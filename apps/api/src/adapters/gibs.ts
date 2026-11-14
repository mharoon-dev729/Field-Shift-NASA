/**
 * NASA GIBS (Global Imagery Browse Services) tile URL builder.
 *
 * Used for VISUAL CONTEXT ONLY. This module produces no numeric observations,
 * so imagery can never enter the decision engine (decision D-07).
 *
 * Geometry: EPSG:3857 "GoogleMapsCompatible_LevelN" matrices are standard web
 * mercator tiles, so row/column are derived from lat/lon — never hardcoded
 * (test A11). Matrix-set names come from the published capabilities document:
 *   https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml
 * verified 2026-11-14:
 *   SMAP_L3_Passive_Enhanced_Day_Soil_Moisture -> GoogleMapsCompatible_Level6
 *   IMERG_Precipitation_Rate                  -> GoogleMapsCompatible_Level6
 *   MODIS_Terra_NDVI_8Day                     -> GoogleMapsCompatible_Level9
 */

import { AppError } from "../lib/errors.js";

export const GIBS_BASE = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";

export interface GibsLayer {
  id: string;
  label: string;
  tileMatrixSet: string;
  /** Highest zoom the layer publishes. */
  maxLevel: number;
  attribution: string;
  dataClass: "observation";
  note: string;
}

export const GIBS_LAYERS: Record<string, GibsLayer> = {
  smap_soil_moisture: {
    id: "SMAP_L3_Passive_Enhanced_Day_Soil_Moisture",
    label: "SMAP surface soil moisture (daily)",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxLevel: 6,
    attribution: "NASA GIBS / NSIDC DAAC — SMAP SPL3SMP_E",
    dataClass: "observation",
    note: "Visual context only. About 9 km per pixel; not used in any calculation.",
  },
  imerg_precipitation: {
    id: "IMERG_Precipitation_Rate",
    label: "GPM IMERG precipitation rate",
    tileMatrixSet: "GoogleMapsCompatible_Level6",
    maxLevel: 6,
    attribution: "NASA GIBS / GES DISC — GPM IMERG",
    dataClass: "observation",
    note: "Visual context only. About 11 km per pixel; not used in any calculation.",
  },
  modis_ndvi: {
    id: "MODIS_Terra_NDVI_8Day",
    label: "MODIS Terra NDVI (8-day)",
    tileMatrixSet: "GoogleMapsCompatible_Level9",
    maxLevel: 9,
    attribution: "NASA GIBS / LP DAAC — MODIS Terra NDVI",
    dataClass: "observation",
    note: "Visual context only. 250 m mixed pixels are larger than most holdings here; never scored.",
  },
};

/** Web-mercator tile row/column for a coordinate at zoom z. */
export function lonLatToTile(lat: number, lon: number, z: number): { x: number; y: number } {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new AppError("VALIDATION_ERROR", "lat and lon must be finite numbers", {
      details: { field: "coordinates" },
    });
  }
  if (z < 0 || !Number.isInteger(z)) {
    throw new AppError("VALIDATION_ERROR", "zoom must be a non-negative integer", {
      details: { field: "z", received: z },
    });
  }
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

export interface GibsTileRequest {
  layerKey: keyof typeof GIBS_LAYERS;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  lat: number;
  lon: number;
  /** Defaults to the layer's max level (native resolution). */
  z?: number;
}

export interface GibsTile {
  layer: string;
  label: string;
  date: string;
  z: number;
  x: number;
  y: number;
  url: string;
  attribution: string;
  note: string;
}

export function buildGibsTile(req: GibsTileRequest): GibsTile {
  const layer = GIBS_LAYERS[req.layerKey];
  if (!layer) {
    throw new AppError("VALIDATION_ERROR", "Unknown GIBS layer", {
      details: { layerKey: req.layerKey, allowed: Object.keys(GIBS_LAYERS) },
    });
  }
  const z = req.z ?? layer.maxLevel;
  if (z < 0 || z > layer.maxLevel) {
    throw new AppError("VALIDATION_ERROR", "Zoom exceeds the layer's published maximum", {
      details: { layer: layer.id, z, maxLevel: layer.maxLevel },
    });
  }
  const { x, y } = lonLatToTile(req.lat, req.lon, z);
  const url = `${GIBS_BASE}/${layer.id}/default/${req.date}/${layer.tileMatrixSet}/${z}/${y}/${x}.png`;
  return {
    layer: layer.id,
    label: layer.label,
    date: req.date,
    z,
    x,
    y,
    url,
    attribution: layer.attribution,
    note: layer.note,
  };
}

/**
 * A ready-to-use XYZ template for an interactive map (Leaflet etc.).
 * Row/column are still computed per tile by the map library.
 */
export function gibsTemplate(layerKey: keyof typeof GIBS_LAYERS, date: string): string {
  const layer = GIBS_LAYERS[layerKey]!;
  return `${GIBS_BASE}/${layer.id}/default/${date}/${layer.tileMatrixSet}/{z}/{y}/{x}.png`;
}
