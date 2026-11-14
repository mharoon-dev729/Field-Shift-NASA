/**
 * POST /api/v1/compare — HTTP layer, catalogue eligibility and contract shape.
 *
 * The evidence pipeline is injected, so these tests never touch the network or
 * the live database. The response is parsed with the shared zod schema, so a
 * drifting handler fails here (TEST_STRATEGY C01).
 */

import { engineResultSchema, type EvidenceResponse, type Season } from "@fieldshift/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { createStaticCatalogueStore, type CatalogueSnapshot } from "../src/db/catalogue.js";
import { AppError } from "../src/lib/errors.js";
import { createCompareService } from "../src/services/compare.js";
import { enumerateDates, resolveSeasonWindow } from "../src/lib/dates.js";
import { FIXTURE_CROPS, FIXTURE_ROTATIONS } from "./helpers/engine-fixtures.js";

const catalogue: CatalogueSnapshot = {
  crops: FIXTURE_CROPS.map((c) => ({ ...c, waterDemandClass: null })),
  rotations: FIXTURE_ROTATIONS,
};

function fakeEvidence(values: { precip: number; tmax: number; tmin: number; gwet: number }) {
  return async (query: { lat: number; lon: number; season: Season; year: number }): Promise<EvidenceResponse> => {
    const window = resolveSeasonWindow(query.season, query.year);
    const points = enumerateDates(window.start, window.end).map((date) => ({ date, value: 0 }));
    const series = (variable: string, unit: string, value: number) => ({
      variable,
      label: variable,
      unit,
      points: points.map((p) => ({ ...p, value })),
      dataClass: "reanalysis" as const,
      sourceId: "nasa_power",
      spatialResolution: "0.5 x 0.625 deg (MERRA-2)",
      qualityFlags: [],
    });

    return {
      request: {
        lat: query.lat,
        lon: query.lon,
        season: query.season,
        year: query.year,
        windowStart: window.start,
        windowEnd: window.end,
        requestedAt: "2026-11-14T00:00:00.000Z",
      },
      point: {
        requested: { lat: query.lat, lon: query.lon },
        resolvedGridPoint: { lat: 31.419, lon: 73.079 },
        elevationM: 182.92,
        gridResolution: "0.5 x 0.625 deg (MERRA-2)",
      },
      seasonWindow: { start: window.start, end: window.end, days: points.length },
      sources: [
        {
          id: "nasa_power",
          provider: "NASA LaRC",
          product: "POWER",
          url: "https://power.larc.nasa.gov/",
          dataClass: "reanalysis",
          spatialResolution: "0.5 x 0.625 deg (MERRA-2)",
          status: "ok",
          retrievedAt: "2026-11-14T00:00:00.000Z",
          cache: "miss",
        },
      ],
      observations: [],
      dailySeries: [
        series("PRECTOTCORR", "mm/day", values.precip),
        series("T2M_MAX", "C", values.tmax),
        series("T2M_MIN", "C", values.tmin),
        series("T2M", "C", values.tmax - 8),
        series("GWETROOT", "1", values.gwet),
      ],
      indicators: [],
      soil: null,
      imagery: [],
      quality: {
        sourcesOk: ["nasa_power"],
        sourcesPartial: [],
        sourcesFailed: [],
        missingVariables: [],
        temporalCoverage: [],
        cacheStatus: { nasa_power: "miss" },
      },
      limitations: [],
    };
  };
}

function buildApp(options: { failingEvidence?: boolean } = {}) {
  const evidence = options.failingEvidence
    ? async (): Promise<EvidenceResponse> => {
        throw new AppError("SOURCE_UNAVAILABLE", "NASA POWER did not respond", { retryable: true });
      }
    : fakeEvidence({ precip: 1.5, tmax: 33, tmin: 9, gwet: 0.3 });

  const compareHandler = createCompareService({
    evidence,
    catalogue: createStaticCatalogueStore(catalogue),
    now: () => new Date("2026-11-14T00:00:00.000Z"),
    newRunId: () => "11111111-1111-4111-8111-111111111111",
    climatology: async () => ({
      1: 0.5,
      2: 0.6,
      3: 0.7,
      4: 0.8,
      5: 1.0,
      6: 2.0,
      7: 3.0,
      8: 3.0,
      9: 1.5,
      10: 0.5,
      11: 0.3,
      12: 0.4,
    }),
  });

  return createApp({ compareHandler });
}

const validRequest = {
  point: { lat: 31.4187, lon: 73.0791 },
  season: "kharif",
  planningYear: 2025,
  currentRotationId: "wheat-cotton",
  previousCropId: "wheat",
  irrigation: "canal",
  farmSizeAcres: 12,
  priorities: { water: 0.6, soilHealth: 0.2, climateResilience: 0.2 },
  candidateRotationIds: ["wheat-cotton", "wheat-maize", "wheat-rice", "wheat-mungbean"],
};

describe("POST /api/v1/compare", () => {
  it("returns a contract-valid comparison and excludes the non-selectable rotation", async () => {
    const response = await request(buildApp()).post("/api/v1/compare").send(validRequest);

    expect(response.status).toBe(200);
    const parsed = engineResultSchema.safeParse(response.body);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(response.body.scenarios).toHaveLength(3);
    expect(response.body.scenarios.map((s: { scenarioId: string }) => s.scenarioId)).not.toContain(
      "wheat-mungbean",
    );
    expect(response.body.globalLimitations.join(" ")).toMatch(/Mungbean.*not selectable/i);
    expect(response.body.indexLabel).toMatch(/comparative index/i);
    expect(response.body.weighting.provisional).toBe(true);
  });

  it("marks the baseline and preserves per-criterion provenance", async () => {
    const response = await request(buildApp()).post("/api/v1/compare").send(validRequest);
    const baseline = response.body.scenarios.find((s: { isBaseline: boolean }) => s.isBaseline);
    expect(baseline.scenarioId).toBe("wheat-cotton");
    for (const scenario of response.body.scenarios) {
      for (const criterion of scenario.components) {
        if (criterion.available) {
          expect(criterion.provenance.length).toBeGreaterThan(0);
        }
      }
      expect(scenario.whyIncluded.length).toBeGreaterThan(10);
    }
  });

  it("rejects all-zero priorities with the shared error envelope", async () => {
    const response = await request(buildApp())
      .post("/api/v1/compare")
      .send({ ...validRequest, priorities: { water: 0, soilHealth: 0, climateResilience: 0 } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a baseline that is not among the candidates", async () => {
    const response = await request(buildApp())
      .post("/api/v1/compare")
      .send({ ...validRequest, currentRotationId: "wheat-rice", candidateRotationIds: ["wheat-cotton"] });

    expect(response.status).toBe(400);
    expect(response.body.error.details.field).toBe("currentRotationId");
  });

  it("rejects unknown rotation ids and unknown fields", async () => {
    const unknownRotation = await request(buildApp())
      .post("/api/v1/compare")
      .send({ ...validRequest, candidateRotationIds: ["wheat-cotton", "not-a-rotation"] });
    expect(unknownRotation.status).toBe(400);
    expect(unknownRotation.body.error.details.rotationId).toBe("not-a-rotation");

    const unknownField = await request(buildApp())
      .post("/api/v1/compare")
      .send({ ...validRequest, madeUpField: true });
    expect(unknownField.status).toBe(400);
  });

  it("returns 200 insufficient_evidence when the evidence sources fail", async () => {
    const response = await request(buildApp({ failingEvidence: true }))
      .post("/api/v1/compare")
      .send(validRequest);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("insufficient_evidence");
    expect(response.body.ranking).toEqual([]);
    expect(response.body.globalLimitations.join(" ")).toMatch(/could not be retrieved/i);
    expect(engineResultSchema.safeParse(response.body).success).toBe(true);
  });

  it("refuses to evaluate a rotation whose crop is not selectable", async () => {
    const response = await request(buildApp())
      .post("/api/v1/compare")
      .send({ ...validRequest, currentRotationId: "wheat-mungbean", candidateRotationIds: ["wheat-mungbean"] });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/not selectable|cannot be evaluated/i);
  });
});
