# Field Shift

**A crop-rotation decision aid for farmers in Faisalabad district, Punjab, Pakistan — built on real NASA
Earth observations, cited local agronomy, and a refusal to guess.**

Entry for the **NASA International Space Apps Challenge 2026**, challenge
*[Field Shift: Adapting Farms with NASA Data](https://www.spaceappschallenge.org/2026/challenges/adapting-farms-with-nasa-data/)*.

> This is an independent project. It is **not** affiliated with, endorsed by, or produced by NASA or NASA
> Space Apps. NASA does not endorse any non-U.S. Government entity.

**Status:** Phase 3 complete — the deterministic decision engine is live. `POST /api/v1/compare` scores four
documented rotations from real NASA POWER evidence plus cited Punjab agronomy, explains every criterion, and
returns `insufficient_evidence` rather than a ranking when coverage is too thin. 112 automated tests pass.
See [docs/PROGRESS.md](docs/PROGRESS.md).

---

## The problem in one paragraph

A farmer with twelve acres has to commit to next season's crop months in advance. The information that
would help — how recent seasons actually behaved in *their* area, and how that fits the water demand and
calendar of each rotation they could choose — exists in NASA archives and provincial agriculture
documents, but not in a form a farmer can use. Field Shift does the translation: it pulls real
environmental data for the farm's area, lines it up against each candidate rotation's growing window, and
explains the comparison, including what it cannot conclude.

It is deliberately **not** a weather dashboard and **not** a yield predictor.

---

## What it does

1. **Pick the farm** — a point inside Faisalabad district.
2. **Describe the farm** — season, current crop, previous crop, irrigation source, optional soil values.
3. **Set priorities** — water conservation, soil health, climate resilience.
4. **Compare rotations** — at least three, always including the farmer's current practice.
5. **Read the reasoning** — supporting evidence, risks, missing information, and what the tool cannot say.
6. **Check the sources** — every value with provider, variable, unit, date range, resolution and retrieval
   time.

When the evidence is too thin, it says **"not enough evidence to compare"** and lists what is missing. That
refusal is a feature, not a failure state.

---

## Data, honestly

| Source | What it contributes | Status |
|---|---|---|
| **NASA POWER** (daily + climatology) | Rainfall, temperature, radiation, humidity, wind, modelled root-zone wetness | ✅ verified live at the pilot point |
| **ISRIC SoilGrids 2.0** | Clay/sand/organic carbon/pH context | ✅ verified live (some points return null → shown as *unknown*) |
| **NASA GIBS** (SMAP, IMERG, MODIS NDVI) | Map imagery | ✅ tiles verified (visual context only — never scored) |
| **NASA CMR** | Granule availability metadata | ✅ verified (no login) |
| **Punjab Crop Reporting Service, PAU, AARI** | Crop calendars, rotations, district statistics | ✅ documents located and cited |

**Excluded, and why:** ten resources in the official list cover only the United States or North America
(Web Soil Survey, CDL/CropScape, PRISM, SSURGO/STATSGO2, NAIP, NLCD, CoCoRaHS, NWIS, USDA Market
News/NASS, OpenET). They are documented and excluded — using them for Pakistan would misrepresent
coverage. Full per-source audit with 15 fields each: [docs/DATA_SOURCE_REGISTER.md](docs/DATA_SOURCE_REGISTER.md).

### Resolution honesty
NASA POWER is **reanalysis (MERRA-2)** on a ~0.5° cell — roughly 50 km. Every environmental value describes
the *area around* the farm, not the field. SoilGrids is a **prediction**, not a soil test. The interface
labels both at the point of use, and the engine refuses to score from 250 m NDVI over a smallholding.

---

## Decision logic in one line

A deterministic, pure TypeScript function scores five components — rainfall reliability, heat exposure,
soil-health structure, water demand vs supply, frost risk — normalised *relative to the options shown*, with
farmer priorities re-weighting them, and an **evidence gate** that blocks scoring below a coverage
threshold. Weights are explicitly **provisional**. No machine learning, no LLM at runtime, no probability
claims. Specification: [docs/DECISION_ENGINE_SPEC.md](docs/DECISION_ENGINE_SPEC.md).

---

## Stack

- **Web:** React 19 + TypeScript + Vite
- **API:** Node 24 + TypeScript + Express (+ zod validation)
- **Database:** Supabase Postgres (5 tables, RLS)
- **Shared:** zod schemas and types compiled on both sides

> **Deviation from the brief's suggested stack:** the original preference was Python/FastAPI, but this
> machine has **no working Python interpreter** (only Windows Store alias stubs). Node was already present
> and verified, so the API is TypeScript. Recorded as decision D-01 in
> [docs/DECISIONS_LOG.md](docs/DECISIONS_LOG.md).

---

## Repository layout

```
.
├── apps/
│   ├── api/            # Express API: adapters, engine, routes
│   └── web/            # React + Vite frontend
├── packages/
│   └── shared/         # zod schemas + shared types
├── docs/               # PRD, data register, engine spec, contracts, plan, progress
├── reference/          # supplied challenge PDF (gitignored)
├── .env.example        # variable names only
└── README.md
```

## Getting started

```bash
# 1. Install (Node 20+; verified on Node 24.14.0 / npm 11.9.0)
npm install

# 2. Configure (names only in .env.example — never commit real values)
cp .env.example .env
#    fill SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL

# 3. Apply the schema to your Supabase project (idempotent; skips applied versions)
npm run db:migrate --workspace @fieldshift/api

# 4. Typecheck, test, build
npm run typecheck
npm test
npm run build

# 5. Run
npm run dev:api     # http://localhost:8000/api/v1/health
npm run dev:web     # http://localhost:5173
```

### Try the evidence pipeline

```bash
curl "http://localhost:8000/api/v1/evidence?lat=31.4187&lon=73.0791&season=kharif&year=2026"\
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);
    console.log(r.request, r.point.resolvedGridPoint);
    console.log(r.sources.map(x=>`${x.id}=${x.status} cache=${x.cache}`));
    console.log(r.indicators);})'
```

Every value carries its source, unit, window and retrieval time. When a source fails, the response keeps the
others and says what is missing; when a value does not exist, it is `null` with a quality flag — never `0`.

`npm run db:migrate` connects through Supabase's IPv4 pooler when the direct database host is unreachable,
and records each applied file in `schema_migrations`.

### Compare rotations

```bash
curl -s -X POST http://localhost:8000/api/v1/compare \
  -H 'Content-Type: application/json' -d '{
    "point": {"lat": 31.4187, "lon": 73.0791},
    "season": "kharif", "planningYear": 2025,
    "currentRotationId": "wheat-cotton", "irrigation": "canal",
    "priorities": {"water": 0.6, "soilHealth": 0.2, "climateResilience": 0.2},
    "candidateRotationIds": ["wheat-cotton", "wheat-maize", "wheat-maize-mung", "wheat-rice"]
  }' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);
    console.log(r.status, "coverage", r.evidenceCoverage, "ranking", r.ranking.join(" > "));
    for (const x of r.scenarios) console.log(" ", x.scenarioId, x.index, x.confidence);
    console.log(r.globalLimitations.slice(0, 2).join("\n"));})'
```

Measured on the pilot point: `status ok`, coverage `0.8047`, `wheat-maize` 87.13, `wheat-rice` 84.12,
`wheat-cotton` 12.87 — and the mungbean rotation excluded because that crop's calendar is still unsourced.
Water demand (C4) is reported as unavailable for every option, never guessed.

No API key is needed for NASA POWER, NASA GIBS or ISRIC SoilGrids. Earthdata credentials are **optional** and
only enable deferred SMAP/IMERG numeric extraction.

---

## Documentation

| Document | Contents |
|---|---|
| [PRD](docs/PRD.md) | Product definition, personas, requirements, MVP scope, risks |
| [Challenge requirements](docs/CHALLENGE_REQUIREMENTS.md) | Official brief decomposed into testable requirements |
| [Data source register](docs/DATA_SOURCE_REGISTER.md) | All 25 resources audited + live verification log |
| [Agricultural evidence](docs/AGRICULTURAL_EVIDENCE.md) | Pilot justification, crop calendars, rotation citations |
| [Decision engine spec](docs/DECISION_ENGINE_SPEC.md) | Indicators, normalisation, weighting, evidence gate, tests |
| [Architecture](docs/ARCHITECTURE.md) | System design, adapters, security, deployment |
| [API contract](docs/API_CONTRACT.md) | Endpoints, schemas, validation, error codes |
| [Database schema](docs/DATABASE_SCHEMA.md) | DDL, constraints, RLS, migrations |
| [Test strategy](docs/TEST_STRATEGY.md) | 80+ named test cases across seven layers |
| [Implementation plan](docs/IMPLEMENTATION_PLAN.md) | M0–M6 milestones, acceptance criteria, P0–P3 backlog |
| [Decisions log](docs/DECISIONS_LOG.md) | 14 architectural decisions with rejected alternatives |
| [Progress](docs/PROGRESS.md) | Live project status, blockers, next action |
| [AI usage](docs/AI_USAGE.md) | Exactly what AI did and did not do, plus claims to re-check |

---

## Known limitations (as of Phase 2)

- **Not deployed.** Nothing has been pushed to GitHub or hosted; awaiting approval.
- **Test coverage reaches the engine but not the UI** — 112 tests cover adapters, migrations, cache,
  evidence, the decision engine (E01–E20) and the compare API. Frontend and end-to-end tests arrive with
  Phases 4–6.
- **Water demand (C4) is always unavailable** — `water_demand_class` is NULL for all six crops, so that
  component is excluded and its weight redistributed, visibly.
- **Runs are not persisted** — `runId` is returned but `GET /api/v1/runs/:id` is not implemented yet.
- **SoilGrids is intermittently slow**, so soil is often reported as unavailable rather than delaying the
  POWER evidence (measured: 1.5 s to beyond 60 s on the same day). The response says so explicitly.
- **Crop water-demand classes are unsourced**, so the water-demand component returns `null` by design until
  PAU/PARC figures are extracted (open question Q2).
- **Mungbean is not selectable** — its sowing window is not yet sourced, and the database enforces that a
  crop without a calendar cannot be offered.
- **SMAP/IMERG numeric series are not implemented** — no Earthdata credential is configured; imagery is used
  as context instead.
- **Credentials:** all secrets live only in the git-ignored `.env`; none appear in source, logs,
  documentation or the web bundle. Rotation is the project owner's decision.

---

## Licence and attribution

NASA data are provided by NASA (POWER, GIBS, CMR, NSIDC DAAC, GES DISC) under their respective open data
terms. Soil data © ISRIC — SoilGrids 2.0 (CC-BY 4.0). Local agronomic data are cited to the Government of
Punjab and Punjab Agricultural University, not republished. See
[docs/DATA_SOURCE_REGISTER.md](docs/DATA_SOURCE_REGISTER.md) for per-source terms.
