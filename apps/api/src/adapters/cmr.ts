/**
 * NASA CMR (Common Metadata Repository) adapter — availability metadata only.
 *
 * Answers one question: does a NASA product actually have granules over this
 * area for these dates? It is used to tell the user whether SMAP/IMERG data
 * exists for their window, without downloading (and without credentials).
 *
 * No login is required for search. A zero-granule answer is a valid result,
 * not an error (test A12).
 */

import type { SourceRef } from "@fieldshift/shared";

import { AppError } from "../lib/errors.js";
import { fetchJson, type FetchLike } from "../lib/http.js";

export const CMR_GRANULES_URL = "https://cmr.earthdata.nasa.gov/search/granules.json";

export const CMR_SOURCE: SourceRef = {
  id: "cmr",
  provider: "NASA CMR",
  product: "Common Metadata Repository granule search",
  url: "https://cmr.earthdata.nasa.gov/search/",
  dataClass: "observation",
  spatialResolution: "product dependent",
};

export interface CmrQuery {
  shortName: string;
  /** [west, south, east, north] */
  boundingBox: [number, number, number, number];
  /** ISO dates. */
  start: string;
  end: string;
  pageSize?: number;
}

export interface CmrResult {
  shortName: string;
  available: boolean;
  granuleCount: number;
  sampleGranules: string[];
  searchUrl: string;
  retrievedAt: string;
}

export async function checkGranules(
  query: CmrQuery,
  deps: { fetchImpl?: FetchLike; timeoutMs?: number; now?: Date } = {},
): Promise<CmrResult> {
  const pageSize = Math.min(query.pageSize ?? 3, 20);
  const temporal = `${query.start}T00:00:00Z,${query.end}T23:59:59Z`;
  const url =
    `${CMR_GRANULES_URL}?short_name=${encodeURIComponent(query.shortName)}` +
    `&bounding_box=${query.boundingBox.join(",")}` +
    `&temporal=${encodeURIComponent(temporal)}&page_size=${pageSize}`;

  const json = await fetchJson(url, {
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs ?? 15_000,
    sourceId: CMR_SOURCE.id,
  });

  const feed = (json as { feed?: { entry?: unknown } })?.feed;
  if (!feed || typeof feed !== "object") {
    throw new AppError("SOURCE_INVALID_RESPONSE", "CMR response is missing the feed block");
  }

  const entries = Array.isArray(feed.entry) ? (feed.entry as Array<Record<string, unknown>>) : [];
  const sampleGranules = entries
    .map((e) => String(e["producer_granule_id"] ?? e["title"] ?? ""))
    .filter(Boolean)
    .slice(0, 3);

  return {
    shortName: query.shortName,
    available: entries.length > 0,
    granuleCount: entries.length,
    sampleGranules,
    searchUrl: url,
    retrievedAt: (deps.now ?? new Date()).toISOString(),
  };
}
