import { describe, expect, it } from "vitest";

import {
  cacheKeyString,
  dailySeriesToRows,
  EvidenceCache,
  MemoryCacheStore,
  roundCoord,
  rowsToDailySeries,
  type CacheKey,
  type CacheRow,
} from "../src/db/cache.js";

const NOW = new Date("2026-11-14T09:00:00Z");

function key(overrides: Partial<CacheKey> = {}): CacheKey {
  return {
    sourceId: "nasa_power",
    lat: 31.4187,
    lon: 73.0791,
    windowStart: "2026-04-01",
    windowEnd: "2026-04-03",
    variables: ["T2M", "PRECTOTCORR"],
    ...overrides,
  };
}

function rows(): CacheRow[] {
  return [
    {
      sourceId: "nasa_power",
      variable: "T2M",
      date: "2026-04-01",
      value: 30.1,
      unit: "C",
      dataClass: "reanalysis",
      spatialResolution: "0.5 x 0.625 deg (MERRA-2)",
      qualityFlags: [],
      retrievedAt: NOW.toISOString(),
    },
    {
      sourceId: "nasa_power",
      variable: "T2M",
      date: "2026-04-02",
      value: null,
      unit: "C",
      dataClass: "reanalysis",
      spatialResolution: "0.5 x 0.625 deg (MERRA-2)",
      qualityFlags: ["fill_value_removed:1"],
      retrievedAt: NOW.toISOString(),
    },
  ];
}

describe("cache keys", () => {
  it("distinguishes different coordinates", () => {
    expect(cacheKeyString(key())).not.toBe(cacheKeyString(key({ lat: 31.5 })));
    expect(cacheKeyString(key())).not.toBe(cacheKeyString(key({ lon: 73.2 })));
  });

  it("distinguishes different date ranges", () => {
    expect(cacheKeyString(key())).not.toBe(
      cacheKeyString(key({ windowStart: "2026-04-02", windowEnd: "2026-04-04" })),
    );
  });

  it("is order-insensitive for the variable list and rounds coordinates to 3 dp", () => {
    expect(cacheKeyString(key({ variables: ["PRECTOTCORR", "T2M"] }))).toBe(cacheKeyString(key()));
    expect(roundCoord(31.41874)).toBe(31.419);
  });
});

describe("memory cache store", () => {
  it("returns a hit for a repeated identical key", async () => {
    const store = new MemoryCacheStore();
    await store.put(key(), rows(), NOW.toISOString(), 3600, NOW);

    const hit = await store.get(key(), new Date(NOW.getTime() + 1000));
    expect(hit).not.toBeNull();
    expect(hit!.backend).toBe("memory");
    expect(hit!.rows).toHaveLength(2);
  });

  it("does not serve expired entries", async () => {
    const store = new MemoryCacheStore();
    await store.put(key(), rows(), NOW.toISOString(), 60, NOW);
    const hit = await store.get(key(), new Date(NOW.getTime() + 61_000));
    expect(hit).toBeNull();
  });

  it("does not collide across coordinates or windows", async () => {
    const store = new MemoryCacheStore();
    await store.put(key(), rows(), NOW.toISOString(), 3600, NOW);
    expect(await store.get(key({ lat: 31.5 }), NOW)).toBeNull();
    expect(await store.get(key({ windowStart: "2026-05-01", windowEnd: "2026-05-02" }), NOW)).toBeNull();
  });
});

describe("layered cache", () => {
  it("first call misses, second identical call hits", async () => {
    const cache = new EvidenceCache(null, 3600);
    const first = await cache.get(key(), NOW);
    expect(first.hit).toBeNull();

    await cache.put(key(), rows(), NOW.toISOString(), NOW);
    const second = await cache.get(key(), NOW);
    expect(second.hit).not.toBeNull();
    expect(second.hit!.rows).toHaveLength(2);
  });

  it("survives a failing persistent backend without failing the request", async () => {
    const warnings: string[] = [];
    const persistent = {
      backend: "supabase" as const,
      async get() {
        throw new Error("Invalid API key");
      },
      async put() {
        throw new Error("Invalid API key");
      },
    };
    const cache = new EvidenceCache(persistent, 3600, (m) => warnings.push(m));

    const result = await cache.get(key(), NOW);
    expect(result.hit).toBeNull();
    expect(result.persistentError).toContain("Invalid API key");
    expect(warnings.join(" ")).toContain("persistent cache unavailable");

    await expect(cache.put(key(), rows(), NOW.toISOString(), NOW)).resolves.toBeUndefined();
    // Memory still works even though persistence is down.
    const after = await cache.get(key(), NOW);
    expect(after.hit).not.toBeNull();
  });
});

describe("cache row <-> series conversion", () => {
  it("preserves dates, units and flags through a round trip", () => {
    const series = rowsToDailySeries(rows());
    const t2m = series.find((s) => s.variable === "T2M")!;
    expect(t2m.unit).toBe("C");
    expect(t2m.points.map((p) => p.date)).toEqual(["2026-04-01", "2026-04-02"]);
    expect(t2m.points[1]!.value).toBeNull();

    const back = dailySeriesToRows(series);
    expect(back.filter((r) => r.variable === "T2M")).toHaveLength(2);
    expect(back[0]!.dataClass).toBe("reanalysis");
  });
});
