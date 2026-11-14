/**
 * Typed API calls. Every response is validated with the shared zod schema before
 * it reaches a component, so a contract drift surfaces as an error instead of a
 * half-rendered screen.
 */

import {
  cropsResponseSchema,
  engineResultSchema,
  evidenceResponseSchema,
  sourcesResponseSchema,
  type CompareRequest,
  type CropsResponse,
  type EngineResult,
  type EvidenceQuery,
  type EvidenceResponse,
  type SourcesResponse,
} from "@fieldshift/shared";
import { z } from "zod";

import { apiRequest, ApiError } from "./client.js";

function invalid(path: string, error: z.ZodError): ApiError {
  return new ApiError(`The server response for ${path} did not match the documented contract.`, {
    code: "CONTRACT_MISMATCH",
    details: { issues: error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) },
  });
}

export async function getCatalogue(
  params: { season?: "rabi" | "kharif"; year?: number } = {},
  signal?: AbortSignal,
): Promise<CropsResponse> {
  const search = new URLSearchParams();
  if (params.season) search.set("season", params.season);
  if (params.year) search.set("year", String(params.year));
  const query = search.toString();

  const payload = await apiRequest<unknown>(`/crops${query ? `?${query}` : ""}`, {}, { signal, timeoutMs: 20_000 });
  const parsed = cropsResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalid("/crops", parsed.error);
  return parsed.data;
}

export async function getSources(signal?: AbortSignal): Promise<SourcesResponse> {
  const payload = await apiRequest<unknown>("/sources", {}, { signal, timeoutMs: 20_000 });
  const parsed = sourcesResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalid("/sources", parsed.error);
  return parsed.data;
}

export async function getEvidence(query: EvidenceQuery, signal?: AbortSignal): Promise<EvidenceResponse> {
  const search = new URLSearchParams({
    lat: String(query.lat),
    lon: String(query.lon),
    season: query.season,
    year: String(query.year),
  });

  // POWER may retry once and runs alongside SoilGrids. This allows that
  // documented slow path while keeping catalogue/source requests short.
  const payload = await apiRequest<unknown>(`/evidence?${search.toString()}`, {}, { signal, timeoutMs: 50_000 });
  const parsed = evidenceResponseSchema.safeParse(payload);
  if (!parsed.success) throw invalid("/evidence", parsed.error);
  return parsed.data;
}

export async function compareRotations(request: CompareRequest, signal?: AbortSignal): Promise<EngineResult> {
  const payload = await apiRequest<unknown>(
    "/compare",
    { method: "POST", body: JSON.stringify(request) },
    // A comparison can retrieve two seasonal evidence windows and climatology.
    // The Vercel function is capped at 120 s, so wait slightly longer for its
    // response instead of aborting a request the server can still complete.
    { signal, timeoutMs: 125_000 },
  );
  const parsed = engineResultSchema.safeParse(payload);
  if (!parsed.success) throw invalid("/compare", parsed.error);
  return parsed.data;
}
