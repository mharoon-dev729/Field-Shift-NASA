/**
 * Short-lived negative-result memo ("circuit breaker").
 *
 * Why: SoilGrids was observed taking 1.5 s to over 60 s on 2026-11-14. Without a
 * memo, every request pays the full timeout again while the provider is down,
 * which makes otherwise-valid NASA POWER evidence take 12 s to arrive.
 *
 * This is NOT a cache of failures "as success". It never yields values: it only
 * short-circuits a retry for `ttlMs` and reports the same failure with its
 * original timestamp. The source is retried automatically after the TTL.
 */

export interface RememberedFailure {
  code: string;
  message: string;
  at: string;
}

export class FailureMemo {
  private readonly entries = new Map<string, { until: number; failure: RememberedFailure }>();

  constructor(private readonly ttlMs = 60_000) {}

  get(sourceId: string, now: Date): RememberedFailure | null {
    const entry = this.entries.get(sourceId);
    if (!entry) return null;
    if (entry.until <= now.getTime()) {
      this.entries.delete(sourceId);
      return null;
    }
    return entry.failure;
  }

  set(sourceId: string, failure: RememberedFailure, now: Date): void {
    this.entries.set(sourceId, { until: now.getTime() + this.ttlMs, failure });
  }

  clear(sourceId: string): void {
    this.entries.delete(sourceId);
  }
}
