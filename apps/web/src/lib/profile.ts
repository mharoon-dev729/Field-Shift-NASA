/**
 * Farm profile form state and its conversion to the API request.
 *
 * Validation uses the SAME zod schema the server enforces, so the form cannot
 * accept something the API would reject (and vice versa).
 */

import { compareRequestSchema, PILOT, type CompareRequest } from "@fieldshift/shared";

export type SeasonValue = "rabi" | "kharif";
export type IrrigationValue = "canal" | "tubewell" | "both" | "rainfed";

export interface FarmProfileInput {
  lat: string;
  lon: string;
  season: SeasonValue;
  planningYear: string;
  currentRotationId: string;
  previousCropId: string;
  irrigation: IrrigationValue;
  farmSizeAcres: string;
  soilTexture: string;
  soilPh: string;
  organicMatter: string;
  priorities: { water: number; soilHealth: number; climateResilience: number };
  candidateRotationIds: string[];
}

export const DEFAULT_PROFILE: FarmProfileInput = {
  lat: String(PILOT.anchor.lat),
  lon: String(PILOT.anchor.lon),
  season: "kharif",
  planningYear: String(new Date().getUTCFullYear() - 1),
  currentRotationId: "wheat-cotton",
  previousCropId: "",
  irrigation: "canal",
  farmSizeAcres: "",
  soilTexture: "",
  soilPh: "",
  organicMatter: "",
  priorities: { water: 0.6, soilHealth: 0.2, climateResilience: 0.2 },
  candidateRotationIds: ["wheat-cotton", "wheat-maize", "wheat-rice"],
};

export type ProfileErrors = Record<string, string>;

function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export interface BuildResult {
  request: CompareRequest | null;
  errors: ProfileErrors;
}

/** Turns the form strings into the documented request, or into field errors. */
export function buildCompareRequest(profile: FarmProfileInput): BuildResult {
  const errors: ProfileErrors = {};

  const lat = Number(profile.lat);
  const lon = Number(profile.lon);
  if (profile.lat.trim() === "" || !Number.isFinite(lat)) errors["lat"] = "Enter a latitude in decimal degrees.";
  else if (lat < PILOT.bbox.south || lat > PILOT.bbox.north) {
    errors["lat"] = `The pilot area spans ${PILOT.bbox.south}–${PILOT.bbox.north} N.`;
  }
  if (profile.lon.trim() === "" || !Number.isFinite(lon)) errors["lon"] = "Enter a longitude in decimal degrees.";
  else if (lon < PILOT.bbox.west || lon > PILOT.bbox.east) {
    errors["lon"] = `The pilot area spans ${PILOT.bbox.west}–${PILOT.bbox.east} E.`;
  }

  const year = Number(profile.planningYear);
  if (!Number.isInteger(year) || year < 1980 || year > new Date().getUTCFullYear() + 1) {
    errors["planningYear"] = `Choose a year between 1980 and ${new Date().getUTCFullYear() + 1}.`;
  }

  if (profile.candidateRotationIds.length === 0) {
    errors["candidateRotationIds"] = "Select at least one rotation to compare.";
  }
  if (!profile.candidateRotationIds.includes(profile.currentRotationId)) {
    errors["candidateRotationIds"] = "Your current rotation must be one of the compared options.";
  }

  const { water, soilHealth, climateResilience } = profile.priorities;
  if (water + soilHealth + climateResilience <= 0) {
    errors["priorities"] = "Set at least one priority above zero.";
  }

  const ph = optionalNumber(profile.soilPh);
  if (profile.soilPh.trim() !== "" && (ph === null || ph < 3 || ph > 11)) {
    errors["soilPh"] = "Soil pH must be between 3 and 11, or left blank.";
  }
  const organicMatter = optionalNumber(profile.organicMatter);
  if (profile.organicMatter.trim() !== "" && (organicMatter === null || organicMatter < 0 || organicMatter > 20)) {
    errors["organicMatter"] = "Organic matter must be 0–20 %, or left blank.";
  }
  const farmSize = optionalNumber(profile.farmSizeAcres);
  if (profile.farmSizeAcres.trim() !== "" && (farmSize === null || farmSize < 0.1 || farmSize > 5000)) {
    errors["farmSizeAcres"] = "Farm size must be 0.1–5000 acres, or left blank.";
  }

  if (Object.keys(errors).length > 0) return { request: null, errors };

  const candidate = {
    point: { lat, lon },
    season: profile.season,
    planningYear: year,
    currentRotationId: profile.currentRotationId,
    previousCropId: profile.previousCropId || null,
    irrigation: profile.irrigation,
    farmSizeAcres: farmSize,
    soil:
      profile.soilTexture.trim() || ph !== null || organicMatter !== null
        ? {
            texture: profile.soilTexture.trim() || null,
            pH: ph,
            organicMatter,
          }
        : null,
    priorities: {
      water,
      soilHealth,
      climateResilience,
    },
    candidateRotationIds: profile.candidateRotationIds,
  };

  const parsed = compareRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors[issue.path.join(".") || "form"] = issue.message;
    }
    return { request: null, errors };
  }
  return { request: parsed.data, errors: {} };
}
