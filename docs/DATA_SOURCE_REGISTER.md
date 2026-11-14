# Data Source Register — Field Shift

**Status:** Phase 1 audit complete
**Pilot location audited:** Faisalabad district, Punjab, Pakistan (anchor point 31.4187 N, 73.0791 E)
**Audit date:** 2026-11-14

Every entry below records what the source *actually* provides and whether it is usable at the pilot
location. Entries marked **VERIFIED-LIVE** were queried during this phase and returned real data; the
commands and observed values are in [Appendix A](#appendix-a--live-verification-log). Entries marked
**DOC-ONLY** are documented products that were not exercised against the pilot location.

> **Geographic rule applied throughout.** A source is never treated as usable for Pakistan because it
> appeared in the challenge resource list. US-only and North-America-only products are recorded as
> **NOT USABLE FOR PILOT** and are excluded from the MVP, regardless of how relevant their variables look.

---

## 1. Classification key

| Field | Meaning |
|---|---|
| **Usable at pilot** | `YES` (verified for Punjab), `PARTIAL` (usable with stated caveat), `NO` (coverage excludes Pakistan), `NO-DATA` (coverage includes Pakistan but audit found no usable values at the pilot point) |
| **MVP role** | `EVIDENCE` (numbers feed the decision engine), `CONTEXT` (imagery/visual only, never scored), `REFERENCE` (used to build crop/soil catalogues), `OPTIONAL`, `EXCLUDED` |
| **Auth** | What is required to obtain values (not just to browse) |

---

# A. NASA Earth-observation and modelling resources

## A1. Soil Moisture Active Passive (SMAP) — SPL3SMP_E v006

| Field | Value |
|---|---|
| Official URL | https://nsidc.org/data/spl3smp_e/versions/6 |
| Provider / product | NASA NSIDC DAAC — SMAP Enhanced L3 Radiometer Global Daily 9 km Soil Moisture |
| Measures | Surface (top ~5 cm) soil moisture, plus freeze/thaw state |
| Variables | `soil_moisture` (cm³/cm³), `soil_moisture_error`, `freeze_thaw_fraction`, `retrieval_qual_flag` |
| Units | cm³/cm³ volumetric; quality flags are bit fields |
| Spatial resolution | 9 km (enhanced grid, EASE-Grid 2.0) |
| Temporal resolution | Daily; revisit 2–3 days |
| Coverage | Global land between 85.044° N and S — **includes Punjab** |
| History | April 2015 → present |
| Access | CMR search without login; **granule download requires Earthdata Login** (HDF5, per-orbit files) |
| Usable at pilot | `PARTIAL` — granules confirmed present over Punjab; numeric extraction blocked on Earthdata credentials + HDF5 decoding |
| MVP role | `CONTEXT` (GIBS image tiles) + `OPTIONAL` (numeric series after Earthdata setup) |
| Limitations | 9 km pixel ≫ field; retrieval degrades over dense vegetation, irrigation, and high soil moisture; urban/water cells are masked. Never represents a single farm. |
| Contribution | Independent satellite check on surface wetness for the *growing-season window*, contrasting with POWER's modelled root-zone wetness. |

**Evidence from audit:** CMR returned granule `SMAP_L3_SM_P_E_20250601_R19240_001.h5` for a
Punjab bounding box on 2025-06-01, and the GIBS layer
`SMAP_L3_Passive_Enhanced_Day_Soil_Moisture` exists in the WMTS capabilities with a working 2 km
tile (`HTTP 200`, PNG).

## A2. Global Precipitation Measurement (GPM) / IMERG — GPM_3IMERGDF v07

| Field | Value |
|---|---|
| Official URL | https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDF_07/summary |
| Provider / product | NASA GES DISC — IMERG Final Run Daily, 0.1° |
| Measures | Merged satellite-gauge precipitation |
| Variables | `precipitation`, `precipitation_cnt`, `randomError`, `probabilityLiquidPrecipitation` (daily product) |
| Units | mm/day |
| Spatial resolution | 0.1° (~11 km at pilot latitude) |
| Temporal resolution | Daily (also half-hourly and monthly siblings) |
| Coverage | Global 60° N–60° S — **includes Punjab** |
| History | June 2000 → present (Final run lags real time by months; Late Run `GPM_3IMERGDL` for recent days) |
| Access | CMR search without login; download requires Earthdata Login (NetCDF4) |
| Usable at pilot | `PARTIAL` — granule `3B-DAY.MS.MRG.3IMERG.20250601-S000000-E235959.V07B.nc4` confirmed over Punjab; numeric extraction blocked on credentials |
| MVP role | `CONTEXT` (GIBS rainfall imagery) + `OPTIONAL` numeric series |
| Limitations | Final run is not real-time; convective monsoon rainfall is spatially variable at sub-0.1° scale; gauge undercatch in mountainous terrain (not the pilot's issue). |
| Contribution | Second, independent rainfall record for cross-checking POWER/MERRA-2 rainfall. Not used as a forecast. |

## A3. Landsat / Harmonized Landsat-Sentinel (HLS) — HLSL30 v2.0 & HLSS30

| Field | Value |
|---|---|
| Official URL | https://www.earthdata.nasa.gov/data/catalog/lpcloud-hlsl30-2.0 |
| Provider / product | NASA LP DAAC — HLS Landsat 30 m and Sentinel-2 30 m surface reflectance |
| Measures | Surface reflectance in visible/NIR/SWIR; basis for NDVI/EVI, crop vigour, bare-soil periods |
| Variables | Band reflectance (COG), `Fmask` cloud mask, derived NDVI/EVI |
| Units | Reflectance (0–1, scaled integers) |
| Spatial resolution | 30 m |
| Temporal resolution | 2–3 days combined (Landsat 8/9 + Sentinel-2 A/B) |
| Coverage | Global — **includes Punjab** |
| History | Landsat 8 era from 2013; Sentinel-2 from 2015/2017 |
| Access | Earthdata Login for download (Cloud-Optimized GeoTIFF per band) |
| Usable at pilot | `DOC-ONLY` — requires credentials, cloud masking and per-field compositing; not feasible inside Phase 1–2 scope |
| MVP role | `OPTIONAL` (post-MVP) |
| Limitations | 30 m still exceeds field scale; Punjab kharif is heavily cloud-contaminated during monsoon; per-field compositing is a substantial pipeline. |
| Contribution | The correct long-term path to actual crop-vigour evidence. Explicitly deferred, not faked. |

## A4. MODIS / VIIRS vegetation indices

| Field | Value |
|---|---|
| Official URL | https://ladsweb.modaps.eosdis.nasa.gov/ · GIBS layer `MODIS_Terra_NDVI_8Day` |
| Provider / product | NASA LP DAAC / GIBS — MODIS Terra NDVI 8-day; VIIRS equivalents |
| Measures | Normalized Difference Vegetation Index, EVI |
| Variables | NDVI, EVI (16-bit scaled) |
| Units | Dimensionless index (−1…1 after scaling) |
| Spatial resolution | 250 m (MODIS), 500 m (VIIRS) |
| Temporal resolution | 8-day and 16-day composites |
| Coverage | Global — **includes Punjab** |
| History | MODIS 2000 → present; VIIRS 2012 → present |
| Access | GIBS tiles are **open, no login**; numeric HDF/NetCDF via LAADS DAAC (Earthdata Login) |
| Usable at pilot | `PARTIAL` — imagery tiles verified available; numeric extraction not yet exercised |
| MVP role | `CONTEXT` — 250 m is larger than a typical Punjab holding (~2–5 ha), so NDVI is shown as *area context*, never as a farm measurement |
| Limitations | Mixed pixels; irrigation and cloud artifacts; NDVI saturates in dense crop canopies. **Cannot be attributed to one farmer's field.** |
| Contribution | Seasonal vegetation context around the farm and a visual sanity check on whether the area is cropped. |

**Note:** I verified the GIBS layer exists and that 2 km SMAP/IMERG tiles return PNGs. The specific
`MODIS_Terra_NDVI_8Day/250m/...` tile path I tried returned `HTTP 400`, i.e. my row/column arithmetic
was wrong, not that the layer is missing. Tile geometry must be derived from the capabilities document
in Phase 2 before relying on NDVI imagery.

## A5. NASA POWER — Agroclimatology API ⭐ **primary evidence source**

| Field | Value |
|---|---|
| Official URL | https://power.larc.nasa.gov/docs/services/api/ |
| Provider / product | NASA LaRC POWER — Daily point, Climatology point, Regional (0.5° × 0.625°) |
| Measures | Meteorology and solar energy: temperature, precipitation, humidity, radiation, wind, soil wetness |
| Variables used | `T2M` (2 m air temp °C), `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR` (mm/day), `RH2M` (%), `ALLSKY_SFC_SW_DWN` (MJ/m²/day), `WS2M` (m/s), `GWETROOT` (root-zone soil wetness, 0–1), `GWETPROF` (profile soil wetness) |
| Units | As per API `parameters` metadata block — returned with every response and stored with each observation |
| Spatial resolution | Point: native MERRA-2 ~0.5° × 0.625° (~55 × 69 km). Elevation returned as a third coordinate. |
| Temporal resolution | Daily; also hourly, monthly, annual, climatology |
| Coverage | Global — **includes Punjab** |
| History | Daily MERRA-2 record from 1980 (1984+ in practice for many parameters); Climatology API currently reports **January 2001 – December 2025 (25-year)** |
| Access | **No key, no login, CORS-enabled** — callable directly from the browser or server |
| Usable at pilot | `VERIFIED-LIVE` |
| MVP role | `EVIDENCE` — rainfall, temperature, radiation, humidity, wind and modelled soil wetness for the farm's growing-season windows, plus 2001–2025 normals |
| Limitations | **This is reanalysis/model output (MERRA-2), not a farm measurement and not a weather forecast.** ~0.5° cells blend a whole irrigated tract. POWER precipitation is corrected but can still differ from gauge records. Solar radiation is modelled. |
| Contribution | The backbone of the evidence layer: season rainfall totals, heat exposure (days above a documented threshold), dry-spell length, radiation, and modelled root-zone wetness trend. |

**Adapter status (Phase 2, implemented):** `apps/api/src/adapters/power.ts`.

| Aspect | Implementation |
|---|---|
| Endpoint | `GET /api/temporal/daily/point`, `community=AG`, `format=JSON` |
| Variables requested | `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `ALLSKY_SFC_SW_DWN`, `WS2M`, `GWETROOT` |
| Units asserted | `C`, `C`, `C`, `mm/day`, `%`, `MJ/m^2/day`, `m/s`, `1` — mismatch raises `UNIT_MISMATCH`, variable is unusable |
| Missing values | `header.fill_value` (−999) → `null` + `qualityFlags: ["fill_value_removed:N"]`; never 0 |
| Grid point | The resolved `geometry.coordinates` are stored; >0.625° lon or >0.5° lat offset → `OUT_OF_COVERAGE` |
| Coverage | `daysValid` / `daysRequested` reported per variable; shortfalls listed as limitations |
| Transport | 20 s timeout, one jittered retry, 429 honours `Retry-After`, non-JSON body → `SOURCE_INVALID_RESPONSE` |
| Data class | `reanalysis`; `header.sources` (`["MERRA2"]`) preserved verbatim |

**Values observed at the pilot point (31.4187 N, 73.0791 E; POWER elevation 182.92 m):**

- Daily 2025-06-01…06-05: `T2M` 33.51, 34.26, 34.56, 34.08, 34.74 °C; `PRECTOTCORR` 1.08, 0.0, 0.59, 0.56, 0.0 mm/day; `GWETROOT` 0.34 throughout; `ALLSKY_SFC_SW_DWN` 26.76→23.23 MJ/m²/day; `RH2M` 27.7–34.4 %.
- Climatology: `T2M` JAN 12.62 °C, MAY 34.78 °C, JUN 37.39 °C, ANN 26.29 °C; `PRECTOTCORR` JUL 3.72 mm/day, AUG 2.31, ANN 1.17 mm/day.
- Daily 1990-01-01…03 returned data (`T2M` 13.72, 14.28, 13.06 °C), confirming multi-decade daily history for trend work.

## A6. Shuttle Radar Topography Mission (SRTM)

| Field | Value |
|---|---|
| Official URL | https://www.earthdata.nasa.gov/data/catalog/lpcloud-srtmgl1-003 |
| Provider / product | NASA LP DAAC — SRTMGL1 v003 (1 arc-second) |
| Measures | Digital elevation; basis for slope, runoff, erosion risk |
| Variables | Elevation (m), derived slope (%) |
| Units | metres |
| Spatial resolution | ~30 m |
| Temporal resolution | Single epoch (Feb 2000) |
| Coverage | Global 60° N–56° S — **includes Punjab** |
| Access | Earthdata Login for GeoTIFF tiles |
| Usable at pilot | `PARTIAL` — POWER already returns the point elevation (182.92 m) but not slope |
| MVP role | `OPTIONAL` — slope/erosion is a defensible secondary indicator, not required for the first vertical slice |
| Limitations | Flat alluvial Punjab means slope is near-zero and of limited discriminating value; vegetation/built-up bias in the 2000 surface. |
| Contribution | Terrain context and slope-based erosion caution, if added. |

## A7. ECOSTRESS (ECO_L3T_JET / ECO_L4T_ESI)

| Field | Value |
|---|---|
| Official URL | https://cmr.earthdata.nasa.gov/search/concepts/C4057232489-LPCLOUD.html |
| Provider / product | NASA LP DAAC — ECOSTRESS evapotranspiration and Evaporative Stress Index |
| Measures | Land-surface temperature, evapotranspiration, evaporative stress |
| Variables | `ETinst` (mm/h), `LST` (K), ESI (unitless) |
| Units | mm/h; K; unitless |
| Spatial resolution | ~70 m |
| Temporal resolution | **Irregular ISS overpasses** — days to weeks between looks, not daily |
| Coverage | Global land, ISS orbital band ≤ ±52° latitude — **includes Punjab** |
| History | 2018 → present |
| Access | Earthdata Login |
| Usable at pilot | `DOC-ONLY` — irregular revisit makes seasonal aggregation unreliable without careful gap handling |
| MVP role | `OPTIONAL` / deferred |
| Limitations | Sparse temporal sampling in any single season; swath gaps; 70 m is attractive but the record is not a time series you can average naively. |
| Contribution | Potential heat-stress spot checks later. Cannot honestly support a season-long comparison in the MVP. |

## A8. NLDAS / GLDAS

| Field | Value |
|---|---|
| Official URL | NLDAS: https://ldas.gsfc.nasa.gov/nldas · GLDAS: https://ldas.gsfc.nasa.gov/gldas |
| Provider / product | NASA GSFC — NLDAS-2 (North America), GLDAS-2 (global) |
| Measures | Modelled land-surface states/fluxes: soil moisture, evapotranspiration, temperature, radiation |
| Variables | Soil moisture layers, `Evap`, `Qs`, `SWE` |
| Units | kg/m², W/m², K |
| Spatial resolution | NLDAS 0.125°; GLDAS 0.25° / 1° |
| Temporal resolution | Hourly / 3-hourly |
| Coverage | **NLDAS: North America only → NOT USABLE FOR PILOT.** GLDAS: global 60° N–60° S → usable |
| History | NLDAS-2 1979→; GLDAS-2 1948/2000→ depending on stream |
| Access | Earthdata Login (GES DISC) |
| Usable at pilot | NLDAS `NO`; GLDAS `PARTIAL` (also available indirectly through POWER, which publishes derived land-surface variables) |
| MVP role | `OPTIONAL` — POWER already exposes modelled soil wetness to the browser without credentials |
| Limitations | Both are model products, not observations; NLDAS's usefulness in the challenge list does not transfer to Pakistan. |
| Contribution | GLDAS as a fallback modelled-moisture source if POWER's wetness variables are insufficient. |

## A9. Global Ecosystem Dynamics Investigation (GEDI)

| Field | Value |
|---|---|
| Official URL | https://gedi.umd.edu/data/ |
| Provider / product | NASA GEDI L2/L4 (LP DAAC / ORNL DAAC) |
| Measures | Lidar canopy height, leaf-area index, aboveground biomass density |
| Variables | `rh98`, `LAI`, `agbd` |
| Units | m, m²/m², Mg/ha |
| Spatial resolution | 25 m footprints along ~4.2 km tracks; sparse sampling |
| Temporal resolution | Mission epochs (2019–2023, resumed 2024) |
| Coverage | 51.6° N–51.6° S — includes Punjab, **but** designed for woody vegetation |
| Access | Earthdata Login (ORNL DAAC) |
| Usable at pilot | `NO-DATA` for the decision problem — Punjab's rotation crops are low canopies that GEDI does not measure meaningfully; returns over cropland are sparse and frequently filtered out |
| MVP role | `EXCLUDED` |
| Limitations | Cropland canopy structure is outside the product's design envelope. Using it here would be a category error. |
| Contribution | None for crop rotation. Documented so the exclusion is a decision, not an oversight. |

---

# B. Agricultural and environmental (non-NASA) resources

## B1. USDA Ag Data Commons

| Field | Value |
|---|---|
| URL | https://agdatacommons.nal.usda.gov/ |
| Provider | USDA National Agricultural Library |
| Measures | Repository of US agricultural research datasets (soils, crops, climate, management, phenology) |
| Variables | Dataset-specific |
| Units | Dataset-specific |
| Spatial / temporal | Dataset-specific, mostly US |
| Coverage | Predominantly **United States** |
| Access | Open web download; some datasets gated |
| Usable at pilot | `NO` — coverage is US-centric |
| MVP role | `REFERENCE` only (methodological precedent: how documented agronomic datasets are structured) |
| Limitations | Not a Pakistan data source. |
| Contribution | Format/structure reference for our own crop catalogue. |

## B2. USDA Web Soil Survey (WSS)

| Field | Value |
|---|---|
| URL | https://websoilsurvey.nrcs.usda.gov/ |
| Provider | USDA NRCS |
| Measures | US soil maps and interpretations (texture, drainage, erosion, hydrologic group) |
| Variables | Soil series attributes, hydrologic soil group |
| Spatial | Detail to ~1:12,000 in the US |
| Coverage | **United States only** |
| Access | Web application / AOI report export |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | Zero coverage of Pakistan. |
| Contribution | None directly; motivates using a global soil product instead (B12/SoilGrids). |

## B3. USDA Cropland Data Layer / CropScape

| Field | Value |
|---|---|
| URL | https://nassgeodata.gmu.edu/CropScape/ |
| Provider | USDA NASS |
| Measures | Annual 30 m US crop-type classification |
| Variables | Crop class codes (corn, soy, cotton, wheat…) |
| Spatial / temporal | 30 m, annual, 1997→ |
| Coverage | **Conterminous United States** |
| Access | Web map / raster download |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | No Pakistan coverage. Punjab crop identification would require our own classifier — far outside hackathon scope. |
| Contribution | None. Our crop context comes from farmer input + provincial statistics. |

## B4. PRISM Climate Data

| Field | Value |
|---|---|
| URL | https://prism.oregonstate.edu/ |
| Provider | Oregon State University (USDA-supported) |
| Measures | High-quality US gridded climate; 30-year normals |
| Variables | Precipitation, temperature, dewpoint, frost/freeze dates |
| Spatial | 800 m (4 km for long records) |
| Coverage | **United States only** |
| Access | Bulk download / web services |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | No Pakistan coverage. POWER + ERA5 fill this role globally. |
| Contribution | None. |

## B5. USDA NRCS SSURGO / STATSGO2

| Field | Value |
|---|---|
| URL | https://www.nrcs.usda.gov/resources/data-and-reports/soil-survey-geographic-database-ssurgo |
| Provider | USDA NRCS |
| Measures | US field-scale (SSURGO) and regional (STATSGO2) soil attributes |
| Variables | Texture, organic matter, drainage class, hydrologic group, water-holding capacity, restrictive layers |
| Spatial | SSURGO ~1:12,000–1:24,000; STATSGO2 1:250,000 |
| Coverage | **United States only** |
| Access | Bulk download / API |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | No Pakistan coverage. |
| Contribution | Defines the attribute set we *wish* we had — our soil layer is deliberately thinner. |

## B6. National Agriculture Imagery Program (NAIP)

| Field | Value |
|---|---|
| URL | https://www.fsa.usda.gov/programs-and-services/aerial-photography/imagery-programs/naip-imagery/ |
| Provider | USDA Farm Service Agency |
| Measures | 1 m aerial imagery during the US growing season |
| Spatial / temporal | 1 m; ~2–3 year cycles |
| Coverage | **Conterminous United States** |
| Access | Download / web services |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | No Pakistan coverage; also too fine to be a public-data MVP dependency. |
| Contribution | None. |

## B7. USGS National Land Cover Database (NLCD)

| Field | Value |
|---|---|
| URL | https://www.mrlc.gov/ |
| Provider | USGS / MRLC |
| Measures | 30 m US land cover, multi-decade |
| Variables | Land-cover class, imperviousness, tree canopy |
| Coverage | **United States only** |
| Access | Raster download |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | No Pakistan coverage. |
| Contribution | None; ESA WorldCover would be the global substitute if land-cover context is ever needed. |

## B8. FAO Global Agro-Ecological Zones (GAEZ)

| Field | Value |
|---|---|
| URL | https://gaez.fao.org/ |
| Provider | FAO / IIASA |
| Measures | Global agro-climatic suitability and yield potential for ~dozens of crops, with soil constraints |
| Variables | Suitability class, attainable yield, growing-period length, water-limited vs rain-fed |
| Units | Suitability classes; kg/ha for yield potential |
| Spatial | 5 arc-min (~10 km) and 30 arc-sec (~1 km) grids |
| Temporal | Climate normals and future scenarios |
| Coverage | **Global — includes Punjab** |
| Access | Web application + bulk raster download; no simple public JSON API |
| Usable at pilot | `PARTIAL` — authoritative for crop suitability context, but raster-heavy and not point-queryable in a hackathon API |
| MVP role | `REFERENCE` — used to justify which rotations are agronomically plausible in the pilot, **not** as a live engine input |
| Limitations | Suitability is modelled at coarse resolution; not a farm prescription; heavy download footprint. |
| Contribution | Citable basis for including/excluding rotation candidates (e.g. why maize, mungbean, wheat, cotton, rice are plausible in central Punjab). |

## B9. CoCoRaHS

| Field | Value |
|---|---|
| URL | https://www.cocorahs.org/ |
| Provider | Community Collaborative Rain, Hail and Snow Network |
| Measures | Volunteer daily precipitation |
| Coverage | **North America only** (US, Canada, Bahamas) |
| Access | Web data entry / download |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | No Pakistan observations. |
| Contribution | None. (The concept — farmer-contributed validation — is noted as a future direction, not a data source.) |

## B10. USGS National Water Information System (NWIS)

| Field | Value |
|---|---|
| URL | https://waterdata.usgs.gov/nwis |
| Provider | USGS |
| Measures | Streamflow, groundwater levels, water quality, river stage |
| Coverage | **United States** (plus some territories) |
| Access | REST/water services API |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | No Pakistan gauges. |
| Contribution | None. Canal/irrigation context for Punjab comes from provincial irrigation documentation instead. |

## B11. USDA AMS Market News / USDA NASS QuickStats

| Field | Value |
|---|---|
| URLs | https://www.ams.usda.gov/market-news · https://quickstats.nass.usda.gov/api |
| Providers | USDA AMS; USDA NASS |
| Measures | US commodity prices and market conditions; US county/state yields, acreage, production |
| Spatial / temporal | US county/state; historical |
| Coverage | **United States only** |
| Access | QuickStats API key (free) |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | US prices and statistics cannot stand in for Pakistani markets. Substituting them would be fabrication. |
| Contribution | None. **Financial comparison is explicitly out of MVP scope** (see PRD non-goals) rather than computed from foreign data. |

## B12. ISRIC SoilGrids 2.0 ⭐ **soil evidence source**

| Field | Value |
|---|---|
| Official URL | https://soilgrids.org/ · REST: https://rest.isric.org/soilgrids/v2.0/properties/query |
| Provider / product | ISRIC — World Soil Information, SoilGrids 2.0 (global digital soil mapping) |
| Measures | Predicted soil properties at standard depths |
| Variables used | `clay` (g/kg), `sand` (g/kg), `silt`, `soc` (dg/kg), `phh2o` (pH × 10), `bdod`, `cec`, `nitrogen` |
| Units | Returned with `unit_measure.d_factor`; e.g. clay `mapped_units: g/kg`, `d_factor: 10` |
| Spatial resolution | 250 m |
| Temporal | Static prediction (ensemble of machine-learning models) |
| Coverage | **Global — includes Punjab** |
| Access | **Open REST JSON, no key** |
| Usable at pilot | `VERIFIED-LIVE` at rural points; **nulls observed at some points** |
| MVP role | `REFERENCE` for optional user-visible soil context, and as a *source of "unknown"* — never a fabricated default |
| Limitations | **Predicted, not sampled.** 250 m; uncertainty is large in data-sparse regions. Calcareous, alkaline Punjab soils are reflected in high pH values (see below). Null responses must be surfaced as "soil data unavailable here", not zero. |
| Contribution | If a farmer does not know their soil texture/pH, we can show a clearly-labelled regional *prediction* with its uncertainty, or honestly say it is unavailable. |

**Values observed near the pilot (0–5 and 5–15 cm depths, `mean`):**

| Point | clay (g/kg) | sand (g/kg) | soc (dg/kg) | phh2o (×10) |
|---|---|---|---|---|
| 73.15 E, 31.35 N | 153 / 162 | 349 / 340 | 90 / 74 | 80 / 80 |
| 73.25 E, 31.42 N | 202 / 214 | 371 / 359 | 89 / 83 | 80 / 80 |
| 72.95 E, 31.30 N | 206 / 198 | 333 / 332 | 116 / 76 | 80 / 80 |
| 73.0791 E, 31.4187 N (city) | `null` | `null` | `null` | `null` |

Interpretation: a sandy-clay-loam surface with pH ≈ 8.0 and low organic carbon — consistent with
irrigated Indus-basin soils. The city-centre nulls are a real missing-data case our pipeline must handle.

**Adapter status (Phase 2, implemented):** `apps/api/src/adapters/soilgrids.ts`.

| Aspect | Implementation |
|---|---|
| Endpoint | `GET https://rest.isric.org/soilgrids/v2.0/properties/query` |
| Properties | `clay`, `sand`, `soc`, `phh2o` (documented set also allows `silt`, `nitrogen`, `cec`, `bdod`) |
| Depths | `0-5cm`, `5-15cm`, `15-30cm`; any other label is rejected before the request (`0-30cm` is invalid) |
| Unit handling | `mean` ÷ `d_factor` exactly once → `target_units` (153 g/kg ÷ 10 = 15.3 %); raw value and raw unit retained |
| Null handling | `values.mean === null` → `value: null`, `status: "no_data"`; all-null ⇒ `status: "unavailable"` |
| Timeout | **12 s, no retry** — measured latency 1.5 s to >60 s (2026-11-14), so it must never gate POWER |
| Data class | `observation` with `predicted: true` on every value |

### Measured SoilGrids behaviour on 2026-11-14

| Time (UTC) | Request | Result |
|---|---|---|
| ~08:41 | pilot point, 4 properties × 3 depths | 200, **~32 s** |
| ~08:44 | rural point 73.15/31.35 | 200, **58.1 s** |
| ~08:45 | rural point, repeat | **timed out at 60 s** |
| ~08:46 | rural point, repeat | **timed out at 60 s** |
| ~08:41 | city point 73.0791/31.4187 | 200, all values `null` (documented missing-data case) |

The provider is intermittently very slow. The adapter therefore fails fast (12 s, no retry) and the API
reports `soil.status = "failed"` with an explicit limitation instead of delaying valid POWER evidence.

## B13. OpenET

| Field | Value |
|---|---|
| URL | https://openetdata.org/ |
| Provider | OpenET consortium (NASA/USDA/partners) |
| Measures | Field-scale evapotranspiration from satellite models |
| Variables | ET (mm/day, monthly, annual) |
| Spatial | 30 m / field-scale |
| Coverage | **Western United States only** |
| Access | API (key), web explorer |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | No Pakistan coverage. Its "field-scale ET" promise cannot be extended to Punjab. |
| Contribution | None. ET for the pilot is approached through modelled POWER radiation/temperature, with the limitation stated. |

## B14. USFS LANDFIRE

| Field | Value |
|---|---|
| URL | https://landfire.gov/ |
| Provider | US Forest Service / USGS |
| Measures | US vegetation type, condition, fuel models |
| Coverage | **United States** |
| Access | Bulk raster download |
| Usable at pilot | `NO` |
| MVP role | `EXCLUDED` |
| Limitations | No Pakistan coverage; wildfire-fuel focus is not a crop-rotation input. |

## B15. ESA Copernicus Sentinel-2

| Field | Value |
|---|---|
| URL | https://dataspace.copernicus.eu/ |
| Provider | ESA / Copernicus |
| Measures | 10–20 m multispectral imagery with red-edge bands |
| Variables | B02–B12 reflectance; NDVI/EVI; bare-soil indices |
| Spatial / temporal | 10 m / 20 m; 5-day revisit (two satellites) |
| Coverage | **Global — includes Punjab** |
| History | 2015 → present |
| Access | Copernicus Data Space (free account), STAC API; also via NASA HLS (see A3) |
| Usable at pilot | `DOC-ONLY` (same per-field compositing burden as A3) |
| MVP role | `OPTIONAL` (post-MVP) |
| Limitations | Monsoon cloud cover during kharif; 10 m still spans multiple holdings in Punjab's fragmented fields. |
| Contribution | The most realistic future path to field-scale vegetation evidence for Pakistan. Deferred, not faked. |

## B16. ERA5 (ECMWF reanalysis)

| Field | Value |
|---|---|
| URL | https://cds.climate.copernicus.eu/ |
| Provider | ECMWF / Copernicus Climate Change Service |
| Measures | Global hourly reanalysis: temperature, precipitation, wind, humidity, radiation, soil temperature |
| Variables | `2m_temperature`, `total_precipitation`, `surface_solar_radiation_downwards`, `volumetric_soil_water_layer_*` |
| Units | K, m, J/m², m³/m³ |
| Spatial / temporal | ~0.25° (~31 km); hourly, 1940 → present |
| Coverage | **Global — includes Punjab** |
| Access | CDS API with free account and personal token; heavy queue |
| Usable at pilot | `PARTIAL` — accessible but requires an account, a token and a Python client |
| MVP role | `OPTIONAL` — cross-validation of POWER/MERRA-2 rainfall and temperature |
| Limitations | Coarser than POWER's native grid; reanalysis, not observation; API queue latency is hostile to a live web request. |
| Contribution | Independent reanalysis comparison for a future data-quality report. |

## B17. Local agronomic sources (not in the challenge list, but essential)

These are **not** Earth observation products. They supply the crop calendar and rotation rules that
NASA data cannot: sowing/harvest windows, rotation sequences, and varietal timing for Punjab.

| Source | URL | What it provides | Usable | MVP role |
|---|---|---|---|---|
| Crop Reporting Service (CRS), Agriculture Department, Punjab — *Crops' Life Calendar* | https://agripunjab.gov.pk/system/files/Crops%20Life%20Calendar2.pdf | Sowing/growth/harvest windows per crop | `YES` | `REFERENCE` |
| CRS — *Seasonal Crop Calendar of Punjab* (with Pakistan Meteorological Department, National Agromet Centre) | https://weather.gov.pk/storage/uploads/namc/crop-report/pdfs/Crop%20Calendar-Punjab-Updated.pdf | Consolidated Punjab crop calendar | `YES` | `REFERENCE` |
| CRS — *Harvesting Calendar Rabi/Kharif* (crop-cut schedules) | https://agripunjab.gov.pk/system/files/Calendar%20YES%20Rabi%202020.pdf · https://agripunjab.gov.pk/system/files/Calendar%20YES%20Kharif%202020.pdf | Harvest/crop-cut dates by crop | `YES` | `REFERENCE` |
| CRS — *Final Rabi / Kharif Estimates* | https://agripunjab.gov.pk/system/files/Final%20Rabi%20Estimates%202025-26_0.pdf | District area/production for wheat, cotton, rice | `YES` | `REFERENCE` (pilot justification) |
| Punjab Agriculture Department — Crop Production plans | https://agripunjab.gov.pk/crop-production | Season production plans per crop | `YES` | `REFERENCE` |
| Punjab Agricultural University (PAU) — *Package of Practices for Crops of Punjab*, Rabi & Kharif | https://pau.edu/content/ccil/pf/pp_rabi.pdf · https://pau.edu/content/ccil/pf/pp_kharif.pdf | Sowing windows, agronomy, **documented rotation sequences** | `YES` | `REFERENCE` |
| Ayub Agricultural Research Institute (AARI) — wheat varieties | https://agripunjab.punjab.gov.pk/aari-cvwheat | Sowing windows per variety | `YES` | `REFERENCE` |
| Pakistan Meteorological Department / National Agromet Centre | https://weather.gov.pk/ | Agromet bulletins (not used for forecasts in MVP) | `PARTIAL` | `REFERENCE` |

See [AGRICULTURAL_EVIDENCE.md](AGRICULTURAL_EVIDENCE.md) for how each crop parameter is cited.

---

# C. Summary matrix

| # | Source | Type | Coverage of pilot | Verified | MVP role |
|---|---|---|---|---|---|
| A1 | SMAP SPL3SMP_E | NASA EO | Global | CMR + GIBS ✓ | CONTEXT / OPTIONAL |
| A2 | GPM IMERG | NASA EO | Global 60N–60S | CMR + GIBS ✓ | CONTEXT / OPTIONAL |
| A3 | Landsat / HLS | NASA EO | Global | — | OPTIONAL (deferred) |
| A4 | MODIS/VIIRS NDVI | NASA EO | Global | GIBS layer ✓ | CONTEXT |
| A5 | **NASA POWER** | NASA model | Global | ✓ live | **EVIDENCE (core)** |
| A6 | SRTM | NASA EO | Global | elevation via POWER ✓ | OPTIONAL |
| A7 | ECOSTRESS | NASA EO | Global, irregular | — | OPTIONAL (deferred) |
| A8 | NLDAS / GLDAS | NASA model | NLDAS ✗ / GLDAS ✓ | — | OPTIONAL |
| A9 | GEDI | NASA EO | Croplands unsuitable | — | EXCLUDED |
| B1 | Ag Data Commons | USDA | US | — | REFERENCE |
| B2 | Web Soil Survey | USDA | US ✗ | — | EXCLUDED |
| B3 | CDL / CropScape | USDA | US ✗ | — | EXCLUDED |
| B4 | PRISM | OSU | US ✗ | — | EXCLUDED |
| B5 | SSURGO / STATSGO2 | USDA | US ✗ | — | EXCLUDED |
| B6 | NAIP | USDA | US ✗ | — | EXCLUDED |
| B7 | NLCD | USGS | US ✗ | — | EXCLUDED |
| B8 | FAO GAEZ | FAO/IIASA | Global | — | REFERENCE |
| B9 | CoCoRaHS | Community | N. America ✗ | — | EXCLUDED |
| B10 | USGS NWIS | USGS | US ✗ | — | EXCLUDED |
| B11 | AMS Market News / NASS | USDA | US ✗ | — | EXCLUDED |
| B12 | **ISRIC SoilGrids 2.0** | Soil | Global | ✓ live | **REFERENCE (soil)** |
| B13 | OpenET | Consortium | W. US ✗ | — | EXCLUDED |
| B14 | LANDFIRE | USFS | US ✗ | — | EXCLUDED |
| B15 | Sentinel-2 | ESA | Global | — | OPTIONAL (deferred) |
| B16 | ERA5 | ECMWF | Global | — | OPTIONAL |
| B17 | Punjab CRS / PAU / AARI | Agronomy | Punjab | ✓ (documents) | REFERENCE |

**Counts:** 25 challenge-listed resources audited (9 NASA + 16 partner/other). Of those, **1 is core
evidence (POWER)**, 2 are live imagery context, 1 global soil product is verified, 10 are US/NA-only and
explicitly excluded, 1 (GEDI) is excluded as unsuited to croplands, and the rest are optional/deferred.
Four additional Punjab agronomic sources were added because the challenge requires local soil and crop
information that no NASA product supplies.

---

# Appendix A — Live verification log

All commands run 2026-11-14 from the project root. `jq`-free parsing via `node -e`; outputs abridged.

**1. NASA POWER daily point — Punjab**
```
GET https://power.larc.nasa.gov/api/temporal/daily/point
  ?parameters=T2M,PRECTOTCORR,GWETROOT,ALLSKY_SFC_SW_DWN,RH2M
  &community=AG&latitude=31.4187&longitude=73.0791&start=20250601&end=20250605&format=JSON
→ 200. geometry coordinates [73.079, 31.419, 182.92]
  T2M 20250601=33.51 … 20250605=34.74 (C)
  PRECTOTCORR 20250601=1.08, 20250602=0.0 (mm/day)
  GWETROOT = 0.34 (unitless)
  header.sources = ["MERRA2","SYN1DEG","POWER"]; fill_value = -999.0
```

**2. NASA POWER climatology — Punjab**
```
GET .../api/temporal/climatology/point?parameters=T2M,PRECTOTCORR&community=AG&lat/lon as above
→ 200. header.range = "25-year Meteorological and Solar Monthly & Annual Climatologies
  (January 2001 - December 2025)"; header.sources=["MERRA2"]
  T2M JUN=37.39, ANN=26.29; PRECTOTCORR JUL=3.72, ANN=1.17
```

**3. NASA POWER historical depth**
```
GET .../daily/point?...&start=19900101&end=19900103
→ 200. T2M 13.72, 14.28, 13.06; PRECTOTCORR 0.0, 0.0, 0.02
```

**4. ISRIC SoilGrids 2.0**
```
GET https://rest.isric.org/soilgrids/v2.0/properties/query
  ?lon=73.15&lat=31.35&property=clay&property=sand&property=soc&property=phh2o
  &depth=0-5cm&depth=5-15cm&value=mean
→ 200. clay [153,162] g/kg, sand [349,340], soc [90,74] dg/kg, phh2o [80,80]
  Same query at 73.0791/31.4187 (city centre) → all nulls.
  Invalid depth label "0-30cm" → 200 with "layers":[] (must use 0-5, 5-15, 15-30, …).
```

**5. NASA GIBS WMTS**
```
GET .../wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml → 5.3 MB, 200
  contains SMAP_L3_Passive_Enhanced_Day_Soil_Moisture, IMERG_Precipitation_Rate,
  MODIS_Terra_NDVI_8Day
GET .../SMAP_L3_Passive_Enhanced_Day_Soil_Moisture/default/2025-06-02/2km/3/3/2.png → 200 image/png 6,393 B
GET .../IMERG_Precipitation_Rate/default/2025-06-02/2km/3/3/2.png → 200 image/png 27,524 B
GET .../MODIS_Terra_NDVI_8Day/default/2025-06-02/250m/4/13/10.png → 400 (wrong tile row/col; layer exists)
```

**6. NASA CMR granule search (no login)**
```
GET https://cmr.earthdata.nasa.gov/search/granules.json?short_name=SPL3SMP_E
  &bounding_box=72.5,30.9,73.6,31.9&temporal=2025-06-01T00:00:00Z,2025-06-03T00:00:00Z
→ 200, granule SMAP_L3_SM_P_E_20250601_R19240_001.h5
GET .../granules.json?short_name=GPM_3IMERGDF&bounding_box=…&temporal=2025-06-01…
→ 200, granule 3B-DAY.MS.MRG.3IMERG.20250601-S000000-E235959.V07B.nc4
```

**7. Phase 2 endpoint verification (live, through `GET /api/v1/evidence`)**

```
GET http://localhost:8000/api/v1/evidence?lat=31.4187&lon=73.0791&season=kharif&year=2026
→ 200, 140,769 bytes
  request.windowStart 2026-04-01, windowEnd 2026-11-13 (17 future days removed, reported)
  point.resolvedGridPoint {lat:31.419, lon:73.079}   elevationM 182.92 (fresh fetch)
  sources: nasa_power=ok (8 observations), soilgrids=unavailable/failed
  indicators: seasonRainMm=448.22 mm, rainDays=79, longestDrySpellDays=27,
              drySpellCount10=4, heatDays35=176, heatDays40=101, frostDays5=0,
              meanT2M=32.32 C, meanGwetroot=0.38, minGwetroot=0.32, meanSolar=19.89 MJ/m^2/day
  temporalCoverage: T2M 225/227, T2M_MAX 225/227, T2M_MIN 225/227, PRECTOTCORR 225/227
  cacheStatus: {nasa_power:"hit"} on the repeat call; second call 25 ms / 6 ms vs 12.07 s cold
```

**8. GIBS 3857 tile geometry (resolved during Phase 2)**

```
SMAP_L3_Passive_Enhanced_Day_Soil_Moisture .../GoogleMapsCompatible_Level6/6/26/44.png -> 200 image/png 7,091 B
IMERG_Precipitation_Rate                  .../GoogleMapsCompatible_Level6/6/26/44.png -> 200 image/png 1,537 B
MODIS_Terra_NDVI_8Day                     .../GoogleMapsCompatible_Level9/6/26/44.png -> 200 image/png 45,076 B
```
Tile row/column derived from lat/lon (web-mercator), so the earlier hand-guessed path error cannot recur.
Matrix-set names were read from the published capabilities document, not guessed.

**Not verified in this phase (stated honestly):** any numeric arrays from SMAP/IMERG/HLS/ECOSTRESS/GEDI
(require Earthdata Login), FAO GAEZ rasters, ERA5 API, and NOAA/USDA products (out of coverage).
