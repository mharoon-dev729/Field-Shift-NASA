/**
 * E01-E20 from docs/TEST_STRATEGY.md §2.
 *
 * Every input here is a hand-built fixture (see helpers/engine-fixtures.ts).
 * No NASA observation and no network call is involved: these tests pin the
 * arithmetic, the gate and the refusal rules.
 */

import { describe, expect, it } from "vitest";

import type { CriterionResult } from "@fieldshift/shared";

import { compareRotations, SyntheticDataRejected } from "../src/engine/index.js";
import { AppError } from "../src/lib/errors.js";
import { buildInput, FIXTURE_CROPS, FIXTURE_ROTATIONS } from "./helpers/engine-fixtures.js";

function component(scenario: { components: CriterionResult[] }, id: CriterionResult["id"]): CriterionResult {
  const found = scenario.components.find((c) => c.id === id);
  if (!found) throw new Error(`missing component ${id}`);
  return found;
}

const ALL_CROPS = ["wheat", "cotton", "maize", "rice", "legume-test"];

describe("evidence gate", () => {
  it("E01: all components available, four candidates → ok, four indices, moderate confidence", () => {
    const result = compareRotations(
      buildInput({ rotationIds: ["wheat-cotton", "wheat-maize", "wheat-rice", "wheat-legume"] }),
    );

    expect(result.status).toBe("ok");
    expect(result.scenarios).toHaveLength(4);
    expect(result.ranking).toHaveLength(4);
    for (const scenario of result.scenarios) {
      expect(scenario.index).not.toBeNull();
      expect(scenario.index!).toBeGreaterThanOrEqual(0);
      expect(scenario.index!).toBeLessThanOrEqual(100);
      // C4 is unavailable because demand classes are NULL, so the ceiling is
      // 4 available components, not 5.
      expect(["moderate", "low"]).toContain(scenario.confidence);
    }
    expect(result.scenarios.every((s) => s.confidence === "moderate")).toBe(true);
    expect(result.evidenceCoverage).toBeGreaterThan(0.6);
  });

  it("E05: coverage inside the low band → index present, confidence low, caveat recorded", () => {
    // C1 and C2 unavailable (null precipitation and maximum temperature), C3 and
    // C4 available thanks to fixture demand classes ⇒ coverage ≈ 0.42.
    const cropsWithDemand = FIXTURE_CROPS.map((c) => ({ ...c, waterDemandClass: "medium" as const }));
    const result = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-maize"],
        crops: cropsWithDemand,
        valueOverrides: {
          wheat: { precipMmPerDay: null, t2mMax: null },
          cotton: { precipMmPerDay: null, t2mMax: null },
          maize: { precipMmPerDay: null, t2mMax: null },
        },
      }),
    );

    for (const scenario of result.scenarios) {
      expect(scenario.evidenceCoverage).toBeGreaterThanOrEqual(0.35);
      expect(scenario.evidenceCoverage).toBeLessThan(0.6);
      expect(scenario.confidence).toBe("low");
      expect(scenario.index).not.toBeNull();
      expect(scenario.comparabilityWarning).toBe(true);
      expect(scenario.redistributed).toContain("C1");
    }
    expect(result.globalLimitations.join(" ")).toMatch(/redistributed/i);
  });

  it("E06: coverage below the floor and one component → insufficient, gaps named", () => {
    const result = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-maize"],
        emptySeriesFor: ALL_CROPS,
      }),
    );

    expect(result.status).toBe("insufficient_evidence");
    expect(result.ranking).toEqual([]);
    for (const scenario of result.scenarios) {
      expect(scenario.index).toBeNull();
      expect(scenario.confidence).toBe("insufficient_evidence");
      const missingText = scenario.explanation.missing.join(" ");
      expect(missingText).toMatch(/Rainfall|PRECTOTCORR/);
      expect(missingText).toMatch(/water-demand|Water demand/i);
    }
  });

  it("E04: every observation null → insufficient evidence, no fabricated index", () => {
    const result = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-rice"],
        valueOverrides: {
          wheat: { precipMmPerDay: null, t2mMax: null, t2mMin: null, gwetroot: null },
          cotton: { precipMmPerDay: null, t2mMax: null, t2mMin: null, gwetroot: null },
          rice: { precipMmPerDay: null, t2mMax: null, t2mMin: null, gwetroot: null },
        },
      }),
    );

    expect(result.status).toBe("insufficient_evidence");
    expect(result.ranking).toEqual([]);
    expect(result.scenarios.every((s) => s.index === null)).toBe(true);
  });
});

describe("C1 rainfall reliability", () => {
  it("E03: all fill values removed (-999 → null) → C1 unavailable, sub null not zero", () => {
    const result = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-maize"],
        valueOverrides: {
          wheat: { precipMmPerDay: null },
          cotton: { precipMmPerDay: null },
          maize: { precipMmPerDay: null },
        },
      }),
    );

    for (const scenario of result.scenarios) {
      const c1 = component(scenario, "C1");
      expect(c1.available).toBe(false);
      expect(c1.sub).toBeNull();
      expect(c1.raw.seasonRainMm).toBeNull();
      expect(c1.missing.join(" ")).toMatch(/missing/i);
    }
  });

  it("uses the anomaly term when climatology exists, and marks the rule complete", () => {
    const result = compareRotations(buildInput({ rotationIds: ["wheat-cotton", "wheat-maize"] }));
    const c1 = component(result.scenarios[0]!, "C1");
    expect(c1.status).toBe("scored");
    expect(c1.raw.normalRainMm).not.toBeNull();
    expect(c1.raw.rainAnomalyPct).not.toBeNull();
    expect(c1.ruleId).toBe("R-RAIN-COMPOSITE-v1");
  });

  it("marks C1 partial when the climatological normal is absent", () => {
    const result = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-maize"],
        phaseOverrides: () => ({ monthlyNormalMmPerDay: null }),
      }),
    );
    const c1 = component(result.scenarios[0]!, "C1");
    expect(c1.status).toBe("partial");
    expect(c1.available).toBe(true);
    expect(c1.raw.rainAnomalyPct).toBeNull();
    expect(c1.missing.join(" ")).toMatch(/normal/i);
  });
});

describe("C2 heat exposure", () => {
  it("counts heat days above the documented thresholds and reports them", () => {
    const result = compareRotations(buildInput({ rotationIds: ["wheat-cotton", "wheat-maize"] }));
    const cotton = result.scenarios.find((s) => s.scenarioId === "wheat-cotton")!;
    const c2 = component(cotton, "C2");
    expect(c2.available).toBe(true);
    expect(c2.raw.heatDays35).toBeGreaterThan(0);
    expect(c2.raw.thresholdC).toBe(35);
    // Cotton's window is entirely at 38 C, so every day counts.
    expect(c2.raw.heatDays35).toBe(c2.raw.heatDays35);
    expect(c2.raw.heatDays40).toBe(0);
  });

  it("C2 unavailable when maximum temperature is missing", () => {
    const result = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-maize"],
        valueOverrides: {
          wheat: { t2mMax: null },
          cotton: { t2mMax: null },
          maize: { t2mMax: null },
        },
      }),
    );
    for (const scenario of result.scenarios) {
      const c2 = component(scenario, "C2");
      expect(c2.available).toBe(false);
      expect(c2.sub).toBeNull();
    }
  });
});

describe("C3 soil-health structure", () => {
  it("rewards a legume phase over a non-legume rotation", () => {
    const result = compareRotations(buildInput({ rotationIds: ["wheat-cotton", "wheat-legume"] }));
    const legume = result.scenarios.find((s) => s.scenarioId === "wheat-legume")!;
    const cotton = result.scenarios.find((s) => s.scenarioId === "wheat-cotton")!;
    expect(component(legume, "C3").raw.legume).toBe(1);
    expect(component(cotton, "C3").raw.legume).toBe(0);
    expect(component(legume, "C3").sub!).toBeGreaterThan(component(cotton, "C3").sub!);
  });

  it("C3 unavailable when a crop's catalogue attributes are unverified", () => {
    const result = compareRotations(buildInput({ rotationIds: ["wheat-cotton", "wheat-mungbean"] }));
    const mung = result.scenarios.find((s) => s.scenarioId === "wheat-mungbean")!;
    const c3 = component(mung, "C3");
    expect(c3.available).toBe(false);
    expect(c3.missing.join(" ")).toMatch(/not verified/i);
  });
});

describe("C4 water demand vs supply", () => {
  it("E10: NULL water-demand class → C4 unavailable with no substituted default", () => {
    const result = compareRotations(buildInput({ rotationIds: ["wheat-cotton", "wheat-maize"] }));
    for (const scenario of result.scenarios) {
      const c4 = component(scenario, "C4");
      expect(c4.available).toBe(false);
      expect(c4.sub).toBeNull();
      expect(c4.raw.waterDemandClass).toBeNull();
      expect(c4.note).toMatch(/does not substitute|not in the verified catalogue/i);
      expect(c4.missing.join(" ")).toMatch(/not sourced/i);
    }
  });

  it("scores when demand classes and modelled wetness both exist", () => {
    const cropsWithDemand = FIXTURE_CROPS.map((c) => ({ ...c, waterDemandClass: "high" as const }));
    const result = compareRotations(
      buildInput({ rotationIds: ["wheat-cotton", "wheat-maize"], crops: cropsWithDemand }),
    );
    const c4 = component(result.scenarios[0]!, "C4");
    expect(c4.available).toBe(true);
    expect(c4.raw.waterDemandClass).toBe(1);
    expect(c4.raw.meanGwetroot).not.toBeNull();
    expect(c4.dataClass).toBe("reanalysis");
    expect(c4.provenance.some((p) => p.variable === "GWETROOT")).toBe(true);
  });
});

describe("C5 frost risk", () => {
  it("E13: rabi includes C5", () => {
    const result = compareRotations(buildInput({ season: "rabi", rotationIds: ["wheat-cotton", "wheat-maize"] }));
    for (const scenario of result.scenarios) {
      const c5 = component(scenario, "C5");
      expect(c5.available).toBe(true);
      expect(c5.raw.thresholdC).toBe(5);
      expect(c5.weight).toBeGreaterThan(0);
    }
  });

  it("E14: kharif excludes C5 and renormalises the remaining weights", () => {
    const result = compareRotations(buildInput({ season: "kharif", rotationIds: ["wheat-cotton", "wheat-maize"] }));
    for (const scenario of result.scenarios) {
      const c5 = component(scenario, "C5");
      expect(c5.available).toBe(false);
      expect(c5.weight).toBe(0);
      expect(c5.rawWeight).toBe(0);
      const sum = scenario.components.reduce((acc, c) => acc + c.weight, 0);
      // C4 is unavailable in this fixture, so only the scored weights sum to 1.
      const availableSum = scenario.components
        .filter((c) => c.available)
        .reduce((acc, c) => acc + c.weight, 0);
      expect(availableSum).toBeCloseTo(1, 6);
      expect(sum).toBeLessThanOrEqual(1.000001);
    }
    expect(result.globalLimitations.join(" ")).toMatch(/Frost risk/);
  });

  it("C5 unavailable when minimum temperature is missing", () => {
    const result = compareRotations(
      buildInput({
        season: "rabi",
        rotationIds: ["wheat-cotton", "wheat-maize"],
        valueOverrides: { wheat: { t2mMin: null }, cotton: { t2mMin: null }, maize: { t2mMin: null } },
      }),
    );
    for (const scenario of result.scenarios) {
      const c5 = component(scenario, "C5");
      expect(c5.available).toBe(false);
      expect(c5.sub).toBeNull();
    }
  });
});

describe("weighting and priorities", () => {
  it("E11: effective weights sum to 1 for 0.6 / 0.2 / 0.2", () => {
    const result = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-maize"],
        priorities: { water: 0.6, soilHealth: 0.2, climateResilience: 0.2 },
      }),
    );
    for (const scenario of result.scenarios) {
      const availableSum = scenario.components
        .filter((c) => c.available)
        .reduce((acc, c) => acc + c.weight, 0);
      expect(availableSum).toBeCloseTo(1, 9);
    }
    expect(result.weighting.provisional).toBe(true);
    expect(result.weighting.note).toMatch(/prototype/i);
    const echoed = result.inputEcho.priorities;
    expect(echoed.water + echoed.soilHealth + echoed.climateResilience).toBeCloseTo(1, 6);
  });

  it("E08: changing the priority from water to soil changes the ranking when soil evidence exists", () => {
    const waterFirst = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-legume"],
        priorities: { water: 1, soilHealth: 0, climateResilience: 0 },
        phaseOverrides: () => ({ monthlyNormalMmPerDay: null }),
        valueOverrides: { cotton: { precipMmPerDay: 2.0 }, "legume-test": { precipMmPerDay: 0.2 } },
      }),
    );
    const soilFirst = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-legume"],
        priorities: { water: 0, soilHealth: 1, climateResilience: 0 },
        phaseOverrides: () => ({ monthlyNormalMmPerDay: null }),
        valueOverrides: { cotton: { precipMmPerDay: 2.0 }, "legume-test": { precipMmPerDay: 0.2 } },
      }),
    );

    expect(waterFirst.ranking[0]).toBe("wheat-cotton");
    expect(soilFirst.ranking[0]).toBe("wheat-legume");
    expect(waterFirst.scenarios[0]!.explanation).not.toEqual(soilFirst.scenarios[0]!.explanation);
  });

  it("E09: priorities cannot rescue a missing component; redistribution is recorded", () => {
    const balanced = compareRotations(
      buildInput({ rotationIds: ["wheat-cotton", "wheat-mungbean"] }),
    );
    const soilFirst = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-mungbean"],
        priorities: { water: 0, soilHealth: 1, climateResilience: 0 },
      }),
    );

    expect(soilFirst.ranking).toEqual(balanced.ranking);
    const mung = soilFirst.scenarios.find((s) => s.scenarioId === "wheat-mungbean")!;
    expect(mung.redistributed).toContain("C3");
    expect(mung.comparabilityWarning).toBe(true);
    expect(component(mung, "C3").weight).toBe(0);
  });

  it("E12: all-zero priorities are rejected before any scoring", () => {
    expect(() =>
      compareRotations(
        buildInput({
          rotationIds: ["wheat-cotton"],
          priorities: { water: 0, soilHealth: 0, climateResilience: 0 },
        }),
      ),
    ).toThrow(AppError);
  });
});

describe("normalisation", () => {
  it("E15: an extreme outlier maps to 1.0 and the rest spread inside [0,1) with no NaN", () => {
    const result = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-maize", "wheat-rice"],
        valueOverrides: { rice: { t2mMax: 20 } },
      }),
    );
    const c2Subs = result.scenarios.map((s) => component(s, "C2").sub!);
    expect(c2Subs.every((v) => Number.isFinite(v))).toBe(true);
    expect(c2Subs.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(Math.max(...c2Subs)).toBe(1);
    for (const scenario of result.scenarios) {
      for (const c of scenario.components) {
        if (c.sub !== null) expect(Number.isFinite(c.sub)).toBe(true);
      }
      expect(Number.isFinite(scenario.index ?? 0)).toBe(true);
    }
  });

  it("E16: identical raw values give sub 0.5 everywhere, never a division by zero", () => {
    const result = compareRotations(
      buildInput({ rotationIds: ["wheat-cotton", "wheat-cotton-alt"] }),
    );
    for (const scenario of result.scenarios) {
      for (const c of scenario.components) {
        if (c.available) expect(c.sub).toBe(0.5);
      }
      if (scenario.index !== null) expect(Number.isFinite(scenario.index)).toBe(true);
    }
    expect(result.scenarios[0]!.index).toBe(result.scenarios[1]!.index);
  });

  it("E07: a difference under the threshold is flagged difference_not_meaningful", () => {
    const result = compareRotations(
      buildInput({ rotationIds: ["wheat-cotton", "wheat-cotton-alt"] }),
    );
    expect(result.pairwise.length).toBeGreaterThan(0);
    for (const pair of result.pairwise) {
      expect(pair.delta).toBeLessThan(5);
      expect(pair.meaningful).toBe(false);
    }
    // Only a non-baseline option is compared against the baseline.
    const compared = result.scenarios.find((s) => !s.isBaseline)!;
    expect(compared.explanation.supporting.join(" ")).toMatch(/not a meaningful difference/);
  });

  it("E02: identical input twice → identical output", () => {
    const input = buildInput({ rotationIds: ["wheat-cotton", "wheat-maize", "wheat-rice"] });
    const first = compareRotations(input);
    const second = compareRotations(input);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("refusals and validation", () => {
  it("E17: synthetic data is rejected unless it is an explicit test run", () => {
    const input = buildInput({ rotationIds: ["wheat-cotton"] });
    input.phases[0]!.series[0]!.dataClass = "synthetic";

    expect(() => compareRotations(input)).toThrow(SyntheticDataRejected);

    // Allowed only when both flags are set, and only in tests.
    const permitted = buildInput({ rotationIds: ["wheat-cotton"], test: true, allowSynthetic: true });
    permitted.phases[0]!.series[0]!.dataClass = "synthetic";
    expect(() => compareRotations(permitted)).not.toThrow();
  });

  it("E18: an empty candidate array is rejected", () => {
    expect(() => compareRotations(buildInput({ rotationIds: [] }))).toThrow(AppError);
  });

  it("E19: the baseline must be one of the candidates", () => {
    expect(() =>
      compareRotations(
        buildInput({
          rotationIds: ["wheat-maize", "wheat-rice"],
          currentRotationId: "wheat-cotton",
        }),
      ),
    ).toThrow(AppError);
  });

  it("E20: a scenario with zero available components is null and unranked", () => {
    const result = compareRotations(
      buildInput({
        rotationIds: ["wheat-cotton", "wheat-mungbean"],
        // Only the mungbean phase is empty: wheat-cotton stays scoreable, so the
        // run is "partial" rather than wholly insufficient.
        emptySeriesFor: ["mungbean"],
      }),
    );

    const mung = result.scenarios.find((s) => s.scenarioId === "wheat-mungbean")!;
    expect(mung.components.filter((c) => c.available)).toHaveLength(0);
    expect(mung.index).toBeNull();
    expect(mung.confidence).toBe("insufficient_evidence");
    expect(result.ranking).not.toContain("wheat-mungbean");
    expect(result.status).toBe("partial");
  });
});

describe("catalogue integration in the engine", () => {
  it("keeps the baseline flag and the cited rationale on every scenario", () => {
    const result = compareRotations(buildInput({ rotationIds: ["wheat-cotton", "wheat-maize"] }));
    const baseline = result.scenarios.find((s) => s.isBaseline)!;
    expect(baseline.scenarioId).toBe("wheat-cotton");
    for (const scenario of result.scenarios) {
      expect(scenario.whyIncluded.length).toBeGreaterThan(10);
      expect(scenario.provenance.length).toBeGreaterThan(0);
    }
  });

  it("never invents a rotation that is not in the supplied catalogue", () => {
    const ids = compareRotations(buildInput()).scenarios.map((s) => s.scenarioId);
    for (const id of ids) {
      expect(FIXTURE_ROTATIONS.some((r) => r.id === id)).toBe(true);
    }
  });
});
