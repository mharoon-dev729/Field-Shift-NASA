/**
 * NASA POWER climatology (monthly normals) — used ONLY for the C1 rainfall
 * anomaly term (DECISION_ENGINE_SPEC §4.1 `normalRainMm`).
 *
 * Deliberately defensive: any unexpected shape, unit or month coverage returns
 * `null` rather than a partial guess. C1 then reports the anomaly as missing
 * instead of inventing a baseline.
 *
 * Docs: https://power.larc.nasa.gov/docs/services/api/temporal/climatology/
 */

import { fetchJson, type FetchLike } from "../lib/http.js";

export const POWER_CLIMATOLOGY_URL = "https://power.larc.nasa.gov/api/temporal/climatology/point";
const MONTH_KEYS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const EXPECTED_UNIT = "mm/day";

export type MonthlyNormals = Record<number, number>;

export interface ClimatologyDeps {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

export function buildClimatologyUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    parameters: "PRECTOTCORR",
    community: "AG",
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    format: "JSON",
  });
  return `${POWER_CLIMATOLOGY_URL}?${params.toString()}`;
}

/**
 * Returns monthly mean precipitation normals (mm/day) for January..December, or
 * null when the payload cannot be trusted.
 */
export async function fetchPrecipClimatology(
  lat: number,
  lon: number,
  deps: ClimatologyDeps = {},
): Promise<MonthlyNormals | null> {
  try {
    const raw = await fetchJson(buildClimatologyUrl(lat, lon), {
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.timeoutMs ?? 15_000,
      sourceId: "nasa_power",
    });

    const json = raw as {
      parameters?: Record<string, { units?: unknown }>;
      properties?: { parameter?: Record<string, unknown> };
    };
    const units = json.parameters?.PRECTOTCORR?.units;
    const block = json.properties?.parameter?.PRECTOTCORR;
    if (typeof units !== "string" || !block || typeof block !== "object") return null;
    if (units.trim().toLowerCase().replace(/\s+/g, "") !== EXPECTED_UNIT) return null;

    const values = block as Record<string, unknown>;
    const normals: MonthlyNormals = {};
    for (let month = 1; month <= 12; month += 1) {
      const value = values[MONTH_KEYS[month - 1]!];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
      normals[month] = value;
    }
    return normals;
  } catch {
    // A missing normal is a documented limitation, never a fatal error.
    return null;
  }
}
