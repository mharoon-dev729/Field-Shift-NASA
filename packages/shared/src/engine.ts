/**
 * Decision-engine contract (docs/DECISION_ENGINE_SPEC.md, Phase 3).
 *
 * The engine itself is pure: these types are shared by the API (which produces
 * the result) and the web client (which will render it), so documentation,
 * server and client cannot drift without failing typecheck.
 *
 * Honesty rules encoded here:
 *  - `index` and every `sub` are nullable. `null` means "not computed", which is
 *    never the same as 0 and never a favourable score.
 *  - every criterion carries its own provenance, unit and missing inputs.
 *  - `confidence: "insufficient_evidence"` accompanies `index: null`.
 */

import { z } from "zod";

import {
  DATA_CLASSES,
  IRRIGATION_SOURCES,
  SEASONS,
  pointSchema,
  prioritiesSchema,
  type DataClass,
  type Season,
} from "./primitives.js";

export const ENGINE_VERSION = "1.0.0";
export const INDEX_LABEL = "comparative index (0-100, relative to options shown)";

export const CRITERION_IDS = ["C1", "C2", "C3", "C4", "C5"] as const;
export type CriterionId = (typeof CRITERION_IDS)[number];

export type EngineConfidence = "moderate" | "low" | "insufficient_evidence";
export type EngineStatus = "ok" | "partial" | "insufficient_evidence";

export interface EnginePriorities {
  water: number;
  soilHealth: number;
  climateResilience: number;
}

/** One traceable input behind a criterion. NASA data and agronomy stay separate. */
export interface CriterionProvenance {
  /** `nasa_power` for environmental values, `crop_catalog`/`rotation_templates` for agronomy. */
  sourceId: string;
  variable: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  /** `reference` marks cited agronomic attributes, so they never look like NASA data. */
  dataClass: DataClass | "reference" | null;
  spatialResolution: string | null;
  /** True when the value is a SoilGrids prediction rather than a measurement. */
  predicted?: boolean;
}

export interface CriterionResult {
  id: CriterionId;
  label: string;
  /** False ⇒ `sub` is null and the weight is excluded, never zero-scored. */
  available: boolean;
  status: "scored" | "partial" | "unavailable";
  sub: number | null;
  /** Effective weight after priority multipliers and per-scenario redistribution. */
  weight: number;
  /** Weight before redistribution, so a reader can audit the redistribution. */
  rawWeight: number;
  raw: Record<string, number | null>;
  unit: string | null;
  dataClass: DataClass | "reference" | null;
  /** Identifier of the exact rule applied (see docs/DECISION_ENGINE_SPEC.md). */
  ruleId: string;
  note: string;
  missing: string[];
  provenance: CriterionProvenance[];
}

export interface ScenarioExplanation {
  supporting: string[];
  risks: string[];
  missing: string[];
  cannotConclude: string[];
}

export interface ScenarioResult {
  scenarioId: string;
  label: string;
  isBaseline: boolean;
  index: number | null;
  confidence: EngineConfidence;
  /** Share of applicable effective weight that could be computed (0-1). */
  evidenceCoverage: number;
  components: CriterionResult[];
  explanation: ScenarioExplanation;
  limitations: string[];
  /** Criteria whose weight was removed and redistributed for this scenario. */
  redistributed: CriterionId[];
  comparabilityWarning: boolean;
  provenance: CriterionProvenance[];
  whyIncluded: string;
}

export interface PairwiseComparison {
  a: string;
  b: string;
  /** Absolute difference in comparative index between the two scenarios. */
  delta: number;
  /** False ⇒ `difference_not_meaningful`: no winner may be claimed. */
  meaningful: boolean;
}

export interface EngineSourceRef {
  id: string;
  provider: string;
  product: string;
  url: string;
  dataClass: DataClass | "reference";
  retrievedAt: string | null;
  scope: "environmental" | "agronomic";
}

export interface EngineResult {
  runId: string;
  engineVersion: string;
  inputEcho: {
    season: Season;
    planningYear: number;
    priorities: EnginePriorities;
    point: { lat: number; lon: number };
    irrigation: string;
    currentRotationId: string;
  };
  status: EngineStatus;
  indexLabel: string;
  weighting: {
    provisional: true;
    components: Record<string, number>;
    note: string;
  };
  scenarios: ScenarioResult[];
  ranking: string[];
  evidenceCoverage: number;
  pairwise: PairwiseComparison[];
  globalLimitations: string[];
  dataSources: EngineSourceRef[];
  generatedAt: string;
}

/** --- Request contract for POST /api/v1/compare (API_CONTRACT.md §6) --- */

const soilInputSchema = z
  .object({
    texture: z.string().min(1).max(40).nullable().optional(),
    pH: z.number().min(3).max(11).nullable().optional(),
    organicMatter: z.number().min(0).max(20).nullable().optional(),
  })
  .strict();

export const compareRequestSchema = z_compare();

function z_compare() {
  return z
    .object({
      point: pointSchema.strict(),
      season: z.enum(SEASONS),
      planningYear: z.number().int().min(1980).max(new Date().getUTCFullYear() + 1),
      currentRotationId: z.string().min(1).max(64),
      previousCropId: z.string().min(1).max(64).nullable().optional(),
      irrigation: z.enum(IRRIGATION_SOURCES),
      farmSizeAcres: z.number().min(0.1).max(5000).nullable().optional(),
      soil: soilInputSchema.nullable().optional(),
      priorities: prioritiesSchema,
      candidateRotationIds: z.array(z.string().min(1).max(64)).min(1).max(6),
    })
    .strict()
    .refine((r) => r.candidateRotationIds.includes(r.currentRotationId), {
      message: "currentRotationId must be one of candidateRotationIds",
      path: ["currentRotationId"],
    })
    .refine((r) => new Set(r.candidateRotationIds).size === r.candidateRotationIds.length, {
      message: "candidateRotationIds must not contain duplicates",
      path: ["candidateRotationIds"],
    });
}

export type CompareRequest = z.infer<typeof compareRequestSchema>;

/** --- Response schema (contract tests parse real responses with this) --- */

const provenanceSchema = z.object({
  sourceId: z.string(),
  variable: z.string().nullable(),
  windowStart: z.string().nullable(),
  windowEnd: z.string().nullable(),
  dataClass: z.enum([...DATA_CLASSES, "reference"]).nullable(),
  spatialResolution: z.string().nullable(),
  predicted: z.boolean().optional(),
});

const criterionSchema = z.object({
  id: z.enum(CRITERION_IDS),
  label: z.string(),
  available: z.boolean(),
  status: z.enum(["scored", "partial", "unavailable"]),
  sub: z.number().nullable(),
  weight: z.number(),
  rawWeight: z.number(),
  raw: z.record(z.number().nullable()),
  unit: z.string().nullable(),
  dataClass: z.enum([...DATA_CLASSES, "reference"]).nullable(),
  ruleId: z.string(),
  note: z.string(),
  missing: z.array(z.string()),
  provenance: z.array(provenanceSchema),
});

const scenarioSchema = z.object({
  scenarioId: z.string(),
  label: z.string(),
  isBaseline: z.boolean(),
  index: z.number().nullable(),
  confidence: z.enum(["moderate", "low", "insufficient_evidence"]),
  evidenceCoverage: z.number(),
  components: z.array(criterionSchema),
  explanation: z.object({
    supporting: z.array(z.string()),
    risks: z.array(z.string()),
    missing: z.array(z.string()),
    cannotConclude: z.array(z.string()),
  }),
  limitations: z.array(z.string()),
  redistributed: z.array(z.enum(CRITERION_IDS)),
  comparabilityWarning: z.boolean(),
  provenance: z.array(provenanceSchema),
  whyIncluded: z.string().min(1),
});

export const engineResultSchema = z.object({
  runId: z.string().uuid(),
  engineVersion: z.string(),
  inputEcho: z.object({
    season: z.enum(SEASONS),
    planningYear: z.number().int(),
    priorities: z.object({
      water: z.number(),
      soilHealth: z.number(),
      climateResilience: z.number(),
    }),
    point: z.object({ lat: z.number(), lon: z.number() }),
    irrigation: z.string(),
    currentRotationId: z.string(),
  }),
  status: z.enum(["ok", "partial", "insufficient_evidence"]),
  indexLabel: z.string(),
  weighting: z.object({
    provisional: z.literal(true),
    components: z.record(z.number()),
    note: z.string(),
  }),
  scenarios: z.array(scenarioSchema),
  ranking: z.array(z.string()),
  evidenceCoverage: z.number(),
  pairwise: z.array(
    z.object({ a: z.string(), b: z.string(), delta: z.number(), meaningful: z.boolean() }),
  ),
  globalLimitations: z.array(z.string()),
  dataSources: z.array(
    z.object({
      id: z.string(),
      provider: z.string(),
      product: z.string(),
      url: z.string(),
      dataClass: z.enum([...DATA_CLASSES, "reference"]),
      retrievedAt: z.string().nullable(),
      scope: z.enum(["environmental", "agronomic"]),
    }),
  ),
  generatedAt: z.string(),
});

export type EngineResultParsed = z.infer<typeof engineResultSchema>;
