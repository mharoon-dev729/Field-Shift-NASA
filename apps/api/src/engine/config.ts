/**
 * Engine configuration — every constant that influences a score lives here, so
 * a reviewer can read the whole rule set in one place.
 *
 * Sources: docs/DECISION_ENGINE_SPEC.md §4-§8. Values marked `provisional` are
 * prototype choices, not agronomic standards, and are labelled as such in the
 * API response.
 */

import type { CriterionId } from "@fieldshift/shared";

export const ENGINE_VERSION = "1.0.0";

export const COMPONENT_LABELS: Record<CriterionId, string> = {
  C1: "Rainfall reliability",
  C2: "Heat exposure",
  C3: "Soil-health structure",
  C4: "Water demand vs supply",
  C5: "Frost risk",
};

/** §6.2 base weights — PROVISIONAL. */
export const BASE_WEIGHTS: Record<CriterionId, number> = {
  C1: 0.3,
  C2: 0.25,
  C3: 0.25,
  C4: 0.15,
  C5: 0.05,
};

export type PriorityKey = "water" | "soilHealth" | "climateResilience";

/** §6.1 priority mapping. */
export const PRIORITY_OF: Record<CriterionId, PriorityKey> = {
  C1: "water",
  C2: "climateResilience",
  C3: "soilHealth",
  C4: "water",
  C5: "climateResilience",
};

/** §7.3 evidence gate. */
export const GATE = {
  /** availableWeight ≥ this and enough components ⇒ "moderate". */
  moderateWeight: 0.6,
  /** Below this (or too few components) ⇒ insufficient_evidence. */
  lowFloorWeight: 0.35,
  moderateMinComponents: 3,
  minComponentsForIndex: 2,
} as const;

/** §2.4 / §7.1: a component needs ≥90 % day coverage of its window. */
export const MIN_COMPONENT_COVERAGE = 0.9;

/** §7.4 provisional "not meaningful difference" threshold, in index points. */
export const MIN_MEANINGFUL_DELTA = 5;

/** §5.2 ordinal mapping for catalogue attributes. */
export const ORDINAL: Record<"low" | "medium" | "high", number> = {
  low: 0,
  medium: 0.5,
  high: 1,
};

/**
 * §4 operationally chosen thresholds. These are NOT crop-specific agronomic
 * limits and are never described as such.
 */
export const THRESHOLDS = {
  rainDayMm: 1.0,
  drySpellMinDays: 10,
  heatDay35: 35,
  heatDay40: 40,
  frostDay5: 5,
} as const;

/** Rule identifiers echoed in every criterion result for traceability. */
export const RULE_IDS = {
  C1: "R-RAIN-COMPOSITE-v1",
  C2: "R-HEAT-DAYS-v1",
  C3: "R-SOIL-STRUCTURE-v1",
  C4: "R-WATER-DEMAND-SUPPLY-v1",
  C5: "R-FROST-DAYS-v1",
  NORMALISE: "R-MINMAX-RELATIVE-v1",
  WEIGHTS: "R-WEIGHTS-PROVISIONAL-v1",
  GATE: "R-EVIDENCE-GATE-v1",
} as const;

/** Direction per component (§6.1). */
export const HIGHER_IS_BETTER: Record<CriterionId, boolean> = {
  C1: true,
  C2: false,
  C3: true,
  C4: false,
  C5: false,
};

export const PROVISIONAL_NOTE =
  "Weighting is a prototype choice, not an agronomic standard.";

export const SPATIAL_CAVEAT =
  "Values describe the ~0.5 deg MERRA-2 cell around the farm, not the field itself.";

export const MODELLED_WETNESS_NOTE =
  "Root-zone wetness is MERRA-2 modelled, not a satellite or field measurement.";

export const CRITERIA_ORDER: CriterionId[] = ["C1", "C2", "C3", "C4", "C5"];

export const ENGINE_POWER_SOURCE = {
  id: "nasa_power",
  provider: "NASA LaRC",
  product: "POWER Agroclimatology — daily point (MERRA-2 based)",
  url: "https://power.larc.nasa.gov/docs/services/api/",
} as const;

export const ENGINE_CATALOGUE_SOURCE = {
  id: "crop_catalog",
  provider: "Punjab Agricultural University / Government of Punjab (CRS)",
  product: "Crop calendars, rotation templates and cited attributes",
  url: "https://pau.edu/content/ccil/pf/pp_rabi.pdf",
} as const;

export const ENGINE_ROTATION_SOURCE = {
  id: "rotation_templates",
  provider: "Punjab Agricultural University / Government of Punjab (CRS)",
  product: "Documented rotation templates with rationale",
  url: "https://pau.edu/content/ccil/pf/pp_rabi.pdf",
} as const;
