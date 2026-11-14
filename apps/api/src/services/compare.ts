/**
 * POST /api/v1/compare orchestration.
 *
 * Responsibilities kept OUT of the engine (spec §0): retrieving evidence,
 * resolving crop calendars to concrete dates, loading the catalogue, and
 * generating run identifiers/timestamps. The engine stays a pure function.
 *
 * Reuses the Phase 2 evidence pipeline unchanged; no POWER or SoilGrids logic is
 * duplicated here.
 */

import { randomUUID } from "node:crypto";

import type {
  CompareRequest,
  EngineResult,
  EvidenceResponse,
  Season,
} from "@fieldshift/shared";

import { fetchPrecipClimatology, type MonthlyNormals } from "../adapters/power-climatology.js";
import type { CatalogueStore } from "../db/catalogue.js";
import { compareRotations, type EngineCropDef, type EngineInput, type EnginePhaseData } from "../engine/index.js";
import { resolveSeasonWindow } from "../lib/dates.js";
import { AppError } from "../lib/errors.js";
import type { FetchLike } from "../lib/http.js";

export interface CompareDeps {
  /** Phase 2 evidence handler, injected so tests never touch the network. */
  evidence: (query: { lat: number; lon: number; season: Season; year: number }) => Promise<EvidenceResponse>;
  catalogue: CatalogueStore;
  now?: () => Date;
  newRunId?: () => string;
  climatology?: (lat: number, lon: number) => Promise<MonthlyNormals | null>;
  fetchImpl?: FetchLike;
}

export type CompareHandler = (request: CompareRequest) => Promise<EngineResult>;

function md(part: string | null | undefined): string | null {
  if (typeof part !== "string" || !/^\d{2}-\d{2}$/.test(part)) return null;
  return part;
}

/**
 * Concrete window for a crop phase.
 *  - kharif Y:  Apr/May..Nov of year Y
 *  - rabi Y:    Nov of year Y .. Apr/May of Y+1
 */
export function resolveCropWindow(
  crop: EngineCropDef,
  season: Season,
  year: number,
): { start: string; end: string } | null {
  const startMd = md(crop.sowingStartMd);
  const endMd = md(crop.harvestEndMd);
  if (!startMd || !endMd) return null;
  const start = `${year}-${startMd}`;
  const end = season === "rabi" ? `${year + 1}-${endMd}` : `${year}-${endMd}`;
  return end > start ? { start, end } : null;
}

const CLIMATOLOGY_TTL_MS = 24 * 60 * 60 * 1000;

export function createCompareService(deps: CompareDeps): CompareHandler {
  const nowFn = deps.now ?? (() => new Date());
  const newRunId = deps.newRunId ?? (() => randomUUID());
  const climatologyFn =
    deps.climatology ??
    ((lat: number, lon: number) =>
      fetchPrecipClimatology(lat, lon, { fetchImpl: deps.fetchImpl }));

  const climatologyCache = new Map<string, { at: number; normals: MonthlyNormals | null }>();

  async function climatologyFor(lat: number, lon: number): Promise<MonthlyNormals | null> {
    const key = `${lat.toFixed(2)}|${lon.toFixed(2)}`;
    const cached = climatologyCache.get(key);
    const now = Date.now();
    if (cached && now - cached.at < CLIMATOLOGY_TTL_MS) return cached.normals;
    const normals = await climatologyFn(lat, lon).catch(() => null);
    climatologyCache.set(key, { at: now, normals });
    return normals;
  }

  return async function compare(request: CompareRequest): Promise<EngineResult> {
    const { point, season, planningYear } = request;
    const catalogue = await deps.catalogue.load();

    const excluded: string[] = [];
    const rotations = [];
    for (const id of request.candidateRotationIds) {
      const rotation = catalogue.rotations.find((r) => r.id === id);
      if (!rotation) {
        throw new AppError("VALIDATION_ERROR", "Unknown rotation id", {
          details: { field: "candidateRotationIds", rotationId: id },
        });
      }
      if (!rotation.active) {
        excluded.push(`Rotation "${rotation.label}" is not active in the catalogue.`);
        continue;
      }
      const missingCalendar: string[] = [];
      const notSelectable: string[] = [];
      for (const phase of rotation.phases) {
        const crop = catalogue.crops.find((c) => c.id === phase.cropId);
        if (!crop) {
          missingCalendar.push(phase.cropId);
          continue;
        }
        if (!crop.selectable) notSelectable.push(crop.name);
        if (!resolveCropWindow(crop, phase.season, planningYear)) missingCalendar.push(crop.name);
      }
      if (notSelectable.length > 0) {
        excluded.push(
          `Rotation "${rotation.label}" was excluded because ${notSelectable.join(", ")} ` +
            "is not selectable (its documented calendar is incomplete).",
        );
        continue;
      }
      if (missingCalendar.length > 0) {
        excluded.push(
          `Rotation "${rotation.label}" was excluded because the calendar is incomplete for ${missingCalendar.join(", ")}.`,
        );
        continue;
      }
      rotations.push(rotation);
    }

    if (!rotations.some((r) => r.id === request.currentRotationId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The current rotation cannot be evaluated: it is unknown, inactive, or uses a crop that is not selectable",
        { details: { field: "currentRotationId", received: request.currentRotationId, excluded } },
      );
    }
    if (rotations.length === 0) {
      throw new AppError("VALIDATION_ERROR", "No eligible rotation remains in the comparison", {
        details: { excluded },
      });
    }

    // --- Which season windows are actually needed? -------------------------
    // A rotation cycle anchored on the planning season: the planning season
    // itself plus the immediately preceding window of the other season.
    const partnerSeason: Season = season === "rabi" ? "kharif" : "rabi";
    const partnerYear = season === "rabi" ? planningYear : planningYear - 1;

    const evidenceBySeason = new Map<Season, EvidenceResponse | null>();
    const evidenceLimitations: string[] = [];

    async function loadSeason(target: Season, year: number): Promise<EvidenceResponse | null> {
      if (evidenceBySeason.has(target)) return evidenceBySeason.get(target) ?? null;
      try {
        const response = await deps.evidence({ lat: point.lat, lon: point.lon, season: target, year });
        evidenceBySeason.set(target, response);
        return response;
      } catch (err) {
        const message = err instanceof AppError ? err.message : "evidence retrieval failed";
        evidenceLimitations.push(
          `Environmental evidence for ${target} ${year} could not be retrieved (${message}), so criteria that need it are unavailable.`,
        );
        evidenceBySeason.set(target, null);
        return null;
      }
    }

    const anchorEvidence = await loadSeason(season, planningYear);
    const anyPartnerPhase = rotations.some((r) => r.phases.some((p) => p.season === partnerSeason));
    const partnerEvidence = anyPartnerPhase ? await loadSeason(partnerSeason, partnerYear) : null;

    const normals = await climatologyFor(point.lat, point.lon);

    const cropIds = [...new Set(rotations.flatMap((r) => r.phases.map((p) => p.cropId)))];
    const phases: EnginePhaseData[] = [];

    for (const cropId of cropIds) {
      const crop = catalogue.crops.find((c) => c.id === cropId);
      if (!crop) continue;
      const phase = rotations.flatMap((r) => r.phases).find((p) => p.cropId === cropId);
      if (!phase) continue;

      const year = phase.season === season ? planningYear : partnerYear;
      const window = resolveCropWindow(crop, phase.season, year);
      if (!window) continue;

      const evidence = phase.season === season ? anchorEvidence : partnerEvidence;
      const retrievedAt =
        evidence?.sources.find((s) => s.id === "nasa_power")?.retrievedAt ?? null;

      phases.push({
        cropId,
        season: phase.season,
        windowStart: window.start,
        windowEnd: window.end,
        monthlyNormalMmPerDay: normals,
        series: (evidence?.dailySeries ?? []).map((series) => ({
          variable: series.variable,
          unit: series.unit,
          dataClass: series.dataClass,
          sourceId: series.sourceId,
          spatialResolution: series.spatialResolution,
          retrievedAt,
          points: series.points,
        })),
      });
    }

    // Evidence windows never extend past the last complete day; say so only when
    // the retrieved window is genuinely shorter than the season's own window.
    const anchorWindow = anchorEvidence?.seasonWindow;
    const nominalWindow = resolveSeasonWindow(season, planningYear);
    if (anchorWindow && anchorWindow.end < nominalWindow.end) {
      evidenceLimitations.push(
        `The ${season} ${planningYear} window only reaches ${anchorWindow.end} because later days are not observed yet.`,
      );
    }

    const engineInput: EngineInput = {
      runId: newRunId(),
      generatedAt: nowFn().toISOString(),
      point,
      season,
      planningYear,
      currentRotationId: request.currentRotationId,
      previousCropId: request.previousCropId ?? null,
      irrigation: request.irrigation,
      farmSizeAcres: request.farmSizeAcres ?? null,
      priorities: request.priorities,
      rotations,
      crops: catalogue.crops,
      phases,
      test: false,
      allowSynthetic: false,
    };

    const result = compareRotations(engineInput);

    if (excluded.length > 0 || evidenceLimitations.length > 0) {
      result.globalLimitations = [...new Set([...excluded, ...evidenceLimitations, ...result.globalLimitations])];
    }
    return result;
  };
}
