/**
 * Deterministic engine fixtures.
 *
 * These are HAND-BUILT test values, not NASA observations. They are deliberately
 * `dataClass: "reanalysis"` only because the engine's synthetic guard exists to
 * catch fixtures leaking into user-facing output (E17) — every value here is
 * invented for arithmetic testing and none is presented as real evidence.
 */

import type { Season } from "@fieldshift/shared";

import type {
  EngineCropDef,
  EngineInput,
  EnginePhaseData,
  EnginePhaseSeries,
  EngineRotationDef,
} from "../../src/engine/index.js";
import { enumerateDates } from "../../src/lib/dates.js";

export const FIXTURE_CROPS: EngineCropDef[] = [
  {
    id: "wheat",
    name: "Wheat",
    season: "rabi",
    sowingStartMd: "11-01",
    harvestEndMd: "05-05",
    waterDemandClass: null,
    heatSensitivity: null,
    isLegume: false,
    residueClass: null,
    selectable: true,
    verified: true,
    evidenceQuality: "high",
    sourceUrls: ["https://example.invalid/fixture"],
  },
  {
    id: "cotton",
    name: "Cotton",
    season: "kharif",
    sowingStartMd: "04-01",
    harvestEndMd: "11-30",
    waterDemandClass: null,
    heatSensitivity: null,
    isLegume: false,
    residueClass: null,
    selectable: true,
    verified: true,
    evidenceQuality: "high",
    sourceUrls: ["https://example.invalid/fixture"],
  },
  {
    id: "maize",
    name: "Maize",
    season: "kharif",
    sowingStartMd: "05-25",
    harvestEndMd: "11-30",
    waterDemandClass: null,
    heatSensitivity: null,
    isLegume: false,
    residueClass: null,
    selectable: true,
    verified: true,
    evidenceQuality: "medium",
    sourceUrls: ["https://example.invalid/fixture"],
  },
  {
    id: "rice",
    name: "Rice",
    season: "kharif",
    sowingStartMd: "05-20",
    harvestEndMd: "11-25",
    waterDemandClass: null,
    heatSensitivity: null,
    isLegume: false,
    residueClass: null,
    selectable: true,
    verified: true,
    evidenceQuality: "high",
    sourceUrls: ["https://example.invalid/fixture"],
  },
  {
    id: "mungbean",
    name: "Mungbean",
    season: "kharif",
    sowingStartMd: null,
    harvestEndMd: "09-15",
    waterDemandClass: null,
    heatSensitivity: null,
    isLegume: true,
    residueClass: null,
    selectable: false,
    verified: false,
    evidenceQuality: "medium",
    sourceUrls: ["https://example.invalid/fixture"],
  },
  {
    id: "legume-test",
    name: "Test legume",
    season: "kharif",
    sowingStartMd: "06-01",
    harvestEndMd: "09-15",
    waterDemandClass: null,
    heatSensitivity: null,
    isLegume: true,
    residueClass: null,
    selectable: true,
    verified: true,
    evidenceQuality: "low",
    sourceUrls: ["https://example.invalid/fixture"],
  },
];

export const FIXTURE_ROTATIONS: EngineRotationDef[] = [
  {
    id: "wheat-cotton",
    label: "Wheat - Cotton",
    phases: [
      { cropId: "wheat", season: "rabi" },
      { cropId: "cotton", season: "kharif" },
    ],
    whyIncluded: "Fixture rotation for arithmetic tests only.",
    sourceUrls: ["https://example.invalid/fixture"],
    active: true,
  },
  {
    id: "wheat-maize",
    label: "Wheat - Maize",
    phases: [
      { cropId: "wheat", season: "rabi" },
      { cropId: "maize", season: "kharif" },
    ],
    whyIncluded: "Fixture rotation for arithmetic tests only.",
    sourceUrls: ["https://example.invalid/fixture"],
    active: true,
  },
  {
    id: "wheat-rice",
    label: "Wheat - Rice",
    phases: [
      { cropId: "wheat", season: "rabi" },
      { cropId: "rice", season: "kharif" },
    ],
    whyIncluded: "Fixture rotation for arithmetic tests only.",
    sourceUrls: ["https://example.invalid/fixture"],
    active: true,
  },
  {
    id: "wheat-cotton-alt",
    label: "Wheat - Cotton (repeat option)",
    phases: [
      { cropId: "wheat", season: "rabi" },
      { cropId: "cotton", season: "kharif" },
    ],
    whyIncluded: "Fixture duplicate for tie and determinism tests.",
    sourceUrls: ["https://example.invalid/fixture"],
    active: true,
  },
  {
    id: "wheat-legume",
    label: "Wheat - Test legume",
    phases: [
      { cropId: "wheat", season: "rabi" },
      { cropId: "legume-test", season: "kharif" },
    ],
    whyIncluded: "Fixture rotation adding a legume phase for tests.",
    sourceUrls: ["https://example.invalid/fixture"],
    active: true,
  },
  {
    id: "wheat-mungbean",
    label: "Wheat - Mungbean",
    phases: [
      { cropId: "wheat", season: "rabi" },
      { cropId: "mungbean", season: "kharif" },
    ],
    whyIncluded: "Fixture rotation using an unverified crop.",
    sourceUrls: ["https://example.invalid/fixture"],
    active: true,
  },
];

export interface CropValues {
  precipMmPerDay: number | null;
  t2mMax: number | null;
  t2mMin: number | null;
  gwetroot: number | null;
}

export const DEFAULT_VALUES: Record<string, CropValues> = {
  wheat: { precipMmPerDay: 1.2, t2mMax: 30, t2mMin: 6, gwetroot: 0.35 },
  cotton: { precipMmPerDay: 2.0, t2mMax: 38, t2mMin: 12, gwetroot: 0.25 },
  maize: { precipMmPerDay: 1.0, t2mMax: 34, t2mMin: 12, gwetroot: 0.3 },
  rice: { precipMmPerDay: 3.0, t2mMax: 33, t2mMin: 12, gwetroot: 0.45 },
  mungbean: { precipMmPerDay: 1.5, t2mMax: 34, t2mMin: 12, gwetroot: 0.3 },
  "legume-test": { precipMmPerDay: 1.4, t2mMax: 35, t2mMin: 12, gwetroot: 0.32 },
};

function series(
  variable: string,
  unit: string,
  start: string,
  end: string,
  value: number | null,
): EnginePhaseSeries {
  return {
    variable,
    unit,
    dataClass: "reanalysis",
    sourceId: "nasa_power",
    spatialResolution: "0.5 x 0.625 deg (MERRA-2)",
    retrievedAt: "2026-11-14T00:00:00.000Z",
    points: enumerateDates(start, end).map((date) => ({ date, value })),
  };
}

export function windowFor(cropId: string, season: Season, year: number): { start: string; end: string } {
  const crop = FIXTURE_CROPS.find((c) => c.id === cropId);
  const startMd = crop?.sowingStartMd ?? "04-01";
  const endMd = crop?.harvestEndMd ?? "11-30";
  const start = `${year}-${startMd}`;
  const end = season === "rabi" ? `${year + 1}-${endMd}` : `${year}-${endMd}`;
  return { start, end };
}

export function buildPhase(
  cropId: string,
  season: Season,
  year: number,
  values: Partial<CropValues> = {},
  options: { monthlyNormalMmPerDay?: Record<number, number> | null; empty?: boolean } = {},
): EnginePhaseData {
  const merged = { ...(DEFAULT_VALUES[cropId] ?? DEFAULT_VALUES.wheat!), ...values };
  const { start, end } = windowFor(cropId, season, year);
  const normals =
    options.monthlyNormalMmPerDay !== undefined
      ? options.monthlyNormalMmPerDay
      : { 1: 0.5, 2: 0.6, 3: 0.7, 4: 0.8, 5: 1.0, 6: 2.0, 7: 3.0, 8: 3.0, 9: 1.5, 10: 0.5, 11: 0.3, 12: 0.4 };

  return {
    cropId,
    season,
    windowStart: start,
    windowEnd: end,
    monthlyNormalMmPerDay: normals,
    series: options.empty
      ? []
      : [
          series("PRECTOTCORR", "mm/day", start, end, merged.precipMmPerDay),
          series("T2M_MAX", "C", start, end, merged.t2mMax),
          series("T2M_MIN", "C", start, end, merged.t2mMin),
          series("T2M", "C", start, end, merged.t2mMax === null ? null : merged.t2mMax - 8),
          series("GWETROOT", "1", start, end, merged.gwetroot),
        ],
  };
}

export interface InputOptions {
  season?: Season;
  planningYear?: number;
  rotationIds?: string[];
  currentRotationId?: string;
  priorities?: { water: number; soilHealth: number; climateResilience: number };
  crops?: EngineCropDef[];
  valueOverrides?: Record<string, Partial<CropValues>>;
  phaseOverrides?: (cropId: string, season: Season) => Partial<EnginePhaseData> | null;
  emptySeriesFor?: string[];
  test?: boolean;
  allowSynthetic?: boolean;
}

export function buildInput(options: InputOptions = {}): EngineInput {
  const season: Season = options.season ?? "kharif";
  const planningYear = options.planningYear ?? 2025;
  const rotationIds = options.rotationIds ?? ["wheat-cotton", "wheat-maize", "wheat-rice", "wheat-legume"];
  const crops = options.crops ?? FIXTURE_CROPS;
  const rotations = FIXTURE_ROTATIONS.filter((r) => rotationIds.includes(r.id));
  const partnerYear = season === "rabi" ? planningYear : planningYear - 1;

  const cropSeasons = new Map<string, Season>();
  for (const rotation of rotations) {
    for (const phase of rotation.phases) cropSeasons.set(phase.cropId, phase.season);
  }

  const phases: EnginePhaseData[] = [];
  for (const [cropId, phaseSeason] of cropSeasons) {
    const year = phaseSeason === season ? planningYear : partnerYear;
    const base = buildPhase(
      cropId,
      phaseSeason,
      year,
      options.valueOverrides?.[cropId] ?? {},
      { empty: options.emptySeriesFor?.includes(cropId) ?? false },
    );
    const extra = options.phaseOverrides?.(cropId, phaseSeason) ?? {};
    phases.push({ ...base, ...extra });
  }

  return {
    runId: "00000000-0000-4000-8000-000000000001",
    generatedAt: "2026-11-14T00:00:00.000Z",
    point: { lat: 31.4187, lon: 73.0791 },
    season,
    planningYear,
    currentRotationId: options.currentRotationId ?? rotationIds[0]!,
    previousCropId: null,
    irrigation: "canal",
    farmSizeAcres: 12,
    priorities: options.priorities ?? { water: 1 / 3, soilHealth: 1 / 3, climateResilience: 1 / 3 },
    rotations,
    crops,
    phases,
    test: options.test ?? false,
    allowSynthetic: options.allowSynthetic ?? false,
  };
}
