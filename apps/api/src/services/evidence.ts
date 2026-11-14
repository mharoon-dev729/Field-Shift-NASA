/**
 * Evidence orchestration.
 *
 * Design notes:
 *  - POWER and SoilGrids are fetched IN PARALLEL and independently. SoilGrids
 *    latency was measured at 1.5-58 s (with 60 s timeouts) on 2026-11-14, so a
 *    slow soil service must never delay or destroy NASA POWER evidence.
 *  - A failed source contributes nothing and is reported as failed. No fallback
 *    values, no district averages, no "nearby point" substitution.
 *  - Aggregates/indicators are re-derived from cached daily values, so a cache
 *    hit returns the same numbers as a fresh fetch.
 *
 * See docs/API_CONTRACT.md §4 and master prompt Task G.
 */

import {
  type EvidenceObservation,
  type EvidenceQuery,
  type EvidenceResponse,
  type Indicator,
  type ImageryLayer,
  type SourceStatus,
  type SoilResult,
} from "@fieldshift/shared";

import { buildGibsTile, GIBS_LAYERS } from "../adapters/gibs.js";
import {
  DEFAULT_POWER_VARIABLES,
  deriveFromSeries,
  fetchPower,
  POWER_SOURCE,
  POWER_SPATIAL_RESOLUTION,
  POWER_VARIABLES,
  type PowerVariable,
} from "../adapters/power.js";
import { fetchSoil, SOILGRIDS_SOURCE, SOILGRIDS_SPATIAL_RESOLUTION } from "../adapters/soilgrids.js";
import {
  dailySeriesToRows,
  EvidenceCache,
  rowsToDailySeries,
  type CacheKey,
  type CacheRow,
} from "../db/cache.js";
import { clampToAvailable, daysBetween, enumerateDates, resolveSeasonWindow } from "../lib/dates.js";
import { AppError } from "../lib/errors.js";
import { FailureMemo } from "../lib/failure-memo.js";
import type { FetchLike } from "../lib/http.js";

export interface EvidenceDeps {
  fetchImpl?: FetchLike;
  now?: () => Date;
  cache?: EvidenceCache;
  soilCache?: EvidenceCache;
  powerEnabled?: boolean;
  soilEnabled?: boolean;
  powerTimeoutMs?: number;
  soilTimeoutMs?: number;
  /** How long a failed source is not retried. Default 60 s. */
  failureMemoTtlMs?: number;
  onWarning?: (message: string) => void;
}

/** SoilGrids is fail-fast: a slow soil service must not stall the whole response. */
export const DEFAULT_SOIL_TIMEOUT_MS = 12_000;

interface PowerState {
  source: SourceStatus;
  observations: EvidenceObservation[];
  dailySeries: ReturnType<typeof rowsToDailySeries>;
  indicators: Indicator[];
  missingVariables: string[];
  temporalCoverage: Array<{ variable: string; daysValid: number; daysRequested: number }>;
  gridPoint: { lat: number; lon: number } | null;
  elevationM: number | null;
  limitations: string[];
  cacheState: SourceStatus["cache"];
}

interface SoilState {
  source: SourceStatus;
  soil: SoilResult;
  limitations: string[];
}

export function createEvidenceService(deps: EvidenceDeps = {}) {
  const nowFn = deps.now ?? (() => new Date());
  const powerEnabled = deps.powerEnabled ?? true;
  const soilEnabled = deps.soilEnabled ?? true;
  const variables: PowerVariable[] = DEFAULT_POWER_VARIABLES;
  const failures = new FailureMemo(deps.failureMemoTtlMs ?? 60_000);

  async function loadPower(
    query: EvidenceQuery,
    window: { start: string; end: string },
    now: Date,
  ): Promise<PowerState> {
    const source = baseSource(POWER_SOURCE);

    if (!powerEnabled) {
      return {
        source: { ...source, status: "disabled", retrievedAt: null, cache: "not_cached" },
        observations: [],
        dailySeries: [],
        indicators: [],
        missingVariables: [],
        temporalCoverage: [],
        gridPoint: null,
        elevationM: null,
        limitations: [
          "NASA POWER retrieval is disabled by configuration; no rainfall or temperature evidence is available.",
        ],
        cacheState: "not_cached",
      };
    }

    const key: CacheKey = {
      sourceId: POWER_SOURCE.id,
      lat: query.lat,
      lon: query.lon,
      windowStart: window.start,
      windowEnd: window.end,
      variables: [...variables],
    };

    let persistentError: string | null = null;
    if (deps.cache) {
      const lookup = await deps.cache.get(key, now);
      persistentError = lookup.persistentError;
      if (lookup.hit) {
        const rebuilt = rebuildFromCache(lookup.hit.rows, window, variables);
        return {
          source: { ...source, status: "ok", retrievedAt: lookup.hit.retrievedAt, cache: "hit" },
          observations: rebuilt.aggregates,
          dailySeries: rebuilt.dailySeries,
          indicators: rebuilt.indicators,
          missingVariables: [],
          temporalCoverage: rebuilt.temporalCoverage,
          gridPoint: rebuilt.gridPoint,
          elevationM: null,
          limitations: [
            "Values were served from the validated observation cache; the original retrieval time is shown in the provenance.",
            ...(persistentError
              ? ["The persistent observation cache is unavailable; results are cached in this process only."]
              : []),
          ],
          cacheState: "hit",
        };
      }
    }

    const remembered = failures.get(POWER_SOURCE.id, now);
    if (remembered) {
      return {
        source: {
          ...source,
          status: "failed",
          retrievedAt: null,
          cache: "unavailable",
          error: { code: remembered.code, message: remembered.message },
        },
        observations: [],
        dailySeries: [],
        indicators: [],
        missingVariables: [],
        temporalCoverage: [],
        gridPoint: null,
        elevationM: null,
        limitations: [
          `NASA POWER failed recently (${remembered.at}) and was not retried yet. No rainfall, temperature or wetness figures are shown rather than guessed.`,
        ],
        cacheState: "unavailable",
      };
    }

    try {
      const result = await fetchPower(
        { lat: query.lat, lon: query.lon, start: window.start, end: window.end, variables },
        { fetchImpl: deps.fetchImpl, timeoutMs: deps.powerTimeoutMs ?? 20_000, now },
      );
      const retrievedAt = result.aggregates[0]?.retrievedAt ?? now.toISOString();
      failures.clear(POWER_SOURCE.id);

      if (deps.cache && result.dailySeries.length > 0) {
        await deps.cache.put(
          key,
          dailySeriesToRows(result.dailySeries).map((row) => ({
            ...row,
            retrievedAt,
            gridLat: result.gridPoint.lat,
            gridLon: result.gridPoint.lon,
          })),
          retrievedAt,
          now,
        );
      }

      return {
        source: {
          ...source,
          status: result.missingVariables.length ? "partial" : "ok",
          retrievedAt,
          cache: "miss",
        },
        observations: result.aggregates,
        dailySeries: result.dailySeries,
        indicators: result.indicators,
        missingVariables: result.missingVariables,
        temporalCoverage: result.temporalCoverage,
        gridPoint: result.gridPoint,
        elevationM: result.elevationM,
        limitations: [
          ...result.limitations,
          ...(persistentError
            ? ["The persistent observation cache is unavailable; results are cached in this process only."]
            : []),
        ],
        cacheState: "miss",
      };
    } catch (err) {
      const appError = err instanceof AppError ? err : null;
      failures.set(
        POWER_SOURCE.id,
        {
          code: appError?.code ?? "INTERNAL",
          message: appError?.message ?? "NASA POWER could not be reached",
          at: now.toISOString(),
        },
        now,
      );
      return {
        source: {
          ...source,
          status: "failed",
          retrievedAt: null,
          cache: "unavailable",
          error: {
            code: appError?.code ?? "INTERNAL",
            message: appError?.message ?? "NASA POWER could not be reached",
          },
        },
        observations: [],
        dailySeries: [],
        indicators: [],
        missingVariables: [],
        temporalCoverage: [],
        gridPoint: null,
        elevationM: null,
        limitations: [
          `NASA POWER evidence is unavailable for this request (${appError?.code ?? "INTERNAL"}). No rainfall, temperature or wetness figures are shown rather than guessed.`,
        ],
        cacheState: "unavailable",
      };
    }
  }

  async function loadSoil(
    query: EvidenceQuery,
    window: { start: string; end: string },
    now: Date,
  ): Promise<SoilState> {
    const source = baseSource(SOILGRIDS_SOURCE);

    if (!soilEnabled) {
      return {
        source: { ...source, status: "disabled", retrievedAt: null, cache: "not_cached" },
        soil: {
          sourceId: "soilgrids",
          status: "disabled",
          properties: [],
          missing: ["all_properties"],
          spatialResolution: SOILGRIDS_SPATIAL_RESOLUTION,
          dataClass: "observation",
          retrievedAt: null,
          limitations: ["SoilGrids retrieval is disabled by configuration."],
        },
        limitations: [],
      };
    }

    // SoilGrids is a static product: in-process cache for 24 h.
    const key: CacheKey = {
      sourceId: "soilgrids",
      lat: query.lat,
      lon: query.lon,
      windowStart: window.start,
      windowEnd: window.end,
      variables: ["clay", "sand", "soc", "phh2o"],
    };

    if (deps.soilCache) {
      const lookup = await deps.soilCache.get(key, now);
      if (lookup.hit) {
        const soil = deserialiseSoil(lookup.hit.rows);
        return {
          source: {
            ...source,
            status: soil.status === "ok" ? "ok" : "partial",
            retrievedAt: lookup.hit.retrievedAt,
            cache: "hit",
          },
          soil,
          limitations: soil.limitations,
        };
      }
    }

    const rememberedSoil = failures.get(SOILGRIDS_SOURCE.id, now);
    if (rememberedSoil) {
      const soil: SoilResult = {
        sourceId: "soilgrids",
        status: "failed",
        properties: [],
        missing: ["all_properties"],
        spatialResolution: SOILGRIDS_SPATIAL_RESOLUTION,
        dataClass: "observation",
        retrievedAt: null,
        limitations: ["Soil values are unavailable; soil is treated as unknown, not estimated."],
        error: { code: rememberedSoil.code, message: rememberedSoil.message },
      };
      return {
        source: {
          ...source,
          status: "failed",
          retrievedAt: null,
          cache: "unavailable",
          error: soil.error!,
        },
        soil,
        limitations: [
          `SoilGrids failed recently (${rememberedSoil.at}) and was not retried yet; soil is treated as unknown.`,
        ],
      };
    }

    try {
      const soil = await fetchSoil(
        { lat: query.lat, lon: query.lon },
        {
          fetchImpl: deps.fetchImpl,
          timeoutMs: deps.soilTimeoutMs ?? DEFAULT_SOIL_TIMEOUT_MS,
          retries: 0,
          now,
        },
      );

      failures.clear(SOILGRIDS_SOURCE.id);
      if (deps.soilCache && soil.properties.length > 0) {
        await deps.soilCache.put(key, serialiseSoil(soil), soil.retrievedAt ?? now.toISOString(), now);
      }

      return {
        source: {
          ...source,
          // Retrieval succeeded; "unavailable" means the provider answered with
          // no values here. That is partial coverage, not a source failure.
          status: soil.status === "ok" ? "ok" : "partial",
          retrievedAt: soil.retrievedAt,
          cache: "miss",
        },
        soil,
        limitations: soil.limitations,
      };
    } catch (err) {
      const appError = err instanceof AppError ? err : null;
      failures.set(
        SOILGRIDS_SOURCE.id,
        {
          code: appError?.code ?? "INTERNAL",
          message: appError?.message ?? "SoilGrids could not be reached",
          at: now.toISOString(),
        },
        now,
      );
      const soil: SoilResult = {
        sourceId: "soilgrids",
        status: "failed",
        properties: [],
        missing: ["all_properties"],
        spatialResolution: SOILGRIDS_SPATIAL_RESOLUTION,
        dataClass: "observation",
        retrievedAt: null,
        limitations: ["Soil values are unavailable; soil is treated as unknown, not estimated."],
        error: {
          code: appError?.code ?? "INTERNAL",
          message: appError?.message ?? "SoilGrids could not be reached",
        },
      };
      return {
        source: {
          ...source,
          status: "failed",
          retrievedAt: null,
          cache: "unavailable",
          error: soil.error!,
        },
        soil,
        limitations: [
          "SoilGrids did not respond, so soil properties are unknown for this request. No district average or nearby value was substituted.",
        ],
      };
    }
  }

  return async function getEvidence(query: EvidenceQuery): Promise<EvidenceResponse> {
    const now = nowFn();

    const seasonWindow = resolveSeasonWindow(query.season, query.year);
    const clamped = clampToAvailable(seasonWindow, now);
    if (clamped.start > clamped.end) {
      throw new AppError("OUT_OF_COVERAGE", "The requested season window is entirely in the future", {
        details: { requested: seasonWindow, latestAvailableDay: clamped.end },
      });
    }
    const window = { start: clamped.start, end: clamped.end };
    const requestedAt = now.toISOString();

    // Both sources start immediately: a slow SoilGrids cannot delay POWER.
    const [power, soilState] = await Promise.all([
      loadPower(query, window, now),
      loadSoil(query, window, now),
    ]);

    const sources = [power.source, soilState.source];
    const limitations: string[] = [...power.limitations, ...soilState.limitations];
    const cacheStatus: Record<string, string> = {
      [POWER_SOURCE.id]: power.cacheState === "hit" ? "hit" : power.cacheState === "miss" ? "miss" : "unavailable",
      soilgrids:
        soilState.source.cache === "hit" ? "hit" : soilState.source.cache === "miss" ? "miss" : "unavailable",
    };

    if (clamped.droppedFutureDays > 0) {
      limitations.unshift(
        `The requested window included ${clamped.droppedFutureDays} day(s) that have not occurred yet; those days were removed, not filled.`,
      );
    }

    if (soilState.soil.status === "unavailable") {
      limitations.push(
        "SoilGrids has no value at this point; treat soil as unknown. A soil test is the only way to know this field.",
      );
    }

    const anyOk = sources.some((s) => s.status === "ok" || s.status === "partial");
    if (!anyOk) {
      throw new AppError("SOURCE_UNAVAILABLE", "No environmental source could provide evidence for this request", {
        details: { sources: sources.map((s) => ({ id: s.id, status: s.status, code: s.error?.code })) },
      });
    }

    const totalDays = daysBetween(window.start, window.end);
    const midDate = enumerateDates(window.start, window.end)[Math.floor(totalDays / 2)] ?? window.end;
    const imagery: ImageryLayer[] = Object.keys(GIBS_LAYERS).map((key) => {
      const tile = buildGibsTile({
        layerKey: key as keyof typeof GIBS_LAYERS,
        date: midDate,
        lat: query.lat,
        lon: query.lon,
      });
      return {
        layerKey: key,
        label: tile.label,
        date: tile.date,
        template: tile.url.replace(/\/\d+\/\d+\/\d+\.png$/, "/{z}/{y}/{x}.png"),
        attribution: tile.attribution,
        note: tile.note,
      };
    });

    limitations.push(
      "All values are attributed to the area around the requested point, not to an individual field.",
    );
    limitations.push(
      "This endpoint provides evidence only. It contains no crop recommendation and no score.",
    );

    return {
      request: {
        lat: query.lat,
        lon: query.lon,
        season: query.season,
        year: query.year,
        windowStart: window.start,
        windowEnd: window.end,
        requestedAt,
      },
      point: {
        requested: { lat: query.lat, lon: query.lon },
        resolvedGridPoint: power.gridPoint,
        elevationM: power.elevationM,
        gridResolution: POWER_SPATIAL_RESOLUTION,
      },
      seasonWindow: { start: window.start, end: window.end, days: totalDays },
      sources,
      observations: power.observations,
      dailySeries: power.dailySeries,
      indicators: power.indicators,
      soil: soilState.soil,
      imagery,
      quality: {
        sourcesOk: sources.filter((s) => s.status === "ok").map((s) => s.id),
        sourcesPartial: sources.filter((s) => s.status === "partial").map((s) => s.id),
        sourcesFailed: sources.filter((s) => s.status === "failed").map((s) => s.id),
        missingVariables: power.missingVariables,
        temporalCoverage: power.temporalCoverage,
        cacheStatus,
      },
      limitations,
    };
  };
}

function baseSource(src: typeof POWER_SOURCE | typeof SOILGRIDS_SOURCE) {
  return {
    id: src.id,
    provider: src.provider,
    product: src.product,
    url: src.url,
    dataClass: src.dataClass,
    spatialResolution: src.spatialResolution,
  };
}

function rebuildFromCache(
  rows: CacheRow[],
  window: { start: string; end: string },
  variables: PowerVariable[],
): {
  dailySeries: ReturnType<typeof rowsToDailySeries>;
  aggregates: EvidenceObservation[];
  indicators: Indicator[];
  temporalCoverage: Array<{ variable: string; daysValid: number; daysRequested: number }>;
  gridPoint: { lat: number; lon: number } | null;
} {
  const series = rowsToDailySeries(rows).map((s) => ({
    ...s,
    label: POWER_VARIABLES[s.variable as PowerVariable]?.label ?? s.variable,
  }));
  const retrievedAt = rows[0]?.retrievedAt ?? new Date().toISOString();
  const derived = deriveFromSeries(series, {
    windowStart: window.start,
    windowEnd: window.end,
    daysRequested: daysBetween(window.start, window.end),
    retrievedAt,
  });
  const ordered = [...series].sort(
    (a, b) =>
      variables.indexOf(a.variable as PowerVariable) -
      variables.indexOf(b.variable as PowerVariable),
  );
  const first = rows[0];
  const gridPoint =
    first?.gridLat != null && first.gridLon != null
      ? { lat: first.gridLat, lon: first.gridLon }
      : null;

  return { dailySeries: ordered, ...derived, gridPoint };
}

/** Soil cache rows: one row per property/depth, value encoded in `value`. */
function serialiseSoil(soil: SoilResult): CacheRow[] {
  return soil.properties.map((p) => ({
    sourceId: "soilgrids",
    variable: `${p.property}@${p.depth}`,
    date: "1970-01-01",
    value: p.value,
    unit: p.unit,
    dataClass: soil.dataClass,
    spatialResolution: soil.spatialResolution,
    qualityFlags: [`raw:${p.rawValue ?? "null"}`, `raw_unit:${p.rawUnit}`],
    retrievedAt: soil.retrievedAt ?? new Date().toISOString(),
  }));
}

function deserialiseSoil(rows: CacheRow[]): SoilResult {
  const properties = rows.map((r) => {
    const [property, depth] = r.variable.split("@");
    const rawFlag = r.qualityFlags.find((f) => f.startsWith("raw:"));
    const rawUnitFlag = r.qualityFlags.find((f) => f.startsWith("raw_unit:"));
    const rawText = rawFlag?.slice(4) ?? "null";
    return {
      property: property ?? r.variable,
      label: property ?? r.variable,
      depth: depth ?? "",
      value: r.value,
      unit: r.unit,
      rawValue: rawText === "null" ? null : Number(rawText),
      rawUnit: rawUnitFlag?.slice(9) ?? "",
      status: (r.value === null ? "no_data" : "available") as "available" | "no_data",
      predicted: true as const,
    };
  });
  const available = properties.filter((p) => p.status === "available").length;
  return {
    sourceId: "soilgrids",
    status: available === 0 ? "unavailable" : available < properties.length ? "partial" : "ok",
    properties,
    missing: properties.filter((p) => p.status === "no_data").map((p) => `${p.property}:${p.depth}`),
    spatialResolution: SOILGRIDS_SPATIAL_RESOLUTION,
    dataClass: "observation",
    retrievedAt: rows[0]?.retrievedAt ?? null,
    limitations: [
      "SoilGrids values are model predictions at 250 m resolution, not measurements from this field.",
    ],
  };
}
