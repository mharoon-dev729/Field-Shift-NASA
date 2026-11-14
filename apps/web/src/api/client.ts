/**
 * HTTP client for the Field Shift API.
 *
 * Rules:
 *  - one place for timeouts, error envelopes and JSON parsing;
 *  - a failed request never returns substitute data;
 *  - the caller receives a typed ApiError it can render.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(
    message: string,
    options: { code?: string; status?: number; details?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = options.code ?? "NETWORK_ERROR";
    this.status = options.status ?? 0;
    this.details = options.details ?? {};
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Configured base URL, or same-origin `/api` in development. */
const API_BASE = (import.meta.env["VITE_API_BASE_URL"] as string | undefined)?.replace(/\/$/, "") ?? "";

function abortError(): ApiError {
  return new ApiError("The request was cancelled.", { code: "ABORTED" });
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onExternalAbort);
  if (options.signal?.aborted) controller.abort();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}/api/v1${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new ApiError("The server returned a response that is not JSON.", {
          code: "INVALID_RESPONSE",
          status: response.status,
        });
      }
    }

    if (!response.ok) {
      const envelope = payload as { error?: { code?: string; message?: string; details?: unknown } } | null;
      throw new ApiError(envelope?.error?.message ?? `Request failed (HTTP ${response.status}).`, {
        code: envelope?.error?.code ?? "HTTP_ERROR",
        status: response.status,
        details: (envelope?.error?.details as Record<string, unknown>) ?? {},
      });
    }

    return payload as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (options.signal?.aborted) throw abortError();
    if (controller.signal.aborted) {
      throw new ApiError(
        `The request timed out after ${Math.round(timeoutMs / 1000)} seconds. The server may still be fetching evidence.`,
        { code: "TIMEOUT" },
      );
    }
    throw new ApiError(
      "Could not reach the Field Shift API. Check that the API server is running, then retry.",
      { code: "NETWORK_ERROR" },
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}
