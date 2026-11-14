/**
 * C1-C5 raw evaluation.
 *
 * Every criterion answers three questions explicitly: what could be computed,
 * from which inputs, and what was missing. A criterion that cannot be computed
 * is `available: false` with `sub: null` — never a favourable placeholder.
 */

import type { CriterionId, CriterionProvenance, Season } from "@fieldshift/shared";

import {
  COMPONENT_LABELS,
  MIN_COMPONENT_COVERAGE,
  ORDINAL,
  RULE_IDS,
  THRESHOLDS,
} from "./config.js";
import { computeWindowStats, normalRainForWindow, type WindowStats } from "./indicators.js";
import type { DemandClass, EngineCropDef, EngineInput, EnginePhaseData, EngineRotationDef } from "./input.js";

export interface RawCriterion {
  id: CriterionId;
  available: boolean;
  status: "scored" | "partial" | "unavailable";
  raw: Record<string, number | null>;
  unit: string | null;
  dataClass: "reanalysis" | "reference" | null;
  ruleId: string;
  note: string;
  missing: string[];
  provenance: CriterionProvenance[];
  /** Scalar entering min-max normalisation. Direction is applied afterwards. */
  scoreValue: number | null;
}

export interface ScenarioRaw {
  scenarioId: string;
  label: string;
  isBaseline: boolean;
  whyIncluded: string;
  rotation: EngineRotationDef;
  criteria: Record<CriterionId, RawCriterion>;
  limitations: string[];
  provenance: CriterionProvenance[];
}

const POWER_WINDOW_NOTE = "NASA POWER daily values, reanalysis (MERRA-2).";

function powerProvenance(
  phase: EnginePhaseData,
  variable: string,
  dataClass: CriterionProvenance["dataClass"] = "reanalysis",
): CriterionProvenance {
  const series = phase.series.find((s) => s.variable === variable);
  return {
    sourceId: series?.sourceId ?? "nasa_power",
    variable,
    windowStart: phase.windowStart,
    windowEnd: phase.windowEnd,
    dataClass,
    spatialResolution: series?.spatialResolution ?? null,
  };
}

function coverageOf(stats: WindowStats, variable: string): number | null {
  return stats.coverage[variable]?.coverage ?? null;
}

function coverageLimitation(variable: string, coverage: number): string {
  return `${variable} covers only ${(coverage * 100).toFixed(0)}% of the window (90% required).`;
}

function unavailable(
  id: CriterionId,
  ruleId: string,
  raw: Record<string, number | null>,
  missing: string[],
  note: string,
): RawCriterion {
  return {
    id,
    available: false,
    status: "unavailable",
    raw,
    unit: null,
    dataClass: null,
    ruleId,
    note,
    missing,
    provenance: [],
    scoreValue: null,
  };
}

function demandOrdinal(value: DemandClass): number {
  return ORDINAL[value];
}

/** C1 — rainfall reliability (§6.1, worked example §11). */
function evaluateC1(
  phases: EnginePhaseData[],
  stats: WindowStats[],
): RawCriterion {
  const missing: string[] = [];
  const provenance: CriterionProvenance[] = [];

  const coverages = stats.map((s) => coverageOf(s, "PRECTOTCORR"));
  if (coverages.some((c) => c === null)) missing.push("PRECTOTCORR series missing for a phase");
  const badCoverage = coverages.filter((c): c is number => c !== null && c < MIN_COMPONENT_COVERAGE);
  if (badCoverage.length > 0) {
    missing.push(coverageLimitation("PRECTOTCORR", Math.min(...badCoverage)));
  }

  const precip = stats.map((s) => s.precipMm);
  const drySpells = stats.map((s) => s.drySpellCount10);
  const longest = stats.map((s) => s.longestDrySpell);

  if (precip.some((v) => v === null) || drySpells.some((v) => v === null)) {
    missing.push("Precipitation values are missing (fill values or no data), not zero.");
  }

  const rainTotal = precip.every((v): v is number => v !== null)
    ? precip.reduce((a, b) => a + b, 0)
    : null;
  const dryTotal = drySpells.every((v): v is number => v !== null)
    ? drySpells.reduce((a, b) => a + b, 0)
    : null;
  const longestTotal = longest.every((v): v is number => v !== null) ? Math.max(...longest) : null;

  for (const phase of phases) provenance.push(powerProvenance(phase, "PRECTOTCORR"));

  const normalMm = phases.every((p) => normalRainForWindow(p.monthlyNormalMmPerDay, p.windowStart, p.windowEnd) !== null)
    ? phases.reduce(
        (acc, p) => acc + (normalRainForWindow(p.monthlyNormalMmPerDay, p.windowStart, p.windowEnd) ?? 0),
        0,
      )
    : null;

  const anomalyPct =
    rainTotal !== null && normalMm !== null && normalMm > 0
      ? ((rainTotal - normalMm) / normalMm) * 100
      : null;

  if (anomalyPct === null) {
    missing.push("Climatological normal rainfall was not retrieved, so the anomaly term is omitted.");
  }

  const raw: Record<string, number | null> = {
    seasonRainMm: rainTotal,
    normalRainMm: normalMm,
    rainAnomalyPct: anomalyPct,
    drySpellCount10: dryTotal,
    longestDrySpellDays: longestTotal,
  };

  if (rainTotal === null || dryTotal === null) {
    return unavailable(
      "C1",
      RULE_IDS.C1,
      raw,
      missing,
      "Rainfall could not be evaluated because the precipitation series did not cover the rotation windows.",
    );
  }

  if (anomalyPct !== null) {
    const composite = -(Math.abs(anomalyPct) / 100) - 0.2 * dryTotal;
    return {
      id: "C1",
      available: true,
      status: "scored",
      raw,
      unit: "mm",
      dataClass: "reanalysis",
      ruleId: RULE_IDS.C1,
      note:
        "Composite of absolute rainfall anomaly (fraction) and long dry-spell count; smaller deviation and fewer dry spells score better.",
      missing,
      provenance,
      scoreValue: composite,
    };
  }

  // Without the anomaly term the composite uses only measured dry spells and is
  // flagged `partial`, so nobody mistakes it for the full documented rule.
  const composite = -(0.2 * dryTotal + 0.1 * (longestTotal ?? 0));
  return {
    id: "C1",
    available: true,
    status: "partial",
    raw,
    unit: "mm",
    dataClass: "reanalysis",
    ruleId: RULE_IDS.C1,
    note:
      "Dry-spell-only composite: the climatological normal was unavailable, so the anomaly term could not be computed.",
    missing,
    provenance,
    scoreValue: composite,
  };
}

/** C2 — heat exposure (§6.1). */
function evaluateC2(phases: EnginePhaseData[], stats: WindowStats[]): RawCriterion {
  const missing: string[] = [];
  const provenance: CriterionProvenance[] = [];

  const coverages = stats.map((s) => coverageOf(s, "T2M_MAX"));
  if (coverages.some((c) => c === null)) missing.push("T2M_MAX series missing for a phase");
  const bad = coverages.filter((c): c is number => c !== null && c < MIN_COMPONENT_COVERAGE);
  if (bad.length > 0) missing.push(coverageLimitation("T2M_MAX", Math.min(...bad)));

  const hot35 = stats.map((s) => s.heatDays35);
  const hot40 = stats.map((s) => s.heatDays40);
  for (const phase of phases) provenance.push(powerProvenance(phase, "T2M_MAX"));

  const raw: Record<string, number | null> = {
    heatDays35: hot35.every((v): v is number => v !== null) ? hot35.reduce((a, b) => a + b, 0) : null,
    heatDays40: hot40.every((v): v is number => v !== null) ? hot40.reduce((a, b) => a + b, 0) : null,
    meanT2M: stats[0]?.meanT2M ?? null,
    thresholdC: THRESHOLDS.heatDay35,
    veryHotThresholdC: THRESHOLDS.heatDay40,
  };

  if (raw.heatDays35 === null || raw.heatDays40 === null) {
    return unavailable(
      "C2",
      RULE_IDS.C2,
      raw,
      missing,
      "Heat exposure could not be evaluated because the maximum-temperature series did not cover the rotation windows.",
    );
  }

  return {
    id: "C2",
    available: true,
    status: "scored",
    raw,
    unit: "days",
    dataClass: "reanalysis",
    ruleId: RULE_IDS.C2,
    note:
      `Days at or above ${THRESHOLDS.heatDay35} C, plus half weight for days at or above ` +
      `${THRESHOLDS.heatDay40} C. Operational thresholds for this prototype, not crop-specific limits.`,
    missing,
    provenance,
    scoreValue: (raw.heatDays35 ?? 0) + 0.5 * (raw.heatDays40 ?? 0),
  };
}

/** C3 — soil-health structure from cited catalogue attributes only (§6.1). */
export function evaluateC3(rotation: EngineRotationDef, crops: EngineCropDef[]): RawCriterion {
  const rotationCrops = rotation.phases
    .map((p) => crops.find((c) => c.id === p.cropId))
    .filter((c): c is EngineCropDef => Boolean(c));

  const missing: string[] = [];
  const unverified = rotationCrops.filter((c) => !c.verified);
  if (unverified.length > 0) {
    missing.push(`Catalogue attributes are not verified for: ${unverified.map((c) => c.name).join(", ")}.`);
  }

  const hasLegume = rotationCrops.some((c) => c.isLegume);
  const distinctCrops = new Set(rotationCrops.map((c) => c.id)).size;
  const diversification = Math.min(1, Math.max(0, (distinctCrops - 1) / 2));

  const residues = rotationCrops.map((c) => c.residueClass);
  const residueKnown = residues.every((r): r is DemandClass => r !== null);
  const residueOrdinal = residueKnown
    ? residues.reduce((acc, r) => acc + ORDINAL[r], 0) / residues.length
    : null;
  if (!residueKnown) {
    missing.push("Residue class is not documented for every crop, so it is omitted from this criterion.");
  }

  const raw: Record<string, number | null> = {
    legume: hasLegume ? 1 : 0,
    distinctCrops,
    diversification,
    residueClass: residueOrdinal,
  };

  const provenance: CriterionProvenance[] = rotationCrops.map((c) => ({
    sourceId: "crop_catalog",
    variable: c.isLegume ? "is_legume" : "residue_class",
    windowStart: null,
    windowEnd: null,
    dataClass: "reference" as const,
    spatialResolution: "crop attribute (not gridded)",
  }));

  if (unverified.length > 0) {
    return unavailable(
      "C3",
      RULE_IDS.C3,
      raw,
      missing,
      "Soil-health structure uses cited rotation attributes, and at least one crop in this rotation is not yet verified.",
    );
  }

  const scoreValue = residueOrdinal !== null
    ? (raw.legume! + diversification + residueOrdinal) / 3
    : 0.5 * raw.legume! + 0.5 * diversification;

  return {
    id: "C3",
    available: true,
    status: residueKnown ? "scored" : "partial",
    raw,
    unit: null,
    dataClass: "reference",
    ruleId: RULE_IDS.C3,
    note: residueKnown
      ? "Legume phase, crop diversification and residue class from the cited catalogue."
      : "Legume phase and crop diversification only; residue class is undocumented for these crops.",
    missing,
    provenance,
    scoreValue,
  };
}

/** C4 — water demand vs supply (§6.1). Documented gap: demand classes are NULL. */
function evaluateC4(rotation: EngineRotationDef, crops: EngineCropDef[], stats: WindowStats[]): RawCriterion {
  const missing: string[] = [];
  const provenance: CriterionProvenance[] = [];

  const rotationCrops = rotation.phases
    .map((p) => crops.find((c) => c.id === p.cropId))
    .filter((c): c is EngineCropDef => Boolean(c));
  const unknownDemand = rotationCrops.filter((c) => c.waterDemandClass === null);
  const demandMax = rotationCrops
    .map((c) => c.waterDemandClass)
    .filter((v): v is DemandClass => v !== null)
    .reduce<number | null>((acc, v) => {
      const ordinal = demandOrdinal(v);
      return acc === null ? ordinal : Math.max(acc, ordinal);
    }, null);

  if (unknownDemand.length > 0) {
    missing.push(
      `Crop water-demand class is not sourced for: ${unknownDemand.map((c) => c.name).join(", ")}, ` +
        "so no numeric water-demand score is produced.",
    );
  }

  const wetnessCoverages = stats.map((s) => coverageOf(s, "GWETROOT"));
  if (wetnessCoverages.some((c) => c === null)) missing.push("GWETROOT series missing for a phase");
  const badWet = wetnessCoverages.filter((c): c is number => c !== null && c < MIN_COMPONENT_COVERAGE);
  if (badWet.length > 0) missing.push(coverageLimitation("GWETROOT", Math.min(...badWet)));

  const wetMeans = stats.map((s) => s.meanGwetroot);
  const meanWet = wetMeans.every((v): v is number => v !== null)
    ? wetMeans.reduce((a, b) => a + b, 0) / wetMeans.length
    : null;

  const raw: Record<string, number | null> = {
    waterDemandClass: demandMax,
    meanGwetroot: meanWet,
    supplyStress: meanWet !== null ? 1 - meanWet : null,
  };

  if (demandMax === null || meanWet === null) {
    return unavailable(
      "C4",
      RULE_IDS.C4,
      raw,
      missing.length > 0 ? missing : ["Water-demand class and modelled wetness are unavailable."],
      "Water demand vs supply cannot be scored: the crop water-demand class is not in the verified catalogue, and the engine does not substitute one.",
    );
  }

  provenance.push({
    sourceId: "nasa_power",
    variable: "GWETROOT",
    windowStart: stats[0]?.windowStart ?? null,
    windowEnd: stats[0]?.windowEnd ?? null,
    dataClass: "reanalysis",
    spatialResolution: "0.5 x 0.625 deg (MERRA-2)",
  });

  return {
    id: "C4",
    available: true,
    status: "scored",
    raw,
    unit: null,
    dataClass: "reanalysis",
    ruleId: RULE_IDS.C4,
    note:
      "Highest crop water-demand class in the rotation plus modelled supply stress (1 - mean root-zone wetness); lower is better.",
    missing,
    provenance,
    scoreValue: demandMax + (1 - meanWet),
  };
}

/** C5 — frost risk, rabi only (§6.1). */
function evaluateC5(season: Season, phases: EnginePhaseData[], stats: WindowStats[]): RawCriterion {
  if (season !== "rabi") {
    return unavailable(
      "C5",
      RULE_IDS.C5,
      { frostDays5: null, thresholdC: THRESHOLDS.frostDay5 },
      [],
      "Frost risk applies only to the rabi season, so this component carries no weight for kharif.",
    );
  }

  const missing: string[] = [];
  const rabiIndexes = phases.map((p, i) => ({ p, i })).filter(({ p }) => p.season === "rabi");
  const provenance = rabiIndexes.map(({ p }) => powerProvenance(p, "T2M_MIN"));

  const coverages = rabiIndexes.map(({ i }) =>
    stats[i] ? coverageOf(stats[i]!, "T2M_MIN") : null,
  );
  const bad = coverages.filter((c): c is number => c !== null && c < MIN_COMPONENT_COVERAGE);
  if (coverages.some((c) => c === null)) missing.push("T2M_MIN series missing for the rabi phase");
  if (bad.length > 0) missing.push(coverageLimitation("T2M_MIN", Math.min(...bad)));

  const frost = rabiIndexes.map(({ i }) => stats[i]?.frostDays5 ?? null);
  const raw: Record<string, number | null> = {
    frostDays5: frost.every((v): v is number => v !== null) ? frost.reduce((a, b) => a + b, 0) : null,
    thresholdC: THRESHOLDS.frostDay5,
  };

  if (raw.frostDays5 === null) {
    return unavailable(
      "C5",
      RULE_IDS.C5,
      raw,
      missing,
      "Frost risk could not be evaluated because the minimum-temperature series did not cover the rabi window.",
    );
  }

  return {
    id: "C5",
    available: true,
    status: "scored",
    raw,
    unit: "days",
    dataClass: "reanalysis",
    ruleId: RULE_IDS.C5,
    note: `Days with minimum temperature at or below ${THRESHOLDS.frostDay5} C inside the rabi window; fewer is better.`,
    missing,
    provenance,
    scoreValue: raw.frostDays5 ?? null,
  };
}

export function evaluateScenario(
  input: EngineInput,
  rotation: EngineRotationDef,
): ScenarioRaw {
  const phases = rotation.phases
    .map((p) => input.phases.find((d) => d.cropId === p.cropId))
    .filter((d): d is EnginePhaseData => Boolean(d));

  const stats = phases.map((p) => computeWindowStats(p.series, p.windowStart, p.windowEnd));

  const criteria: Record<CriterionId, RawCriterion> = {
    C1: evaluateC1(phases, stats),
    C2: evaluateC2(phases, stats),
    C3: evaluateC3(rotation, input.crops),
    C4: evaluateC4(rotation, input.crops, stats),
    C5: evaluateC5(input.season, phases, stats),
  };

  const provenance: CriterionProvenance[] = [];
  for (const criterion of Object.values(criteria)) {
    for (const p of criterion.provenance) {
      const key = `${p.sourceId}|${p.variable}|${p.windowStart}|${p.windowEnd}`;
      if (!provenance.some((q) => `${q.sourceId}|${q.variable}|${q.windowStart}|${q.windowEnd}` === key)) {
        provenance.push(p);
      }
    }
  }

  const limitations: string[] = [];
  for (const criterion of Object.values(criteria)) {
    if (!criterion.available && criterion.missing.length > 0) {
      limitations.push(`${COMPONENT_LABELS[criterion.id]}: ${criterion.missing.join(" ")}`);
    }
    if (criterion.status === "partial" && criterion.missing.length > 0) {
      limitations.push(`${COMPONENT_LABELS[criterion.id]} is partial: ${criterion.missing.join(" ")}`);
    }
  }

  return {
    scenarioId: rotation.id,
    label: rotation.label,
    isBaseline: rotation.id === input.currentRotationId,
    whyIncluded: rotation.whyIncluded,
    rotation,
    criteria,
    limitations,
    provenance,
  };
}
