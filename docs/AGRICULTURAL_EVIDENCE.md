# Agricultural Evidence — Pilot District and Crop Parameters

**Pilot:** Faisalabad district, Punjab, Pakistan
**Anchor coordinates:** 31.4187 N, 73.0791 E (POWER returns elevation 182.92 m)
**Compiled:** 2026-11-14
**Rule:** no crop calendar, water requirement or rotation rule is stated here without a source. Where a
value is not yet extracted from a primary document it is marked **TO-VERIFY** and the engine treats it as
unknown rather than guessing.

---

## 1. Why a Pakistan pilot, and why the data allows it

The challenge requires "local soil information, crop characteristics, and farmer priorities". For a
Pakistan pilot to be honest, three things must hold:

1. The NASA products used must genuinely cover Punjab — **verified**: POWER daily/climatology return
   data at the pilot point; SMAP, IMERG and MODIS NDVI granules/layers exist over Punjab (see
   DATA_SOURCE_REGISTER Appendix A).
2. Credible district-level agronomic documentation must exist — **verified** (Punjab Crop Reporting
   Service, PAU, AARI; see §4).
3. Global soil data must cover the area, or be honestly reported as missing — **verified with caveat**:
   SoilGrids returns values at rural points near Faisalabad and `null` at others.

Equally important: **ten of the challenge's listed resources are US- or North-America-only** and cannot
be used here (Web Soil Survey, CDL/CropScape, PRISM, SSURGO/STATSGO2, NAIP, NLCD, CoCoRaHS, NWIS, USDA
Market News/NASS, OpenET). Any Pakistan entry that leans on those is misrepresenting coverage. That
exclusion is documented per-source in the data register.

---

## 2. Candidate districts compared

All figures are from Crop Reporting Service, Agriculture Department, Punjab, unless stated.

| Criterion | **Faisalabad** | Sheikhupura | Multan | Bahawalnagar |
|---|---|---|---|---|
| Wheat area 2024-25 ('000 acres) | **612** | 561 | 438 | 1,075 (Punjab's largest) |
| Wheat production 2025 ('000 t) | **939** (top-5 district nationally) | — | — | 1,557 (national #1) |
| Cotton area 2025-26 ('000 acres) | **58** (division 151) | negligible | significant (cotton belt 30–40 % of cropped area) | 665 (Punjab's largest) |
| Rice | present but modest | **major** (rice 40–45 % of cropped area) | low | low |
| Maize | **present, both spring & autumn** | present | low | low |
| Sugarcane | **10–16 % of cropped area** | low | low | low |
| Crop diversity (rotations demonstrable) | **Highest** — wheat, cotton, rice, maize, sugarcane together | Medium (rice–wheat dominant) | Medium (cotton–wheat dominant) | Low–medium (cotton–wheat, wheat) |
| Agronomic research base | **UAF + AARI in-district** | Punjab-wide only | Punjab-wide only | Punjab-wide only |
| Irrigation | Canal (Lower Chenab) + tubewell mix | Canal | Canal + tubewell | Canal, water-scarce tail |
| SoilGrids values at rural points | **Present** (clay 153–206 g/kg, pH ≈ 8.0) | Not tested | Not tested | Not tested |
| NASA coverage | Verified (POWER/SMAP/IMERG/MODIS) | Same | Same | Same |

### Recommendation: **Faisalabad district**

Reasons, in order of weight:

1. **Rotation diversity is the product's core.** Faisalabad is one of the few Punjab districts where
   wheat–cotton, wheat–maize, wheat–rice and wheat–sugarcane are all real local practices, so a
   comparison screen has genuinely different options to compare rather than cosmetic variants.
   (Crop Reporting Service district tables; the crop-share analysis in *Grassroots* 2022 places
   sugarcane at 10–16 % of cropped area in Faisalabad, Chiniot and Rahim Yar Khan.)
2. **Documented, citable rotations.** The PAU *Package of Practices for Crops of Punjab* lists
   Rice–Wheat, Rice–Wheat–Summer Moong/Mash, Cotton–Wheat, Maize–Wheat, Maize/Rice–Potato–Wheat and
   others as recommended Punjab sequences — an authoritative local source for "why is this rotation on
   the list".
3. **Statistical weight and evidence depth.** 612,000 acres of wheat (2024-25) and 939,000 t produced
   (2025) make it a materially important wheat district, and district-level series exist for 2022-23
   through 2025-26.
4. **Institutions in-district** (University of Agriculture Faisalabad, Ayub Agricultural Research
   Institute) mean local agronomy is documented, not extrapolated from another province.
5. **Water stress is real but not extreme** — canal rotation plus tubewell dependence makes the "water"
   priority meaningful without making the district a desert-edge case where every rotation fails.
6. **Data availability confirmed at rural sample points**, including soil predictions and NASA series.

**Honest caveats:**
- Rice is *not* the district's dominant kharif crop. Rice-based rotations are included because they are
  documented Punjab rotations and locally present, but the UI must say rice is more characteristic of
  the Sheikhupura/Gujranwala belt. A farmer in Faisalabad comparing "cotton vs rice" is deciding about a
  minority practice.
- Bahawalnagar is the bigger wheat and cotton district, but its rotation set is narrower and its water
  situation is more constrained; it is a better *second* pilot, not the first.
- "District" is an administrative unit, not an agro-ecological one. Messaging must say the environmental
  values describe the *area around* the farm.

---

## 3. The pilot's climate, as observed (not assumed)

From NASA POWER at 31.4187 N, 73.0791 E (MERRA-2 based, ~0.5° cell), retrieved 2026-11-14:

| Month | T2M (°C) | PRECTOTCORR (mm/day) |
|---|---|---|
| JAN | 12.62 | 0.39 |
| FEB | 15.89 | 0.79 |
| MAR | 22.18 | 1.05 |
| APR | 28.65 | 0.85 |
| MAY | 34.78 | 0.56 |
| JUN | **37.39** | 1.76 |
| JUL | 35.87 | **3.72** |
| AUG | 34.34 | 2.31 |
| SEP | 31.68 | 1.68 |
| OCT | 26.87 | 0.22 |
| NOV | 20.06 | 0.39 |
| DEC | 14.66 | 0.29 |
| ANN | 26.29 | 1.17 |

Climatology period returned by the API: **January 2001 – December 2025 (25-year)**.

What this means for crop planning (descriptive, not prescriptive):

- A **monsoon-concentrated rainfall regime**: July (~3.7 mm/day) is roughly 17× October (~0.22 mm/day).
  Kharif crops are timed to the monsoon; rabi crops depend on irrigation and residual moisture.
- **May–June mean temperatures of 35–37 °C** with daily maxima far higher. Any crop phase that sits in
  May–June carries heat exposure — relevant to cotton establishment and to late-sown maize.
- **October–November is dry and cooling**, which is why wheat sowing is timed for November rather than
  October on irrigated land.
- Rainfall *totals* are modest (ANN 1.17 mm/day ≈ 427 mm/year), so irrigation, not rainfall, is the
  binding constraint — which is exactly why "water" must be a first-class farmer priority.

Soil context at a rural point (73.15 E, 31.35 N; ISRIC SoilGrids 2.0, 0–5 cm / 5–15 cm):
clay 153/162 g/kg, sand 349/340 g/kg, SOC 90/74 dg/kg, pH × 10 = 80/80 → **pH ≈ 8.0**, i.e. an alkaline,
light-to-medium textured soil with low organic carbon. This is consistent with published descriptions of
calcareous Indus-basin soils and explains why soil-health priorities matter here (organic matter, not
acidity, is the constraint). *SoilGrids is a prediction, not a sample from the farmer's field.*

---

## 4. Documented crop calendars (Punjab)

These are the windows the engine will align NASA indicators to. Each row states exactly what the cited
document says; where I read only an extract, that is noted.

| Crop | Season | Sowing / planting | Harvest | Source | Evidence quality | Note |
|---|---|---|---|---|---|---|
| **Wheat** | Rabi | 1–20 Nov (irrigated, timely); up to 30 Nov, some varieties to 10 Dec; 15 Oct–15 Nov on barani | Crop-cut 1 Apr – 5 May | AARI wheat variety table (https://agripunjab.punjab.gov.pk/aari-cvwheat) for sowing windows; CRS *Harvesting Calendar Rabi 2020* for cut dates | **High** — two provincial government documents, mutually consistent | Variety-level tables also give 25 Oct–10 Dec ranges for older varieties |
| **Rice** | Kharif | Nursery late May–Jun; transplant Jun–Jul (CRS field-activity calendar: Nursery-I 20 May, Transplant-I 1 Jun, transplant rounds through Jul) | Crop-cut 15 Sep – 25 Nov | CRS *Crops' Life Calendar*; CRS *Harvesting Calendar Kharif 2020*; CRS *Calendar of Annual Field Activities 2022* | **High** for calendar; **document excerpts only** | Rice is water-intensive; district share is modest in Faisalabad |
| **Cotton** | Kharif | Sowing from Apr (CRS GOS-I 1 Apr; GOS rounds through May) | Picking Jul–Oct, final pick to 30 Nov; crop-cut 15 Jul–15 Oct (PMS) / 1 Sep–30 Nov (YES) | CRS *Final Kharif Estimates*; CRS field-activity & harvesting calendars | **High** for calendar | Multi-pick crop; "harvest" spans months, which matters for window alignment |
| **Maize (spring)** | Kharif (spring) | Last week May – end June (PAU: "Time of Sowing: Last week of May to end of June") | — | PAU *Package of Practices, Kharif* | **Medium-high** — university package of practices | Early June sowing advised on waterlogging-prone fields |
| **Maize (autumn)** | Kharif (autumn) | — | Crop-cut 1 Nov – 30 Nov | CRS *Harvesting Calendar Kharif 2020* | **High** | Autumn maize fits between kharif and rabi wheat |
| **Sugarcane** | Annual | — | Crop-cut 1 Jan – 30 Mar | CRS *Harvesting Calendar Kharif 2020* | **High** | Included as context; not an MVP rotation candidate (multi-year) |
| **Mungbean (moong)** | Kharif (summer) | — | Crop-cut 1 Aug – 15 Sep | CRS *Harvesting Calendar Kharif 2020* | **High** | The legume phase in "Wheat–Summer Moong" rotations |
| **Gram / lentil** | Rabi | — | Crop-cut 20 Apr – 10 May (gram) | CRS *Harvesting Calendar Rabi 2020* | **High** | Alternative rabi legume; not in MVP candidate set |

**Caveat that must appear in the UI:** these are *district/province-level recommended windows*, not this
farmer's dates. Real sowing shifts with water availability and variety. The engine uses windows to select
which weeks of NASA data are relevant — it does not claim the farmer sowed on those dates.

---

## 5. Crop parameters for the decision engine

The engine needs, per crop: water-demand class, heat sensitivity, rotation role, and a citation. Values
below are what I could substantiate from the audited sources. Anything not substantiated is
**TO-VERIFY**, and the engine returns `null` for that component until it is filled.

| Parameter | Wheat | Cotton | Rice | Maize | Mungbean | Status |
|---|---|---|---|---|---|---|
| Growing season | Rabi | Kharif | Kharif | Kharif (spring & autumn) | Kharif (summer) | **VERIFIED** (§4) |
| Sowing window | Nov (irrigated) | Apr–May | Jun–Jul transplant | late May–Jun / autumn | — | **VERIFIED** |
| Harvest window | Apr–early May | Jul–Nov (multi-pick) | Sep–Nov | Nov (autumn) | Aug–Sep | **VERIFIED** |
| Water-demand class | — | — | high (water-intensive; widely documented) | — | low (short-duration legume) | **PARTIAL** — classes need PAU irrigation-section extraction |
| Irrigation requirement (mm/season) | TO-VERIFY | TO-VERIFY | TO-VERIFY | TO-VERIFY | TO-VERIFY | **NOT YET SOURCED** |
| Heat sensitivity threshold | TO-VERIFY | TO-VERIFY | TO-VERIFY | TO-VERIFY | TO-VERIFY | **NOT YET SOURCED** |
| Frost sensitivity | TO-VERIFY | n/a (kharif) | n/a | n/a | n/a | **NOT YET SOURCED** |
| Legume / N-fixing | no | no | no | no | **yes** | **VERIFIED** (crop biology; CRS rotation set includes summer moong) |
| Documented rotation role | base of nearly all Punjab rotations | Cotton–Wheat | Rice–Wheat, Rice–Wheat–Summer Moong | Maize–Wheat, Maize/Rice–Potato–Wheat | legume phase in Rice–Wheat–Summer Moong | **VERIFIED** (PAU PoP rotation list) |

### Rotations documented for Punjab (PAU *Package of Practices*, Rabi)

The PAU document lists, among others:

> "Rice-Wheat, Rice-Wheat-Summer Moong/Mash, Cotton-Wheat, Maize-Wheat, Maize/Rice-Potato-Wheat,
> Moong/Arhar/Mash-Wheat, Groundnut-Wheat, Early Fodder-Toria-Wheat, Green Manure-Rice-Wheat,
> Rice-Pea-Wheat, Soybean-Wheat, … Summer moong/Green manure-Direct Seeded Rice (DSR)/Direct Seeded
> Basmati Rice (DSBR)-Wheat."

This single citation justifies the MVP candidate set. The four rotations offered at the pilot:

| # | Rotation | Why included | Evidence |
|---|---|---|---|
| 1 | **Wheat – Cotton** | Farmer's likely baseline; dominant in Faisalabad division (58k acres cotton, district) | CRS Kharif Estimates 2025-26; PAU rotation list |
| 2 | **Wheat – Maize** | Documented Punjab rotation; shorter kharif window than cotton; both spring and autumn maize grown locally | PAU rotation list; CRS harvest calendar |
| 3 | **Wheat – Maize + Summer Mung** | Adds a legume phase (N-fixing) with a documented summer window | PAU rotation list (summer moong); CRS moong cut dates |
| 4 | **Wheat – Rice** | Documented rotation; contrasts a water-intensive kharif with cotton | PAU rotation list; CRS rice calendar. **Flagged**: rice is a minority practice in Faisalabad |

Fallow/uncropped kharif is not offered as a "scenario" but is acknowledged in the explanation where
water scarcity makes it the real-world choice.

---

## 6. What the agricultural evidence cannot support

Stated plainly so the product does not overreach:

1. **No yield or income claims.** No credible, localised yield-response function for these rotations was
   assembled, and inventing one would violate the project's core principle.
2. **No soil-health measurement.** Organic-matter change from a rotation is a multi-year field-trial
   question. Field Shift can point to rotation *properties* (legume phase, residue, diversification) that
   the literature associates with soil-health direction, and must label them as reasoning aids, not
   measurements.
3. **No water-savings figure.** We can compare relative water-demand *classes* and the observed rainfall
   and wetness of the windows, not litres saved.
4. **No variety advice.** Variety choice depends on seed availability, market and local trials.
5. **No weather forecast.** POWER is historical/reanalysis.
6. **No pest/disease modelling.** Out of scope.

---

## 7. Sources

**Government of Punjab / Pakistan**
- Crop Reporting Service, Agriculture Department, Punjab — *Crops' Life Calendar*: https://agripunjab.gov.pk/system/files/Crops%20Life%20Calendar2.pdf
- CRS — *Seasonal Crop Calendar of Punjab* (with PMD National Agromet Centre): https://weather.gov.pk/storage/uploads/namc/crop-report/pdfs/Crop%20Calendar-Punjab-Updated.pdf
- CRS — *Harvesting Calendar Rabi Crops' 2020*: https://agripunjab.gov.pk/system/files/Calendar%20YES%20Rabi%202020.pdf
- CRS — *Harvesting Calendar Kharif Crops' 2020*: https://agripunjab.gov.pk/system/files/Calendar%20YES%20Kharif%202020.pdf
- CRS — *Calendar of Annual Field Activities 2022*: https://agripunjab.gov.pk/system/files/Calendar%20Annual%20CRS%20Activities%202022_3.pdf
- CRS — *Final Kharif Estimates 2025-26* (cotton area/production by district): https://agripunjab.gov.pk/system/files/Final%20Kharif%20Estimates%202025-26_1.pdf
- CRS — *Final Rabi Estimates 2025-26*: https://agripunjab.gov.pk/system/files/Final%20Rabi%20Estimates%202025-26_0.pdf
- CRS — *Historical Data Wheat (Districtwise) 2022-25*: https://agripunjab.gov.pk/system/files/Historical%20Data%20Wheat%20%28Districtwise%29%202022-25_0.pdf
- Punjab Agriculture Department — *Crop Production* plans index: https://agripunjab.gov.pk/crop-production
- AARI wheat varieties (sowing windows): https://agripunjab.punjab.gov.pk/aari-cvwheat
- Ministry of National Food Security & Research — *Crops Area & Production (District wise) 2024-25*: https://mnfsr.gov.pk/SiteImage/Downloads/CAP2024-25.pdf

**University / research**
- Punjab Agricultural University — *Package of Practices for Crops of Punjab, Rabi*: https://pau.edu/content/ccil/pf/pp_rabi.pdf
- Punjab Agricultural University — *Package of Practices for Crops of Punjab, Kharif*: https://pau.edu/content/ccil/pf/pp_kharif.pdf
- *Grassroots* (PASTIC) 2022 — district crop-share analysis for Punjab: https://nja.pastic.gov.pk/journals/index.php/Grassroots/article/download/23792/22941/26249
- Urban Unit — *Faisalabad Regional Development Plan: Agriculture Development* (cropping pattern, Rabi area): https://urbanunit.gov.pk/Download/publications/Files/17/2023/Faisalabad%20Regional%20Development%20Plan%20-%20Agriculture%20Development_compressed%20(1).pdf

**Data**
- NASA POWER (climate values quoted in §3): https://power.larc.nasa.gov/docs/services/api/
- ISRIC SoilGrids 2.0 (soil values quoted in §3): https://rest.isric.org/soilgrids/v2.0/properties/query

**Verification honesty note:** district statistics and calendar dates above were taken from search
extracts of the cited PDFs, not from a full manual read of every page. Each is attributed to the exact
document that states it. Phase 2 must open the PDFs and confirm page-level wording before these numbers
appear in the shipped app.
