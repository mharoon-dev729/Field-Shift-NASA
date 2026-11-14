# Test Strategy — Field Shift

**Version:** 1.0 (Phase 1)
**Principle:** the tests exist to prove the thing we claim most loudly — that a failed or missing data
request never becomes a fabricated result.

---

## 1. Test pyramid

| Layer | Tool | Count target | Runtime | What it protects |
|---|---|---|---|---|
| Unit — engine | Vitest | ~45 | < 1 s | Scoring, normalisation, evidence gate, determinism |
| Unit — adapters/validators | Vitest | ~30 | < 2 s | Unit assertion, fill-value handling, date/coverage rules |
| Contract / schema | Vitest + zod | ~15 | < 1 s | Shared types ↔ handlers ↔ docs |
| Integration — API | Vitest + Supertest | ~20 | ~10 s | Routes, error envelopes, CORS, partial failure |
| Integration — Supabase | Vitest against a test project | ~8 | ~10 s | Migrations, constraints, RLS denials |
| Component — web | Vitest + Testing Library | ~15 | ~5 s | Priority sliders, insufficient-evidence rendering |
| E2E | Playwright | 3 journeys | ~60 s | The vertical slice survives real wiring |
| Live smoke (opt-in, manual) | Script | 5 checks | ~20 s | Sources still behave as audited |

**No network in the default test run.** Adapters are tested against recorded fixtures; the live smoke script
is separate and never part of CI gating, so an upstream outage cannot turn the suite red.

---

## 2. Unit tests — decision engine

Fixtures are hand-built `Observation` objects. They are **explicitly labelled synthetic** and exist only in
test files under `fixtures/`, never in `src/`.

| ID | Test | Assertion |
|---|---|---|
| E01 | All components available, 4 candidates | `status:"ok"`, 4 indices in [0,100], `confidence:"moderate"` |
| E02 | Same input twice | Output JSON identical except `runId`, `generatedAt` |
| E03 | `-999` fill values on all precipitation days | C1 `available:false`, `sub:null` (not 0) |
| E04 | All observations `null` | `status:"insufficient_evidence"`, `ranking:[]` |
| E05 | Evidence coverage 0.5 | index present, `confidence:"low"`, caveat in `limitations` |
| E06 | Evidence coverage 0.2 | no index, missing list names each gap |
| E07 | Two scenarios within 4.9 index points | `difference_not_meaningful` flag set |
| E08 | Priority change water→soil with soil evidence present | ranking order changes; explanation strings differ |
| E09 | Priority change but C3 unavailable | ranking unchanged; `redistributed:["C3"]`; warning present |
| E10 | `waterDemandClass:null` | C4 unavailable; no default substituted (assert on `raw`) |
| E11 | Weight normalisation: inputs 0.6/0.2/0.2 | effective weights sum to 1 (±1e-9) |
| E12 | All-zero priorities | throws `ValidationError` (engine refuses to run) |
| E13 | Rabi | C5 in component set |
| E14 | Kharif | C5 absent; remaining weights renormalised |
| E15 | One extreme outlier scenario | min–max maps it to 1.0 and the others spread [0,1); no NaN |
| E16 | Identical raw values across scenarios | all subs = 0.5; no division by zero |
| E17 | `dataClass:"synthetic"` with `test:false` | throws `SyntheticDataRejected` |
| E18 | Empty candidate array | throws `ValidationError` |
| E19 | Baseline missing from candidates | throws `ValidationError` |
| E20 | Scenario with 0 available components | `index:null`, `confidence:"insufficient_evidence"`, not ranked |

**Property-based tests (fast-check), engine:** for arbitrary valid inputs —
- index is always within [0,100] or null;
- `ranking` is a permutation of scoreable scenario ids;
- normalised priorities always sum to 1;
- no `NaN`/`Infinity` ever appears in output.

---

**Implementation status (Phase 3):** E01–E20 are implemented in `apps/api/test/engine.test.ts` (30 tests,
all passing) against hand-built fixtures in `test/helpers/engine-fixtures.ts`. The fixtures are explicitly
labelled as invented values and never presented as NASA observations; E17 asserts that a `synthetic`
dataClass is rejected unless the run is an explicit test run.

Two cases needed engineered inputs to hit the intended band, and this is recorded rather than glossed over:

| Case | How the fixture reaches it |
|---|---|
| E05 (coverage 0.35–0.6) | C1 and C2 removed (null precipitation and maximum temperature), C3 + C4 available via fixture demand classes ⇒ coverage ≈ 0.42, `confidence:"low"` |
| E08 (water→soil flip) | Climatology normal removed so C1 is monotonic in dry spells; the legume rotation is given a dry window and cotton a wet one, so the ranking flips when the priority changes |

The property-based fast-check tests described below are **not** implemented yet; deterministic example
cases cover index bounds, permutation and NaN absence instead.

API-level coverage lives in `test/compare-api.test.ts` (7 tests): schema validation (zero priorities, baseline
not in candidates, unknown rotation, unknown field), eligibility filtering (mungbean rotation excluded with a
reason), provenance presence, and a 200 `insufficient_evidence` when every source fails.

## 3. Unit tests — adapters and validation

| ID | Test | Assertion |
|---|---|---|
| A01 | POWER response with `fill_value: -999.0` | those days → `null`; `qualityFlags` counts them |
| A02 | POWER `T2M` unit `K` | `UnitMismatchError`; no silent conversion |
| A03 | POWER geometry returns a different grid point | stored as `grid_lat/grid_lon`, tolerance enforced (±0.625 lon, ±0.5 lat) |
| A04 | POWER `parameters` metadata missing | `SOURCE_INVALID_RESPONSE` (cannot assert units) |
| A05 | Date range 1975 | `OUT_OF_COVERAGE` before any request is made |
| A06 | Date range ending in the future | clamped to last complete day; flagged |
| A07 | SoilGrids all-null mean | `Observation.value = null`, flag `no_data` |
| A08 | SoilGrids invalid depth label (`0-30cm`) — the mistake I made during the audit | rejected by the adapter's allowed-depth list |
| A09 | SoilGrids returns `unit_measure.d_factor` | value converted exactly once; no double-scaling |
| A10 | GIBS URL builder | produces a template whose constructed sample URL returns 200 (recorded check) |
| A11 | GIBS builder for MODIS NDVI | row/col derived from the TileMatrixSet, not hardcoded (regression for the 400 seen in the audit) |
| A12 | CMR zero granules | returns `{available:false}` metadata; does not throw |
| A13 | HTTP 429 with `Retry-After` | one retry after the delay; then `RATE_LIMITED` |
| A14 | Timeout at 20 s | `SOURCE_UNAVAILABLE`, retryable flag |
| A15 | Upstream returns HTML error page | parsed as `SOURCE_INVALID_RESPONSE`, body never echoed |
| A16 | Coordinate NaN / string / out of range | `VALIDATION_ERROR` before outbound call |

---

**Implementation status (Phase 2):** A01–A16 are implemented in `apps/api/test/adapters.test.ts`,
`test/evidence.test.ts` and `test/api.test.ts` and all pass. A10/A11 assert the URL construction and
tile maths; the resulting URLs were additionally fetched once by hand and returned `200 image/png`
(SMAP 7,091 B; IMERG 1,537 B; NDVI 45,076 B), so no test performs a live network call.

## 4. Contract tests

| ID | Test |
|---|---|
| C01 | Every route response parses against its `packages/shared` schema |
| C02 | Request schema rejects unknown fields (strict) |
| C03 | Error envelope shape is identical across all error codes |
| C04 | No environmental number in a response lacks `sourceId` **or** `unit` (recursive walk) |
| C05 | `docs/API_CONTRACT.md` JSON examples parse against the same schemas |
| C06 | `EngineResult` type in shared matches engine return type (compile-time + runtime sample) |

---

**Implementation status (Phase 3):** `/compare` is covered by `test/compare-api.test.ts`. Contract check C01 is
satisfied for this endpoint: every test response is parsed with `engineResultSchema` from `packages/shared`.

## 5. API integration tests

| ID | Test | Assertion |
|---|---|---|
| I01 | `GET /health` with DB up | 200, `status:"ok"` |
| I02 | `GET /health` with DB unreachable (stubbed) | 503, `status:"down"` |
| I03 | `GET /evidence` valid point | 200; observations carry units/sources; imagery marked context-only |
| I04 | `GET /evidence` point outside pilot | 422, `nearestValidPoint` present |
| I05 | `POST /compare` happy path | 200; `indexLabel` present; `weighting.provisional === true` |
| I06 | `POST /compare` POWER down, SoilGrids up | 200 with `status:"partial"` or `insufficient_evidence`; **never** invented rainfall |
| I07 | `POST /compare` priorities sum ≠ 1 | 200, echoed normalised values sum to 1 |
| I08 | `POST /compare` priorities all zero | 400 |
| I09 | `POST /compare` unknown rotation id | 400 |
| I10 | Foreign `Origin` header | no `Access-Control-Allow-Origin` echo; browser would block |
| I11 | Allowed `Origin` | correct ACAO + `Vary: Origin` |
| I12 | Rate limit exceeded | 429 with `Retry-After` |
| I13 | `GET /runs/:id` random UUID | 404, no enumeration, no timing oracle on validity |
| I14 | `POST /compare` with a 300 KB body | 413 or 400, not a crash |
| I15 | Logs during `/compare` | contain no `apikey`, `password`, `authorization`, or soil values |

---

## 6. Supabase integration tests

| ID | Test | Assertion |
|---|---|---|
| D01 | `001_init.sql` applies to a clean project | all tables/constraints/indexes exist |
| D02 | Insert observation with `data_class='synthetic'` | constraint violation |
| D03 | Insert observation with NULL `unit` | not-null violation |
| D04 | Duplicate observation key | unique violation |
| D05 | Insert crop with empty `source_urls` | `citation_required` violation |
| D06 | Insert `selectable=true` crop without calendar | `selectable_needs_calendar` violation |
| D07 | Anon `select` on `data_sources` | allowed |
| D08 | Anon `select` on `environmental_observations` / `analysis_runs` | denied |
| D09 | Anon `insert` on any table | denied |
| D10 | `expires_at` filtering | cache reader ignores expired rows |
| D11 | Seeds are idempotent | running `002`/`003` twice leaves 8 sources / 6 crops |

---

**Implementation status (Phase 2):** D01–D06 and D10–D11 run against real PostgreSQL (PGlite) in
`test/migrations.test.ts`; D07–D09 assert both the policy configuration and runtime behaviour
(`set role anon`, then verify reads succeed on published tables and inserts fail). Live confirmation on the
hosted project: anon read of `data_sources`/`crop_catalog`/`rotation_templates` returned rows, anon `insert`
returned `401 / 42501`, and anon read of `environmental_observations` returned 0 rows.

Current totals: **6 files, 75 tests, 75 passing, 0 failing** (`npm test`, ~3.7 s).

## 7. Frontend component tests

| ID | Test |
|---|---|
| W01 | Priority sliders keep the sum at 1 and show the effect on ranking |
| W02 | All-zero priorities blocks submission with an explanation |
| W03 | `insufficient_evidence` state renders the missing list and **no** index, no "winner" badge |
| W04 | `difference_not_meaningful` renders the caveat instead of a recommendation |
| W05 | Soil "I don't know" path shows "unavailable" — never a numeric pH |
| W06 | Reanalysis label appears next to every POWER-derived value |
| W07 | Evidence panel lists source, variable, unit, window, resolution, retrieval time |
| W08 | Keyboard-only journey reaches comparison (focus order, no traps) |
| W09 | Contrast and labels on the comparison table (axe rule subset) |
| W10 | 360 px viewport: comparison is readable, no horizontal scroll |

---

## 8. End-to-end (Playwright, 3 journeys)

1. **Happy path** — land → pick Faisalabad point → wheat/cotton → priorities "save water" → compare →
   open a scenario → open evidence panel → see NASA POWER row with units and window.
2. **Honest degradation** — same, with POWER blocked via route interception → comparison shows
   insufficient evidence, names the failed source, shows no numbers.
3. **Priority shift** — compare with "save water", then "build soil" → ranking or explanation changes,
   no crash, state preserved.

---

## 9. Live smoke script (manual, not CI)

`npm run smoke` — hits the real endpoints once and prints a pass/fail table:

1. POWER daily returns ≥ 1 day of non-fill `T2M` and `PRECTOTCORR` for the pilot point.
2. POWER climatology returns 12 monthly values.
3. SoilGrids returns non-null clay at the primary rural anchor point **or** explicitly reports null.
4. GIBS returns 200 image/png for the SMAP and IMERG 2 km tiles for a recent date.
5. CMR returns ≥ 1 SMAP granule over the pilot bbox for a known date.

Expected outcomes are the *observations* recorded in the data register Appendix A. If real behaviour
deviates, the register and the smoke script must be updated together.

---

## 10. Determinism and data-integrity guards

- **Golden-file test:** a recorded `EngineInput` fixture produces a committed `EngineResult` snapshot; any
  arithmetic change fails the test until the snapshot and the spec are updated together.
- **No-synthetic-in-prod test:** the API refuses `dataClass:"synthetic"` when
  `ALLOW_SYNTHETIC_FIXTURES=false` (default), asserted at the adapter boundary and at engine entry.
- **Provenance walk:** response-level test asserting every numeric environmental value resolves to a
  `data_sources.id` present in the DB seed.
- **Docs drift:** a script asserts every `docs/*.md` internal link resolves and that the file list required
  by the master prompt exists.

---

## 11. CI plan (Phase 5)

```
npm ci
npm run typecheck          # tsc --noEmit across workspaces
npm run lint               # eslint, incl. engine import-boundary rule
npm test                   # unit + contract + component (no network)
npm run test:integration   # requires a disposable Supabase project + env
npm run build              # api + web production build
```

E2E runs on the PR to `main` only. Live smoke never blocks a merge.

---

## 12. Coverage policy

- **Thresholds:** engine `≥ 95 %` lines/branches; adapters `≥ 85 %`; API routes `≥ 80 %`; web components
  `≥ 60 %`. Enforced in Phase 5, not Phase 1.
- **Not chased:** 100 % UI coverage, or tests for static copy. A test that only re-asserts a constant is
  noise.
- **Explicitly untested by automation:** whether a rotation is *agronomically* right for a specific farmer.
  That is a domain question the product answers by citing sources and refusing to guess — no test can
  certify it.

---

## 13. What could still go wrong despite these tests

| Risk | Why tests do not catch it | Mitigation |
|---|---|---|
| POWER revision changes values historically | Fixtures encode old values | Version note in `data_sources`, retrieval timestamps surfaced |
| SoilGrids silently changes null behaviour | Nulls treated as valid "unknown" | Smoke script asserts the null *and* non-null cases |
| Provisional weights read as science | Tests assert arithmetic, not meaning | UI banner + docs + decisions log |
| Judge expects an ML model | No test measures expectation | README and demo script explain the deliberate choice |
