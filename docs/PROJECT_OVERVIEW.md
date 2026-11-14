# Field Shift — Project Overview

**NASA Space Apps Challenge 2026 — Independent Entry**
*Field Shift: Adapting Farms with NASA Data*
Not affiliated with, endorsed by, or produced by NASA or NASA Space Apps.

## The Problem

A farmer in Faisalabad district, Punjab, Pakistan must commit to next season's crop months before it starts. The information needed to make that decision is scattered and inaccessible:

- **NASA archives** require Earthdata logins and HDF5 decoding — not feasible for a farmer.
- **Provincial agriculture documents** (Punjab Crop Reporting Service, PAU *Package of Practices*) exist but are in PDFs with no machine‑readable translation.
- **Memory and local advice** are unreliable and vary by source.

The gap is not data — it is **translation**. Nobody is converting NASA's gridded reanalysis into plain‑language comparisons across the rotations a farmer can actually choose.

## What Field Shift Does

Field Shift translates NASA Earth‑observation data into an explained, source‑linked comparison of crop rotations for one farm — and says so plainly when the data aren't good enough to decide.

**One‑sentence summary:**
> Field Shift turns NASA environmental data into an explained, source‑linked comparison of crop rotations for one farm — and says so plainly when the data isn't good enough to decide.

### What it is not
- A weather app or forecast.
- A yield, income or profit predictor.
- A substitute for a soil test, an agronomist, or a variety‑seed recommendation.
- A guarantee of higher yield or improved soil health.
- A global tool — it is built for the Faisalabad pilot district, honestly.

## Main Features (Vertical Slice)

1. **Farm profile** — enter a point in Faisalabad district; set season (rabi/kharif), current crop, previous crop, irrigation source, optional soil values, and three priority weights (water, soil health, climate resilience).

2. **NASA evidence retrieval** — server‑side fetch of POWER daily + climatology (MERRA‑2 reanalysis, ~0.5° cell ≈ 50 km), with quality‑flag handling, `fill_value` → `null` conversion, and clear provenance. SoilGrids 2.0 predictions shown only when valid, explicitly labelled as model predictions. GIBS imagery tiles as visual context only — never scored.

3. **Rotation comparison** — the deterministic decision engine scores five components (C1 rainfall reliability, C2 heat exposure, C3 soil‑health structure, C4 water demand vs supply, C5 frost risk) relative to the options shown, re‑weights by farmer priorities, and applies an evidence gate that blocks scoring when coverage is too thin. Weights are explicitly **provisional**. C4 is currently unavailable because water‑demand classes are not yet sourced.

4. **Per‑scenario explanation** — every rotation card shows:
   - **Supporting indicators** (numbers with units and source).
   - **Risks** (e.g., days above 35 °C inside the window).
   - **Missing evidence** (what could not be computed and why).
   - **What the system cannot conclude** (no yield claims, no absolute suitability).

5. **Ranking and pairwise differences** — scenarios are ranked by comparative index (0–100, relative to the options in that run). Pairwise differences are labelled *meaningful* or *not meaningful* based on a 5‑point band. No winner is declared when `meaningful` is false.

6. **Evidence panel / provenance** — one‑tap drawer that clearly distinguishes:
   - NASA environmental observations (POWER, data class = *reanalysis*).
   - Soil information (ISRIC SoilGrids 2.0, data class = *observation*, predicted flag).
   - Agricultural research and crop requirements (Punjab CRS, PAU *Package of Practices*, citations).
   - Project assumptions and provisional thresholds (weights, thresholds, data‑class disclaimers).

7. **Limitations always visible** — a persistent honesty banner labels POWER as reanalysis, notes the ~0.5° grid scale, states that SoilGrids is a prediction not a field measurement, and reminds the user that this is an independent project not affiliated with NASA.

## Technology Stack

| Layer | Tool |
|---|---|
| **Web frontend** | React 19 + TypeScript + Vite |
| **API server** | Node 24 + TypeScript + Express + zod validation |
| **Database** | Supabase Postgres (5 tables, RLS) |
| **Shared types** | zod schemas compiled on both sides |
| **Decision engine** | Pure TypeScript, no I/O, no clock, no LLM (C1–C5, evidence gate, deterministic explanations) |
| **NASA adapters** | POWER (daily + climatology), SoilGrids 2.0, GIBS imagery, CMR metadata |
| **Deployment** | Not yet deployed — local Node + Vite; ready for static frontend + containerised API |

## Current Limitations (as of Phase 5)

- **C4 (Water demand vs supply) is unavailable** — `water_demand_class` is NULL for all six crops in the catalogue; its weight is redistributed and the UI says so.
- **SoilGrids is intermittently slow** — when slow or null, the response says soil is unknown; it is never estimated as zero.
- **Mungbean is not selectable** — its sowing window is not yet sourced; the DB constraint enforces this.
- **Runs are not persisted** — `runId` is returned but `GET /api/v1/runs/:id` is not implemented.
- **SMAP/IMERG numeric series** — not implemented (Earthdata credentials not configured); only GIBS imagery tiles are used, labelled *visual context only*.
- **Ten challenge‑listed resources are US‑only** and explicitly excluded; the pilot is Faisalabad, Pakistan.
- **Weights are provisional** — labelled as such in the UI and in the engine config.
- **No user accounts, saved farms, or multi‑user sharing** in v1.
- **No yield, income or financial claims** — the system refuses to make them.

## Data Sources (Honest Accounting)

| Source | Role | Status |
|---|---|---|
| **NASA POWER** (daily + climatology) | Core evidence: rainfall, temperature, radiation, humidity, wind, modelled root‑zone wetness | ✅ verified live |
| **ISRIC SoilGrids 2.0** | Optional soil context (clay, sand, SOC, pH at 0–5, 5–15, 15–30 cm) | ✅ live; nulls handled |
| **NASA GIBS** (SMAP, IMERG, MODIS NDVI) | Visual‑context imagery only, never scored | ✅ tiles verified |
| **NASA CMR** | Granule‑availability metadata | ✅ verified (no login) |
| **Punjab CRS / PAU / AARI** | Crop calendars, rotation rules, district statistics | ✅ documents located and cited |
| **10 US‑only resources** | Excluded — cover only North America | EXCLUDED |

Full per‑source audit with 15 fields each: [docs/DATA_SOURCE_REGISTER.md](docs/DATA_SOURCE_REGISTER.md).

## Decision Logic in One Line

A deterministic, pure TypeScript function scores five components — rainfall reliability, heat exposure, soil‑health structure, water demand vs supply, frost risk — normalised *relative to the options shown*, with farmer priorities re‑weighting them, and an **evidence gate** that blocks scoring below a coverage threshold. Weights are explicitly **provisional**. No machine learning, no LLM at runtime, no probability claims. Specification: [docs/DECISION_ENGINE_SPEC.md](docs/DECISION_ENGINE_SPEC.md).

## Submission Checklist Status

- [x] A user can complete the whole journey without an account.
- [x] At least three rotations, including the farmer's current one, are compared.
- [x] Every displayed environmental number has a source, variable name, unit, date range and resolution.
- [x] A failing data source degrades the result openly and blocks unsupported conclusions.
- [x] Changing farmer priorities visibly changes the ranking and the explanation.
- [x] US-only datasets are absent from the evidence path.
- [x] README states clearly that this is an independent project.