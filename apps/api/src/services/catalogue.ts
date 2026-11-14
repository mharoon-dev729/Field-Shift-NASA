/**
 * GET /api/v1/crops and GET /api/v1/sources.
 *
 * Reference data only. Crop windows are the catalogue's district-level MM-DD
 * recommendations turned into concrete dates for the requested planning year;
 * both forms are returned so nothing is silently reinterpreted.
 */

import type {
  CropCatalogueEntry,
  CropsQuery,
  CropsResponse,
  CropSource,
  CropWindow,
  RotationCatalogueEntry,
} from "@fieldshift/shared";

import type { CatalogueSnapshot, CatalogueStore } from "../db/catalogue.js";
import type { SourceStore } from "../db/sources.js";
import type { EngineCropDef } from "../engine/index.js";
import { AppError } from "../lib/errors.js";

export interface CatalogueDeps {
  catalogue: CatalogueStore;
  sources: SourceStore;
  now?: () => Date;
}

export type CropsHandler = (query: CropsQuery) => Promise<CropsResponse>;
export type SourcesHandler = () => Promise<import("@fieldshift/shared").SourcesResponse>;

/** Mechanical label from a URL (never an invented citation title). */
function sourceTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).at(-1) ?? parsed.hostname;
    return decodeURIComponent(last).replace(/[_-]+/g, " ");
  } catch {
    return url;
  }
}

function citations(urls: string[], quality: "high" | "medium" | "low"): CropSource[] {
  return urls.map((url) => ({ title: sourceTitle(url), url, quality }));
}

/**
 * A rabi season starts in November and finishes the following spring, so dates
 * from January to October belong to the following calendar year. Applying one
 * year to both ends would place a wheat harvest before its own sowing.
 */
function dateFor(season: EngineCropDef["season"], md: string, year: number): string {
  const month = Number(md.slice(0, 2));
  const resolvedYear = season === "rabi" && month < 11 ? year + 1 : year;
  return `${resolvedYear}-${md}`;
}

function windowFor(
  crop: EngineCropDef,
  startMd: string | null,
  endMd: string | null,
  year: number,
): CropWindow | null {
  if (!startMd || !endMd) return null;
  const start = dateFor(crop.season, startMd, year);
  const end = dateFor(crop.season, endMd, year);
  if (end <= start) return null;
  return { start, end, startMd, endMd };
}

export function mapCropEntry(crop: EngineCropDef, year: number): CropCatalogueEntry {
  const limitations = crop.limitations ?? [];
  return {
    id: crop.id,
    name: crop.name,
    localName: crop.localName ?? null,
    season: crop.season,
    sowingWindow: windowFor(crop, crop.sowingStartMd, crop.sowingEndMd ?? null, year),
    harvestWindow: windowFor(crop, crop.harvestStartMd ?? null, crop.harvestEndMd, year),
    waterDemandClass: crop.waterDemandClass,
    heatSensitivity: crop.heatSensitivity,
    isLegume: crop.isLegume,
    residueClass: crop.residueClass,
    selectable: crop.selectable,
    verified: crop.verified,
    sources: citations(crop.sourceUrls ?? [], crop.evidenceQuality),
    limitations,
  };
}

function mapRotation(
  snapshot: CatalogueSnapshot,
  rotation: CatalogueSnapshot["rotations"][number],
): RotationCatalogueEntry {
  const problems: string[] = [];
  if (!rotation.active) problems.push("Rotation is not active in the catalogue.");

  for (const phase of rotation.phases) {
    const crop = snapshot.crops.find((c) => c.id === phase.cropId);
    if (!crop) {
      problems.push(`Unknown crop "${phase.cropId}".`);
      continue;
    }
    if (!crop.selectable) {
      problems.push(`${crop.name} is not selectable (its documented calendar is incomplete).`);
    } else if (!crop.sowingStartMd || !crop.harvestEndMd) {
      problems.push(`${crop.name} has no documented sowing or harvest window.`);
    }
  }

  return {
    id: rotation.id,
    label: rotation.label,
    phases: rotation.phases,
    whyIncluded: rotation.whyIncluded,
    sources: citations(rotation.sourceUrls ?? [], "high"),
    active: rotation.active,
    evaluable: problems.length === 0,
    excludedReason: problems.length === 0 ? null : problems.join(" "),
  };
}

export function createCatalogueService(deps: CatalogueDeps) {
  const nowFn = deps.now ?? (() => new Date());

  const crops: CropsHandler = async (query) => {
    const snapshot = await deps.catalogue.load();
    const year = query.year ?? nowFn().getUTCFullYear();

    const filtered = snapshot.crops.filter((crop) => {
      if (query.season && crop.season !== query.season && crop.season !== "annual") return false;
      if (!query.includeUnverified && !crop.verified) return false;
      return true;
    });

    return {
      planningYear: year,
      crops: filtered.map((crop) => mapCropEntry(crop, year)),
      rotations: snapshot.rotations
        .map((rotation) => mapRotation(snapshot, rotation))
        .filter((rotation) => {
          if (query.includeUnverified) return true;
          // A rotation is only offered when it is actually evaluable.
          return rotation.evaluable;
        }),
    };
  };

  const sources: SourcesHandler = async () => deps.sources.load();

  return { crops, sources };
}

/** Used by the app when the database is not configured: refuse, do not fake. */
export function unavailableCatalogue(): never {
  throw new AppError(
    "SOURCE_UNAVAILABLE",
    "The crop catalogue is unavailable because the database is not configured",
  );
}
