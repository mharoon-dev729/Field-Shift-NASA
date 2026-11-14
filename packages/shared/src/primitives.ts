/**
 * Shared primitives: vocabularies and request schemas used by both the evidence
 * contract and the decision-engine contract.
 *
 * Kept separate from `index.ts` so `engine.ts` can import them without creating
 * a circular initialisation (index re-exports engine, engine needs these).
 */

import { z } from "zod";

/** How a value was produced. Never mix these without labelling. */
export const DATA_CLASSES = [
  "observation",
  "historical",
  "reanalysis",
  "forecast",
  "synthetic",
] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

export const SEASONS = ["rabi", "kharif"] as const;
export type Season = (typeof SEASONS)[number];

export const IRRIGATION_SOURCES = ["canal", "tubewell", "both", "rainfed"] as const;
export type IrrigationSource = (typeof IRRIGATION_SOURCES)[number];

export const AGGREGATIONS = [
  "daily",
  "sum",
  "mean",
  "min",
  "max",
  "count",
  "slope",
  "latest",
] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

export const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const prioritiesSchema = z
  .object({
    water: z.number().min(0).max(1),
    soilHealth: z.number().min(0).max(1),
    climateResilience: z.number().min(0).max(1),
  })
  .strict()
  .refine((p) => p.water + p.soilHealth + p.climateResilience > 0, {
    message: "At least one priority must be greater than zero",
  });
