/**
 * Window statistics computed from validated daily series.
 *
 * Rules (DECISION_ENGINE_SPEC §4):
 *  - a `null` day is skipped, never treated as 0;
 *  - `nValid` / `nExpected` are always reported so coverage is auditable;
 *  - nothing is interpolated, smoothed or back-filled.
 */

import { daysBetween, enumerateDates } from "../lib/dates.js";
import { THRESHOLDS } from "./config.js";
import type { EnginePhaseSeries } from "./input.js";

export interface VariableCoverage {
  variable: string;
  unit: string;
  daysValid: number;
  daysExpected: number;
  coverage: number;
  dataClass: string;
  sourceId: string;
  spatialResolution: string;
}

export interface WindowStats {
  windowStart: string;
  windowEnd: string;
  daysExpected: number;
  /** Precipitation total over days with a value (mm). Never 0-for-missing. */
  precipMm: number | null;
  rainDays: number | null;
  longestDrySpell: number | null;
  drySpellCount10: number | null;
  heatDays35: number | null;
  heatDays40: number | null;
  frostDays5: number | null;
  meanT2M: number | null;
  meanGwetroot: number | null;
  minGwetroot: number | null;
  coverage: Record<string, VariableCoverage>;
}

function findSeries(series: EnginePhaseSeries[], variable: string): EnginePhaseSeries | null {
  return series.find((s) => s.variable === variable) ?? null;
}

function windowPoints(series: EnginePhaseSeries | null, start: string, end: string) {
  if (!series) return [];
  return series.points.filter((p) => p.date >= start && p.date <= end);
}

function coverageOf(
  series: EnginePhaseSeries | null,
  start: string,
  end: string,
): VariableCoverage | null {
  if (!series) return null;
  const daysExpected = daysBetween(start, end);
  const daysValid = windowPoints(series, start, end).filter((p) => p.value !== null).length;
  return {
    variable: series.variable,
    unit: series.unit,
    daysValid,
    daysExpected,
    coverage: daysExpected > 0 ? daysValid / daysExpected : 0,
    dataClass: series.dataClass,
    sourceId: series.sourceId,
    spatialResolution: series.spatialResolution,
  };
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Longest run of consecutive days strictly below the rain-day threshold. */
function drySpellRuns(values: Array<number | null>, dates: string[]): number[] {
  const runs: number[] = [];
  let current = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i] ?? null;
    if (value === null) {
      // A missing day breaks a run rather than extending it: we cannot claim it
      // was dry.
      if (current > 0) runs.push(current);
      current = 0;
      continue;
    }
    if (value < THRESHOLDS.rainDayMm) {
      current += 1;
    } else if (current > 0) {
      runs.push(current);
      current = 0;
    }
    void dates;
  }
  if (current > 0) runs.push(current);
  return runs;
}

export function computeWindowStats(
  series: EnginePhaseSeries[],
  start: string,
  end: string,
): WindowStats {
  const precipSeries = findSeries(series, "PRECTOTCORR");
  const t2mMaxSeries = findSeries(series, "T2M_MAX");
  const t2mMinSeries = findSeries(series, "T2M_MIN");
  const t2mSeries = findSeries(series, "T2M");
  const gwetSeries = findSeries(series, "GWETROOT");

  const coverage: Record<string, VariableCoverage> = {};
  for (const candidate of [precipSeries, t2mMaxSeries, t2mMinSeries, t2mSeries, gwetSeries]) {
    const cov = coverageOf(candidate, start, end);
    if (cov) coverage[cov.variable] = cov;
  }

  const dates = enumerateDates(start, end);
  const precipPoints = windowPoints(precipSeries, start, end);
  const precipValues = dates.map(
    (date) => precipPoints.find((p) => p.date === date)?.value ?? null,
  );
  const precipValid = precipValues.filter((v): v is number => v !== null);
  const precipMm =
    precipValid.length > 0
      ? precipValid.filter((v) => v >= 0).reduce((a, b) => a + b, 0)
      : null;
  const rainDays =
    precipValid.length > 0 ? precipValid.filter((v) => v >= THRESHOLDS.rainDayMm).length : null;
  const runs = drySpellRuns(precipValues, dates);
  const longestDrySpell = precipValid.length > 0 && runs.length > 0 ? Math.max(...runs) : precipValid.length > 0 ? 0 : null;
  const drySpellCount10 =
    precipValid.length > 0 ? runs.filter((r) => r >= THRESHOLDS.drySpellMinDays).length : null;

  const t2mMax = windowPoints(t2mMaxSeries, start, end)
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  const heatDays35 = t2mMax.length > 0 ? t2mMax.filter((v) => v >= THRESHOLDS.heatDay35).length : null;
  const heatDays40 = t2mMax.length > 0 ? t2mMax.filter((v) => v >= THRESHOLDS.heatDay40).length : null;

  const t2mMin = windowPoints(t2mMinSeries, start, end)
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  const frostDays5 = t2mMin.length > 0 ? t2mMin.filter((v) => v <= THRESHOLDS.frostDay5).length : null;

  const t2m = windowPoints(t2mSeries, start, end)
    .map((p) => p.value)
    .filter((v): v is number => v !== null);
  const gwet = windowPoints(gwetSeries, start, end)
    .map((p) => p.value)
    .filter((v): v is number => v !== null);

  return {
    windowStart: start,
    windowEnd: end,
    daysExpected: daysBetween(start, end),
    precipMm,
    rainDays,
    longestDrySpell,
    drySpellCount10,
    heatDays35,
    heatDays40,
    frostDays5,
    meanT2M: mean(t2m),
    meanGwetroot: mean(gwet),
    minGwetroot: gwet.length > 0 ? Math.min(...gwet) : null,
    coverage,
  };
}

/**
 * Climatological normal rainfall for the window, from monthly mm/day normals.
 * Weighted by the number of window days falling in each month. Returns null when
 * no normal is available — it is never inferred from the observed series.
 */
export function normalRainForWindow(
  monthlyNormalMmPerDay: Record<number, number> | null,
  start: string,
  end: string,
): number | null {
  if (!monthlyNormalMmPerDay) return null;
  const days = enumerateDates(start, end);
  let total = 0;
  let covered = 0;
  for (const date of days) {
    const month = Number(date.slice(5, 7));
    const normal = monthlyNormalMmPerDay[month];
    if (typeof normal !== "number" || !Number.isFinite(normal)) continue;
    total += normal;
    covered += 1;
  }
  if (covered === 0 || covered !== days.length) return null;
  return total;
}
