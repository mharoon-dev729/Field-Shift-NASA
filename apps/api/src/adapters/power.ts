/**
 * NASA POWER adapter (daily point API).
 *
 * Official docs: https://power.larc.nasa.gov/docs/services/api/
 *
 * Guarantees (docs/DATA_SOURCE_REGISTER.md A5, TEST_STRATEGY A01-A06):
 *  - unit integrity: the unit the API declares for each variable is asserted
 *    against its expected unit; a mismatch is a UnitMismatchError and the
 *    variable is unusable. No silent conversion (A02).
 *  - missing values: the API's own `header.fill_value` (normally -999) becomes
 *    `null` with a counted quality flag. Never 0 (A01).
 *  - date integrity: keys are parsed exactly; a date is never shifted or
 *    relabelled. Coverage gaps are reported, not smoothed.
 *  - provenance: dataClass is "reanalysis" (MERRA-2) and the API's own
 *    `header.sources` is preserved verbatim.
 *
 * Derivation (aggregates + indicators) lives in `deriveFromSeries` so the cache
 * path produces byte-identical output from stored daily values.
 */

import type {
  DailyPoint,
  DailySeries,
  DataClass,
  EvidenceObservation,
  Indicator,
  SourceRef,
} from "@fieldshift/shared";

import { daysBetween, enumerateDates, fromPowerDate, toPowerDate } from "../lib/dates.js";
import { AppError, UnitMismatchError } from "../lib/errors.js";
import { fetchJson, type FetchLike } from "../lib/http.js";

export const POWER_BASE_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
export const POWER_SPATIAL_RESOLUTION = "0.5 x 0.625 deg (MERRA-2)";
export const POWER_EARLIEST = "1980-01-01";

export const POWER_SOURCE: SourceRef = {
  id: "nasa_power",
  provider: "NASA LaRC",
  product: "POWER Agroclimatology — daily point (MERRA-2 based)",
  url: "https://power.larc.nasa.gov/docs/services/api/",
  dataClass: "reanalysis",
  spatialResolution: POWER_SPATIAL_RESOLUTION,
};

export type PowerVariable =
  | "T2M"
  | "T2M_MAX"
  | "T2M_MIN"
  | "PRECTOTCORR"
  | "RH2M"
  | "ALLSKY_SFC_SW_DWN"
  | "WS2M"
  | "GWETROOT"
  | "GWETPROF";

export interface VariableSpec {
  label: string;
  /** Expected unit exactly as POWER declares it. */
  unit: string;
  aggregation: "mean" | "sum" | "max" | "min";
  /** Unit of the aggregate when it differs from the daily unit. */
  aggregateUnit?: string;
  note?: string;
}

export const POWER_VARIABLES: Record<PowerVariable, VariableSpec> = {
  T2M: { label: "Temperature at 2 m", unit: "C", aggregation: "mean" },
  T2M_MAX: { label: "Maximum temperature at 2 m", unit: "C", aggregation: "max" },
  T2M_MIN: { label: "Minimum temperature at 2 m", unit: "C", aggregation: "min" },
  PRECTOTCORR: {
    label: "Precipitation (corrected)",
    unit: "mm/day",
    aggregation: "sum",
    aggregateUnit: "mm",
    note: "Daily values summed over the window give millimetres of rainfall.",
  },
  RH2M: { label: "Relative humidity at 2 m", unit: "%", aggregation: "mean" },
  ALLSKY_SFC_SW_DWN: {
    label: "All-sky surface shortwave downward irradiance",
    unit: "MJ/m^2/day",
    aggregation: "mean",
  },
  WS2M: { label: "Wind speed at 2 m", unit: "m/s", aggregation: "mean" },
  GWETROOT: {
    label: "Root-zone soil wetness (modelled)",
    unit: "1",
    aggregation: "mean",
    note: "MERRA-2 modelled wetness, dimensionless. Not a satellite measurement.",
  },
  GWETPROF: {
    label: "Profile soil wetness (modelled)",
    unit: "1",
    aggregation: "mean",
    note: "MERRA-2 modelled wetness, dimensionless. Not a satellite measurement.",
  },
};

export const DEFAULT_POWER_VARIABLES: PowerVariable[] = [
  "T2M",
  "T2M_MAX",
  "T2M_MIN",
  "PRECTOTCORR",
  "RH2M",
  "ALLSKY_SFC_SW_DWN",
  "WS2M",
  "GWETROOT",
];

export interface PowerQuery {
  lat: number;
  lon: number;
  /** ISO dates, inclusive. */
  start: string;
  end: string;
  variables?: PowerVariable[];
}

export interface PowerResult {
  source: SourceRef;
  gridPoint: { lat: number; lon: number };
  elevationM: number | null;
  header: {
    apiVersion: string;
    sources: string[];
    fillValue: number;
    timeStandard: string;
    start: string;
    end: string;
  };
  dataClass: DataClass;
  window: { start: string; end: string; days: number };
  dailySeries: DailySeries[];
  aggregates: EvidenceObservation[];
  indicators: Indicator[];
  missingVariables: string[];
  temporalCoverage: Array<{ variable: string; daysValid: number; daysRequested: number }>;
  limitations: string[];
}

export interface AdapterDeps {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  now?: Date;
}

function normaliseUnit(unit: string): string {
  return unit
    .trim()
    .replace(/°/g, "")
    .replace(/m²/g, "m^2")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function assertUnit(variable: string, received: string, expected: string): void {
  if (normaliseUnit(received) !== normaliseUnit(expected)) {
    throw new UnitMismatchError(variable, expected, received);
  }
}

interface PowerJson {
  geometry?: { coordinates?: unknown };
  properties?: { parameter?: unknown };
  header?: Record<string, unknown>;
  parameters?: Record<string, { units?: unknown; longname?: unknown }>;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

type ValidatedPowerJson = PowerJson & {
  header: Record<string, unknown>;
  properties: { parameter: Record<string, unknown> };
  parameters: Record<string, { units?: unknown; longname?: unknown }>;
};

function assertPowerShape(json: unknown): ValidatedPowerJson {
  if (!json || typeof json !== "object") {
    throw new AppError("SOURCE_INVALID_RESPONSE", "POWER returned a non-object payload");
  }
  const j = json as PowerJson;
  if (!j.properties || typeof j.properties.parameter !== "object" || j.properties.parameter === null) {
    throw new AppError("SOURCE_INVALID_RESPONSE", "POWER response is missing properties.parameter");
  }
  if (!j.header || typeof j.header !== "object") {
    throw new AppError("SOURCE_INVALID_RESPONSE", "POWER response is missing the header block");
  }
  // A04: without the parameters metadata units cannot be asserted at all.
  if (!j.parameters || typeof j.parameters !== "object") {
    throw new AppError(
      "SOURCE_INVALID_RESPONSE",
      "POWER response is missing the parameter metadata block (units cannot be verified)",
      { details: { block: "parameters" } },
    );
  }
  return j as ValidatedPowerJson;
}

export async function fetchPower(query: PowerQuery, deps: AdapterDeps = {}): Promise<PowerResult> {
  const now = deps.now ?? new Date();
  const variables = query.variables ?? DEFAULT_POWER_VARIABLES;

  // --- Pre-flight validation: fail before any network call (A05, A16) ---
  if (!Number.isFinite(query.lat) || !Number.isFinite(query.lon)) {
    throw new AppError("VALIDATION_ERROR", "lat and lon must be finite numbers", {
      details: { field: "coordinates" },
    });
  }
  if (query.lat < -90 || query.lat > 90 || query.lon < -180 || query.lon > 180) {
    throw new AppError("VALIDATION_ERROR", "Coordinates are out of range", {
      details: { lat: query.lat, lon: query.lon },
    });
  }
  const requestedDays = daysBetween(query.start, query.end);
  if (requestedDays <= 0) {
    throw new AppError("VALIDATION_ERROR", "start must be on or before end", {
      details: { start: query.start, end: query.end },
    });
  }
  if (query.start < POWER_EARLIEST) {
    throw new AppError("OUT_OF_COVERAGE", "POWER daily data does not start before 1980", {
      details: { requestedStart: query.start, earliest: POWER_EARLIEST },
    });
  }
  const unknownVar = variables.find((v) => !(v in POWER_VARIABLES));
  if (unknownVar) {
    throw new AppError("VALIDATION_ERROR", "Unsupported POWER variable requested", {
      details: { variable: unknownVar },
    });
  }

  const raw = await fetchJson(buildPowerUrl(query), {
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs ?? 20_000,
    sourceId: POWER_SOURCE.id,
  });
  const json = assertPowerShape(raw);

  const header = json.header;
  const fillValue = asNumber(header["fill_value"]);
  if (fillValue === null) {
    throw new AppError(
      "SOURCE_INVALID_RESPONSE",
      "POWER response does not declare header.fill_value; missing values cannot be detected safely",
      { details: { block: "header.fill_value" } },
    );
  }

  // --- Grid point actually resolved by POWER (A03) ---
  const coords = Array.isArray(json.geometry?.coordinates) ? json.geometry.coordinates : [];
  const gridLon = asNumber(coords[0]);
  const gridLat = asNumber(coords[1]);
  const elevationM = asNumber(coords[2]);

  if (gridLat === null || gridLon === null) {
    throw new AppError("SOURCE_INVALID_RESPONSE", "POWER response is missing geometry.coordinates");
  }
  const LON_TOLERANCE = 0.625;
  const LAT_TOLERANCE = 0.5;
  if (
    Math.abs(gridLon - query.lon) > LON_TOLERANCE ||
    Math.abs(gridLat - query.lat) > LAT_TOLERANCE
  ) {
    throw new AppError("OUT_OF_COVERAGE", "POWER resolved a grid point far from the requested location", {
      details: {
        requested: { lat: query.lat, lon: query.lon },
        resolved: { lat: gridLat, lon: gridLon },
        tolerance: { lat: LAT_TOLERANCE, lon: LON_TOLERANCE },
      },
    });
  }

  const retrievedAt = now.toISOString();
  const paramBlock = json.properties?.parameter as Record<string, unknown>;
  const expectedDates = enumerateDates(query.start, query.end);

  const dailySeries: DailySeries[] = [];
  const missingVariables: string[] = [];

  for (const variable of variables) {
    const spec = POWER_VARIABLES[variable];
    const meta = json.parameters?.[variable];

    if (!meta || typeof meta.units !== "string") {
      missingVariables.push(variable);
      continue;
    }
    assertUnit(variable, meta.units, spec.unit);

    const series = paramBlock[variable];
    if (!series || typeof series !== "object") {
      missingVariables.push(variable);
      continue;
    }

    let fillRemoved = 0;
    let nonNumeric = 0;
    const points: DailyPoint[] = expectedDates.map((date) => {
      const rawValue = (series as Record<string, unknown>)[toPowerDate(date)];
      if (rawValue === undefined) {
        nonNumeric += 1;
        return { date, value: null };
      }
      const num = asNumber(rawValue);
      if (num === null) {
        nonNumeric += 1;
        return { date, value: null };
      }
      if (Math.abs(num - fillValue) < 1e-9) {
        fillRemoved += 1;
        return { date, value: null };
      }
      return { date, value: num };
    });

    const qualityFlags: string[] = [];
    if (fillRemoved > 0) qualityFlags.push(`fill_value_removed:${fillRemoved}`);
    if (nonNumeric > 0) qualityFlags.push(`missing_key:${nonNumeric}`);

    const daysValid = points.filter((p) => p.value !== null).length;
    if (daysValid === 0) {
      missingVariables.push(variable);
      continue;
    }

    dailySeries.push({
      variable,
      label: spec.label,
      unit: spec.unit,
      points,
      dataClass: POWER_SOURCE.dataClass,
      sourceId: POWER_SOURCE.id,
      spatialResolution: POWER_SPATIAL_RESOLUTION,
      qualityFlags,
    });
  }

  const derived = deriveFromSeries(dailySeries, {
    windowStart: query.start,
    windowEnd: query.end,
    daysRequested: requestedDays,
    retrievedAt,
  });

  const limitations = [...derived.limitations];
  for (const variable of missingVariables) {
    const spec = POWER_VARIABLES[variable as PowerVariable];
    limitations.push(
      `${spec ? spec.label : variable} (${variable}) returned no usable days for this window and is excluded from every calculation.`,
    );
  }
  limitations.push(
    "POWER is a MERRA-2 based reanalysis on a ~0.5 degree grid: these values describe the area around the farm, not the field.",
  );
  limitations.push(
    "POWER is historical/model data, not a forecast. It must not be read as a weather prediction.",
  );

  return {
    source: POWER_SOURCE,
    gridPoint: { lat: gridLat, lon: gridLon },
    elevationM,
    header: {
      apiVersion: readApiVersion(header),
      sources: Array.isArray(header["sources"]) ? header["sources"].map(String) : [],
      fillValue,
      timeStandard: String(header["time_standard"] ?? "unknown"),
      start: String(header["start"] ?? ""),
      end: String(header["end"] ?? ""),
    },
    dataClass: POWER_SOURCE.dataClass,
    window: { start: query.start, end: query.end, days: requestedDays },
    dailySeries,
    aggregates: derived.aggregates,
    indicators: derived.indicators,
    missingVariables,
    temporalCoverage: derived.temporalCoverage,
    limitations,
  };
}

function readApiVersion(header: Record<string, unknown>): string {
  const api = header["api"];
  if (api && typeof api === "object") {
    return String((api as Record<string, unknown>)["version"] ?? "unknown");
  }
  return "unknown";
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Pure derivation shared by the live path and the cache path.
 * Given the same daily series it returns identical aggregates and indicators.
 */
export function deriveFromSeries(
  dailySeries: DailySeries[],
  meta: { windowStart: string; windowEnd: string; daysRequested: number; retrievedAt: string },
): {
  aggregates: EvidenceObservation[];
  indicators: Indicator[];
  temporalCoverage: Array<{ variable: string; daysValid: number; daysRequested: number }>;
  limitations: string[];
} {
  const retrievedAt = meta.retrievedAt;
  const aggregates: EvidenceObservation[] = [];
  const temporalCoverage: Array<{ variable: string; daysValid: number; daysRequested: number }> = [];
  const limitations: string[] = [];

  for (const series of dailySeries) {
    const spec = POWER_VARIABLES[series.variable as PowerVariable];
    if (!spec) continue;

    const values = series.points
      .filter((p): p is { date: string; value: number } => p.value !== null)
      .map((p) => p.value);

    temporalCoverage.push({
      variable: series.variable,
      daysValid: values.length,
      daysRequested: meta.daysRequested,
    });

    if (values.length < meta.daysRequested) {
      limitations.push(
        `${series.label} (${series.variable}) covers ${values.length} of ${meta.daysRequested} days; aggregates use only the valid days.`,
      );
    }

    const value =
      spec.aggregation === "sum"
        ? values.reduce((a, b) => a + b, 0)
        : spec.aggregation === "max"
          ? Math.max(...values)
          : spec.aggregation === "min"
            ? Math.min(...values)
            : values.reduce((a, b) => a + b, 0) / values.length;

    aggregates.push({
      variable: series.variable,
      label: series.label,
      unit: spec.aggregateUnit ?? spec.unit,
      aggregation: spec.aggregation,
      value: round(value, spec.aggregation === "sum" ? 2 : 3),
      windowStart: meta.windowStart,
      windowEnd: meta.windowEnd,
      nValid: values.length,
      nExpected: meta.daysRequested,
      qualityFlags: series.qualityFlags,
      dataClass: series.dataClass,
      spatialResolution: series.spatialResolution,
      sourceId: series.sourceId,
      retrievedAt,
      daily: series.points,
      ...(spec.note ? { processingNotes: spec.note } : {}),
    });
  }

  const indicators = buildIndicators(dailySeries, meta);
  return { aggregates, indicators, temporalCoverage, limitations };
}

/**
 * Descriptive indicators derived ONLY from validated daily values.
 * A missing series yields `value: null`, never 0 (engine spec §7).
 */
export function buildIndicators(
  series: DailySeries[],
  meta: { windowStart: string; windowEnd: string; retrievedAt: string },
): Indicator[] {
  const byVar = new Map(series.map((s) => [s.variable, s]));

  const make = (
    id: string,
    label: string,
    unit: string,
    value: number | null,
    qualityFlags: string[] = [],
    note?: string,
  ): Indicator => ({
    id,
    label,
    unit,
    value: value === null ? null : round(value, 2),
    windowStart: meta.windowStart,
    windowEnd: meta.windowEnd,
    sourceId: POWER_SOURCE.id,
    dataClass: POWER_SOURCE.dataClass,
    qualityFlags,
    ...(note ? { note } : {}),
  });

  const precip = byVar.get("PRECTOTCORR");
  const rain = precip?.points ?? [];
  const rainValues = rain.filter((p): p is { date: string; value: number } => p.value !== null);
  const rainSum = rainValues.length ? rainValues.reduce((a, b) => a + b.value, 0) : null;
  const rainDays = rainValues.length ? rainValues.filter((p) => p.value >= 1).length : null;

  let longestDry = 0;
  let current = 0;
  let gaps = 0;
  for (const p of rain) {
    if (p.value === null) {
      gaps += 1;
      current = 0;
      continue;
    }
    if (p.value < 1) {
      current += 1;
      longestDry = Math.max(longestDry, current);
    } else {
      current = 0;
    }
  }
  const drySpellCount10 = countRuns(rain, 10);

  const tmax = (byVar.get("T2M_MAX")?.points ?? []).filter((p) => p.value !== null);
  const tmin = (byVar.get("T2M_MIN")?.points ?? []).filter((p) => p.value !== null);
  const heat35 = tmax.length ? tmax.filter((p) => (p.value as number) >= 35).length : null;
  const heat40 = tmax.length ? tmax.filter((p) => (p.value as number) >= 40).length : null;
  const frost5 = tmin.length ? tmin.filter((p) => (p.value as number) <= 5).length : null;

  const mean = (v: DailySeries | undefined): number | null => {
    const vals = (v?.points ?? []).filter((p) => p.value !== null).map((p) => p.value as number);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const min = (v: DailySeries | undefined): number | null => {
    const vals = (v?.points ?? []).filter((p) => p.value !== null).map((p) => p.value as number);
    return vals.length ? Math.min(...vals) : null;
  };

  const gapNote = gaps > 0 ? `${gaps} day(s) in this window have no valid value.` : undefined;

  return [
    make("seasonRainMm", "Season rainfall (area)", "mm", rainSum, precip?.qualityFlags ?? [], gapNote),
    make("rainDays", "Days with at least 1 mm rain", "days", rainDays, precip?.qualityFlags ?? []),
    make(
      "longestDrySpellDays",
      "Longest dry spell (consecutive days under 1 mm)",
      "days",
      rainValues.length ? longestDry : null,
      precip?.qualityFlags ?? [],
      gapNote,
    ),
    make(
      "drySpellCount10",
      "Dry spells of 10 days or longer",
      "count",
      rainValues.length ? drySpellCount10 : null,
    ),
    make("heatDays35", "Days at or above 35 C", "days", heat35),
    make("heatDays40", "Days at or above 40 C", "days", heat40),
    make("frostDays5", "Days at or below 5 C", "days", frost5),
    make("meanT2M", "Mean temperature", "C", mean(byVar.get("T2M"))),
    make(
      "meanGwetroot",
      "Mean modelled root-zone soil wetness",
      "1",
      mean(byVar.get("GWETROOT")),
      [],
      "Modelled (MERRA-2), dimensionless. Not a satellite soil-moisture measurement.",
    ),
    make("minGwetroot", "Minimum modelled root-zone soil wetness", "1", min(byVar.get("GWETROOT"))),
    make("meanSolar", "Mean solar irradiance", "MJ/m^2/day", mean(byVar.get("ALLSKY_SFC_SW_DWN"))),
  ];
}

function countRuns(points: DailyPoint[], threshold: number): number {
  let runs = 0;
  let current = 0;
  for (const p of points) {
    if (p.value === null) {
      current = 0;
      continue;
    }
    if (p.value < 1) {
      current += 1;
      if (current === threshold) runs += 1;
    } else {
      current = 0;
    }
  }
  return runs;
}

/** Exported for tests: the exact URL the adapter builds. */
export function buildPowerUrl(query: PowerQuery): string {
  const variables = query.variables ?? DEFAULT_POWER_VARIABLES;
  return (
    `${POWER_BASE_URL}?parameters=${variables.join(",")}` +
    `&community=AG&latitude=${query.lat}&longitude=${query.lon}` +
    `&start=${toPowerDate(query.start)}&end=${toPowerDate(query.end)}&format=JSON`
  );
}

export { fromPowerDate };
