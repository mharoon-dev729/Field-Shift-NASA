/**
 * Catalogue contract: the cited crop / rotation reference data the frontend needs
 * to build a comparison request (API_CONTRACT.md §3), plus the data-source
 * register used by the provenance panel (§5).
 *
 * These endpoints expose reference data only — no measurements, no scores.
 */

import { z } from "zod";

import { DATA_CLASSES, SEASONS } from "./primitives.js";

export const DEMAND_CLASSES = ["low", "medium", "high"] as const;
export type DemandClassValue = (typeof DEMAND_CLASSES)[number];

export interface CropSource {
  title: string;
  url: string;
  quality: "high" | "medium" | "low";
}

export interface CropWindow {
  /** Concrete dates for the requested planning year. */
  start: string;
  end: string;
  /** The catalogue's district-level recommendation (MM-DD), preserved verbatim. */
  startMd: string;
  endMd: string;
}

export interface CropCatalogueEntry {
  id: string;
  name: string;
  localName: string | null;
  season: "rabi" | "kharif" | "annual";
  sowingWindow: CropWindow | null;
  harvestWindow: CropWindow | null;
  waterDemandClass: DemandClassValue | null;
  heatSensitivity: DemandClassValue | null;
  isLegume: boolean;
  residueClass: DemandClassValue | null;
  selectable: boolean;
  verified: boolean;
  sources: CropSource[];
  limitations: string[];
}

export interface RotationPhase {
  cropId: string;
  season: "rabi" | "kharif";
}

export interface RotationCatalogueEntry {
  id: string;
  label: string;
  phases: RotationPhase[];
  whyIncluded: string;
  sources: CropSource[];
  active: boolean;
  /** False when a phase crop is not selectable: the UI must not offer it. */
  evaluable: boolean;
  /** Human-readable reason when `evaluable` is false. */
  excludedReason: string | null;
}

export interface CropsResponse {
  planningYear: number;
  crops: CropCatalogueEntry[];
  rotations: RotationCatalogueEntry[];
}

export interface DataSourceEntry {
  id: string;
  provider: string;
  product: string;
  url: string;
  dataClass: string;
  variables: string[];
  units: Record<string, string>;
  spatialResolution: string;
  temporalResolution: string;
  coverage: string;
  history: string | null;
  auth: "none" | "earthdata";
  usableAtPilot: "yes" | "partial" | "no" | "no_data";
  role: "evidence" | "context" | "reference" | "optional" | "excluded";
  limitations: string[];
}

export interface SourcesResponse {
  sources: DataSourceEntry[];
}

export const cropsQuerySchema = z
  .object({
    season: z.enum(SEASONS).optional(),
    /** Planning year used to turn MM-DD recommendations into concrete dates. */
    year: z.coerce.number().int().min(1980).max(2100).optional(),
    includeUnverified: z
      .union([z.literal("true"), z.literal("false")])
      .optional()
      .transform((v) => v === "true"),
  })
  .strict();

export type CropsQuery = z.infer<typeof cropsQuerySchema>;

const cropSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  quality: z.enum(["high", "medium", "low"]),
});

const cropWindowSchema = z.object({
  start: z.string(),
  end: z.string(),
  startMd: z.string(),
  endMd: z.string(),
});

const cropEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  localName: z.string().nullable(),
  season: z.enum(["rabi", "kharif", "annual"]),
  sowingWindow: cropWindowSchema.nullable(),
  harvestWindow: cropWindowSchema.nullable(),
  waterDemandClass: z.enum(DEMAND_CLASSES).nullable(),
  heatSensitivity: z.enum(DEMAND_CLASSES).nullable(),
  isLegume: z.boolean(),
  residueClass: z.enum(DEMAND_CLASSES).nullable(),
  selectable: z.boolean(),
  verified: z.boolean(),
  sources: z.array(cropSourceSchema),
  limitations: z.array(z.string()),
});

export const cropsResponseSchema = z.object({
  planningYear: z.number().int(),
  crops: z.array(cropEntrySchema),
  rotations: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      phases: z.array(z.object({ cropId: z.string(), season: z.enum(SEASONS) })),
      whyIncluded: z.string(),
      sources: z.array(cropSourceSchema),
      active: z.boolean(),
      evaluable: z.boolean(),
      excludedReason: z.string().nullable(),
    }),
  ),
});

export const sourcesResponseSchema = z.object({
  sources: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      product: z.string(),
      url: z.string(),
      dataClass: z.enum(DATA_CLASSES),
      variables: z.array(z.string()),
      units: z.record(z.string()),
      spatialResolution: z.string(),
      temporalResolution: z.string(),
      coverage: z.string(),
      history: z.string().nullable(),
      auth: z.enum(["none", "earthdata"]),
      usableAtPilot: z.enum(["yes", "partial", "no", "no_data"]),
      role: z.enum(["evidence", "context", "reference", "optional", "excluded"]),
      limitations: z.array(z.string()),
    }),
  ),
});
