import { describe, expect, it, vi } from "vitest";

import { fetchPower } from "../src/adapters/power.js";
import { fetchSoil } from "../src/adapters/soilgrids.js";
import { clampToAvailable, resolveSeasonWindow } from "../src/lib/dates.js";
import { AppError, UnitMismatchError } from "../src/lib/errors.js";
import {
  jsonResponse,
  makePowerResponse,
  makeSoilResponse,
  stubFetch,
  textResponse,
} from "./helpers/fixtures.js";

const NOW = new Date("2026-11-14T09:00:00Z");

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    return err as AppError;
  }
  throw new Error(`Expected AppError ${code}, but the call resolved`);
}

describe("NASA POWER adapter", () => {
  it("A01 converts the declared fill_value to null with a counted flag, never 0", async () => {
    const { json } = makePowerResponse({
      start: "2026-06-01",
      days: 5,
      values: { PRECTOTCORR: (i) => (i === 1 ? -999 : 0) },
    });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    const result = await fetchPower(
      { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-05" },
      { fetchImpl, now: NOW },
    );

    const precipSeries = result.dailySeries.find((s) => s.variable === "PRECTOTCORR")!;
    expect(precipSeries.points[1]!.value).toBeNull();
    expect(precipSeries.points[1]!.value).not.toBe(0);
    expect(precipSeries.qualityFlags).toContain("fill_value_removed:1");

    const precipAgg = result.aggregates.find((a) => a.variable === "PRECTOTCORR")!;
    expect(precipAgg.nValid).toBe(4);
    expect(precipAgg.nExpected).toBe(5);
    // 0 + 0 + 0 + 0 summed over the four valid days only.
    expect(precipAgg.value).toBe(0);
    expect(precipAgg.qualityFlags).toContain("fill_value_removed:1");
  });

  it("A02 rejects an unexpected unit instead of converting it", async () => {
    const { json } = makePowerResponse({ start: "2026-06-01", days: 3, units: { T2M: "K" } });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    const err = await expectAppError(
      fetchPower(
        { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
        { fetchImpl, now: NOW },
      ),
      "UNIT_MISMATCH",
    );
    expect(err).toBeInstanceOf(UnitMismatchError);
    expect(err.details["variable"]).toBe("T2M");
    expect(err.details["expectedUnit"]).toBe("C");
    expect(err.details["receivedUnit"]).toBe("K");
  });

  it("A03 stores the grid point POWER actually resolved", async () => {
    const { json } = makePowerResponse({ start: "2026-06-01", days: 3, lat: 31.419, lon: 73.079 });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    const result = await fetchPower(
      { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
      { fetchImpl, now: NOW },
    );
    expect(result.gridPoint).toEqual({ lat: 31.419, lon: 73.079 });
    expect(result.elevationM).toBe(182.92);
  });

  it("A03 rejects a grid point beyond the documented tolerance", async () => {
    const { json } = makePowerResponse({ start: "2026-06-01", days: 3, lat: 40, lon: 60 });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    await expectAppError(
      fetchPower(
        { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
        { fetchImpl, now: NOW },
      ),
      "OUT_OF_COVERAGE",
    );
  });

  it("A04 rejects a response without the parameter metadata block (units unverifiable)", async () => {
    const { json } = makePowerResponse({ start: "2026-06-01", days: 3, omitParametersBlock: true });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    await expectAppError(
      fetchPower(
        { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
        { fetchImpl, now: NOW },
      ),
      "SOURCE_INVALID_RESPONSE",
    );
  });

  it("A05 refuses a pre-1980 window before making any request", async () => {
    const handler = vi.fn(async () => jsonResponse({}));
    const { fetchImpl, calls } = stubFetch(handler);

    await expectAppError(
      fetchPower(
        { lat: 31.4187, lon: 73.0791, start: "1975-01-01", end: "1975-01-10" },
        { fetchImpl, now: NOW },
      ),
      "OUT_OF_COVERAGE",
    );
    expect(calls).toHaveLength(0);
    expect(handler).not.toHaveBeenCalled();
  });

  it("A06 clamps a window that ends in the future and reports dropped days", () => {
    const window = resolveSeasonWindow("kharif", 2026); // 2026-04-01 .. 2026-11-30
    const clamped = clampToAvailable(window, NOW); // now 2026-11-14 -> latest 2026-11-13
    expect(clamped.end).toBe("2026-11-13");
    expect(clamped.start).toBe("2026-04-01");
    expect(clamped.droppedFutureDays).toBe(17);
  });

  it("keeps dates exactly as the source labels them", async () => {
    const { json } = makePowerResponse({ start: "2026-06-01", days: 3 });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    const result = await fetchPower(
      { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
      { fetchImpl, now: NOW },
    );
    const t2m = result.dailySeries.find((s) => s.variable === "T2M")!;
    expect(t2m.points.map((p) => p.date)).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });

  it("preserves provenance on every aggregate", async () => {
    const { json } = makePowerResponse({ start: "2026-06-01", days: 3 });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    const result = await fetchPower(
      { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
      { fetchImpl, now: NOW },
    );
    for (const agg of result.aggregates) {
      expect(agg.sourceId).toBe("nasa_power");
      expect(agg.dataClass).toBe("reanalysis");
      expect(agg.unit.length).toBeGreaterThan(0);
      expect(agg.spatialResolution).toContain("MERRA-2");
      expect(agg.retrievedAt).toBe(NOW.toISOString());
    }
    expect(result.header.sources).toEqual(["MERRA2"]);
    expect(result.header.fillValue).toBe(-999);
  });

  it("A13 retries once on 429 with Retry-After, then succeeds", async () => {
    const { json } = makePowerResponse({ start: "2026-06-01", days: 3 });
    let calls = 0;
    const { fetchImpl, calls: urls } = stubFetch(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("slow down", {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "0" },
        });
      }
      return jsonResponse(json);
    });

    const result = await fetchPower(
      { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
      { fetchImpl, now: NOW },
    );
    expect(result.aggregates.length).toBeGreaterThan(0);
    expect(urls).toHaveLength(2);
  });

  it("A13 surfaces RATE_LIMITED when the retry is also throttled", async () => {
    const { fetchImpl } = stubFetch(
      async () =>
        new Response("slow down", {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "0" },
        }),
    );
    await expectAppError(
      fetchPower(
        { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
        { fetchImpl, now: NOW },
      ),
      "RATE_LIMITED",
    );
  });

  it("A14 maps a timeout to SOURCE_UNAVAILABLE with a retryable flag", async () => {
    const { fetchImpl } = stubFetch(async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "AbortError";
      throw err;
    });
    const err = await expectAppError(
      fetchPower(
        { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
        { fetchImpl, now: NOW, timeoutMs: 10 },
      ),
      "SOURCE_UNAVAILABLE",
    );
    expect(err.retryable).toBe(true);
    expect(err.details["reason"]).toBe("timeout");
  });

  it("A15 treats an HTML error page as an invalid response without echoing it", async () => {
    const { fetchImpl } = stubFetch(async () =>
      textResponse("<html><body>SECRET_UPSTREAM_TOKEN</body></html>", 200),
    );
    const err = await expectAppError(
      fetchPower(
        { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
        { fetchImpl, now: NOW },
      ),
      "SOURCE_INVALID_RESPONSE",
    );
    expect(JSON.stringify(err.details)).not.toContain("SECRET_UPSTREAM_TOKEN");
  });

  it("A16 rejects invalid coordinates before any outbound call", async () => {
    const { fetchImpl, calls } = stubFetch(async () => jsonResponse({}));
    await expectAppError(
      fetchPower(
        { lat: Number.NaN, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
        { fetchImpl, now: NOW },
      ),
      "VALIDATION_ERROR",
    );
    await expectAppError(
      fetchPower(
        { lat: 31.4187, lon: 300, start: "2026-06-01", end: "2026-06-03" },
        { fetchImpl, now: NOW },
      ),
      "VALIDATION_ERROR",
    );
    expect(calls).toHaveLength(0);
  });

  it("marks a variable absent from the response as missing, not as zero", async () => {
    const { json } = makePowerResponse({ start: "2026-06-01", days: 3, omitVariables: ["WS2M"] });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    const result = await fetchPower(
      { lat: 31.4187, lon: 73.0791, start: "2026-06-01", end: "2026-06-03" },
      { fetchImpl, now: NOW },
    );
    expect(result.missingVariables).toContain("WS2M");
    expect(result.aggregates.find((a) => a.variable === "WS2M")).toBeUndefined();
    expect(result.limitations.join(" ")).toContain("excluded from every calculation");
  });
});

describe("SoilGrids adapter", () => {
  it("A07 returns null (no_data) when the provider has no value, never 0", async () => {
    const { json } = makeSoilResponse({ nullProperties: ["clay", "sand", "soc", "phh2o"] });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    const result = await fetchSoil({ lat: 31.4187, lon: 73.0791 }, { fetchImpl, now: NOW });

    expect(result.status).toBe("unavailable");
    expect(result.properties).toHaveLength(12);
    for (const p of result.properties) {
      expect(p.value).toBeNull();
      expect(p.status).toBe("no_data");
      expect(p.value).not.toBe(0);
    }
    expect(result.missing).toContain("all_properties");
  });

  it("A08 rejects an undocumented depth label before any request", async () => {
    const { fetchImpl, calls } = stubFetch(async () => jsonResponse({}));
    await expectAppError(
      fetchSoil({ lat: 31.4187, lon: 73.0791, depths: ["0-30cm"] }, { fetchImpl, now: NOW }),
      "VALIDATION_ERROR",
    );
    expect(calls).toHaveLength(0);
  });

  it("A09 divides by d_factor exactly once (153 g/kg -> 15.3 %)", async () => {
    const { json } = makeSoilResponse({ values: { clay: 153 } });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    const result = await fetchSoil({ lat: 31.4187, lon: 73.0791 }, { fetchImpl, now: NOW });
    const clay = result.properties.find((p) => p.property === "clay" && p.depth === "0-5cm")!;

    expect(clay.rawValue).toBe(153);
    expect(clay.value).toBe(15.3);
    expect(clay.unit).toBe("%");
    expect(clay.predicted).toBe(true);
  });

  it("reports partial availability when only some properties have values", async () => {
    const { json } = makeSoilResponse({ nullProperties: ["soc"] });
    const { fetchImpl } = stubFetch(async () => jsonResponse(json));

    const result = await fetchSoil({ lat: 31.4187, lon: 73.0791 }, { fetchImpl, now: NOW });
    expect(result.status).toBe("partial");
    expect(result.missing).toContain("soc:0-5cm");
    expect(result.limitations.join(" ")).toContain("returned no value");
  });

  it("rejects a response missing properties.layers", async () => {
    const { fetchImpl } = stubFetch(async () => jsonResponse({ type: "Feature", properties: {} }));
    await expectAppError(
      fetchSoil({ lat: 31.4187, lon: 73.0791 }, { fetchImpl, now: NOW }),
      "SOURCE_INVALID_RESPONSE",
    );
  });

  it("maps a network failure to SOURCE_UNAVAILABLE", async () => {
    const { fetchImpl } = stubFetch(async () => {
      throw new Error("ECONNRESET");
    });
    await expectAppError(
      fetchSoil({ lat: 31.4187, lon: 73.0791 }, { fetchImpl, now: NOW }),
      "SOURCE_UNAVAILABLE",
    );
  });
});
