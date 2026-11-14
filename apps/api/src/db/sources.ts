/**
 * Data-source register reader (`data_sources`, seeded by migration 002).
 *
 * Reference metadata only: this never returns a measurement.
 */

import type { DataSourceEntry, SourcesResponse } from "@fieldshift/shared";

import type { SelectClient } from "./catalogue.js";

interface SourceRow {
  id: string;
  provider: string;
  product: string;
  url: string;
  data_class: string;
  variables: string[] | null;
  units: Record<string, string> | null;
  spatial_resolution: string;
  temporal_resolution: string;
  coverage: string;
  history: string | null;
  auth_required: boolean;
  usable_at_pilot: string;
  mvp_role: string;
  limitations: string[] | null;
}

export interface SourceStore {
  load(): Promise<SourcesResponse>;
}

const USABLE = new Set(["yes", "partial", "no", "no_data"]);
const ROLES = new Set(["evidence", "context", "reference", "optional", "excluded"]);

function asDataClass(value: string): DataSourceEntry["dataClass"] {
  return ["observation", "historical", "reanalysis", "forecast", "synthetic"].includes(value)
    ? value
    : "reanalysis";
}

export function mapSourceRow(row: SourceRow): DataSourceEntry {
  return {
    id: row.id,
    provider: row.provider,
    product: row.product,
    url: row.url,
    dataClass: asDataClass(row.data_class),
    variables: row.variables ?? [],
    units: row.units ?? {},
    spatialResolution: row.spatial_resolution,
    temporalResolution: row.temporal_resolution,
    coverage: row.coverage,
    history: row.history,
    auth: row.auth_required ? "earthdata" : "none",
    usableAtPilot: (USABLE.has(row.usable_at_pilot) ? row.usable_at_pilot : "no") as DataSourceEntry["usableAtPilot"],
    role: (ROLES.has(row.mvp_role) ? row.mvp_role : "excluded") as DataSourceEntry["role"],
    limitations: row.limitations ?? [],
  };
}

export function createSupabaseSourceStore(client: SelectClient, ttlMs = 10 * 60 * 1000): SourceStore {
  let cached: { at: number; value: SourcesResponse } | null = null;

  return {
    async load() {
      const now = Date.now();
      if (cached && now - cached.at < ttlMs) return cached.value;

      const result = await client
        .from("data_sources")
        .select(
          "id,provider,product,url,data_class,variables,units,spatial_resolution,temporal_resolution,coverage,history,auth_required,usable_at_pilot,mvp_role,limitations",
        );
      if (result.error) throw new Error(`sources unavailable: ${result.error.message}`);

      const rows = Array.isArray(result.data) ? (result.data as SourceRow[]) : [];
      const value: SourcesResponse = {
        sources: rows.map(mapSourceRow).sort((a, b) => a.id.localeCompare(b.id)),
      };
      cached = { at: now, value };
      return value;
    },
  };
}

export function createStaticSourceStore(value: SourcesResponse): SourceStore {
  return {
    async load() {
      return value;
    },
  };
}
