# Decisions Log — Field Shift

Architectural and product decisions that must not be changed silently. Each entry states the decision,
the alternative rejected, the reason, and what it costs.

---

## D-01 — Node/TypeScript backend instead of Python/FastAPI
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** Build the API in Node 24 + TypeScript (Express) rather than Python + FastAPI.

**Reason:** The target machine has Node v24.14.0 and npm 11.9.0 working, but **no functioning Python
interpreter** — `python` and `python3` resolve only to Windows Store alias stubs in
`AppData\Local\Microsoft\WindowsApps`, and `py -3 --version` produces no output. Using FastAPI would require
installing a Python runtime, a virtualenv and a second dependency manager before any product work, adding a
second deployment target for a solo entrant.

**Rejected alternative:** Install Python (out of scope for the request; adds toolchain risk mid-hackathon).

**Cost:** Loses Python's scientific stack (xarray/rasterio) for future HDF/NetCDF work. Mitigation: such work
is already deferred (see D-05), and Node can call a one-off Python script later if that becomes necessary.

**Reversal path:** the API is thin; the engine is pure TypeScript and could be ported or run behind a
different server without changing the contract.

---

## D-02 — npm workspaces monorepo (api / web / shared)
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** One repository, three workspaces.

**Reason:** Shared zod schemas make the API contract compile-time checked on both sides, which is the
cheapest defence against frontend/backend drift in a one-person project. One lockfile, one install.

**Rejected alternative:** Two repositories (simpler deploy, guaranteed drift).

**Cost:** Slightly more build config. Ceiling set at three workspaces — no further packages without a
decision entry.

---

## D-03 — Pilot district: Faisalabad, Punjab, Pakistan
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** Pilot on Faisalabad district (anchor 31.4187 N, 73.0791 E).

**Reason:** Highest rotation diversity among the candidates (wheat, cotton, rice, maize, sugarcane all
materially present), documented rotations from PAU, district statistics from Punjab CRS, in-district
research institutions (UAF, AARI), verified NASA coverage, and verified SoilGrids values at rural points.
Full comparison in AGRICULTURAL_EVIDENCE §2.

**Rejected alternatives:** Bahawalnagar (largest wheat/cotton, but narrower rotation set and tighter water
situation — better second pilot); Sheikhupura (rice-dominant, less diverse); Multan (cotton-dominant).

**Cost / risk:** Rice is a minority practice in Faisalabad, so a "wheat–rice" scenario must carry a visible
caveat. District boundaries are administrative, not agro-ecological; messaging must not imply otherwise.

---

## D-04 — POWER as the core numeric evidence source; SMAP/IMERG as imagery until credentialed
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** Use NASA POWER daily + climatology as the numeric backbone. Use SMAP, IMERG and MODIS NDVI
through NASA GIBS as labelled visual context only. Defer numeric extraction from SMAP/IMERG/HLS.

**Reason:** POWER needs no key, is CORS-enabled, and returns real, unit-annotated data at the pilot point —
verified live. SMAP/IMERG numeric access requires Earthdata Login plus HDF5/NetCDF decoding; attempting it
inside the MVP would risk either a fake dataset or an unfinished pipeline. GIBS tiles are open and give a
genuine NASA visual without pretending to be numbers.

**Rejected alternative:** Fabricate or interpolate SMAP values to make the UI look richer. Not acceptable
under the project's principles.

**Cost:** One numeric source makes the comparison thinner than the challenge's ideal. Mitigated by POWER's
breadth (rain, temperature, radiation, humidity, wind, modelled wetness) and by honest labelling of POWER as
**reanalysis**, not observation.

**Reversal path:** `adapters/smap.ts` + Earthdata credentials; the engine needs no change because it consumes
`Observation` records.

---

## D-05 — Exclude all US/North-America-only datasets from the evidence path
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** Web Soil Survey, CDL/CropScape, PRISM, SSURGO/STATSGO2, NAIP, NLCD, CoCoRaHS, NWIS,
USDA Market News/NASS and OpenET are documented and excluded. NLDAS is excluded; GLDAS is optional.

**Reason:** None of them cover Pakistan. Presenting them as global would be the single most damaging
credibility error available to this project, and the master prompt explicitly warned about it.

**Cost:** Less "NASA resource coverage" in the narrative. Mitigated by showing the audit itself — the
exclusion is evidence of rigour, not a gap.

---

## D-06 — Global soil data from ISRIC SoilGrids 2.0, with nulls surfaced as unknown
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** Use SoilGrids REST for soil context; treat `null` as "unavailable", never as 0 or a default.

**Reason:** It is the credible global soil product reachable from Pakistan with no key, and it returns real
values near the pilot (clay 153–206 g/kg, pH ≈ 8.0). During the audit, several points returned nulls — a
real missing-data case the product must display, not paper over.

**Rejected alternative:** FAO Harmonized World Soil Database rasters (heavier, no point API) or inventing
defaults for Punjab soils.

**Cost:** Soil may be unavailable for some users. That is the honest outcome, and the UI has a designed state
for it.

---

## D-07 — NDVI imagery is context only; it never enters scoring
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** MODIS NDVI (250 m) and any vegetation index is display-only.

**Reason:** A Punjab smallholding is often 2–5 ha (roughly 140–220 m across but fragmented); a 250 m pixel
mixes several farms, roads and water channels. Scoring a farmer's rotation on a mixed pixel would violate
"no false farm-level precision".

**Cost:** One fewer scoring component. Acceptable: the engine still has rainfall, heat, structure, water
balance and frost.

---

## D-08 — Provisional weights, declared in the product
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** Component weights (C1 .30, C2 .25, C3 .25, C4 .15, C5 .05) and the priority multipliers are
labelled `provisional: true`, live in one config file, and are shown to the user as a prototype choice.

**Reason:** No agronomic source justifies specific weights. Inventing quiet authority would breach the
project's core principle. Making them explicit and change-controlled is the honest option.

**Cost:** Weakens claims of scientific validity — intentionally. Changes require a new entry here plus
updated snapshots and tests.

---

## D-09 — Deterministic engine refuses to score without evidence (the evidence gate)
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** `availableWeight < 0.35` or fewer than 2 available components ⇒ `insufficient_evidence` and no
index. Missing components are `null`, never 0.

**Reason:** Zero is a plausible-looking value that silently penalises a scenario for a data outage — the
exact failure mode the master prompt forbids ("a failed data request must not silently turn into a fabricated
result"). Refusal is the feature.

**Cost:** Some users will see "not enough evidence" instead of a ranked list. That is the correct outcome.

---

## D-10 — No accounts, no PII in v1
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** No auth, no user table, no saved farms. Analyses are anonymous with opaque UUIDs.

**Reason:** The challenge does not require accounts; adding them would consume hackathon time and create a
data-protection surface for no product benefit. Removing PII also removes most of the security risk.

**Cost:** No cross-session persistence for a farmer. `analysis_runs` gives a shareable link as a partial
substitute.

---

## D-11 — Explanation by deterministic templates, not an LLM
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** Generate explanations from templates over structured findings.

**Reason:** Reproducibility and auditability. A judge (or a farmer) must be able to trace a sentence back to a
number and a source. An LLM in the loop breaks determinism and invites invented claims.

**Cost:** Less fluent prose. Mitigated by careful template design and by showing the underlying numbers
adjacent to the sentence.

---

## D-12 — Four database tables only
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** `data_sources`, `crop_catalog`, `rotation_templates`, `environmental_observations`,
`analysis_runs` (five including rotations) — and no `farm_profiles` or `saved_reports`.

**Reason:** Without accounts, `farm_profiles` stores PII for no benefit, and `saved_reports` duplicates
`analysis_runs.result`. Rotation definitions are cited reference data and belong beside the catalogue.

**Cost:** Adding accounts later needs a migration. Acceptable.

---

## D-13 — Contract enforced by shared zod schemas
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** `packages/shared` is the only source of request/response types; API integration tests parse
responses with the same schemas.

**Reason:** Drift between `docs/API_CONTRACT.md`, the server and the client is the most likely defect in a
solo, fast-moving project. Types compiled on both sides catch it at `npm run typecheck`.

---

## D-14 — Corpus of documentation kept as the single source of truth
**Date:** 2026-11-14 · **Phase:** 1 · **Status:** accepted

**Decision:** Every future task reads `PROGRESS.md`, `IMPLEMENTATION_PLAN.md` and this log before changing
code; structural changes append a new entry.

**Reason:** Master prompt §18. Prevents silent drift of the objective or architecture.

---

## D-15 — POWER and SoilGrids are fetched in parallel; soil fails fast
**Date:** 2026-11-14 · **Phase:** 2 · **Status:** accepted

**Decision:** The evidence service issues both source requests concurrently. SoilGrids gets a **12 s timeout
and zero retries**; POWER keeps 20 s with one retry.

**Reason:** SoilGrids was measured at 1.5 s, then 32 s, 58 s, and twice beyond 60 s on the same afternoon.
Run sequentially, a slow soil provider delayed valid NASA POWER evidence by more than a minute. Soil is
context; POWER is the evidence base. Soil must never gate it.

**Consequence:** A soil outage yields `soil.status = "failed"` (or `"unavailable"` when the provider answers
with nulls) plus an explicit limitation, while the POWER evidence still returns in full.

---

## D-16 — A short failure memo, never a cached failure
**Date:** 2026-11-14 · **Phase:** 2 · **Status:** accepted

**Decision:** After a source fails, do not retry it for 60 s; report the same failure with its original
timestamp and say it was not retried yet. Success clears the memo.

**Reason:** Without it, every request paid the full 12 s soil timeout while ISRIC was down. Measured effect:
repeat requests dropped from 12.07 s to 25 ms and 6 ms.

**Consequence:** This is not caching a failure *as evidence* — it yields no values and never writes to the
cache. It is bounded to 60 s, and the source is retried automatically after that (covered by a test).

---

## D-17 — Soil has three outcomes, not two
**Date:** 2026-11-14 · **Phase:** 2 · **Status:** accepted

**Decision:** `SoilStatus` is `ok | unavailable | failed`. `unavailable` means the provider answered but had
no value (all-null means); `failed` means the request did not produce a usable response.

**Reason:** "The service is down" and "this cell has no soil data" are different facts, and the farmer-facing
explanation differs. The pilot's city-centre point genuinely returns all nulls.

**Consequence:** Both are surfaced as unknown, never as zero or a regional average.

---

## D-18 — The cache stores daily rows only; aggregates are re-derived
**Date:** 2026-11-14 · **Phase:** 2 · **Status:** accepted

**Decision:** Persist one row per variable per day. Recompute season sums, means and indicators on every
request from that series.

**Reason:** A stored aggregate can silently drift from its inputs when an indicator definition changes, and
`seasonRainMm` would then disagree between a cold fetch and a cache hit. Re-derivation makes a hit
numerically identical, which the test suite asserts.

---

## D-19 — Migrations run through the IPv4 pooler, not the direct host
**Date:** 2026-11-14 · **Phase:** 2 · **Status:** accepted

**Decision:** `apps/api/scripts/migrate.mjs` tries the direct host, then the Supabase poolers, and caches the
first endpoint that authenticates.

**Reason:** `db.<ref>.supabase.co` is IPv6-only on this network (`ENOTFOUND`), and neither `psql` nor the
Supabase CLI is installed. The pooler is the documented IPv4 path.

**Consequence:** No credential is ever written into a file by the runner — it caches host, port and the
project-scoped username only, and reads the password from `.env` at runtime.

---

## D-20 — A rotation is evaluated over one anchored cycle
**Date:** 2026-11-14 · **Phase:** 3 · **Status:** accepted

**Decision:** A comparison for planning season S and year Y evaluates each rotation's S phase in year Y
plus the other phase in the window immediately preceding it (rabi Y ⇒ rabi Y + kharif Y; kharif Y ⇒ kharif Y
+ rabi Y−1).

**Reason:** A rotation spans two seasons. Evaluating only the planning season's phase would compare four
identical wheat windows (every seeded rotation starts with wheat) and produce no discrimination at all;
evaluating the *future* phase would compare unobserved data.

**Consequence:** The engine describes what happened in the most recent complete cycle of each rotation, not
a forecast. Every window is reported per criterion so the reader can see the dates used.

---

## D-21 — C4 stays unavailable rather than approximated
**Date:** 2026-11-14 · **Phase:** 3 · **Status:** accepted

**Decision:** C4 is implemented in full but returns `available: false` for every live crop, because
`water_demand_class` is NULL for all six seeded crops.

**Reason:** The only way to make C4 produce a number today is to invent a demand class or substitute a
regional average. Both would manufacture the exact evidence this project refuses to manufacture.

**Consequence:** Water-priority farmers still get C1 (rainfall reliability) and the C4 weight is explicitly
redistributed and reported. Live coverage is therefore ~0.80, not 1.0, and the response says why.

---

## D-22 — The comparison path does not request soil
**Date:** 2026-11-14 · **Phase:** 3 · **Status:** accepted

**Decision:** `POST /compare` uses an evidence handler with `soilEnabled: false`.

**Reason:** No criterion consumes SoilGrids: C3 is built from cited catalogue attributes and C4 uses POWER
`GWETROOT`. Requesting soil added a 12 s timeout whenever ISRIC was slow (measured twice), delaying every
comparison for evidence that is then discarded.

**Consequence:** Cold comparison latency fell from 16.7 s to 7.0 s, and warm requests to 36 ms. The soil
panel on `GET /evidence` is untouched.

---

## D-23 — The rainfall anomaly term is optional, and never faked
**Date:** 2026-11-14 · **Phase:** 3 · **Status:** accepted

**Decision:** C1 uses the POWER climatology normal when it can be retrieved. If it cannot, C1 falls back to a
dry-spell-only composite and is marked `status: "partial"` with the missing input named.

**Reason:** The anomaly term is the most informative part of the rainfall criterion, but a baseline must
come from climatology, not from the observed series itself (which would make the anomaly trivially zero) and
not from a neighbouring year.

---

## D-24 — Runs are not persisted yet
**Date:** 2026-11-14 · **Phase:** 3 · **Status:** accepted (temporary)

**Decision:** The engine returns a `runId` but writes nothing to `analysis_runs`; `GET /runs/:id` remains
unimplemented.

**Reason:** Phase 3's acceptance criteria are the engine, the gate and the API. Persisting adds a write path,
retention semantics and an export contract, none of which the frontend needs yet.

**Consequence:** Documented as deferred rather than claimed as done; `analysis_runs` is ready and unused.

---

## Open questions carried forward

| # | Question | Owner decision needed by |
|---|---|---|
| ~~Q1~~ | ~~`GWETROOT` vs `GWETPROF` vs eventual SMAP as the "soil moisture" indicator~~ — **decided:** `GWETROOT`, labelled modelled, used only in C4 | done |
| Q2 | PAU/PARC-sourced water-demand classes and irrigation requirements per crop | M3 |
| Q3 | Mungbean sowing window (currently blocks `selectable`) | M3 |
| Q4 | District boundary vs canal-command boundary for the pilot polygon | M4 |
| Q5 | Whether to show a 5-season wetness trend in v1 | M4 |
