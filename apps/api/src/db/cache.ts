/**
 * Observation cache.
 *
 * Design (docs/DECISION_ENGINE_SPEC.md §2, DATABASE_SCHEMA.md §4):
 *  - Only VALIDATED daily values are stored. Nothing is cached before the
 *    adapter has passed unit/shape/fill-value validation, so a malformed
 *    response can never become "successful evidence" later.
 *  - Aggregates and indicators are NOT stored: they are re-derived from the
 *    cached daily values by the same pure function, so a cache hit returns
 *    identical numbers and never drifts from the derivation rules.
 *  - Key: source + rounded coordinates + window + variables. Different points
 *    or windows therefore cannot collide.
 *  - Backends: in-process memory (always) and Supabase (when the service-role
 *    key is valid). The Supabase backend is best-effort: if it is missing or
 *    rejects the key, evidence still works from memory and reports
 *    `cache: "unavailable"` for persistence.
 */

import type { DailySeries, DataClass } from "@fieldshift/shared";

export interface CacheRow {
  sourceId: string;
  variable: string;
  date: string;
  value: number | null;
  unit: string;
  dataClass: DataClass;
  spatialResolution: string;
  qualityFlags: string[];
  retrievedAt: string;
  /** The grid point the source actually resolved, so provenance survives a hit. */
  gridLat?: number | null;
  gridLon?: number | null;
}

export interface CacheKey {
  sourceId: string;
  lat: number;
  lon: number;
  windowStart: string;
  windowEnd: string;
  variables: string[];
}

export interface CacheHit {
  rows: CacheRow[];
  retrievedAt: string;
  backend: "memory" | "supabase";
}

export interface CacheStore {
  readonly backend: "memory" | "supabase";
  get(key: CacheKey, now: Date): Promise<CacheHit | null>;
  put(key: CacheKey, rows: CacheRow[], retrievedAt: string, ttlSeconds: number, now: Date): Promise<void>;
}

export function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Stable, human-readable cache key. Exported so tests can assert non-collision. */
export function cacheKeyString(key: CacheKey): string {
  return [
    key.sourceId,
    roundCoord(key.lat).toFixed(3),
    roundCoord(key.lon).toFixed(3),
    key.windowStart,
    key.windowEnd,
    [...key.variables].sort().join(","),
  ].join("|");
}

export class MemoryCacheStore implements CacheStore {
  readonly backend = "memory" as const;
  private readonly entries = new Map<string, { rows: CacheRow[]; retrievedAt: string; expiresAt: number }>();

  async get(key: CacheKey, now: Date): Promise<CacheHit | null> {
    const entry = this.entries.get(cacheKeyString(key));
    if (!entry) return null;
    if (entry.expiresAt <= now.getTime()) {
      this.entries.delete(cacheKeyString(key));
      return null;
    }
    return { rows: entry.rows, retrievedAt: entry.retrievedAt, backend: "memory" };
  }

  async put(
    key: CacheKey,
    rows: CacheRow[],
    retrievedAt: string,
    ttlSeconds: number,
    now: Date,
  ): Promise<void> {
    this.entries.set(cacheKeyString(key), {
      rows,
      retrievedAt,
      expiresAt: now.getTime() + ttlSeconds * 1000,
    });
  }

  /** Test/diagnostic helper. */
  get size(): number {
    return this.entries.size;
  }
}

interface SupabaseLikeClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): unknown;
    };
    insert(rows: unknown[]): Promise<{ error: { message: string } | null }>;
    upsert?(
      rows: unknown[],
      options?: { onConflict?: string },
    ): Promise<{ error: { message: string } | null }>;
  };
}

/**
 * Supabase-backed cache using the documented `environmental_observations`
 * table. One row per (variable, day); `aggregation = 'daily'`.
 */
export class SupabaseCacheStore implements CacheStore {
  readonly backend = "supabase" as const;
  private readonly client: SupabaseLikeClient;
  private readonly table = "environmental_observations";

  constructor(client: SupabaseLikeClient) {
    this.client = client;
  }

  async get(key: CacheKey, now: Date): Promise<CacheHit | null> {
    const query = this.client
      .from(this.table)
      .select(
        "variable,unit,value,data_class,spatial_resolution,quality_flags,retrieved_at,window_start,grid_lat,grid_lon",
      )
      .eq("source_id", key.sourceId) as unknown as {
      eq(column: string, value: unknown): unknown;
    };

    // Chain the remaining filters; the shape is kept loose to avoid coupling
    // this file to a specific supabase-js version.
    const builder = query
      .eq("lat_rounded", roundCoord(key.lat)) as unknown as {
      eq(column: string, value: unknown): unknown;
    };
    const withLon = builder.eq("lon_rounded", roundCoord(key.lon)) as unknown as {
      eq(column: string, value: unknown): unknown;
    };
    const withAgg = withLon.eq("aggregation", "daily") as unknown as {
      gte(column: string, value: unknown): unknown;
    };
    const withStart = withAgg.gte("window_start", key.windowStart) as unknown as {
      lte(column: string, value: unknown): unknown;
    };
    const withEnd = withStart.lte("window_end", key.windowEnd) as unknown as {
      gt(column: string, value: unknown): unknown;
    };
    const withExpiry = withEnd.gt("expires_at", now.toISOString()) as unknown as
      | Promise<{ data: unknown; error: { message: string } | null }>
      | { then: unknown };

    const result = await (withExpiry as Promise<{ data: unknown; error: { message: string } | null }>);
    if (result.error) throw new Error(result.error.message);
    const data = Array.isArray(result.data) ? (result.data as Array<Record<string, unknown>>) : [];
    if (data.length === 0) return null;

    const rows: CacheRow[] = data
      .filter((r) => key.variables.includes(String(r["variable"])))
      .map((r) => ({
        sourceId: key.sourceId,
        variable: String(r["variable"]),
        date: String(r["window_start"]).slice(0, 10),
        value: typeof r["value"] === "number" ? (r["value"] as number) : null,
        unit: String(r["unit"] ?? ""),
        dataClass: String(r["data_class"] ?? "reanalysis") as DataClass,
        spatialResolution: String(r["spatial_resolution"] ?? ""),
        qualityFlags: Array.isArray(r["quality_flags"]) ? (r["quality_flags"] as string[]) : [],
        retrievedAt: String(r["retrieved_at"] ?? ""),
        gridLat: typeof r["grid_lat"] === "number" ? (r["grid_lat"] as number) : null,
        gridLon: typeof r["grid_lon"] === "number" ? (r["grid_lon"] as number) : null,
      }));

    // Only a complete answer counts as a hit: every requested variable must
    // cover the window, otherwise we refetch rather than serve a partial view.
    const days = countDays(key.windowStart, key.windowEnd);
    const expected = days * key.variables.length;
    if (rows.length !== expected) return null;

    return {
      rows,
      retrievedAt: rows[0]?.retrievedAt ?? now.toISOString(),
      backend: "supabase",
    };
  }

  async put(
    key: CacheKey,
    rows: CacheRow[],
    _retrievedAt: string,
    ttlSeconds: number,
    now: Date,
  ): Promise<void> {
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const payload = rows.map((row) => ({
      lat_rounded: roundCoord(key.lat),
      lon_rounded: roundCoord(key.lon),
      grid_lat: row.gridLat ?? null,
      grid_lon: row.gridLon ?? null,
      source_id: key.sourceId,
      variable: row.variable,
      unit: row.unit,
      aggregation: "daily",
      window_start: row.date,
      window_end: row.date,
      value: row.value,
      n_valid: row.value === null ? 0 : 1,
      n_expected: 1,
      data_class: row.dataClass,
      spatial_resolution: row.spatialResolution,
      quality_flags: row.qualityFlags,
      retrieved_at: row.retrievedAt,
      expires_at: expiresAt,
    }));

    // Re-fetching an already-cached window must REFRESH it, not fail on the
    // uq_obs_key constraint. Upsert when the client supports it.
    const table = this.client.from(this.table);
    const { error } = table.upsert
      ? await table.upsert(payload, {
          onConflict:
            "lat_rounded,lon_rounded,source_id,variable,aggregation,window_start,window_end",
        })
      : await table.insert(payload);
    if (error) throw new Error(error.message);
  }
}

function countDays(start: string, end: string): number {
  const ms = new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Layered cache: memory first, then any persistent backend.
 * A persistent-backend failure never fails the request; it only changes the
 * reported cache status.
 */
export class EvidenceCache {
  private readonly memory = new MemoryCacheStore();

  constructor(
    private readonly persistent: CacheStore | null,
    private readonly ttlSeconds: number,
    private readonly onWarning?: (message: string) => void,
  ) {}

  async get(
    key: CacheKey,
    now: Date,
  ): Promise<{ hit: CacheHit | null; persistentError: string | null }> {
    const mem = await this.memory.get(key, now);
    if (mem) return { hit: mem, persistentError: null };

    if (this.persistent) {
      try {
        const hit = await this.persistent.get(key, now);
        if (hit) {
          // Promote into memory so the next call is fast.
          await this.memory.put(key, hit.rows, hit.retrievedAt, this.ttlSeconds, now);
          return { hit, persistentError: null };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown cache error";
        this.onWarning?.(`persistent cache unavailable: ${message}`);
        return { hit: null, persistentError: message };
      }
    }
    return { hit: null, persistentError: null };
  }

  async put(key: CacheKey, rows: CacheRow[], retrievedAt: string, now: Date): Promise<void> {
    await this.memory.put(key, rows, retrievedAt, this.ttlSeconds, now);
    if (this.persistent) {
      try {
        await this.persistent.put(key, rows, retrievedAt, this.ttlSeconds, now);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown cache error";
        this.onWarning?.(`persistent cache write failed: ${message}`);
      }
    }
  }
}

/** Rebuild daily series from cached rows (sorted by date). */
export function rowsToDailySeries(rows: CacheRow[]): DailySeries[] {
  const byVariable = new Map<string, CacheRow[]>();
  for (const row of rows) {
    const list = byVariable.get(row.variable) ?? [];
    list.push(row);
    byVariable.set(row.variable, list);
  }

  return [...byVariable.entries()].map(([variable, list]) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0]!;
    return {
      variable,
      label: first.variable,
      unit: first.unit,
      points: sorted.map((r) => ({ date: r.date, value: r.value })),
      dataClass: first.dataClass,
      sourceId: first.sourceId,
      spatialResolution: first.spatialResolution,
      qualityFlags: first.qualityFlags,
    };
  });
}

/** Flatten an adapter's daily series into cache rows. */
export function dailySeriesToRows(series: DailySeries[]): CacheRow[] {
  const rows: CacheRow[] = [];
  for (const s of series) {
    for (const point of s.points) {
      rows.push({
        sourceId: s.sourceId,
        variable: s.variable,
        date: point.date,
        value: point.value,
        unit: s.unit,
        dataClass: s.dataClass,
        spatialResolution: s.spatialResolution,
        qualityFlags: s.qualityFlags,
        retrievedAt: new Date().toISOString(),
      });
    }
  }
  return rows;
}
