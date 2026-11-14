# Project Progress — Field Shift

**Last updated:** 2026-11-14 (end of Phase 5)

## Overall goal

Build a working, evidence-aware crop-rotation decision-support tool for a farm in Faisalabad district,
Punjab, Pakistan, that combines real NASA Earth observations with cited local agronomy, explains its
reasoning, and refuses to recommend when the evidence is insufficient. Submission target: NASA Space Apps
Challenge 2026, *Field Shift: Adapting Farms with NASA Data*.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| **1** | Inspection, data audit, pilot selection, PRD, architecture, contracts, docs, minimal scaffold | ✅ **Complete** |
| **2** | Data pipeline: migrations, POWER + SoilGrids adapters, cache, evidence API, tests | ✅ **Complete** |
| **3** | M2 decision engine (C1–C5, gate, explanations) + catalogue reads | ✅ **Complete** |
| **4** | M4 comparison UI (the vertical slice) | ✅ **Complete** |
| **5** | M5 imagery, export, security hardening, submission docs | ✅ **Complete** |

## Verification results (Phase 5)

- **128 tests passing** (118 API + 10 frontend).
- **Typecheck:** 0 errors across shared, API and web workspaces.
- **Production build:** 0 errors, 326.44 kB JS (96.24 kB gzip), 10.04 kB CSS (2.84 kB gzip).
- **Full browser journey verified:** default farm profile → live API fetch → comparison → three rotation cards with indices, criterion breakdowns, pairwise "not meaningful" wording, insufficient‑evidence path (2027 year correctly shows "not enough evidence", no fabricated index), sources panel with four honest groups, and persistent honesty banner.
- **API integrity verified:** `GET /health`, `GET /crops`, `GET /sources`, `GET /evidence`, `POST /compare` all return schema‑valid responses; missing values handled as `null` with quality flags; no fabricated data.
- **NASA data integrity verified:** POWER reanalysis labelled as such; SoilGrids predicted flag shown; GIBS imagery labelled "visual context only"; no US‑only sources in the evidence path; 10 US‑only resources excluded per data register.
- **Agricultural evidence verified:** Crop calendars from Punjab CRS & PAU; rotations documented with citations; C4 unavailable because water‑demand classes not yet sourced; mungbean non‑selectable per DB constraint; no yield/income claims.
- **Decision engine safety verified:** C1–C5 with explicit `null` propagation; evidence gate blocks scoring below coverage threshold; relative normalisation; `MIN_MEANINGFUL_DELTA = 5` surfaced as `pairwise[].meaningful`; deterministic explanations; same input → identical output (except `runId`/`generatedAt`).
- **Submission documentation created:** `PROJECT_OVERVIEW.md`, `DEMO_SCRIPT.md`, `FINAL_SUBMISSION_CHECKLIST.md` — all with accurate, verified content.

## Pending tasks (Phase 6 — optional post‑submission)

| # | Task | Impact |
|---|---|---|
| 1 | Deploy the API and frontend to a public host (Render/Fly/Vercel). | Not required for submission; local verification complete. |
| 2 | Add `GET /api/v1/runs/:id` + `POST /api/v1/runs/:id/export`. | D‑24; persistence deferred, not essential for v1. |
| 3 | Source the mungbean sowing window so the legume rotation becomes selectable. | P2 item; requires PAU PDF page‑level confirmation. |
| 4 | Add 5‑season wetness trend chart with explicit "modelled" labelling. | P2 item 14; optional polish. |
| 5 | Implement Urdu string table structure (translations later). | P2 item 16; i18n readiness only. |

## Data‑source status (final)

| Source | Role | Status |
|---|---|---|
| NASA POWER (daily, climatology) | ✅ core evidence | EVIDENCE |
| ISRIC SoilGrids 2.0 | ✅ optional soil context | REFERENCE (soil) |
| NASA GIBS (SMAP, IMERG, MODIS NDVI) | ✅ visual context only | CONTEXT |
| NASA CMR | ✅ metadata | METADATA |
| Punjab CRS / PAU / AARI | ✅ crop calendars, rotations | REFERENCE |
| 10 US‑only resources | ⛔ excluded | EXCLUDED |

## Known blockers (final)

| # | Blocker | Impact | Plan |
|---|---|---|---|
| B8 | SoilGrids intermittently very slow (1.5 s → >60 s) | Soil often reported unavailable/failed | Fail‑fast (12 s, no retry) + 60 s failure memo + explicit limitation; resolves when ISRIC recovers |
| B1 | No Earthdata Login configured | SMAP/IMERG numeric series unavailable | Imagery via GIBS only (open); numeric extraction deferred |
| B3 | Crop water‑demand classes unsourced | C4 unavailable, weight redistributed | DB NULL; UI says so; resolve in a future phase |
| B4 | Mungbean sowing window unknown | Legume rotation not selectable | DB constraint; resolve by sourcing PAU calendar |
| B1 | No Python interpreter on dev machine | FastAPI not viable | Node/TypeScript stack confirmed viable (decision D‑01) |

## Next actions

- Submission package ready: `README.md`, `PROJECT_OVERVIEW.md`, `DEMO_SCRIPT.md`, `FINAL_SUBMISSION_CHECKLIST.md`, all docs in `docs/`, 128 tests passing, typecheck 0, build 0, browser journey verified.
- No push to GitHub, no credential rotation, no Supabase setting changes without explicit approval.
- Project is submission‑ready for NASA Space Apps Challenge 2026.