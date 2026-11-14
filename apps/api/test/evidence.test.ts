import { evidenceResponseSchema } from "@fieldshift/shared";
import { describe, expect, it } from "vitest";

import { EvidenceCache } from "../src/db/cache.js";
import { daysBetween, resolveSeasonWindow } from "../src/lib/dates.js";
import { AppError } from "../src/lib/errors.js";
import { createEvidenceService } from "../src/services/evidence.js";
import {
  jsonResponse,
  makePowerResponse,
  makeSoilResponse,
  stubFetch,
  textResponse,
} from "./helpers/fixtures.js";

const NOW = new Date("2026-11-14T09:00:00Z");
const RABI_2025 = resolveSeasonWindow("rabi", 2025); // 2025-11-01 .. 2026-05-05
const RABI_DAYS = daysBetween(RABI_2025.start, RABI_2025.end);

function happySources(options: { failSoil?: boolean; failPower?: boolean } = {}) {
  const { json: powerJson } = makePowerResponse({
    start: RABI_2025.start,
    days: RABI_DAYS,
  });
  const { json: soilJson } = makeSoilResponse();

  return stubFetch(async (url) => {
    if (url.includes("power.larc.nasa.gov")) {
      if (options.failPower) return textResponse("upstream down", 500, "text/html");
      return jsonResponse(powerJson);
    }
    if (url.includes("rest.isric.org")) {
      if (options.failSoil) return textResponse("upstream down", 503, "text/html");
      return jsonResponse(soilJson);
    }
    return textResponse("unexpected url", 404, "text/plain");
  });
}

function service(fetchImpl: typeof fetch, cache?: EvidenceCache) {
  return createEvidenceService({
    fetchImpl,
    now: () => NOW,
    cache: cache ?? new EvidenceCache(null, 3600),
    soilCache: new EvidenceCache(null, 3600),
  });
}

const QUERY = { lat: 31.4187, lon: 73.0791, season: "rabi" as const, year: 2025 };

describe("evidence service", () => {
  it("returns validated POWER + soil evidence that satisfies the response schema", async () => {
    const { fetchImpl } = happySources();
    const result = await service(fetchImpl)(QUERY);

    const parsed = evidenceResponseSchema.safeParse(result);
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);

    expect(result.request.windowStart).toBe(RABI_2025.start);
    expect(result.request.windowEnd).toBe(RABI_2025.end);
    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.indicators.find((i) => i.id === "seasonRainMm")).toBeDefined();
    expect(result.sources.map((s) => s.id)).toEqual(["nasa_power", "soilgrids"]);
    expect(result.quality.sourcesFailed).toEqual([]);
    expect(result.soil?.status).toBe("ok");
    expect(result.imagery).toHaveLength(3);
    expect(result.imagery[0]!.note).toContain("Visual context only");
  });

  it("every observation carries unit, source, resolution and data classification", async () => {
    const { fetchImpl } = happySources();
    const result = await service(fetchImpl)(QUERY);

    for (const obs of result.observations) {
      expect(obs.unit).toBeTruthy();
      expect(obs.sourceId).toBe("nasa_power");
      expect(obs.spatialResolution).toContain("MERRA-2");
      expect(obs.dataClass).toBe("reanalysis");
      expect(obs.windowStart).toBe(RABI_2025.start);
      expect(obs.retrievedAt).toBe(NOW.toISOString());
    }
  });

  it("serves the second identical request from cache, without refetching", async () => {
    const { fetchImpl, calls } = happySources();
    const cache = new EvidenceCache(null, 3600);
    const getEvidence = service(fetchImpl, cache);

    const first = await getEvidence(QUERY);
    expect(first.quality.cacheStatus["nasa_power"]).toBe("miss");
    const callsAfterFirst = calls.filter((u) => u.includes("power.larc")).length;

    const second = await getEvidence(QUERY);
    expect(second.quality.cacheStatus["nasa_power"]).toBe("hit");
    const callsAfterSecond = calls.filter((u) => u.includes("power.larc")).length;

    expect(callsAfterSecond).toBe(callsAfterFirst);
    // Cached values are identical to the freshly fetched ones.
    expect(second.observations.map((o) => [o.variable, o.value])).toEqual(
      first.observations.map((o) => [o.variable, o.value]),
    );
    expect(second.indicators.find((i) => i.id === "seasonRainMm")?.value).toBe(
      first.indicators.find((i) => i.id === "seasonRainMm")?.value,
    );
  });

  it("does not cache a failed POWER response as successful evidence", async () => {
    const cache = new EvidenceCache(null, 3600);
    const failing = happySources({ failPower: true });
    const first = await service(failing.fetchImpl, cache)(QUERY);
    expect(first.quality.sourcesFailed).toContain("nasa_power");
    expect(first.quality.cacheStatus["nasa_power"]).toBe("unavailable");

    // A later successful call must be a MISS, because nothing was cached.
    const healthy = happySources();
    const second = await service(healthy.fetchImpl, cache)(QUERY);
    expect(second.quality.cacheStatus["nasa_power"]).toBe("miss");
    expect(second.observations.length).toBeGreaterThan(0);
  });

  it("keeps valid POWER evidence when SoilGrids fails", async () => {
    const { fetchImpl } = happySources({ failSoil: true });
    const result = await service(fetchImpl)(QUERY);

    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.indicators.length).toBeGreaterThan(0);
    expect(result.soil?.status).toBe("failed");
    expect(result.quality.sourcesFailed).toContain("soilgrids");
    expect(result.quality.sourcesOk).toContain("nasa_power");
    expect(result.limitations.join(" ")).toContain("SoilGrids did not respond");
    // No invented soil values.
    expect(result.soil?.properties).toEqual([]);
  });

  it("returns soil with no observations when POWER fails", async () => {
    const { fetchImpl } = happySources({ failPower: true });
    const result = await service(fetchImpl)(QUERY);

    expect(result.observations).toEqual([]);
    expect(result.indicators).toEqual([]);
    expect(result.soil?.status).toBe("ok");
    expect(result.quality.sourcesFailed).toContain("nasa_power");
    expect(result.limitations.join(" ")).toContain("No rainfall, temperature or wetness figures are shown rather than guessed");
  });

  it("fails with SOURCE_UNAVAILABLE when every source fails", async () => {
    const { fetchImpl } = happySources({ failPower: true, failSoil: true });
    await expect(service(fetchImpl)(QUERY)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("rejects a point outside the pilot boundary with the nearest valid point", async () => {
    const { fetchImpl } = happySources();
    try {
      await service(fetchImpl)({ lat: 24.86, lon: 67.0, season: "rabi", year: 2025 });
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.code).toBe("OUT_OF_COVERAGE");
      expect(appErr.details["nearestValidPoint"]).toBeDefined();
    }
  });

  it("rejects a season window that is entirely in the future", async () => {
    const { fetchImpl } = happySources();
    await expect(
      service(fetchImpl)({ lat: 31.4187, lon: 73.0791, season: "kharif", year: 2027 }),
    ).rejects.toMatchObject({ code: "OUT_OF_COVERAGE" });
  });

  it("clamps the current season to completed days and reports the removal", async () => {
    const { fetchImpl } = happySources();
    const result = await service(fetchImpl)({
      lat: 31.4187,
      lon: 73.0791,
      season: "kharif",
      year: 2026,
    });
    // "Now" is 2026-11-14, so the latest complete day is 2026-11-13.
    expect(result.request.windowEnd).toBe("2026-11-13");
    expect(result.limitations.join(" ")).toContain("have not occurred yet");
  });

  it("does not re-hit a failing source inside the cooldown window", async () => {
    const { json: powerJson } = makePowerResponse({ start: RABI_2025.start, days: RABI_DAYS });
    let soilCalls = 0;
    const { fetchImpl } = stubFetch(async (url) => {
      if (url.includes("power.larc")) return jsonResponse(powerJson);
      soilCalls += 1;
      return textResponse("down", 503, "text/html");
    });

    const getEvidence = createEvidenceService({
      fetchImpl,
      now: () => NOW,
      cache: new EvidenceCache(null, 3600),
      soilCache: new EvidenceCache(null, 3600),
    });

    const first = await getEvidence(QUERY);
    const second = await getEvidence(QUERY);

    expect(soilCalls).toBe(1);
    expect(first.quality.sourcesFailed).toContain("soilgrids");
    expect(second.quality.sourcesFailed).toContain("soilgrids");
    expect(second.limitations.join(" ")).toContain("was not retried yet");
    // POWER evidence is unaffected by the soil outage.
    expect(second.observations.length).toBeGreaterThan(0);
  });

  it("retries a previously failed source after the cooldown expires", async () => {
    const { json: powerJson } = makePowerResponse({ start: RABI_2025.start, days: RABI_DAYS });
    const { json: soilJson } = makeSoilResponse();
    let soilCalls = 0;
    let failing = true;
    const { fetchImpl } = stubFetch(async (url) => {
      if (url.includes("power.larc")) return jsonResponse(powerJson);
      soilCalls += 1;
      return failing ? textResponse("down", 503, "text/html") : jsonResponse(soilJson);
    });

    let clock = NOW;
    const getEvidence = createEvidenceService({
      fetchImpl,
      now: () => clock,
      cache: new EvidenceCache(null, 3600),
      soilCache: new EvidenceCache(null, 3600),
      failureMemoTtlMs: 1_000,
    });

    await getEvidence(QUERY);
    expect(soilCalls).toBe(1);

    failing = false;
    clock = new Date(NOW.getTime() + 2_000);
    const afterCooldown = await getEvidence(QUERY);

    expect(soilCalls).toBe(2);
    expect(afterCooldown.soil?.status).toBe("ok");
  });

  it("reports SoilGrids nulls as unknown rather than estimating", async () => {
    const { json: powerJson } = makePowerResponse({ start: RABI_2025.start, days: RABI_DAYS });
    const { json: soilJson } = makeSoilResponse({
      nullProperties: ["clay", "sand", "soc", "phh2o"],
    });
    const { fetchImpl } = stubFetch(async (url) =>
      url.includes("power.larc") ? jsonResponse(powerJson) : jsonResponse(soilJson),
    );

    const result = await service(fetchImpl)(QUERY);
    expect(result.soil?.status).toBe("unavailable");
    expect(result.soil?.properties.every((p) => p.value === null)).toBe(true);
    expect(result.limitations.join(" ")).toContain("A soil test is the only way to know this field");
  });
});
