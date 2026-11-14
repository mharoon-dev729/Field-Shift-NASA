/**
 * Date helpers. Dates are handled as plain YYYY-MM-DD strings in UTC and are
 * never shifted to look current (docs/TEST_STRATEGY.md, master prompt §13).
 */

import { AppError } from "./errors.js";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** Inclusive day count between two ISO dates. */
export function daysBetween(start: string, end: string): number {
  const ms = toUtcDate(end).getTime() - toUtcDate(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

export function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 20_000) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

export function toPowerDate(iso: string): string {
  return iso.replace(/-/g, "");
}

export function fromPowerDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) {
    throw new AppError("SOURCE_INVALID_RESPONSE", "Unexpected date key in POWER response", {
      details: { received: yyyymmdd },
    });
  }
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export type Season = "rabi" | "kharif";

/**
 * Planning window per season, from the documented Punjab crop calendar
 * (docs/AGRICULTURAL_EVIDENCE.md §4):
 *  - kharif: cotton sowing 1 Apr -> cotton/rice harvest end 30 Nov
 *  - rabi:   wheat sowing 1 Nov  -> wheat crop-cut end 5 May
 *
 * These are *district-level recommended windows*, not this farm's dates.
 */
export function resolveSeasonWindow(season: Season, year: number): { start: string; end: string } {
  const y = Math.trunc(year);
  if (!Number.isFinite(y) || y < 1980 || y > 2100) {
    throw new AppError("VALIDATION_ERROR", "year is outside the supported range", {
      details: { field: "year", min: 1980, max: 2100 },
    });
  }
  if (season === "kharif") {
    return { start: `${y}-04-01`, end: `${y}-11-30` };
  }
  return { start: `${y}-11-01`, end: `${y + 1}-05-05` };
}

/**
 * Clamp a requested window to what can exist: nothing after "yesterday".
 * Returns the clamped window and the number of days removed (test A06).
 */
export function clampToAvailable(
  window: { start: string; end: string },
  now: Date,
): { start: string; end: string; droppedFutureDays: number } {
  const latest = toIsoDate(new Date(now.getTime() - 86_400_000));
  if (window.end <= latest) {
    return { ...window, droppedFutureDays: 0 };
  }
  const clampedEnd = window.end > latest ? latest : window.end;
  const dropped =
    daysBetween(window.start, window.end) -
    (window.start <= clampedEnd ? daysBetween(window.start, clampedEnd) : 0);
  return { start: window.start, end: clampedEnd, droppedFutureDays: Math.max(dropped, 0) };
}
