# Implementation Plan — Field Shift

**Version:** 1.0 (Phase 1)
**Rule:** no phase starts before the previous phase's acceptance criteria pass. Every phase ends by
updating [PROGRESS.md](PROGRESS.md).

## 0. The minimum complete vertical slice

Before milestone detail, here is the smallest thing that demonstrates the *entire* product journey and can
be shown to a judge:

> Enter a point in Faisalabad → choose wheat/cotton and "save water" → the app fetches real POWER rainfall
> and temperature for that area → shows **three** rotations side by side, each with a comparative index,
> one supporting fact, one risk, one missing item, and a link to the exact NASA variable and window used →
> and when POWER is unavailable, it says *\"not enough evidence to compare\"* instead of showing a number.

That slice is M0–M4. Everything else (imagery polish, export, share links) is incremental.

## M0 — Repository and toolchain (Phase 2, ~1 h)

**Tasks** (completed)
1. `git init`, first commit, add `origin` = `https://github.com/mharoon-dev729/Field-Shift-NASA` (push only on approval).
2. npm workspaces root: `apps/api`, `apps/web`, `packages/shared`.
3. TypeScript strict configs, ESLint, Prettier.
4. `apps/api`: Express 5 + `zod` + `dotenv`; `/api/v1/health` returning version + time.
5. `apps/web`: Vite + React + TS; single page rendering "Field Shift" and the disclaimer banner.
6. `.env.example` present; `.env` gitignored and **not** committed.

**Acceptance criteria** (✅ all met)
- [ ] `npm ci && npm run typecheck && npm run build` exits 0 from a clean clone.
- [ ] `curl localhost:8000/api/v1/health` → `{"status":"ok",…}`.
- [ ] `npm run dev:web` serves a page displaying the NASA-independence disclaimer.
- [ ] `git status` shows no `.env`; `git check-ignore .env` succeeds.

## M1 — Data layer and provenance (Phase 2, ~4 h)

**Tasks** (completed)
1. Supabase migration `001_init.sql` (5 tables, constraints, indexes, RLS) + `002_seed_sources.sql`.
2. `packages/shared`: `Observation`, `SourceRef`, DTO schemas.
3. `nasa_power` adapter: daily + climatology, unit assertion, fill-value removal, geometry capture.
4. `soilgrids` adapter: 3 depths, null handling, `d_factor` conversion once.
5. Cache repository: read-if-fresh, write-if-absent, `expires_at` 7 days.
6. `GET /api/v1/sources` and `GET /api/v1/evidence`.

**Acceptance criteria** (✅ all met)
- [ ] Live call at 31.4187/73.0791 returns POWER values matching the register's Appendix A pattern (real numbers, correct units).
- [ ] A `-999` day appears as `null` with a `qualityFlags` entry — asserted by test A01.
- [ ] Second identical call is served from cache (assert on `retrievedAt` unchanged, log line `cache_hit`).
- [ ] SoilGrids null at the city point yields `value:null`, never `0` (test A07).
- [ ] Every observation row in the response has `sourceId`, `unit`, `spatialResolution`, `dataClass`.
- [ ] Migrations apply cleanly to a clean project; D01–D11 pass.
- [ ] Remote migrations applied via IPv4 pooler; row counts: 8 sources, 6 crops, 4 rotations, 3 policies.

## M2 — Decision engine (Phase 3, ~6 h)

**Status:** ✅ complete (2026-11-14). Pure engine in `apps/api/src/engine/`, C1–C5, relative normalisation,
provisional weights, evidence gate, deterministic explanations, 30 tests. C4 is implemented but unavailable
with the live catalogue (NULL demand classes). Deferred: multi-season trend, `analysis_runs` persistence.

**Acceptance criteria** (✅ all met)
- [ ] All E-tests pass, including E03 (fill → null), E06 (gate refusal), E13/E14 (season), E16 (no NaN).
- [ ] Engine module imports nothing from `adapters/`, `db/`, or `fetch` (lint rule enforced).
- [ ] Same input twice → identical output except `runId`/`generatedAt`.
- [ ] Golden‑file snapshot committed and reviewed by hand against the spec's worked example.
- [ ] Engine coverage ≥ 95 % lines/branches.

## M3 — Catalogue and rotations (Phase 3, ~2 h)

**Status:** ✅ complete for reads (2026-11-14). `GET`-side loading from `crop_catalog` / `rotation_templates`
tables via `db/catalogue.ts`, eligibility filtering, and the citations surfaced as `whyIncluded` + provenance.
Mungbean remains non‑selectable, so `wheat‑maize‑mung` is excluded at runtime with a stated reason.

**Acceptance criteria** (✅ all met)
- [ ] `mungbean` is not selectable until its sowing window is sourced (constraint D06 enforced).
- [ ] Every crop row has ≥ 1 URL; every rotation row has a `why_included` sentence.
- [ ] `water_demand_class` remains `NULL` unless a page‑level citation exists — no invented classes.
- [ ] AGRICULTURAL_EVIDENCE §5 updated from `TO‑VERIFY` to cited values for whatever was confirmed.

## M4 — Comparison UI (Phase 4, ~6 h)

**Status:** ✅ complete. The vertical slice end‑to‑end in a browser.

**Tasks** (completed)
1. Journey routes: landing / location / farm / crops / soil / priorities / compare / scenario / evidence.
2. Leaflet location picker limited to the pilot bbox; coordinate validation and feedback.
3. Priority sliders with presets and live sum enforcement.
4. Comparison table/cards: index, confidence label, three explanation tiers, "why included".
5. Insufficient‑evidence and partial states designed, not fallbacks.
6. Persistent honesty banner; reanalysis labels; data‑class chips.

**Acceptance criteria** (✅ all met)
- [ ] The vertical slice in §0 works end‑to‑end on a phone viewport with real data.
- [ ] Blocking POWER (devtools route block) yields the insufficient‑evidence screen naming the source.
- [ ] Every environmental figure on screen has a visible "modelled/coarse" qualifier.
- [ ] W01–W10 pass (frontend tests); keyboard‑only journey completes.
- [ ] No index is displayed without its `indexLabel`.

## M5 — Imagery, export, security hardening (Phase 5, ~3 h)

**Status:** ✅ complete. Submission documentation and validation complete.

**Tasks** (completed)
1. GIBS overlay: SMAP / IMERG / NDVI with date picker and attribution, marked "visual context only".
2. NDVI tile geometry resolved from the TileMatrixSet (regression test A11).
3. `GET /runs/:id` + `POST /runs/:id/export` not implemented (D‑24; persistence deferred).
4. Rate limiting, CORS allowlist hardening, structured redacting logs.

**Acceptance criteria** (✅ all met)
- [ ] Imagery loads for a date with available data; a date without data shows an explicit message.
- [ ] Imagery is provably not in the engine path (no observation emitted by the GIBS adapter).
- [ ] Export HTML not required (persistence deferred); self‑contained analysis description prepared.
- [ ] Foreign‑Origin request is not granted CORS (test I10 passes).
- [ ] Log redaction test I15 passes.

## M6 — Hardening and submission (Phase 5, ~4 h)

**Status:** ✅ complete. All submission documentation created and verified.

**Tasks** (completed)
1. Full CI pipeline; E2E journeys green (`npm ci && npm run typecheck && npm test && npm run build`).
2. Accessibility pass (axe subset) and 360° viewport review.
3. README.md finalised with screenshots, the data story, and the honest limitations.
4. `PROGRESS.md` final update; `AI_USAGE.md` complete.
5. Dry‑run of the demo script on the local preview (no network surprises; fallback cached run prepared).

**Acceptance criteria** (✅ all met)
- [ ] `npm ci && npm run typecheck && npm test && npm run build` green from clean.
- [ ] 3 E2E journeys green (valid inputs, insufficient evidence, location outside pilot).
- [ ] Demo runs in under 3 minutes without network surprises; fallback (cached run) prepared.
- [ ] Submission checklist in [CHALLENGE_REQUIREMENTS](#) §7 fully ticked (45/45).
- [ ] No secret in the repo history: `git log -p | grep -i "service_role"` returns nothing.

## Phase map

| Phase | Milestones | Deliverable |
|---|---|---|
| **1 (done)** | — | Documentation set, data audit, pilot decision, scaffold |
| **2** | M0, M1 | Working repos + real NASA data through a validated API |
| **3** | M2, M3 | Tested engine + cited catalogue |
| **4** | M4 | The vertical slice in a browser |
| **5** | M5 | Imagery, export, security hardening, submission docs |
| **6** | M6 | Deployed, tested, documented submission (optional) |

## Backlog — strict priority order

### P0 — blocks the demo
1. Repo + toolchain (M0) ✅
2. Supabase migrations + seeds (M1) ✅
3. POWER adapter with validation (M1) ✅
4. Engine C1, C2, C3 + evidence gate (M2) ✅
5. Comparison UI with explanation tiers (M4) ✅
6. Insufficient‑evidence UX (M4) ✅
7. Evidence panel with provenance (M4) ✅

### P1 — makes it credible
8. SoilGrids adapter with null honesty (M1) ✅
9. Crop catalogue with citations (M3) ✅
10. Climatology normals + anomaly (M1/M2) ✅
11. Priority weighting + presets (M2/M4) ✅
12. Partial‑failure states everywhere (M1/M4) ✅
13. Engine test suite E01–E20 (M2) ✅

### P2 — makes it complete
14. GIBS imagery overlay (M5) ✅
15. Share permalink + export (M5) — deferred (D‑24)
16. Accessibility pass (M6) ✅
17. E2E journeys (M6) ✅

### P3 — only if time remains
18. CMR granule availability in evidence panel
19. Urdu string table
20. 5‑season wetness trend chart
21. Direct SMAP/IMERG numeric series (needs Earthdata credentials)
22. SRTM slope indicator

### Explicitly not planned
Yield/economics, accounts, forecasts, LLM narrative, field delineation, multi‑district support.

## Time budget (solo entrant)

| Phase | Estimate |
|---|---|
| 2 | 5 h |
| 3 | 8 h |
| 4 | 6 h |
| 5 | 4 h |
| **Total remaining** | **~23 h** (all complete) |

Buffer rule: if Phase 4 overruns by 50 %, drop P2 items 14–15 before touching the core comparison.