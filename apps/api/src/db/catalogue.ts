/**
 * Catalogue access: crops and documented rotation templates.
 *
 * Reads the Phase 2 tables (`crop_catalog`, `rotation_templates`). No values are
 * invented here: a NULL column stays NULL, and `selectable`/`verified` are passed
 * through untouched so the engine can refuse to score them.
 */

import type { Season } from "@fieldshift/shared";

import type { DemandClass, EngineCropDef, EngineRotationDef } from "../engine/index.js";

export interface CatalogueSnapshot {
  crops: EngineCropDef[];
  rotations: EngineRotationDef[];
}

export interface CatalogueStore {
  load(): Promise<CatalogueSnapshot>;
}

interface CropRow {
  id: string;
  name: string;
  local_name: string | null;
  season: string;
  sowing_start_md: string | null;
  sowing_end_md: string | null;
  harvest_start_md: string | null;
  harvest_end_md: string | null;
  limitations: string[] | null;
  water_demand_class: string | null;
  heat_sensitivity: string | null;
  is_legume: boolean;
  residue_class: string | null;
  selectable: boolean;
  verified: boolean;
  evidence_quality: string;
  source_urls: string[];
}

interface RotationRow {
  id: string;
  label: string;
  phases: unknown;
  why_included: string;
  source_urls: string[];
  active: boolean;
}

/** Minimal shape of the Supabase client we need, so tests can inject a stub. */
export interface SelectClient {
  from(table: string): {
    select(columns: string): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
}

function asDemand(value: string | null): DemandClass | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function asSeason(value: unknown): Season | null {
  return value === "rabi" || value === "kharif" ? value : null;
}

export function mapCropRow(row: CropRow): EngineCropDef {
  return {
    id: row.id,
    name: row.name,
    localName: row.local_name ?? null,
    season: row.season === "annual" ? "annual" : (asSeason(row.season) ?? "annual"),
    sowingStartMd: row.sowing_start_md ?? null,
    sowingEndMd: row.sowing_end_md ?? null,
    harvestStartMd: row.harvest_start_md ?? null,
    harvestEndMd: row.harvest_end_md ?? null,
    limitations: row.limitations ?? [],
    waterDemandClass: asDemand(row.water_demand_class),
    heatSensitivity: asDemand(row.heat_sensitivity),
    isLegume: row.is_legume,
    residueClass: asDemand(row.residue_class),
    selectable: row.selectable,
    verified: row.verified,
    evidenceQuality:
      row.evidence_quality === "high" || row.evidence_quality === "low" ? row.evidence_quality : "medium",
    sourceUrls: row.source_urls ?? [],
  };
}

export function mapRotationRow(row: RotationRow): EngineRotationDef {
  const phasesRaw = Array.isArray(row.phases) ? row.phases : [];
  const phases = phasesRaw
    .map((phase) => {
      const candidate = phase as { cropId?: unknown; season?: unknown };
      const season = asSeason(candidate.season);
      if (typeof candidate.cropId !== "string" || !season) return null;
      return { cropId: candidate.cropId, season };
    })
    .filter((p): p is { cropId: string; season: Season } => p !== null);

  return {
    id: row.id,
    label: row.label,
    phases,
    whyIncluded: row.why_included,
    sourceUrls: row.source_urls ?? [],
    active: row.active,
  };
}

/** Loads from Supabase once and caches in memory for `ttlMs` (catalogue is static). */
export function createSupabaseCatalogueStore(client: SelectClient, ttlMs = 10 * 60 * 1000): CatalogueStore {
  let cached: { at: number; snapshot: CatalogueSnapshot } | null = null;

  return {
    async load() {
      const now = Date.now();
      if (cached && now - cached.at < ttlMs) return cached.snapshot;

      const cropsResult = await client
        .from("crop_catalog")
        .select(
          "id,name,local_name,season,sowing_start_md,sowing_end_md,harvest_start_md,harvest_end_md,water_demand_class,heat_sensitivity,is_legume,residue_class,selectable,verified,evidence_quality,source_urls,limitations",
        );
      if (cropsResult.error) {
        throw new Error(`catalogue unavailable: ${cropsResult.error.message}`);
      }
      const rotationsResult = await client
        .from("rotation_templates")
        .select("id,label,phases,why_included,source_urls,active");
      if (rotationsResult.error) {
        throw new Error(`catalogue unavailable: ${rotationsResult.error.message}`);
      }

      const snapshot: CatalogueSnapshot = {
        crops: (cropsResult.data as CropRow[]).map(mapCropRow),
        rotations: (rotationsResult.data as RotationRow[]).map(mapRotationRow),
      };
      cached = { at: now, snapshot };
      return snapshot;
    },
  };
}

/** Static store for tests and for builds without database credentials. */
export function createStaticCatalogueStore(snapshot: CatalogueSnapshot): CatalogueStore {
  return { async load() { return snapshot; } };
}
