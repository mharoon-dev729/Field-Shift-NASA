/**
 * Engine input types and pre-flight validation.
 *
 * The engine receives already-retrieved data. It never calls a network, never
 * reads configuration, and never touches the database (spec §0).
 */

import type { DataClass, EnginePriorities, Season } from "@fieldshift/shared";

import { AppError } from "../lib/errors.js";

export type DemandClass = "low" | "medium" | "high";

export interface EngineCropDef {
  id: string;
  name: string;
  season: "rabi" | "kharif" | "annual";
  /** Documented calendar as MM-DD; null means unsourced (crop is not selectable). */
  sowingStartMd: string | null;
  harvestEndMd: string | null;
  /** Reference-only fields, used by GET /crops; the engine never scores them. */
  sowingEndMd?: string | null;
  harvestStartMd?: string | null;
  localName?: string | null;
  limitations?: string[];
  waterDemandClass: DemandClass | null;
  heatSensitivity: DemandClass | null;
  isLegume: boolean;
  residueClass: DemandClass | null;
  selectable: boolean;
  /** False ⇒ the catalogue row itself is not yet verified; attributes are unusable. */
  verified: boolean;
  evidenceQuality: "high" | "medium" | "low";
  sourceUrls: string[];
}

export interface EngineRotationDef {
  id: string;
  label: string;
  phases: Array<{ cropId: string; season: Season }>;
  whyIncluded: string;
  sourceUrls: string[];
  active: boolean;
}

/** One validated daily series for one crop window. */
export interface EnginePhaseSeries {
  variable: string;
  unit: string;
  dataClass: DataClass;
  sourceId: string;
  spatialResolution: string;
  retrievedAt?: string | null;
  points: Array<{ date: string; value: number | null }>;
}

export interface EnginePhaseData {
  cropId: string;
  season: Season;
  windowStart: string;
  windowEnd: string;
  series: EnginePhaseSeries[];
  /**
   * Monthly climatological normal (mm/day, index 1-12) for PRECTOTCORR, or
   * null when it could not be retrieved. Never estimated from the daily series.
   */
  monthlyNormalMmPerDay: Record<number, number> | null;
}

export interface EngineInput {
  runId: string;
  generatedAt: string;
  point: { lat: number; lon: number };
  season: Season;
  planningYear: number;
  currentRotationId: string;
  previousCropId: string | null;
  irrigation: string;
  farmSizeAcres: number | null;
  priorities: EnginePriorities;
  rotations: EngineRotationDef[];
  crops: EngineCropDef[];
  phases: EnginePhaseData[];
  /** Only a test run may consume `synthetic` fixtures (spec §1.2, E17). */
  test?: boolean;
  allowSynthetic?: boolean;
}

/** Thrown when synthetic data would reach a user-facing result (E17). */
export class SyntheticDataRejected extends AppError {
  constructor(variable: string) {
    super("VALIDATION_ERROR", `Synthetic data is not allowed in engine results (${variable})`, {
      details: { variable, dataClass: "synthetic" },
    });
    this.name = "SyntheticDataRejected";
  }
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates everything the engine relies on. Throws `AppError` so the HTTP layer
 * produces the standard envelope; the route never sees a half-computed result.
 */
export function assertEngineInput(input: EngineInput): void {
  const { priorities } = input;

  // E12 — all-zero priorities make the weighting undefined, not balanced.
  const sum = priorities.water + priorities.soilHealth + priorities.climateResilience;
  if (!Number.isFinite(sum) || sum <= 0) {
    throw new AppError("VALIDATION_ERROR", "At least one priority must be greater than zero", {
      details: { field: "priorities" },
    });
  }
  for (const [key, value] of Object.entries(priorities)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new AppError("VALIDATION_ERROR", "Each priority must be between 0 and 1", {
        details: { field: `priorities.${key}`, received: value },
      });
    }
  }

  const candidates = input.rotations.map((r) => r.id);

  // E18 — no candidates, nothing to compare.
  if (candidates.length === 0) {
    throw new AppError("VALIDATION_ERROR", "At least one candidate rotation is required", {
      details: { field: "candidateRotationIds" },
    });
  }

  // E19 — the baseline must be part of the comparison.
  if (!candidates.includes(input.currentRotationId)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "currentRotationId must be included in candidateRotationIds",
      { details: { field: "currentRotationId", received: input.currentRotationId } },
    );
  }

  for (const rotation of input.rotations) {
    if (!nonEmpty(rotation.id) || !nonEmpty(rotation.label)) {
      throw new AppError("VALIDATION_ERROR", "Rotation is missing an id or label", {
        details: { rotationId: rotation.id ?? null },
      });
    }
    if (rotation.phases.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Rotation has no phases", {
        details: { rotationId: rotation.id },
      });
    }
    for (const phase of rotation.phases) {
      if (!input.crops.some((c) => c.id === phase.cropId)) {
        throw new AppError("VALIDATION_ERROR", "Rotation references an unknown crop", {
          details: { rotationId: rotation.id, cropId: phase.cropId },
        });
      }
    }
  }

  // E17 — a synthetic value may never reach a user-facing result.
  for (const phase of input.phases) {
    for (const series of phase.series) {
      if (series.dataClass === "synthetic" && !(input.test === true && input.allowSynthetic === true)) {
        throw new SyntheticDataRejected(series.variable);
      }
    }
  }
}

/** Convenience: the candidate ids in the order they were supplied. */
export function candidateIds(input: EngineInput): string[] {
  return input.rotations.map((r) => r.id);
}
