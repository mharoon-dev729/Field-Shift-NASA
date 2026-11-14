-- =============================================================================
-- Field Shift — 001_init
-- Schema per docs/DATABASE_SCHEMA.md §1-6.
-- Applied remotely only when SUPABASE_DB_URL is valid; validated locally
-- against real Postgres (PGlite) by test/migrations.test.ts.
-- =============================================================================

-- Applied-migration ledger (spec: DATABASE_SCHEMA.md §7)
create table if not exists public.schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 1. data_sources — provenance catalogue
-- -----------------------------------------------------------------------------
create table if not exists public.data_sources (
  id                  text primary key,
  provider            text not null,
  product             text not null,
  url                 text not null,
  data_class          text not null check (data_class in
                        ('observation','historical','reanalysis','forecast','synthetic')),
  variables           text[] not null default '{}',
  units               jsonb  not null default '{}'::jsonb,
  spatial_resolution  text not null,
  temporal_resolution text not null,
  coverage            text not null,
  history             text,
  auth_required       boolean not null default false,
  usable_at_pilot     text not null check (usable_at_pilot in ('yes','partial','no','no_data')),
  mvp_role            text not null check (mvp_role in
                        ('evidence','context','reference','optional','excluded')),
  limitations         text[] not null default '{}',
  created_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. crop_catalog
-- -----------------------------------------------------------------------------
create table if not exists public.crop_catalog (
  id                 text primary key,
  name               text not null,
  local_name         text,
  season             text not null check (season in ('rabi','kharif','annual')),
  sowing_start_md    text,
  sowing_end_md      text,
  harvest_start_md   text,
  harvest_end_md     text,
  water_demand_class text check (water_demand_class in ('low','medium','high')),
  heat_sensitivity   text check (heat_sensitivity in ('low','medium','high')),
  is_legume          boolean not null default false,
  residue_class      text check (residue_class in ('low','medium','high')),
  selectable         boolean not null default true,
  verified           boolean not null default false,
  source_urls        text[] not null,
  evidence_quality   text not null check (evidence_quality in ('high','medium','low')),
  limitations        text[] not null default '{}',
  updated_at         timestamptz not null default now(),
  -- cardinality(), not array_length(): array_length('{}',1) is NULL, so
  -- `array_length(...) >= 1` evaluates to NULL and a CHECK passes. That bug was
  -- caught by test D05 and fixed before any remote application.
  constraint citation_required check (cardinality(source_urls) >= 1),
  constraint selectable_needs_calendar check (
    not selectable or (sowing_start_md is not null and harvest_end_md is not null)
  )
);

-- -----------------------------------------------------------------------------
-- 3. rotation_templates
-- -----------------------------------------------------------------------------
create table if not exists public.rotation_templates (
  id           text primary key,
  label        text not null,
  phases       jsonb not null,
  why_included text not null,
  source_urls  text[] not null,
  active       boolean not null default true,
  constraint rationale_required check (length(why_included) > 20),
  constraint rotation_citation_required check (cardinality(source_urls) >= 1)
);

-- -----------------------------------------------------------------------------
-- 4. environmental_observations — validated daily-value cache
-- -----------------------------------------------------------------------------
create table if not exists public.environmental_observations (
  id                 bigserial primary key,
  lat_rounded        numeric(6,3) not null,
  lon_rounded        numeric(6,3) not null,
  grid_lat           numeric(7,4),
  grid_lon           numeric(7,4),
  source_id          text not null references public.data_sources(id),
  variable           text not null,
  unit               text not null,
  aggregation        text not null check (aggregation in
                       ('daily','sum','mean','min','max','count','slope')),
  window_start       date not null,
  window_end         date not null,
  value              double precision,
  n_valid            integer,
  n_expected         integer,
  data_class         text not null check (data_class in
                       ('observation','historical','reanalysis','forecast','synthetic')),
  spatial_resolution text not null,
  quality_flags      text[] not null default '{}',
  retrieved_at       timestamptz not null default now(),
  expires_at         timestamptz not null default now() + interval '7 days',
  constraint window_order check (window_end >= window_start),
  -- A synthetic value can never be persisted as cacheable evidence.
  constraint no_synthetic_cache check (data_class <> 'synthetic')
);

create unique index if not exists uq_obs_key on public.environmental_observations
  (lat_rounded, lon_rounded, source_id, variable, aggregation, window_start, window_end);
create index if not exists ix_obs_lookup on public.environmental_observations
  (lat_rounded, lon_rounded, variable, window_start desc);
create index if not exists ix_obs_expiry on public.environmental_observations (expires_at);

-- -----------------------------------------------------------------------------
-- 5. analysis_runs — anonymous
-- -----------------------------------------------------------------------------
create table if not exists public.analysis_runs (
  id             uuid primary key default gen_random_uuid(),
  input          jsonb not null,
  result         jsonb not null,
  status         text not null check (status in ('ok','partial','insufficient_evidence')),
  season         text not null,
  planning_year  integer not null,
  lat_rounded    numeric(6,3) not null,
  lon_rounded    numeric(6,3) not null,
  engine_version text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '90 days'
);

create index if not exists ix_runs_expiry on public.analysis_runs (expires_at);

-- -----------------------------------------------------------------------------
-- 6. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.data_sources             enable row level security;
alter table public.crop_catalog             enable row level security;
alter table public.rotation_templates       enable row level security;
alter table public.environmental_observations enable row level security;
alter table public.analysis_runs            enable row level security;

drop policy if exists "public read sources" on public.data_sources;
create policy "public read sources" on public.data_sources
  for select to anon, authenticated using (true);

drop policy if exists "public read crops" on public.crop_catalog;
create policy "public read crops" on public.crop_catalog
  for select to anon, authenticated using (true);

drop policy if exists "public read rotations" on public.rotation_templates;
create policy "public read rotations" on public.rotation_templates
  for select to anon, authenticated using (true);

-- No anon policies for caches or runs: only the service role (server-side)
-- reads or writes them. RLS is enabled, so absence of a policy denies access.

insert into public.schema_migrations (version) values ('001_init')
  on conflict (version) do nothing;
