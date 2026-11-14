/**
 * Shared contract types for Field Shift.
 *
 * Single source of truth for the API contract (docs/API_CONTRACT.md).
 * Both the API and the web client import these, so a drift between
 * documentation, server and client fails `npm run typecheck`.
 *
 * Phase 2 adds the evidence vocabulary and an explicit "unavailable" state
 * for soil data. Nothing here may represent a fabricated value: every field
 * that can be unknown is nullable, and `null` means "we looked and there was
 * nothing usable" — never zero.
 */

import { z } from "zod";

import { AGGREGATIONS, DATA_CLASSES, SEASONS } from "./primitives.js";
import type { Aggregation, DataClass, Season } from "./primitives.js";

/** Vocabularies and request schemas live in `primitives.ts` (no cycles). */
export * from "./primitives.js";

export type SourceStatusValue = "ok" | "partial" | "failed" | "disabled";

/**
 * Soil has one extra state on purpose (master prompt Task D): a provider can
 * answer successfully yet hold NO value at this point. That is "unavailable",
 * which is distinct from a failed retrieval.
 */
export type SoilStatus = "ok" | "partial" | "unavailable" | "failed" | "disabled";

/**
 * A single traceable environmental value.
 *
 * `value` is nullable BY DESIGN: a missing or invalid reading is `null`,
 * never 0. The decision engine treats `null` as "unavailable" and the
 * evidence gate refuses to score from it (docs/DECISION_ENGINE_SPEC.md §7).
 */
export interface Observation<T = number> {
  value: T | null;
  unit: string;
  sourceId: string;
  variable: string;
  windowStart: string;
  windowEnd: string;
  spatialResolution: string;
  dataClass: DataClass;
  retrievedAt: string;
  qualityFlags: string[];
}

export interface DailyPoint {
  /** Source date, preserved exactly (YYYY-MM-DD). Never re-labelled. */
  date: string;
  value: number | null;
}

/** A validated daily series from a source, with its own units. */
export interface DailySeries {
  variable: string;
  label: string;
  unit: string;
  points: DailyPoint[];
  dataClass: DataClass;
  sourceId: string;
  spatialResolution: string;
  qualityFlags: string[];
}

/** An aggregate computed only from validated, non-null daily values. */
export interface EvidenceObservation {
  variable: string;
  label: string;
  unit: string;
  aggregation: Aggregation;
  value: number | null;
  windowStart: string;
  windowEnd: string;
  nValid: number;
  nExpected: number;
  qualityFlags: string[];
  dataClass: DataClass;
  spatialResolution: string;
  sourceId: string;
  retrievedAt: string;
  daily?: DailyPoint[];
  processingNotes?: string;
}

/** A descriptive, plainly-derived figure shown to the user. Not a score. */
export interface Indicator {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  windowStart: string;
  windowEnd: string;
  sourceId: string;
  dataClass: DataClass;
  qualityFlags: string[];
  note?: string;
}

export interface SoilPropertyValue {
  property: string;
  label: string;
  depth: string;
  /** Converted to `unit` exactly once (see SoilGrids adapter). */
  value: number | null;
  unit: string;
  /** As returned by the provider, before conversion. */
  rawValue: number | null;
  rawUnit: string;
  status: "available" | "no_data";
  /** SoilGrids is a digital soil map prediction, never a lab test. */
  predicted: true;
}

export interface SoilResult {
  sourceId: "soilgrids";
  status: SoilStatus;
  properties: SoilPropertyValue[];
  missing: string[];
  spatialResolution: string;
  dataClass: DataClass;
  retrievedAt: string | null;
  limitations: string[];
  error?: { code: string; message: string };
}

export interface SourceStatus {
  id: string;
  provider: string;
  product: string;
  url: string;
  dataClass: DataClass;
  spatialResolution: string;
  status: SourceStatusValue;
  retrievedAt: string | null;
  /** True when this run was served from cache rather than a fresh retrieval. */
  cache: "hit" | "miss" | "not_cached" | "unavailable";
  error?: { code: string; message: string };
}

export interface EvidenceRequestEcho {
  lat: number;
  lon: number;
  season: Season;
  year: number;
  /** Actual date range requested from sources, after clamping. */
  windowStart: string;
  windowEnd: string;
  requestedAt: string;
}

export interface EvidenceQuality {
  sourcesOk: string[];
  sourcesPartial: string[];
  sourcesFailed: string[];
  missingVariables: string[];
  /** Days with a usable value out of days requested, per variable. */
  temporalCoverage: Array<{ variable: string; daysValid: number; daysRequested: number }>;
  cacheStatus: Record<string, string>;
}

export interface ImageryLayer {
  layerKey: string;
  label: string;
  /** Representative mid-window date; tile availability for it is not guaranteed. */
  date: string;
  template: string;
  attribution: string;
  note: string;
}

export interface EvidenceResponse {
  request: EvidenceRequestEcho;
  point: {
    requested: { lat: number; lon: number };
    resolvedGridPoint: { lat: number; lon: number } | null;
    elevationM: number | null;
    gridResolution: string;
  };
  seasonWindow: { start: string; end: string; days: number };
  sources: SourceStatus[];
  observations: EvidenceObservation[];
  dailySeries: DailySeries[];
  indicators: Indicator[];
  soil: SoilResult | null;
  /** Map imagery templates. Visual context only: never used in any calculation. */
  imagery: ImageryLayer[];
  quality: EvidenceQuality;
  limitations: string[];
}

export interface SourceRef {
  id: string;
  provider: string;
  product: string;
  url: string;
  dataClass: DataClass;
  spatialResolution: string;
}

/** Pilot anchor point: Faisalabad district, Punjab, Pakistan. */
export const PILOT = {
  id: "faisalabad-pk",
  name: "Faisalabad district",
  province: "Punjab",
  country: "Pakistan",
  anchor: { lat: 31.4187, lon: 73.0791 },
  bbox: { south: 30.75, west: 72.45, north: 31.95, east: 73.75 },
  disclaimer: "Independent project. Not affiliated with or endorsed by NASA.",
} as const;

/** --- Validation schemas (server-enforced) --- */

/**
 * Query contract for GET /api/v1/evidence.
 * `year` is the *planning* year: the year the season's sowing window starts.
 *   rabi 2025  -> 2025-11-01 .. 2026-05-05
 *   kharif 2026 -> 2026-04-01 .. 2026-11-30
 */
export const evidenceQuerySchema = z
  .object({
    lat: z.coerce.number().finite().min(-90).max(90),
    lon: z.coerce.number().finite().min(-180).max(180),
    season: z.enum(SEASONS),
    year: z.coerce.number().int().min(1980).max(2100),
  })
  .strict();

export type EvidenceQuery = z.infer<typeof evidenceQuerySchema>;

/** True when the point lies inside the v1 pilot boundary. */
export function isInsidePilot(lat: number, lon: number): boolean {
  return (
    lat >= PILOT.bbox.south &&
    lat <= PILOT.bbox.north &&
    lon >= PILOT.bbox.west &&
    lon <= PILOT.bbox.east
  );
}

/** --- Response schema, used by contract tests to catch drift --- */

const dailyPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.number().nullable(),
});

const evidenceObservationSchema = z.object({
  variable: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().min(1),
  aggregation: z.enum(AGGREGATIONS),
  value: z.number().nullable(),
  windowStart: z.string(),
  windowEnd: z.string(),
  nValid: z.number().int().nonnegative(),
  nExpected: z.number().int().nonnegative(),
  qualityFlags: z.array(z.string()),
  dataClass: z.enum(DATA_CLASSES),
  spatialResolution: z.string().min(1),
  sourceId: z.string().min(1),
  retrievedAt: z.string(),
  daily: z.array(dailyPointSchema).optional(),
  processingNotes: z.string().optional(),
});

export const evidenceResponseSchema = z.object({
  request: z.object({
    lat: z.number(),
    lon: z.number(),
    season: z.enum(SEASONS),
    year: z.number().int(),
    windowStart: z.string(),
    windowEnd: z.string(),
    requestedAt: z.string(),
  }),
  point: z.object({
    requested: z.object({ lat: z.number(), lon: z.number() }),
    resolvedGridPoint: z
      .object({ lat: z.number(), lon: z.number() })
      .nullable(),
    elevationM: z.number().nullable(),
    gridResolution: z.string(),
  }),
  seasonWindow: z.object({
    start: z.string(),
    end: z.string(),
    days: z.number().int().nonnegative(),
  }),
  sources: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      product: z.string(),
      url: z.string(),
      dataClass: z.enum(DATA_CLASSES),
      spatialResolution: z.string(),
      status: z.enum(["ok", "partial", "failed", "disabled"]),
      retrievedAt: z.string().nullable(),
      cache: z.enum(["hit", "miss", "not_cached", "unavailable"]),
      error: z.object({ code: z.string(), message: z.string() }).optional(),
    }),
  ),
  observations: z.array(evidenceObservationSchema),
  dailySeries: z.array(
    z.object({
      variable: z.string(),
      label: z.string(),
      unit: z.string(),
      points: z.array(dailyPointSchema),
      dataClass: z.enum(DATA_CLASSES),
      sourceId: z.string(),
      spatialResolution: z.string(),
      qualityFlags: z.array(z.string()),
    }),
  ),
  indicators: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.number().nullable(),
      unit: z.string(),
      windowStart: z.string(),
      windowEnd: z.string(),
      sourceId: z.string(),
      dataClass: z.enum(DATA_CLASSES),
      qualityFlags: z.array(z.string()),
      note: z.string().optional(),
    }),
  ),
  soil: z
    .object({
      sourceId: z.literal("soilgrids"),
      status: z.enum(["ok", "partial", "unavailable", "failed", "disabled"]),
      properties: z.array(
        z.object({
          property: z.string(),
          label: z.string(),
          depth: z.string(),
          value: z.number().nullable(),
          unit: z.string(),
          rawValue: z.number().nullable(),
          rawUnit: z.string(),
          status: z.enum(["available", "no_data"]),
          predicted: z.literal(true),
        }),
      ),
      missing: z.array(z.string()),
      spatialResolution: z.string(),
      dataClass: z.enum(DATA_CLASSES),
      retrievedAt: z.string().nullable(),
      limitations: z.array(z.string()),
      error: z.object({ code: z.string(), message: z.string() }).optional(),
    })
    .nullable(),
  imagery: z.array(
    z.object({
      layerKey: z.string(),
      label: z.string(),
      date: z.string(),
      template: z.string(),
      attribution: z.string(),
      note: z.string(),
    }),
  ),
  quality: z.object({
    sourcesOk: z.array(z.string()),
    sourcesPartial: z.array(z.string()),
    sourcesFailed: z.array(z.string()),
    missingVariables: z.array(z.string()),
    temporalCoverage: z.array(
      z.object({
        variable: z.string(),
        daysValid: z.number().int(),
        daysRequested: z.number().int(),
      }),
    ),
    cacheStatus: z.record(z.string()),
  }),
  limitations: z.array(z.string()),
});

export type EvidenceResponseParsed = z.infer<typeof evidenceResponseSchema>;

/** Decision-engine contract (Phase 3). Kept in its own module, re-exported here. */
export * from "./engine.js";

/** Catalogue and data-source contracts (Phase 4). */
export * from "./catalogue.js";
