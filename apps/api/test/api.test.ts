import { evidenceResponseSchema } from "@fieldshift/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { EvidenceCache } from "../src/db/cache.js";
import { daysBetween, resolveSeasonWindow } from "../src/lib/dates.js";
import { createEvidenceService } from "../src/services/evidence.js";
import { jsonResponse, makePowerResponse, makeSoilResponse, stubFetch } from "./helpers/fixtures.js";

const NOW = new Date("2026-11-14T09:00:00Z");
const RABI = resolveSeasonWindow("rabi", 2025);
const DAYS = daysBetween(RABI.start, RABI.end);

function liveApp() {
  const { json: powerJson } = makePowerResponse({ start: RABI.start, days: DAYS });
  const { json: soilJson } = makeSoilResponse();
  const { fetchImpl } = stubFetch(async (url) =>
    url.includes("power.larc") ? jsonResponse(powerJson) : jsonResponse(soilJson),
  );
  const handler = createEvidenceService({
    fetchImpl,
    now: () => NOW,
    cache: new EvidenceCache(null, 3600),
    soilCache: new EvidenceCache(null, 3600),
  });
  return createApp({ evidenceHandler: handler });
}

function stubApp(handler: (q: unknown) => Promise<unknown>) {
  return createApp({ evidenceHandler: handler as never });
}

describe("GET /api/v1/evidence", () => {
  it("returns 200 with a response that satisfies the shared schema", async () => {
    const res = await request(liveApp())
      .get("/api/v1/evidence")
      .query({ lat: 31.4187, lon: 73.0791, season: "rabi", year: 2025 });

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const parsed = evidenceResponseSchema.safeParse(res.body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });

  it("returns a structured 400 when parameters are missing", async () => {
    const res = await request(liveApp()).get("/api/v1/evidence").query({ lat: 31.4187 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.field).toBeTruthy();
  });

  it("returns 400 for an invalid season", async () => {
    const res = await request(liveApp())
      .get("/api/v1/evidence")
      .query({ lat: 31.4187, lon: 73.0791, season: "monsoon", year: 2025 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 for an out-of-range year", async () => {
    const res = await request(liveApp())
      .get("/api/v1/evidence")
      .query({ lat: 31.4187, lon: 73.0791, season: "rabi", year: 1500 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-numeric coordinates", async () => {
    const res = await request(liveApp())
      .get("/api/v1/evidence")
      .query({ lat: "abc", lon: 73.0791, season: "rabi", year: 2025 });
    expect(res.status).toBe(400);
  });

  it("returns 422 with the nearest valid point outside the pilot area", async () => {
    const res = await request(liveApp())
      .get("/api/v1/evidence")
      .query({ lat: 24.86, lon: 67.0, season: "rabi", year: 2025 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("OUT_OF_COVERAGE");
    expect(res.body.error.details.nearestValidPoint).toBeDefined();
  });

  it("rejects unknown query parameters (strict schema)", async () => {
    const res = await request(liveApp())
      .get("/api/v1/evidence")
      .query({ lat: 31.4187, lon: 73.0791, season: "rabi", year: 2025, includeForecast: "true" });
    expect(res.status).toBe(400);
  });

  it("maps a total source failure to a 502 envelope", async () => {
    const app = stubApp(async () => {
      const err = new Error("all sources down") as Error & { code: string; status: number; details: object };
      err.code = "SOURCE_UNAVAILABLE";
      err.status = 502;
      err.details = { sources: [] };
      // Use the real AppError so the envelope is exercised end to end.
      const { AppError } = await import("../src/lib/errors.js");
      throw new AppError("SOURCE_UNAVAILABLE", "No environmental source could provide evidence", {
        details: { sources: [] },
      });
    });
    const res = await request(app)
      .get("/api/v1/evidence")
      .query({ lat: 31.4187, lon: 73.0791, season: "rabi", year: 2025 });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("SOURCE_UNAVAILABLE");
    expect(res.body.error.message).not.toContain("stack");
  });

  it("returns 200 with a partial body when one source fails", async () => {
    const { json: powerJson } = makePowerResponse({ start: RABI.start, days: DAYS });
    const { fetchImpl } = stubFetch(async (url) =>
      url.includes("power.larc")
        ? jsonResponse(powerJson)
        : new Response("down", { status: 503, headers: { "content-type": "text/html" } }),
    );
    const handler = createEvidenceService({
      fetchImpl,
      now: () => NOW,
      cache: new EvidenceCache(null, 3600),
      soilCache: new EvidenceCache(null, 3600),
    });
    const res = await request(createApp({ evidenceHandler: handler }))
      .get("/api/v1/evidence")
      .query({ lat: 31.4187, lon: 73.0791, season: "rabi", year: 2025 });

    expect(res.status).toBe(200);
    expect(res.body.quality.sourcesFailed).toContain("soilgrids");
    expect(res.body.observations.length).toBeGreaterThan(0);
  });

  it("does not grant CORS to a foreign origin", async () => {
    const res = await request(liveApp())
      .get("/api/v1/evidence")
      .query({ lat: 31.4187, lon: 73.0791, season: "rabi", year: 2025 })
      .set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("grants CORS to an allowed origin with Vary: Origin", async () => {
    const res = await request(liveApp())
      .get("/api/v1/evidence")
      .query({ lat: 31.4187, lon: 73.0791, season: "rabi", year: 2025 })
      .set("Origin", "http://localhost:5173");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["vary"]).toContain("Origin");
  });

  it("reports health without leaking configuration values", async () => {
    const res = await request(liveApp()).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.config).toBeDefined();
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
    expect(body).not.toContain("postgresql://");
  });
});
