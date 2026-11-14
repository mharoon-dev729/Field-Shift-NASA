/**
 * HTTP helper with timeouts, one jittered retry and strict response typing.
 *
 * Rules enforced here so adapters cannot get them wrong:
 *  - never echo an upstream body to the client (test A15);
 *  - a non-JSON content type is an invalid response, not parsed data;
 *  - 4xx (except 429) is never retried;
 *  - 429 honours Retry-After once, then surfaces RATE_LIMITED (test A13).
 */

import { AppError } from "./errors.js";

export type FetchLike = typeof fetch;

export interface FetchJsonOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  retries?: number;
  /** Max wait honoured from Retry-After, in ms. */
  maxRetryAfterMs?: number;
  sourceId?: string;
  headers?: Record<string, string>;
}

const DEFAULTS = {
  timeoutMs: 20_000,
  retries: 1,
  maxRetryAfterMs: 2_000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(res: Response, capMs: number): number {
  const header = res.headers.get("retry-after");
  if (!header) return 250;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, capMs);
  const dateMs = Date.parse(header);
  if (Number.isFinite(dateMs)) return Math.min(Math.max(dateMs - Date.now(), 0), capMs);
  return 250;
}

/** Parse a response as JSON, mapping every failure mode to a typed AppError. */
async function parseJson(res: Response, url: string): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();

  if (!contentType.includes("json")) {
    // Do NOT include the body: it may be an HTML error page or worse.
    throw new AppError("SOURCE_INVALID_RESPONSE", "Upstream did not return JSON", {
      details: { url: stripQuery(url), contentType: contentType.slice(0, 80) },
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("SOURCE_INVALID_RESPONSE", "Upstream returned malformed JSON", {
      details: { url: stripQuery(url) },
    });
  }
}

function stripQuery(url: string): string {
  const idx = url.indexOf("?");
  return idx === -1 ? url : url.slice(0, idx);
}

export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const retries = options.retries ?? DEFAULTS.retries;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? DEFAULTS.maxRetryAfterMs;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchImpl(url, {
        headers: { accept: "application/json", ...(options.headers ?? {}) },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.status === 429) {
        const wait = retryAfterMs(res, maxRetryAfterMs);
        if (attempt < retries) {
          await sleep(wait);
          continue;
        }
        throw new AppError("RATE_LIMITED", "Upstream rate limit reached", {
          details: { url: stripQuery(url), retryAfterMs: wait },
          retryable: true,
        });
      }

      if (res.status >= 500) {
        lastError = new AppError("SOURCE_UNAVAILABLE", `Upstream responded ${res.status}`, {
          details: { url: stripQuery(url), upstreamStatus: res.status },
          retryable: true,
        });
        if (attempt < retries) {
          await sleep(150 + Math.floor(Math.random() * 200));
          continue;
        }
        throw lastError;
      }

      if (!res.ok) {
        // 4xx other than 429: the request itself is wrong. Do not retry.
        throw new AppError("SOURCE_UNAVAILABLE", `Upstream rejected the request (${res.status})`, {
          details: { url: stripQuery(url), upstreamStatus: res.status },
          retryable: false,
        });
      }

      return await parseJson(res, url);
    } catch (err) {
      if (err instanceof AppError) {
        if (!err.retryable || attempt >= retries) throw err;
        lastError = err;
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.toLowerCase().includes("abort") || message.includes("timeout");
      lastError = new AppError(
        "SOURCE_UNAVAILABLE",
        isTimeout ? "Upstream timed out" : "Upstream request failed",
        { details: { url: stripQuery(url), reason: isTimeout ? "timeout" : "network" }, retryable: true },
      );
      if (attempt >= retries) throw lastError;
      await sleep(150 + Math.floor(Math.random() * 200));
    }
  }

  throw lastError instanceof AppError
    ? lastError
    : new AppError("SOURCE_UNAVAILABLE", "Upstream request failed", {
        details: { url: stripQuery(url) },
        retryable: true,
      });
}
