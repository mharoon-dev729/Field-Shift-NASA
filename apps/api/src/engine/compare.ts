/**
 * compareRotations — the deterministic engine (spec §0).
 *
 * Pure: no network, no clock, no randomness, no LLM, no environment access.
 * Identical input ⇒ identical output except the supplied `runId`/`generatedAt`.
 *
 * Order of operations (spec §2): evaluate criteria → normalise relative to the
 * scenarios shown → apply priority multipliers → redistribute per scenario →
 * check the evidence gate → index → explanations.
 */

import { ENGINE_VERSION, INDEX_LABEL } from "@fieldshift/shared";
import type {
  CriterionId,
  CriterionResult,
  EngineResult,
  EngineSourceRef,
  PairwiseComparison,
  ScenarioResult,
  Season,
} from "@fieldshift/shared";

import {
  BASE_WEIGHTS,
  COMPONENT_LABELS,
  CRITERIA_ORDER,
  ENGINE_CATALOGUE_SOURCE,
  ENGINE_POWER_SOURCE,
  ENGINE_ROTATION_SOURCE,
  GATE,
  HIGHER_IS_BETTER,
  MIN_MEANINGFUL_DELTA,
  PRIORITY_OF,
  PROVISIONAL_NOTE,
  RULE_IDS,
  SPATIAL_CAVEAT,
} from "./config.js";
import { evaluateScenario, type ScenarioRaw } from "./criteria.js";
import { buildExplanation, type ExplainContext } from "./explain.js";
import { assertEngineInput, type EngineInput } from "./input.js";

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Min-max relative normalisation (spec §5.1). Computed across the scenarios in
 * this run only; when every value is identical the sub-score is 0.5 (no
 * discriminating information) rather than an arbitrary winner.
 */
function normalise(scenarios: ScenarioRaw[]): Record<CriterionId, Record<string, number | null>> {
  const out = {} as Record<CriterionId, Record<string, number | null>>;
  for (const id of CRITERIA_ORDER) {
    const scored = scenarios.filter(
      (s) => s.criteria[id].available && s.criteria[id].scoreValue !== null,
    );
    const values = scored.map((s) => s.criteria[id].scoreValue as number);
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const perScenario: Record<string, number | null> = {};

    for (const scenario of scenarios) {
      const criterion = scenario.criteria[id];
      if (!criterion.available || criterion.scoreValue === null) {
        perScenario[scenario.scenarioId] = null;
        continue;
      }
      const base = max === min ? 0.5 : (criterion.scoreValue - min) / (max - min);
      perScenario[scenario.scenarioId] = clamp01(HIGHER_IS_BETTER[id] ? base : 1 - base);
    }
    out[id] = perScenario;
  }
  return out;
}

/** Which criteria carry weight for a planning season (C5 is rabi-only). */
function applicableCriteria(season: Season): CriterionId[] {
  return season === "rabi" ? CRITERIA_ORDER : CRITERIA_ORDER.filter((id) => id !== "C5");
}

function normalisedPriorities(input: EngineInput): Record<string, number> {
  const { water, soilHealth, climateResilience } = input.priorities;
  const sum = water + soilHealth + climateResilience;
  return {
    water: water / sum,
    soilHealth: soilHealth / sum,
    climateResilience: climateResilience / sum,
  };
}

/** Effective (pre-normalisation) weight per component for this run. */
function effectiveWeights(input: EngineInput): Record<CriterionId, number> {
  const priorities = normalisedPriorities(input);
  const out = {} as Record<CriterionId, number>;
  for (const id of CRITERIA_ORDER) {
    const priority = priorities[PRIORITY_OF[id]] ?? 0;
    out[id] = BASE_WEIGHTS[id] * (0.5 + 1.0 * priority);
  }
  return out;
}

function buildScenarioResult(
  input: EngineInput,
  raw: ScenarioRaw,
  subs: Record<CriterionId, Record<string, number | null>>,
  weights: Record<CriterionId, number>,
  applicable: CriterionId[],
): ScenarioResult {
  const totalApplicable = applicable.reduce((acc, id) => acc + weights[id], 0);
  const available = applicable.filter((id) => raw.criteria[id].available);
  const availableWeight = available.reduce((acc, id) => acc + weights[id], 0);
  const coverage = totalApplicable > 0 ? availableWeight / totalApplicable : 0;

  const components: CriterionResult[] = CRITERIA_ORDER.map((id) => {
    const criterion = raw.criteria[id];
    const sub = subs[id][raw.scenarioId] ?? null;
    const isApplicable = applicable.includes(id);
    const rawWeight = isApplicable && totalApplicable > 0 ? weights[id] / totalApplicable : 0;
    const effective =
      isApplicable && criterion.available && availableWeight > 0 ? weights[id] / availableWeight : 0;
    return {
      id,
      label: COMPONENT_LABELS[id],
      available: criterion.available,
      status: criterion.status,
      sub: sub === null ? null : round(sub, 4),
      weight: round(effective, 6),
      rawWeight: round(rawWeight, 6),
      raw: criterion.raw,
      unit: criterion.unit,
      dataClass: criterion.dataClass,
      ruleId: criterion.ruleId,
      note: criterion.note,
      missing: criterion.missing,
      provenance: criterion.provenance,
    };
  });

  const availableCount = available.length;
  const gatePasses =
    coverage >= GATE.lowFloorWeight && availableCount >= GATE.minComponentsForIndex;

  const index = gatePasses
    ? round(
        components.reduce((acc, c) => acc + (c.available && c.sub !== null ? c.sub * c.weight : 0), 0) * 100,
        2,
      )
    : null;

  const confidence = !gatePasses
    ? "insufficient_evidence"
    : coverage >= GATE.moderateWeight && availableCount >= GATE.moderateMinComponents
      ? "moderate"
      : "low";

  const redistributed = applicable.filter((id) => !raw.criteria[id].available);

  return {
    scenarioId: raw.scenarioId,
    label: raw.label,
    isBaseline: raw.isBaseline,
    index,
    confidence,
    evidenceCoverage: round(coverage, 4),
    components,
    explanation: { supporting: [], risks: [], missing: [], cannotConclude: [] },
    limitations: raw.limitations,
    redistributed,
    comparabilityWarning: redistributed.length > 0,
    provenance: raw.provenance,
    whyIncluded: raw.whyIncluded,
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

export function compareRotations(input: EngineInput): EngineResult {
  assertEngineInput(input);

  const scenariosRaw = input.rotations.map((rotation) => evaluateScenario(input, rotation));
  const subs = normalise(scenariosRaw);
  const weights = effectiveWeights(input);
  const applicable = applicableCriteria(input.season);
  const baseline = scenariosRaw.find((s) => s.scenarioId === input.currentRotationId) ?? null;

  const scenarios = scenariosRaw.map((raw) =>
    buildScenarioResult(input, raw, subs, weights, applicable),
  );

  const scored = scenarios.filter((s) => s.index !== null);
  const ranked = [...scored].sort((a, b) => {
    if (b.index! !== a.index!) return b.index! - a.index!;
    return a.scenarioId.localeCompare(b.scenarioId);
  });

  const baselineIndex = scenarios.find((s) => s.isBaseline)?.index ?? null;

  // Explanations need the final indices and rank, so they are filled last.
  for (const scenario of scenarios) {
    const ctx: ExplainContext = {
      baseline: baseline ?? null,
      index: scenario.index,
      baselineIndex,
      rank: ranked.findIndex((s) => s.scenarioId === scenario.scenarioId),
      totalScored: ranked.length,
      components: scenario.components,
    };
    scenario.explanation = buildExplanation(
      scenariosRaw.find((r) => r.scenarioId === scenario.scenarioId)!,
      ctx,
    );
  }

  const pairwise: PairwiseComparison[] = [];
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      const a = ranked[i]!;
      const b = ranked[j]!;
      const delta = round(Math.abs(a.index! - b.index!), 2);
      pairwise.push({ a: a.scenarioId, b: b.scenarioId, delta, meaningful: delta >= MIN_MEANINGFUL_DELTA });
    }
  }

  const status: EngineResult["status"] =
    scored.length === 0 ? "insufficient_evidence" : scored.length < scenarios.length ? "partial" : "ok";

  const evidenceCoverage = round(Math.min(...scenarios.map((s) => s.evidenceCoverage)), 4);

  const globalLimitations: string[] = [];
  globalLimitations.push(SPATIAL_CAVEAT);
  if (input.season !== "rabi") {
    globalLimitations.push("Frost risk (C5) is not part of the kharif comparison; weights are renormalised.");
  }
  const waterMissing = scenarios.every((s) =>
    s.components.some((c) => c.id === "C4" && !c.available),
  );
  if (waterMissing) {
    globalLimitations.push(
      "Crop water-demand classes are not yet sourced, so water demand vs supply (C4) is excluded for every option.",
    );
  }
  if (scenarios.some((s) => s.comparabilityWarning)) {
    globalLimitations.push(
      "At least one option is missing a component, so its weights were redistributed and its index is not directly equivalent to the others.",
    );
  }
  if (scored.length === 0) {
    globalLimitations.push(
      "No option had enough evidence to produce a comparative index, so no ranking is shown.",
    );
  }
  for (const scenario of scenarios) {
    for (const limitation of scenario.limitations) globalLimitations.push(limitation);
  }

  const powerRetrieved = input.phases
    .flatMap((p) => p.series)
    .map((s) => s.retrievedAt ?? null)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1) ?? null;

  const dataSources: EngineSourceRef[] = [
    {
      id: ENGINE_POWER_SOURCE.id,
      provider: ENGINE_POWER_SOURCE.provider,
      product: ENGINE_POWER_SOURCE.product,
      url: ENGINE_POWER_SOURCE.url,
      dataClass: "reanalysis",
      retrievedAt: powerRetrieved,
      scope: "environmental",
    },
    {
      id: ENGINE_CATALOGUE_SOURCE.id,
      provider: ENGINE_CATALOGUE_SOURCE.provider,
      product: ENGINE_CATALOGUE_SOURCE.product,
      url: ENGINE_CATALOGUE_SOURCE.url,
      dataClass: "reference",
      retrievedAt: null,
      scope: "agronomic",
    },
    {
      id: ENGINE_ROTATION_SOURCE.id,
      provider: ENGINE_ROTATION_SOURCE.provider,
      product: ENGINE_ROTATION_SOURCE.product,
      url: ENGINE_ROTATION_SOURCE.url,
      dataClass: "reference",
      retrievedAt: null,
      scope: "agronomic",
    },
  ];

  const weightingComponents: Record<string, number> = {};
  const totalApplicable = applicable.reduce((acc, id) => acc + weights[id], 0);
  for (const id of CRITERIA_ORDER) {
    weightingComponents[id] =
      applicable.includes(id) && totalApplicable > 0 ? round(weights[id] / totalApplicable, 4) : 0;
  }

  return {
    runId: input.runId,
    engineVersion: ENGINE_VERSION,
    inputEcho: {
      season: input.season,
      planningYear: input.planningYear,
      priorities: {
        water: round(normalisedPriorities(input).water ?? 0, 6),
        soilHealth: round(normalisedPriorities(input).soilHealth ?? 0, 6),
        climateResilience: round(normalisedPriorities(input).climateResilience ?? 0, 6),
      },
      point: input.point,
      irrigation: input.irrigation,
      currentRotationId: input.currentRotationId,
    },
    status,
    indexLabel: INDEX_LABEL,
    weighting: {
      provisional: true,
      components: weightingComponents,
      note: PROVISIONAL_NOTE,
    },
    scenarios,
    ranking: ranked.map((s) => s.scenarioId),
    evidenceCoverage,
    pairwise,
    globalLimitations: dedupe(globalLimitations),
    dataSources,
    generatedAt: input.generatedAt,
  };
}
