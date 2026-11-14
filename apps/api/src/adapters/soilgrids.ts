/**
 * ISRIC SoilGrids 2.0 adapter.
 *
 * Official project: https://soilgrids.org/
 * Endpoint used (verified live 2026-11-14):
 *   https://rest.isric.org/soilgrids/v2.0/properties/query
 *
 * Honesty rules (docs/DATA_SOURCE_REGISTER.md B12, TEST_STRATEGY A07-A09):
 *  - SoilGrids is a *digital soil map prediction* at 250 m, never a lab test.
 *  - A `null` mean is "no data" — never 0, never a district average, never a
 *    nearby substitute (A07).
 *  - Values arrive in mapped units (clay in g/kg with d_factor 10) and are
 *    converted exactly once to the target unit (A09).
 *  - Invalid depth labels are rejected by the adapter's allowed list (A08).
 */

import type {
  DataClass,
  SoilPropertyValue,
  SoilResult,
  SoilStatus,
  SourceRef,
} from "@fieldshift/shared";

import { AppError } from "../lib/errors.js";
import { fetchJson, type FetchLike } from "../lib/http.js";

export const SOILGRIDS_BASE_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query";

export const SOILGRIDS_SOURCE: SourceRef = {
  id: "soilgrids",
  provider: "ISRIC — World Soil Information",
  product: "SoilGrids 2.0 (250 m digital soil mapping)",
  url: "https://soilgrids.org/",
  // A model prediction from measured soil profiles — an estimate, not a sample.
  dataClass: "observation",
  spatialResolution: "250 m",
};

export const SOILGRIDS_SPATIAL_RESOLUTION = "250 m";

/** Depths supported by the provider. "0-30cm" is NOT valid (test A08). */
export const SOILGRIDS_DEPTHS = ["0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm"] as const;
export type SoilDepth = (typeof SOILGRIDS_DEPTHS)[number];

export interface SoilPropertySpec {
  property: string;
  label: string;
  /** Conventional unit we convert to, after dividing by d_factor once. */
  unit: string;
}

/** Only documented SoilGrids properties are requested. */
export const SOILGRIDS_PROPERTIES: Record<string, SoilPropertySpec> = {
  clay: { property: "clay", label: "Clay content", unit: "%" },
  sand: { property: "sand", label: "Sand content", unit: "%" },
  silt: { property: "silt", label: "Silt content", unit: "%" },
  soc: { property: "soc", label: "Soil organic carbon", unit: "g/kg" },
  phh2o: { property: "phh2o", label: "Soil pH (in water)", unit: "pH" },
  nitrogen: { property: "nitrogen", label: "Total nitrogen", unit: "g/kg" },
  cec: { property: "cec", label: "Cation exchange capacity", unit: "mmol(c)/kg" },
  bdod: { property: "bdod", label: "Bulk density", unit: "kg/dm3" },
};

const DEFAULT_PROPERTIES = ["clay", "sand", "soc", "phh2o"];
const DEFAULT_DEPTHS: SoilDepth[] = ["0-5cm", "5-15cm", "15-30cm"];

export interface SoilQuery {
  lat: number;
  lon: number;
  properties?: string[];
  depths?: string[];
}

export interface SoilAdapterDeps {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** SoilGrids latency is highly variable (1.5 s to >60 s observed); default is fail-fast. */
  retries?: number;
  now?: Date;
}

interface SoilLayer {
  name?: unknown;
  unit_measure?: { d_factor?: unknown; mapped_units?: unknown; target_units?: unknown };
  depths?: Array<{ label?: unknown; values?: { mean?: unknown } }>;
}

export function buildSoilgridsUrl(query: SoilQuery): string {
  const props = (query.properties ?? DEFAULT_PROPERTIES).join("&property=");
  const depths = (query.depths ?? DEFAULT_DEPTHS).map((d) => `&depth=${d}`).join("");
  return `${SOILGRIDS_BASE_URL}?lon=${query.lon}&lat=${query.lat}&property=${props}${depths}&value=mean`;
}

/**
 * Fetch and normalise SoilGrids properties.
 *
 * Never throws for "no data at this point": that is a valid answer returned as
 * `status: "unavailable"` with per-property `no_data`. Throws only for request
 * validation problems and genuinely failed/invalid responses.
 */
export async function fetchSoil(query: SoilQuery, deps: SoilAdapterDeps = {}): Promise<SoilResult> {
  const now = deps.now ?? new Date();
  const retrievedAt = now.toISOString();

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

  const properties = query.properties ?? DEFAULT_PROPERTIES;
  const depths = query.depths ?? DEFAULT_DEPTHS;

  // A08: reject undocumented depth labels before any network call.
  const badDepth = depths.find((d) => !(SOILGRIDS_DEPTHS as readonly string[]).includes(d));
  if (badDepth) {
    throw new AppError("VALIDATION_ERROR", "Unsupported SoilGrids depth label", {
      details: { depth: badDepth, allowed: [...SOILGRIDS_DEPTHS] },
    });
  }
  const badProp = properties.find((p) => !(p in SOILGRIDS_PROPERTIES));
  if (badProp) {
    throw new AppError("VALIDATION_ERROR", "Unsupported SoilGrids property", {
      details: { property: badProp, allowed: Object.keys(SOILGRIDS_PROPERTIES) },
    });
  }

  const raw = await fetchJson(buildSoilgridsUrl(query), {
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs ?? 12_000,
    retries: deps.retries ?? 0,
    sourceId: SOILGRIDS_SOURCE.id,
  });

  const layers = (raw as { properties?: { layers?: unknown } })?.properties?.layers;
  if (!Array.isArray(layers)) {
    throw new AppError("SOURCE_INVALID_RESPONSE", "SoilGrids response is missing properties.layers");
  }

  const values: SoilPropertyValue[] = [];
  const missing: string[] = [];

  for (const property of properties) {
    const spec = SOILGRIDS_PROPERTIES[property]!;
    const layer = (layers as SoilLayer[]).find((l) => l.name === property);

    if (!layer) {
      missing.push(property);
      continue;
    }

    const dFactor = Number(layer.unit_measure?.d_factor);
    const mappedUnit = String(layer.unit_measure?.mapped_units ?? "");
    if (!Number.isFinite(dFactor) || dFactor <= 0) {
      throw new AppError("SOURCE_INVALID_RESPONSE", `SoilGrids layer ${property} has no valid d_factor`, {
        details: { property, dFactor: layer.unit_measure?.d_factor },
      });
    }

    for (const depth of depths) {
      const depthEntry = layer.depths?.find((d) => d.label === depth);
      if (!depthEntry) {
        missing.push(`${property}:${depth}`);
        continue;
      }
      const rawValue =
        typeof depthEntry.values?.mean === "number" && Number.isFinite(depthEntry.values.mean)
          ? (depthEntry.values.mean as number)
          : null;

      // A09: divide by d_factor exactly once. 153 g/kg, d_factor 10 -> 15.3 %.
      const converted = rawValue === null ? null : rawValue / dFactor;

      values.push({
        property,
        label: spec.label,
        depth,
        value: converted === null ? null : Math.round(converted * 100) / 100,
        unit: spec.unit,
        rawValue,
        rawUnit: mappedUnit,
        status: rawValue === null ? "no_data" : "available",
        predicted: true,
      });

      if (rawValue === null) missing.push(`${property}:${depth}`);
    }
  }

  const available = values.filter((v) => v.status === "available").length;
  const status: SoilStatus =
    available === 0 ? "unavailable" : available < values.length ? "partial" : "ok";

  const limitations: string[] = [
    "SoilGrids values are model predictions at 250 m resolution, not measurements from this field.",
  ];
  if (status === "unavailable") {
    limitations.push(
      "No SoilGrids property value is available at this point; soil must be treated as unknown rather than estimated.",
    );
  } else if (status === "partial") {
    limitations.push(
      `${values.length - available} of ${values.length} property/depth combinations returned no value.`,
    );
  }

  if (status === "unavailable") missing.unshift("all_properties");

  return {
    sourceId: "soilgrids",
    status,
    properties: values,
    missing: [...new Set(missing)],
    spatialResolution: SOILGRIDS_SPATIAL_RESOLUTION,
    dataClass: SOILGRIDS_SOURCE.dataClass as DataClass,
    retrievedAt,
    limitations,
  };
}
