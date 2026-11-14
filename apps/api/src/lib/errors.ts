/**
 * Structured errors. Every failure that a client can see goes through here so
 * the response envelope stays identical (docs/API_CONTRACT.md §0).
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "OUT_OF_COVERAGE"
  | "SOURCE_UNAVAILABLE"
  | "SOURCE_INVALID_RESPONSE"
  | "UNIT_MISMATCH"
  | "INSUFFICIENT_EVIDENCE"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "INTERNAL";

const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  OUT_OF_COVERAGE: 422,
  SOURCE_UNAVAILABLE: 502,
  SOURCE_INVALID_RESPONSE: 502,
  UNIT_MISMATCH: 502,
  INSUFFICIENT_EVIDENCE: 200,
  RATE_LIMITED: 429,
  NOT_FOUND: 404,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: { details?: Record<string, unknown>; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = HTTP_STATUS[code];
    this.details = options.details ?? {};
    this.retryable = options.retryable ?? false;
  }
}

/**
 * A unit mismatch is never silently converted. The variable becomes unusable
 * and the affected source is reported as invalid (test A02).
 */
export class UnitMismatchError extends AppError {
  constructor(variable: string, expected: string, received: string) {
    super("UNIT_MISMATCH", `Unit mismatch for ${variable}: expected "${expected}", received "${received}"`, {
      details: { variable, expectedUnit: expected, receivedUnit: received },
    });
    this.name = "UnitMismatchError";
  }
}

/** Serialise an error into the public envelope. Never includes a stack trace. */
export function toErrorEnvelope(err: unknown): {
  status: number;
  body: { error: { code: string; message: string; details: Record<string, unknown> } };
} {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }
  return {
    status: 500,
    body: {
      error: { code: "INTERNAL", message: "Unexpected server error", details: {} },
    },
  };
}
