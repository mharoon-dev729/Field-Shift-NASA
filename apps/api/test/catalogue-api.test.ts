/**
 * GET /api/v1/crops and GET /api/v1/sources.
 *
 * Reference-data endpoints: contract shape, filtering, and the refusal path when
 * the catalogue cannot be read.
 */

import { cropsResponseSchema, sourcesResponseSchema } from "@fieldshift/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createStaticCatalogueStore, type CatalogueSnapshot } from "../src/db/catalogue.js";
import { createStaticSourceStore, type SourceStore } from "../src/db/sources.js";
import { AppError } from "../src/lib/errors.js";
import { createCatalogueService } from "../src/services/catalogue.js";
import { FIXTURE_CROPS, FIXTURE_ROTATIONS } from "./helpers/engine-fixtures.js";

// The engine fixtures only carry the two calendar fields it needs; the catalogue
// response reports full sowing and harvest windows, so they are supplied here.
const catalogue: CatalogueSnapshot = {
  crops: FIXTURE_CROPS.map((c) => ({
    ...c,
    sowingEndMd: c.sowingStartMd,
    harvestStartMd: null,
    limitations: [`Fixture limitation for ${c.name}`],
  })).map((c) =>
    c.id === "wheat" ? { ...c, sowingEndMd: "11-20", harvestStartMd: "04-01" } : c,
  ),
  rotations: FIXTURE_ROTATIONS,
};

const sourceStore = createStaticSourceStore({
  sources: [
    {
      id: "nasa_power",
      provider: "NASA LaRC",
      product: "POWER Agroclimatology",
      url: "https://power.larc.nasa.gov/docs/services/api/",
      dataClass: "reanalysis",
      variables: ["T2M", "PRECTOTCORR"],
      units: { T2M: "C", PRECTOTCORR: "mm/day" },
      spatialResolution: "0.5 x 0.625 deg",
      temporalResolution: "daily",
      coverage: "global",
      history: "1981-present",
      auth: "none",
      usableAtPilot: "yes",
      role: "evidence",
      limitations: ["Reanalysis, not an observation"],
    },
  ],
});

function buildApp(options: { failing?: boolean } = {}) {
  const failingStore: SourceStore = {
    async load(): Promise<never> {
      throw new AppError("SOURCE_UNAVAILABLE", "register unavailable");
    },
  };
  const service = createCatalogueService({
    catalogue: createStaticCatalogueStore(catalogue),
    sources: options.failing ? failingStore : sourceStore,
    now: () => new Date("2026-11-14T00:00:00.000Z"),
  });

  return createApp({
    cropsHandler: options.failing
      ? async () => {
          throw new AppError("SOURCE_UNAVAILABLE", "catalogue unavailable");
        }
      : service.crops,
    sourcesHandler: service.sources,
  });
}

describe("GET /api/v1/crops", () => {
  it("returns a contract-valid catalogue with concrete and MM-DD windows", async () => {
    const response = await request(buildApp()).get("/api/v1/crops?year=2026");

    expect(response.status).toBe(200);
    const parsed = cropsResponseSchema.safeParse(response.body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);

    const wheat = response.body.crops.find((c: { id: string }) => c.id === "wheat");
    expect(wheat.sowingWindow.start).toBe("2026-11-01");
    // Rabi harvest falls in the following year — never silently same-year.
    expect(wheat.harvestWindow.end).toBe("2027-05-05");
    expect(wheat.sowingWindow.startMd).toBe("11-01");
    expect(wheat.waterDemandClass).toBeNull();
  });

  it("offers only evaluable rotations and explains the excluded one", async () => {
    const response = await request(buildApp()).get("/api/v1/crops");
    const ids = response.body.rotations.map((r: { id: string }) => r.id);

    expect(ids).toContain("wheat-cotton");
    expect(ids).not.toContain("wheat-mungbean");

    const unfiltered = await request(buildApp()).get("/api/v1/crops?includeUnverified=true");
    const mung = unfiltered.body.rotations.find((r: { id: string }) => r.id === "wheat-mungbean");
    expect(mung.evaluable).toBe(false);
    expect(mung.excludedReason).toMatch(/Mungbean is not selectable/i);
  });

  it("filters by season and hides unverified crops by default", async () => {
    const response = await request(buildApp()).get("/api/v1/crops?season=rabi");
    const seasons = new Set(
      response.body.crops.map((c: { season: string }) => c.season),
    );
    expect([...seasons]).toEqual(["rabi"]);
    expect(response.body.crops.every((c: { verified: boolean }) => c.verified)).toBe(true);
  });

  it("rejects unknown query parameters", async () => {
    const response = await request(buildApp()).get("/api/v1/crops?madeUp=1");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 502 rather than inventing a catalogue", async () => {
    const response = await request(buildApp({ failing: true })).get("/api/v1/crops");
    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("SOURCE_UNAVAILABLE");
  });
});

describe("GET /api/v1/sources", () => {
  it("returns the register with provenance fields and limitations", async () => {
    const response = await request(buildApp()).get("/api/v1/sources");

    expect(response.status).toBe(200);
    expect(sourcesResponseSchema.safeParse(response.body).success).toBe(true);
    const power = response.body.sources[0];
    expect(power.id).toBe("nasa_power");
    expect(power.units.T2M).toBe("C");
    expect(power.limitations.length).toBeGreaterThan(0);
    expect(power.auth).toBe("none");
  });
});
