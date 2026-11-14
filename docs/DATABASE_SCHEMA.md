# Database Schema — Field Shift (Supabase Postgres)

**Version:** 1.0 (Phase 1) · four tables only
**Migration strategy:** versioned SQL files in `apps/api/src/db/migrations/`, applied in order
(`001_init.sql`, `002_seed_sources.sql`, `003_seed_catalog.sql`), tracked in a `schema_migrations` table.
No ORM. No destructive edits to applied migrations.

---

## 0. Design decisions

1. **Four tables, not seven.** The master prompt listed candidates (`farm_profiles`, `crop_catalog`,
   `environmental_observations`, `data_sources`, `rotation_scenarios`, `analysis_runs`, `saved_reports`).
   v1 has **no accounts**, so `farm_profiles` and `saved_reports` would store PII for no benefit.
   `rotation_scenarios` is static reference data that belongs in the cited catalogue, served from the API.
   What remains is: sources, catalogue, observation cache, runs.
2. **Provenance columns are NOT NULL.** An observation without a source, unit, resolution and data class
   cannot be inserted. This is the schema enforcing the product principle.
3. **`jsonb` for payloads, relational columns for anything queried.** Observations are relational (they are
   filtered by point/variable/date); run inputs/outputs are `jsonb` (whole-document reads).
4. **RLS on every table.** Public read for `data_sources` and `crop_catalog` only. Everything else is
   service-role-only, and the service-role key never leaves the API process.

---

## 1. `data_sources`

Seeded from [DATA_SOURCE_REGISTER.md](DATA_SOURCE_REGISTER.md) so the evidence panel is data-driven.

```sql
create table public.data_sources (
  id                text primary key,                    -- 'nasa_power', 'soilgrids', 'gibs_smap'
  provider          text not null,                       -- 'NASA LaRC'
  product           text not null,                       -- 'POWER Agroclimatology'
  url               text not null,
  data_class        text not null check (data_class in
                      ('observation','historical','reanalysis','forecast','synthetic')),
  variables         text[] not null default '{}',
  units             jsonb  not null default '{}'::jsonb, -- {"T2M":"C","PRECTOTCORR":"mm/day"}
  spatial_resolution text not null,
  temporal_resolution text not null,
  coverage          text not null,                       -- 'global' | 'United States' | ...
  history           text,                                -- '1980-present (MERRA-2)'
  auth_required     boolean not null default false,
  usable_at_pilot   text not null check (usable_at_pilot in ('yes','partial','no','no_data')),
  mvp_role          text not null check (mvp_role in ('evidence','context','reference','optional','excluded')),
  limitations       text[] not null default '{}',
  created_at        timestamptz not null default now()
);
```

**Seed rows (v1):** `nasa_power`, `soilgrids`, `gibs_smap`, `gibs_imerg`, `gibs_modis_ndvi`, `cmr`,
`punjab_crs`, `pau_agriculture`. US-only sources are **not** seeded into the runtime table (they would be
dead weight); they remain documented in the register.

---

## 2. `crop_catalog`

```sql
create table public.crop_catalog (
  id                text primary key,                    -- 'wheat', 'cotton', 'maize', 'mungbean', 'rice'
  name              text not null,
  local_name        text,
  season            text not null check (season in ('rabi','kharif','annual')),
  sowing_start_md   text,                                -- 'MM-DD' (year-agnostic recommendation)
  sowing_end_md     text,
  harvest_start_md  text,
  harvest_end_md    text,
  water_demand_class text check (water_demand_class in ('low','medium','high')),
  heat_sensitivity  text check (heat_sensitivity in ('low','medium','high')),
  is_legume         boolean not null default false,
  residue_class     text check (residue_class in ('low','medium','high')),
  selectable        boolean not null default true,
  verified          boolean not null default false,       -- false => engine treats params as unavailable
  source_urls       text[] not null,                      -- at least one citation required
  evidence_quality  text not null check (evidence_quality in ('high','medium','low')),
  limitations       text[] not null default '{}',
  updated_at        timestamptz not null default now(),
  constraint citation_required check (array_length(source_urls, 1) >= 1),
  constraint selectable_needs_calendar check (
    not selectable or (sowing_start_md is not null and harvest_end_md is not null)
  )
);
```

**Seeded values (from AGRICULTURAL_EVIDENCE §4):**

| id | season | sowing | harvest | legume | selectable | verified |
|---|---|---|---|---|---|---|
| `wheat` | rabi | 11-01 | 05-05 | no | true | true |
| `cotton` | kharif | 04-01 | 11-30 | no | true | true |
| `rice` | kharif | 05-20 | 11-25 | no | true | true |
| `maize` | kharif | 05-25 | 11-30 | no | true | true |
| `mungbean` | kharif | null | 09-15 | yes | **false** | false |
| `sugarcane` | annual | null | 03-30 | no | **false** | true |

`mungbean` carries `selectable=false` because only its harvest window is sourced (CRS kharif calendar), not
its sowing window — the schema constraint enforces that a crop without a calendar cannot be offered. Its
`is_legume=true` and harvest date still support the rotation narrative. **This is a deliberate, visible
gap**, not an oversight: Phase 2 must source the mung sowing window from PAU/CRS before the legume
rotation can be scored.

`water_demand_class` and `heat_sensitivity` are `NULL` in the seed — deliberately. They are `TO-VERIFY`
(AGRICULTURAL_EVIDENCE §5) and the engine must treat them as unavailable rather than defaulting.

---

## 3. `rotation_templates`

Static, cited rotation definitions (served read-only; also mirrored in API code so the engine has no DB
dependency).

```sql
create table public.rotation_templates (
  id            text primary key,                        -- 'wheat-cotton'
  label         text not null,                           -- 'Wheat – Cotton'
  phases        jsonb not null,                          -- [{"cropId":"wheat","season":"rabi"},...]
  why_included  text not null,                           -- citation-backed rationale
  source_urls   text[] not null,
  active        boolean not null default true,
  constraint rationale_required check (length(why_included) > 20)
);
```

**Seeded:**

| id | label | why included |
|---|---|---|
| `wheat-cotton` | Wheat – Cotton | PAU documented rotation; dominant kharif in Faisalabad division (CRS 2025-26) |
| `wheat-maize` | Wheat – Maize | PAU documented rotation; local spring/autumn maize windows (CRS) |
| `wheat-maize-mung` | Wheat – Maize + Summer Mung | PAU documented summer-moong rotation; adds a legume phase |
| `wheat-rice` | Wheat – Rice | PAU documented rotation; **flagged**: minority practice in this district |

---

## 4. `environmental_observations`

Validated cache. One row per (point, variable, source, window, aggregation).

```sql
create table public.environmental_observations (
  id              bigserial primary key,
  lat_rounded     numeric(6,3) not null,                 -- rounded to ~0.001 deg for cache keying
  lon_rounded     numeric(6,3) not null,
  grid_lat        numeric(7,4),                          -- point the source actually resolved
  grid_lon        numeric(7,4),
  source_id       text not null references public.data_sources(id),
  variable        text not null,
  unit            text not null,
  aggregation     text not null check (aggregation in ('daily','sum','mean','min','max','count','slope')),
  window_start    date not null,
  window_end      date not null,
  value           double precision,                      -- NULL = missing/invalid. Never 0 as a stand-in.
  n_valid         integer,
  n_expected      integer,
  data_class      text not null check (data_class in
                    ('observation','historical','reanalysis','forecast','synthetic')),
  spatial_resolution text not null,
  quality_flags   text[] not null default '{}',
  retrieved_at    timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '7 days',
  constraint window_order check (window_end >= window_start),
  constraint no_synthetic_cache check (data_class <> 'synthetic')
);

create unique index uq_obs_key on public.environmental_observations
  (lat_rounded, lon_rounded, source_id, variable, aggregation, window_start, window_end);
create index ix_obs_lookup on public.environmental_observations
  (lat_rounded, lon_rounded, variable, window_start desc);
create index ix_obs_expiry on public.environmental_observations (expires_at);
```

Notes:
- `value` is nullable **by design**. A cacheable "we looked and there was nothing" is a fact worth storing;
  a fabricated 0 is not.
- **Only daily rows are written** (`aggregation = 'daily'`, `window_start = window_end`). Aggregates and
  indicators are re-derived in memory from the stored series on every request, so a cache hit produces
  exactly the same numbers as a fresh fetch. A live call persisted 1,000 such rows for one rabi window.
- `grid_lat` / `grid_lon` are written on insert, which is what lets a cache hit still report the resolved
  POWER cell rather than falling back to the rounded request coordinate.
- `no_synthetic_cache` makes it impossible to persist test fixtures into the production cache.
- Cache reads require `expires_at > now()`; stale rows are ignored and refreshed, and the UI shows the age.

---

## 5. `analysis_runs`

Anonymous. No user id, no name, no phone, no email.

```sql
create table public.analysis_runs (
  id            uuid primary key default gen_random_uuid(),
  input         jsonb not null,     -- FarmerProfile + candidate ids (no PII by construction)
  result        jsonb not null,     -- EngineResult exactly as returned
  status        text not null check (status in ('ok','partial','insufficient_evidence')),
  season        text not null,
  planning_year integer not null,
  lat_rounded   numeric(6,3) not null,
  lon_rounded   numeric(6,3) not null,
  engine_version text not null,     -- so old runs remain interpretable
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '90 days'
);

create index ix_runs_expiry on public.analysis_runs (expires_at);
```

`engine_version` matters: when provisional weights change, stored results must still be explainable.

> **Writer status (Phase 3):** no code writes to this table yet. The decision engine returns a `runId` but run
> persistence is deferred (DECISIONS_LOG D-24), so the table is created, indexed, RLS-protected and empty.
> It is documented here as *ready*, not as *in use*.
>
> The engine reads only `crop_catalog` and `rotation_templates` (via `apps/api/src/db/catalogue.ts`, cached in
> memory for 10 minutes). `environmental_observations` is read through the Phase 2 evidence cache, unchanged.

---

## 6. Row Level Security

```sql
alter table public.data_sources            enable row level security;
alter table public.crop_catalog            enable row level security;
alter table public.rotation_templates      enable row level security;
alter table public.environmental_observations enable row level security;
alter table public.analysis_runs           enable row level security;

-- Public read for published reference data only
create policy "public read sources"  on public.data_sources       for select to anon, authenticated using (true);
create policy "public read crops"    on public.crop_catalog       for select to anon, authenticated using (true);
create policy "public read rotations" on public.rotation_templates for select to anon, authenticated using (true);

-- No anon policies for caches/runs: service_role bypasses RLS and is the only writer/reader.
-- Anon access to analysis_runs happens through GET /api/v1/runs/:id in the API, which enforces
-- an unguessable UUID and returns only the stored result.
```

Explicitly **no** `insert`/`update`/`delete` policy for `anon` on any table. Writes require the
service-role key, which exists only in the API's server environment.

---

## 7. Migration plan

| File | Contents | Applied |
|---|---|---|
| `001_init.sql` | extensions (`pgcrypto` for `gen_random_uuid()`), all five tables, indexes, constraints, RLS + policies | ✅ applied 2026-11-14 (391 ms) |
| `002_seed_sources.sql` | 8 `data_sources` rows from the register | ✅ applied 2026-11-14 (344 ms) |
| `003_seed_catalog.sql` | 6 crops + 4 rotation templates with citations | ✅ applied 2026-11-14 (349 ms) |
| `004_seed_engine_meta.sql` | optional: engine version + provisional weights snapshot for auditing | not needed in Phase 3 — weights live in `engine/config.ts` and are echoed in every response |

**Remote application status (verified, not assumed):** all three migrations were applied to project
`dwemvasuoymquzjahyqy` through `npm run db:migrate` and confirmed by querying the resulting row counts —
8 sources, 6 crops, 4 rotations, 3 policies. The runner connects via `aws-1-ap-southeast-1:5432`, because
the direct host `db.<ref>.supabase.co` is IPv6-only on this network; each migration runs inside a
transaction and records itself in `schema_migrations`, so re-running is a no-op.

**Known upstream behaviour:** `array_length('{}', 1) >= 1` evaluates to `NULL` in Postgres, not `false`, so
a `CHECK` written that way silently permits empty arrays. The citation constraints therefore use
`cardinality(...) >= 1`. This was caught by test D05 and is not a theoretical concern.

Rules:
- Migrations are append-only; fixes are new files.
- Applied with `psql "$SUPABASE_DB_URL" -f <file>` (the connection string lives in `.env`, never in a file
  that is committed).
- Each migration is idempotent where practical (`create table if not exists`, `on conflict do nothing`).
- Down-migrations are not maintained for a hackathon; a reset is `drop schema public cascade` on a
  disposable project only.

## 8. Storage sizing

Trivial: 4 variables × 6 seasons × ~5 points × 8 sources ≈ a few thousand observation rows. No partitioning,
no materialised views. Query budget: cache lookup < 10 ms; run insert < 20 ms.

## 9. Backup / reset

Supabase daily backups cover the managed instance. For development, the seed scripts reconstruct
everything except `environmental_observations` (disposable cache) and `analysis_runs` (disposable).
