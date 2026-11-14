# Architecture — Field Shift

**Version:** 1.0 (Phase 1)
**Status:** Approved for Phase 2 scaffold (decision D-01, D-02 in [DECISIONS_LOG.md](DECISIONS_LOG.md))

---

## 1. Environment findings that shaped the design

Inspected on the target machine (`D:\Field Shift NASA`, 2026-11-14):

| Finding | Consequence |
|---|---|
| Node **v24.14.0**, npm **11.9.0** present | TypeScript stack viable |
| **No working Python interpreter** — `python`/`python3` resolve only to Windows Store
  alias stubs under `AppData\Local\Microsoft\WindowsApps`; `py -3 --version` returns nothing | **FastAPI is not viable without an install the user did not ask for** |
| Git 2.56 present, **no git repository initialised** in the project folder | `git init` is Phase 2, on approval |
| GitHub repo `mharoon-dev729/Field-Shift-NASA` exists and is **empty** (API: "This repository is empty") | First push will initialise history |
| `reference/Resources of NASA Data.pdf` present (135,691 B, Skia-generated, 5 pp.) | Source audit completed (see register) |
| `.freebuff/` and `.cloud-attachments/` present | Tool state; gitignored |

**Stack decision: Node + TypeScript end-to-end.** The brief's preferred stack (React + Vite + FastAPI)
would require installing Python and a virtualenv, introducing a second language, a second dependency
manager and a second deployment surface for a solo entrant inside a hackathon window. Node gives the same
capability (HTTP client, JSON validation, Postgres access) with one toolchain. This is recorded as an
architectural deviation with its reason, per the master prompt's instruction to document such changes.

**Evidence the stack works:** `node --version` → `v24.14.0`; `npm --version` → `11.9.0`; all Phase 1 data
verification was performed with Node/`curl` from this machine.

---

## 2. System shape

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Browser (React + TS + Vite)                                              │
│  Landing → Location → Farm → Crops → Soil → Priorities → Compare         │
│  Evidence panel · Scenario detail · GIBS map overlay                     │
└───────────────┬──────────────────────────────────────────────────────────┘
                │  JSON over HTTPS (typed client, zod-validated)
┌───────────────▼──────────────────────────────────────────────────────────┐
│ API (Express + TS, single process)                                       │
│  ┌────────────┐ ┌──────────────┐ ┌─────────────┐ ┌───────────────────┐  │
│  │  routes    │→│  services    │→│  adapters   │→│  external sources │  │
│  │  (HTTP)    │ │  (orchestr.) │ │  (fetch+map)│ │  POWER, SoilGrids,│  │
│  └────────────┘ └──────┬───────┘ └─────────────┘ │  GIBS, CMR        │  │
│                        │                          └───────────────────┘  │
│                 ┌──────▼───────┐  ┌──────────────┐                       │
│                 │ engine (pure)│  │ cache/repo   │                       │
│                 │ C1..C5       │  │ (Supabase)   │                       │
│                 └──────────────┘  └──────────────┘                       │
└──────────────────────────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────────┐
│ Supabase (Postgres + RLS): data_sources · crop_catalog ·                 │
│ environmental_observations (cache) · analysis_runs                       │
└──────────────────────────────────────────────────────────────────────────┘
```

**One deployable API, one static frontend, one managed Postgres.** No microservices, no queue, no worker
process in v1. Caching happens inline on request with a database-backed TTL — the volumes are tiny (a
handful of points × variables × seasons).

---

## 3. Repository layout

```
field-shift/
├── package.json                 # npm workspaces root + scripts
├── tsconfig.base.json
├── .env.example                 # names only
├── .gitignore
├── README.md
├── docs/                        # this documentation set
├── reference/                   # supplied challenge PDF (gitignored)
├── packages/
│   └── shared/                  # types shared by web + api (zod schemas, DTOs)
│       └── src/
│           ├── types.ts         # Observation, EngineResult, DTOs
│           └── schemas.ts       # zod request/response schemas
└── apps/
    ├── api/
    │   └── src/
    │       ├── index.ts         # server bootstrap
    │       ├── config.ts        # env parsing (fails fast, never logs secrets)
    │       ├── routes/          # health, location, crops, evidence, compare, sources
    │       ├── services/        # orchestration, caching, validation
    │       ├── adapters/        # power.ts, soilgrids.ts, gibs.ts, cmr.ts
    │       ├── engine/          # pure decision engine (no I/O)
    │       │   ├── compare.ts
    │       │   ├── components.ts
    │       │   ├── normalize.ts
    │       │   ├── explain.ts
    │       │   └── config.ts    # provisional weights + thresholds
    │       ├── catalog/         # crop catalogue + rotations (cited)
    │       └── db/              # supabase client, repositories, migrations ref
    └── web/
        └── src/
            ├── main.tsx
            ├── routes/           # journey screens
            ├── components/       # EvidencePanel, ScenarioCard, PrioritySliders…
            ├── api/              # typed client
            └── styles/
```

Rationale for a monorepo at this size: one `npm install`, one lockfile, shared types that make the API
contract compile-time-checked on both sides. It is *not* an invitation to add packages — three
workspaces is the ceiling.

---

## 4. API layer

### 4.1 Routing style
Thin route handlers: parse + validate (zod) → call a service → shape response. No business logic in
routes. No SQL in routes.

### 4.2 Validation
Every request body/query is parsed by a zod schema from `packages/shared`. Validation errors return
`400` with field-level detail. Unknown fields are rejected (strict schemas) to prevent silent client bugs.

### 4.3 Error envelope
```json
{ "error": { "code": "SOURCE_UNAVAILABLE", "message": "NASA POWER did not respond.",
             "details": { "sourceId": "nasa_power", "retryable": true } } }
```
Codes: `VALIDATION_ERROR`, `OUT_OF_COVERAGE`, `SOURCE_UNAVAILABLE`, `SOURCE_INVALID_RESPONSE`,
`INSUFFICIENT_EVIDENCE`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL`. Upstream HTML/stack traces never reach
the client.

### 4.4 Timeouts and retries
Per-source budget: POWER 20 s, SoilGrids 15 s, CMR 15 s. One retry with jitter for idempotent GETs.
Node's built-in `AbortSignal.timeout`. No retry on 4xx (except 429 with `Retry-After`).

### 4.5 CORS
Explicit allowlist from `CORS_ALLOWED_ORIGINS`, no wildcard with credentials, `OPTIONS` preflight handled,
`Vary: Origin`.

---

## 5. Data-source adapters

One module per external system, each exposing:

```ts
interface SourceAdapter<TRaw, TNormalized> {
  id: string;                      // "nasa_power"
  fetch(params): Promise<TRaw>;    // raw HTTP, with timeout
  validate(raw): TRaw;             // throws on unit/shape/coverage problems
  normalize(raw, ctx): TNormalized;// -> Observation[]
  metadata: SourceMetadata;        // provider, product, url, resolution, dataClass
}
```

Adapters never compute indicators and never touch the engine. They may only return `Observation` records
or throw typed errors. This is what makes "no fabricated data" enforceable in code review: if it is not in
an `Observation`, the engine cannot see it.

### 5.1 NASA POWER adapter
- Endpoints: `/api/temporal/daily/point`, `/api/temporal/climatology/point`.
- Parameters: `T2M`, `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `RH2M`, `ALLSKY_SFC_SW_DWN`, `WS2M`,
  `GWETROOT`, `GWETPROF`; `community=AG`; `format=JSON`.
- Validation: `header.fill_value` respected; units read from the response's own `parameters` block and
  asserted; geometry returned is the *actual* grid point and is stored, not assumed.
- `dataClass: "reanalysis"` (MERRA-2), with `header.sources` preserved verbatim.
- Verified live (see DATA_SOURCE_REGISTER Appendix A).

### 5.2 SoilGrids adapter
- `GET https://rest.isric.org/soilgrids/v2.0/properties/query?lon&lat&property=…&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean&value=uncertainty`
- `null` → `Observation.value = null` with `qualityFlags:["no_data"]`.
- `dataClass: "observation"` (digital soil map prediction — flagged `predicted: true` in metadata).

### 5.3 GIBS adapter (imagery only)
- Builds WMTS `KVP`/REST tile URLs for `SMAP_L3_Passive_Enhanced_Day_Soil_Moisture`,
  `IMERG_Precipitation_Rate`, `MODIS_Terra_NDVI_8Day` using the tile matrix from the capabilities
  document (2 km for SMAP/IMERG; 250 m for NDVI).
- Returns URLs + attribution strings to the client; **emits no numeric observations**, so imagery can
  never enter the engine.
- Known gap: NDVI tile row/col derivation must be computed from the TileMatrixSet in Phase 2 (my first
  hand-built path returned 400).

### 5.4 CMR adapter
- Metadata-only: confirms a product actually has granules over the farm for the requested dates, used in
  the evidence panel ("NASA SMAP has 1 granule over this area for 2025-06-01").
- No download in v1 (Earthdata credentials not configured).

### 5.5 Deferred adapters
HLS/Landsat, ECOSTRESS, GEDI, SRTM tiles, ERA5, GAEZ — interfaces reserved, not implemented. Each needs a
credentialed, raster-capable pipeline that would not fit the MVP.

---

## 6. Decision engine module

Pure, synchronous, dependency-free TypeScript in `apps/api/src/engine/`:

| File | Responsibility |
|---|---|
| `components.ts` | C1–C5 raw computation from `Observation[]` + catalogue attributes |
| `normalize.ts` | min–max / ordinal / boolean normalisation with direction |
| `compare.ts` | orchestration, weighting, evidence gate, ranking |
| `explain.ts` | deterministic template strings |
| `config.ts` | provisional weights and thresholds, single source of truth |

Import boundary enforced by convention + lint: `engine/` may not import `adapters/`, `db/`, or `fetch`.
That keeps it testable with plain fixtures and guarantees determinism.

Specification: [DECISION_ENGINE_SPEC.md](DECISION_ENGINE_SPEC.md).

---

## 7. Database

Supabase Postgres. Four tables (full DDL in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)):

| Table | Purpose |
|---|---|
| `data_sources` | provenance catalogue seeded from the data register |
| `crop_catalog` | crops with calendars, parameters, citations, `verified` flag |
| `environmental_observations` | validated observation cache keyed by point/variable/window |
| `analysis_runs` | stored input + output of a comparison (anonymous, opaque id) |

**No user PII in v1.** No auth in v1, therefore RLS policies are written for the read-only published
catalogue + server-only access to caches; the service-role key is used exclusively server-side.

---

## 8. Frontend

- **React 19 + TypeScript + Vite**, React Router, no state library (React context + URL state).
- **Charts:** one lightweight library (Recharts or Chart.js) — chosen in Phase 4 when the chart shape is
  known; not installed speculatively.
- **Map:** Leaflet with an OSM/NASA GIBS tile layer for location selection; no API key required.
- **Journey as routes** so back/forward works and any step is linkable.
- **Data fetching:** TanStack Query *or* a 40-line hook — decided in Phase 3 based on need; the journey
  has ~6 fetches, so no framework is assumed now.
- **Accessibility:** semantic forms, labelled inputs, focus rings, no colour-only ranking; index shown as
  a number *and* a text confidence label.
- **Honesty UI:** a persistent, dismissible-once banner: *"Environmental values describe the area around
  your farm (NASA POWER ~50 km grid). Soil is a regional prediction. This tool is independent of NASA."*

---

## 9. Security posture

| Concern | Control |
|---|---|
| Secrets | `.env` gitignored; `.env.example` names only; server-side env parsed once, never logged |
| Supabase | service-role key only in API process; anon key never needed in v1 (no client-side DB access) |
| Input | zod strict schemas server-side; coordinate/dates/enums validated before any outbound call |
| CORS | explicit allowlist |
| Logging | structured, redacts `authorization`, `apikey`, `password`; no request bodies with soil/PII in production logs |
| Error surfaces | no upstream payloads, no stack traces |
| RLS | enabled on every table; public read only for `data_sources` and `crop_catalog` |
| Rate limits | per-IP token bucket on `/compare` and `/evidence` (upstream goodwill + cost control) |

---

## 10. Deployment (planned, not performed)

| Piece | Target | Note |
|---|---|---|
| API | Container host (Render/Railway/Fly) or Cloud Run — Node 24 | Needs outbound HTTPS to POWER/SoilGrids/GIBS/CMR and to Supabase |
| Web | Static hosting (Vercel/Netlify/Cloudflare Pages) | `VITE_API_BASE_URL` at build time |
| DB | Supabase (existing project) | migrations checked in |

**Not deployed in Phase 1.** No push, no deploy without explicit approval (master prompt §17).

---

## 11. Architectural constraints (deliberate)

1. **One process, one database.** No queue, no cron, no worker. Caching is request-scoped.
2. **No client-side data fetching from NASA.** All external calls go through the API so validation,
   caching, rate limiting and provenance are server-enforced, and so keys never reach the browser.
3. **The engine must stay pure.** If a computation needs data, it arrives as an `Observation`.
4. **No synthetic data path to the UI.** A single boolean gate (`ALLOW_SYNTHETIC_FIXTURES`) exists for
   tests, and it is off by default.
5. **Adapters are replaceable.** Adding SMAP numerics later must not require touching `engine/`.
6. **Every displayed number is resolvable to a `data_sources` row.** If it is not, it is a bug.
