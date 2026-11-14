/**
 * Deterministic fixtures for automated tests.
 *
 * These are SYNTHETIC and exist only under test/. They are never served by the
 * API: the adapter marks nothing as synthetic here, but the production path is
 * covered separately, and `ALLOW_SYNTHETIC_FIXTURES` is false by default.
 */

import { POWER_VARIABLES, type PowerVariable } from "../../src/adapters/power.js";

export function isoAddDays(start: string, days: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function powerKey(iso: string): string {
  return iso.replace(/-/g, "");
}

export interface PowerFixtureOptions {
  start: string;
  days: number;
  lat?: number;
  lon?: number;
  /** Value used for every variable/day unless overridden. */
  fill?: number;
  /** Override the unit the fixture declares for a variable. */
  units?: Partial<Record<PowerVariable, string>>;
  /** Return null to omit the key entirely; return NaN to write a non-numeric value. */
  values?: Partial<Record<PowerVariable, (dayIndex: number, date: string) => number | null>>;
  omitVariables?: PowerVariable[];
  omitParametersBlock?: boolean;
  omitParameterMetaFor?: PowerVariable[];
  /** Set to override the declared fill_value marker. */
  fillValue?: number;
}

const DEFAULTS: Record<PowerVariable, (i: number) => number> = {
  T2M: (i) => 28 + (i % 7),
  T2M_MAX: (i) => 36 + (i % 5),
  T2M_MIN: (i) => 18 + (i % 4),
  PRECTOTCORR: (i) => (i % 5 === 0 ? 4.5 : 0),
  RH2M: () => 52,
  ALLSKY_SFC_SW_DWN: () => 21.5,
  WS2M: () => 2.4,
  GWETROOT: () => 0.31,
  GWETPROF: () => 0.34,
};

export interface PowerFixture {
  json: Record<string, unknown>;
}

export function makePowerResponse(options: PowerFixtureOptions): PowerFixture {
  const lat = options.lat ?? 31.419;
  const lon = options.lon ?? 73.079;
  const fillValue = options.fillValue ?? -999;
  const variables = (Object.keys(POWER_VARIABLES) as PowerVariable[]).filter(
    (v) => !(options.omitVariables ?? []).includes(v),
  );

  const parameter: Record<string, Record<string, number | null>> = {};
  const parameterMeta: Record<string, { units: string; longname: string }> = {};

  for (const variable of variables) {
    const series: Record<string, number | null> = {};
    for (let i = 0; i < options.days; i += 1) {
      const date = isoAddDays(options.start, i);
      const override = options.values?.[variable];
      const value = override ? override(i, date) : DEFAULTS[variable](i);
      if (value === null) continue; // omit the key entirely
      if (Number.isNaN(value)) {
        (series as Record<string, unknown>)[powerKey(date)] = "n/a";
        continue;
      }
      series[powerKey(date)] = value;
    }
    parameter[variable] = series;
    if (!(options.omitParameterMetaFor ?? []).includes(variable)) {
      parameterMeta[variable] = {
        units: options.units?.[variable] ?? POWER_VARIABLES[variable].unit,
        longname: POWER_VARIABLES[variable].label,
      };
    }
  }

  const json: Record<string, unknown> = {
    type: "Feature",
    geometry: { type: "Point", coordinates: [lon, lat, 182.92] },
    properties: { parameter },
    header: {
      title: "NASA/POWER Source Native Resolution Daily Data",
      api: { version: "v2.10.3", name: "POWER Daily API" },
      sources: ["MERRA2"],
      fill_value: fillValue,
      time_standard: "LST",
      start: powerKey(options.start),
      end: powerKey(isoAddDays(options.start, options.days - 1)),
    },
  };

  if (!options.omitParametersBlock) json["parameters"] = parameterMeta;

  return { json };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function textResponse(body: string, status = 500, contentType = "text/html"): Response {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

/** SoilGrids fixture with optional null means. */
export function makeSoilResponse(options: {
  nullProperties?: string[];
  dFactor?: number;
  units?: Record<string, { mapped: string; target?: string }>;
  values?: Record<string, number>;
} = {}): { json: unknown } {
  const props = ["clay", "sand", "soc", "phh2o"];
  const defaults: Record<string, number> = { clay: 153, sand: 349, soc: 90, phh2o: 80 };
  const layers = props.map((property) => {
    const meta = options.units?.[property];
    return {
      name: property,
      unit_measure: {
        d_factor: options.dFactor ?? 10,
        mapped_units: meta?.mapped ?? "g/kg",
        target_units: meta?.target ?? "%",
      },
      depths: ["0-5cm", "5-15cm", "15-30cm"].map((label) => ({
        range: { top_depth: 0, bottom_depth: 5, unit_depth: "cm" },
        label,
        values: {
          mean: (options.nullProperties ?? []).includes(property)
            ? null
            : (options.values?.[property] ?? defaults[property]),
        },
      })),
    };
  });
  return { json: { type: "Feature", properties: { layers } } };
}

/** A fetch stub that records calls and returns queued responses. */
export function stubFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
