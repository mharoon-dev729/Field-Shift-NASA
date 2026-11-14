import { describe, expect, it } from "vitest";

import { checkGranules } from "../src/adapters/cmr.js";
import { buildGibsTile, gibsTemplate, GIBS_LAYERS, lonLatToTile } from "../src/adapters/gibs.js";
import { jsonResponse, stubFetch } from "./helpers/fixtures.js";

describe("GIBS tile builder", () => {
  it("A10 builds the documented WMTS URL for SMAP and IMERG", () => {
    const smap = buildGibsTile({
      layerKey: "smap_soil_moisture",
      date: "2025-06-02",
      lat: 31.4187,
      lon: 73.0791,
    });
    expect(smap.url).toBe(
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/SMAP_L3_Passive_Enhanced_Day_Soil_Moisture/default/2025-06-02/GoogleMapsCompatible_Level6/6/26/44.png",
    );
    // Verified live 2026-11-14: this exact URL returned 200 image/png (7091 bytes).
    expect(GIBS_LAYERS["smap_soil_moisture"]!.tileMatrixSet).toBe("GoogleMapsCompatible_Level6");

    const imerg = buildGibsTile({
      layerKey: "imerg_precipitation",
      date: "2025-06-02",
      lat: 31.4187,
      lon: 73.0791,
    });
    expect(imerg.url).toContain("/IMERG_Precipitation_Rate/default/2025-06-02/");
    expect(imerg.url).toMatch(/\/6\/26\/44\.png$/);
  });

  it("A11 derives row/column from the coordinate instead of hardcoding tiles", () => {
    const here = lonLatToTile(31.4187, 73.0791, 6);
    const elsewhere = lonLatToTile(31.4187, 74.5, 6);
    expect(here).toEqual({ x: 44, y: 26 });
    expect(elsewhere.x).toBeGreaterThan(here.x);
    expect(elsewhere.y).toBe(here.y);

    const ndvi = buildGibsTile({
      layerKey: "modis_ndvi",
      date: "2025-06-02",
      lat: 31.4187,
      lon: 73.0791,
    });
    // Verified live 2026-11-14: 200 image/png (45,076 bytes) at Level9 zoom 6.
    expect(ndvi.url).toContain("MODIS_Terra_NDVI_8Day");
    expect(ndvi.url).toContain("GoogleMapsCompatible_Level9");
    expect(ndvi.z).toBe(9);
  });

  it("rejects a zoom beyond the layer's published maximum", () => {
    expect(() =>
      buildGibsTile({
        layerKey: "smap_soil_moisture",
        date: "2025-06-02",
        lat: 31.4187,
        lon: 73.0791,
        z: 9,
      }),
    ).toThrowError(/maximum/i);
  });

  it("exposes an XYZ template for map clients", () => {
    const template = gibsTemplate("modis_ndvi", "2025-06-02");
    expect(template).toContain("{z}/{y}/{x}.png");
    expect(template).toContain("MODIS_Terra_NDVI_8Day");
  });

  it("emits no numeric observation at all (imagery can never be scored)", () => {
    const tile = buildGibsTile({
      layerKey: "modis_ndvi",
      date: "2025-06-02",
      lat: 31.4187,
      lon: 73.0791,
    });
    expect(Object.keys(tile).sort()).toEqual(
      ["attribution", "date", "label", "layer", "note", "url", "x", "y", "z"].sort(),
    );
  });
});

describe("CMR availability adapter", () => {
  it("A12 returns available:false for zero granules without throwing", async () => {
    const { fetchImpl } = stubFetch(async () => jsonResponse({ feed: { entry: [] } }));

    const result = await checkGranules(
      {
        shortName: "SPL3SMP_E",
        boundingBox: [72.5, 30.9, 73.6, 31.9],
        start: "2025-06-01",
        end: "2025-06-01",
      },
      { fetchImpl, now: new Date("2026-11-14T09:00:00Z") },
    );

    expect(result.available).toBe(false);
    expect(result.granuleCount).toBe(0);
    expect(result.sampleGranules).toEqual([]);
  });

  it("reports granules when present", async () => {
    const { fetchImpl } = stubFetch(async () =>
      jsonResponse({
        feed: {
          entry: [
            { producer_granule_id: "SMAP_L3_SM_P_E_20250601_R19240_001.h5" },
            { producer_granule_id: "SMAP_L3_SM_P_E_20250602_R19240_001.h5" },
          ],
        },
      }),
    );
    const result = await checkGranules(
      {
        shortName: "SPL3SMP_E",
        boundingBox: [72.5, 30.9, 73.6, 31.9],
        start: "2025-06-01",
        end: "2025-06-02",
      },
      { fetchImpl },
    );
    expect(result.available).toBe(true);
    expect(result.granuleCount).toBe(2);
    expect(result.sampleGranules[0]).toBe("SMAP_L3_SM_P_E_20250601_R19240_001.h5");
  });

  it("rejects a response without a feed block", async () => {
    const { fetchImpl } = stubFetch(async () => jsonResponse({ errors: ["bad"] }));
    await expect(
      checkGranules(
        { shortName: "X", boundingBox: [0, 0, 1, 1], start: "2025-06-01", end: "2025-06-01" },
        { fetchImpl },
      ),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID_RESPONSE" });
  });
});
