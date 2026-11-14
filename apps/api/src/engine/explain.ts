/**
 * Deterministic explanation templates (spec §9). No generative model runs here:
 * every sentence is assembled from values already present in the result.
 *
 * Ordering is fixed: supporting → risks → missing → cannotConclude.
 */

import type { CriterionId, CriterionResult, ScenarioExplanation } from "@fieldshift/shared";

import { COMPONENT_LABELS, MIN_MEANINGFUL_DELTA, SPATIAL_CAVEAT, THRESHOLDS } from "./config.js";
import type { RawCriterion, ScenarioRaw } from "./criteria.js";

function pct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function windowPhrase(scenario: ScenarioRaw): string {
  const windows = scenario.rotation.phases.map((p) => p.season);
  return windows.length === 1 ? `${windows[0]} window` : `${windows.join(" and ")} windows`;
}

export interface ExplainContext {
  baseline: ScenarioRaw | null;
  index: number | null;
  baselineIndex: number | null;
  rank: number;
  totalScored: number;
  components: CriterionResult[];
}

export function buildExplanation(scenario: ScenarioRaw, ctx: ExplainContext): ScenarioExplanation {
  const supporting: string[] = [];
  const risks: string[] = [];
  const missing: string[] = [];
  const cannotConclude: string[] = [];

  const c1 = scenario.criteria.C1;
  const c2 = scenario.criteria.C2;
  const c3 = scenario.criteria.C3;
  const c4 = scenario.criteria.C4;
  const c5 = scenario.criteria.C5;

  const rain = c1.raw.seasonRainMm ?? null;
  const anomaly = c1.raw.rainAnomalyPct ?? null;
  if (c1.available && rain !== null) {
    const anomalyText =
      anomaly === null ? "no climatological normal was available" : `${pct(anomaly)} against the long-term normal`;
    supporting.push(
      `Rainfall across the ${windowPhrase(scenario)} totals ${rain.toFixed(1)} mm (${anomalyText}; ` +
        `${c1.raw.drySpellCount10 ?? "?"} spells of ${THRESHOLDS.drySpellMinDays}+ dry days). Source: NASA POWER, MERRA-2 reanalysis.`,
    );
    if (anomaly !== null && anomaly <= -20) {
      risks.push(
        `Rainfall was ${Math.abs(anomaly).toFixed(0)}% below the long-term normal for this rotation's windows.`,
      );
    }
  }

  if (c2.available && c2.raw.heatDays35 !== null) {
    const hot = c2.raw.heatDays35 ?? 0;
    const veryHot = c2.raw.heatDays40 ?? 0;
    const sentence =
      `${hot.toFixed(0)} days at or above ${THRESHOLDS.heatDay35} C fall inside the ${windowPhrase(scenario)}` +
      (veryHot > 0 ? `, ${veryHot.toFixed(0)} of them at or above ${THRESHOLDS.heatDay40} C` : "") +
      " (NASA POWER T2M_MAX, MERRA-2 reanalysis).";
    if (hot > 0) risks.push(sentence);
    else supporting.push(sentence);
  }

  if (c3.available) {
    const hasLegume = c3.raw.legume === 1;
    const distinct = c3.raw.distinctCrops ?? 0;
    supporting.push(
      hasLegume
        ? `The rotation includes a legume phase and ${distinct} distinct crops, from cited Punjab rotation guidance.`
        : `The rotation covers ${distinct} distinct crops but no legume phase, from cited Punjab rotation guidance.`,
    );
  }

  if (c4.available && c4.scoreValue !== null) {
    supporting.push(
      `Water demand was scored against modelled root-zone wetness ` +
        `(mean ${(c4.raw.meanGwetroot ?? 0).toFixed(2)} on a 0-1 scale, MERRA-2 modelled).`,
    );
  }

  if (c5.available && c5.raw.frostDays5 !== null) {
    if ((c5.raw.frostDays5 ?? 0) > 0) {
      risks.push(
        `${(c5.raw.frostDays5 ?? 0).toFixed(0)} rabi days reach ${THRESHOLDS.frostDay5} C or below (NASA POWER T2M_MIN).`,
      );
    } else {
      supporting.push(
        `No rabi day in the window reached ${THRESHOLDS.frostDay5} C or below (NASA POWER T2M_MIN).`,
      );
    }
  }

  // Makes the explanation sensitive to the farmer's priorities, and shows which
  // component dominates the evaluated weight.
  const weighted = ctx.components.filter((c) => c.available).sort((a, b) => b.weight - a.weight);
  const top = weighted[0];
  if (top && top.weight > 0) {
    supporting.push(
      `Under your stated priorities, ${top.label.toLowerCase()} carries ` +
        `${(top.weight * 100).toFixed(0)}% of the weight that could be evaluated for this option.`,
    );
  }

  for (const criterion of Object.values(scenario.criteria) as RawCriterion[]) {
    for (const item of criterion.missing) missing.push(`${COMPONENT_LABELS[criterion.id]}: ${item}`);
  }

  if (ctx.index !== null && ctx.baselineIndex !== null && !scenario.isBaseline) {
    const delta = ctx.index - ctx.baselineIndex;
    if (Math.abs(delta) < MIN_MEANINGFUL_DELTA) {
      supporting.push(
        `This option and your current rotation differ by ${Math.abs(delta).toFixed(1)} index points, which is ` +
          `inside the ${MIN_MEANINGFUL_DELTA}-point band the prototype treats as "not a meaningful difference".`,
      );
    } else {
      supporting.push(
        delta > 0
          ? `This option scores ${delta.toFixed(1)} points above your current rotation on the factors that could be evaluated.`
          : `This option scores ${Math.abs(delta).toFixed(1)} points below your current rotation on the factors that could be evaluated.`,
      );
    }
  }

  cannotConclude.push(
    "Field Shift cannot say whether this rotation would raise yield or income: no localised yield-response evidence is included.",
  );
  cannotConclude.push(
    "No absolute suitability class is claimed; the index is only comparable with the other options in this run.",
  );
  cannotConclude.push(SPATIAL_CAVEAT);

  if (scenario.criteria.C4.status === "unavailable") {
    cannotConclude.push(
      "Crop water demand is not in the verified catalogue, so irrigation requirement is not estimated.",
    );
  }

  return {
    supporting,
    risks,
    missing,
    cannotConclude,
  };
}

export function rankingSentence(
  id: CriterionId,
): string {
  return COMPONENT_LABELS[id];
}
