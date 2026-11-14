/**
 * Migration + constraint + RLS checks (D01-D11).
 *
 * Executed against REAL PostgreSQL (PGlite = Postgres compiled to WASM), not a
 * mock, so the SQL is genuinely validated. This does not prove the migrations
 * were applied to the hosted Supabase project — see docs/PROGRESS.md.
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(new URL("../src/db/migrations/", import.meta.url));

function migration(name: string): string {
  return readFileSync(`${MIGRATIONS_DIR}${name}`, "utf8");
}

let db: PGlite;
let rlsRuntimeWorks = false;

async function tableCount(table: string): Promise<number> {
  const res = await db.query<{ count: string | number }>(`select count(*)::int as count from public.${table}`);
  const row = res.rows[0] as { count: number } | undefined;
  return Number(row?.count ?? 0);
}

beforeAll(async () => {
  db = new PGlite();
  // Supabase provisions these roles; a bare Postgres does not.
  await db.exec(`create role anon nologin; create role authenticated nologin;`);
  await db.exec(migration("001_init.sql"));
  await db.exec(migration("002_seed_sources.sql"));
  await db.exec(migration("003_seed_catalog.sql"));
});

describe("D01 — schema applies to a clean database", () => {
  it("creates every documented table", async () => {
    const res = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    );
    const tables = res.rows.map((r) => r.table_name);
    expect(tables).toEqual(
      expect.arrayContaining([
        "analysis_runs",
        "crop_catalog",
        "data_sources",
        "environmental_observations",
        "rotation_templates",
        "schema_migrations",
      ]),
    );
  });

  it("creates the unique observation key and indexes", async () => {
    const res = await db.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    const names = res.rows.map((r) => r.indexname);
    expect(names).toContain("uq_obs_key");
    expect(names).toContain("ix_obs_expiry");
    expect(names).toContain("ix_runs_expiry");
  });

  it("records the applied migrations", async () => {
    expect(await tableCount("schema_migrations")).toBe(3);
  });
});

describe("data integrity constraints", () => {
  function observationSql(overrides: Record<string, string> = {}): string {
    const base: Record<string, string> = {
      lat_rounded: "31.419",
      lon_rounded: "73.079",
      source_id: "'nasa_power'",
      variable: "'T2M'",
      unit: "'C'",
      aggregation: "'daily'",
      window_start: "'2026-06-01'",
      window_end: "'2026-06-01'",
      value: "30.1",
      n_valid: "1",
      n_expected: "1",
      data_class: "'reanalysis'",
      spatial_resolution: "'0.5 x 0.625 deg'",
      quality_flags: "'{}'",
      ...overrides,
    };
    const cols = Object.keys(base).join(", ");
    const vals = Object.values(base).join(", ");
    return `insert into public.environmental_observations (${cols}) values (${vals})`;
  }

  it("D02 refuses a synthetic observation", async () => {
    await expect(db.exec(observationSql({ data_class: "'synthetic'" }))).rejects.toThrow(/no_synthetic_cache/);
  });

  it("D03 refuses a NULL unit", async () => {
    await expect(db.exec(observationSql({ unit: "null" }))).rejects.toThrow(/unit/i);
  });

  it("D04 refuses a duplicate observation key", async () => {
    await db.exec(observationSql({ variable: "'DUP_CHECK'" }));
    await expect(db.exec(observationSql({ variable: "'DUP_CHECK'" }))).rejects.toThrow(/uq_obs_key|duplicate/i);
  });

  it("D05 refuses a crop with no citation", async () => {
    await expect(
      db.exec(`insert into public.crop_catalog
        (id, name, season, selectable, verified, source_urls, evidence_quality)
        values ('testcrop','Test','rabi',false,false,'{}'::text[],'low')`),
    ).rejects.toThrow(/citation_required/);
  });

  it("D06 refuses a selectable crop without a calendar", async () => {
    await expect(
      db.exec(`insert into public.crop_catalog
        (id, name, season, selectable, verified, source_urls, evidence_quality)
        values ('testcrop2','Test','rabi',true,false,array['https://example.org'],'low')`),
    ).rejects.toThrow(/selectable_needs_calendar/);
  });

  it("D10 excludes expired cache rows from a freshness-filtered read", async () => {
    await db.exec(
      observationSql({
        variable: "'EXPIRED'",
        window_start: "'2026-01-01'",
        window_end: "'2026-01-01'",
        value: "null",
        n_valid: "0",
      }),
    );
    await db.exec(`update public.environmental_observations
                   set expires_at = now() - interval '1 day' where variable = 'EXPIRED'`);
    const fresh = await db.query(
      `select count(*)::int as count from public.environmental_observations
       where variable = 'EXPIRED' and expires_at > now()`,
    );
    expect(Number((fresh.rows[0] as { count: number }).count)).toBe(0);
  });

  it("D11 keeps seeds idempotent", async () => {
    expect(await tableCount("data_sources")).toBe(8);
    expect(await tableCount("crop_catalog")).toBe(6);
    expect(await tableCount("rotation_templates")).toBe(4);

    await db.exec(migration("002_seed_sources.sql"));
    await db.exec(migration("003_seed_catalog.sql"));

    expect(await tableCount("data_sources")).toBe(8);
    expect(await tableCount("crop_catalog")).toBe(6);
    expect(await tableCount("rotation_templates")).toBe(4);
  });
});

describe("Row Level Security", () => {
  it("D07/D08/D09 configures read policies for reference data only", async () => {
    const res = await db.query<{ tablename: string; roles: string[]; cmd: string }>(
      `select tablename, roles, cmd from pg_policies where schemaname = 'public'`,
    );
    const readPolicies = res.rows.filter((r) => r.cmd === "SELECT");
    const tablesWithRead = readPolicies.flatMap((r) => r.roles.map((role) => `${r.tablename}:${role}`));

    expect(tablesWithRead).toContain("data_sources:anon");
    expect(tablesWithRead).toContain("crop_catalog:anon");
    expect(tablesWithRead).toContain("rotation_templates:anon");
    // Cache and run tables must have NO anon policy at all.
    expect(tablesWithRead.some((t) => t.startsWith("environmental_observations"))).toBe(false);
    expect(tablesWithRead.some((t) => t.startsWith("analysis_runs"))).toBe(false);

    // No INSERT/UPDATE/DELETE policy is granted to anon anywhere.
    const writePoliciesForAnon = res.rows.filter(
      (r) => r.roles.includes("anon") && r.cmd !== "SELECT",
    );
    expect(writePoliciesForAnon).toHaveLength(0);

    const rls = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    for (const row of rls.rows) {
      if (row.relname.startsWith("schema_migrations")) continue;
      expect(row.relrowsecurity, `${row.relname} must have RLS enabled`).toBe(true);
    }
  });

  it("enforces the policies at runtime when role switching is available", async () => {
    await db.exec(`
      grant usage on schema public to anon;
      grant select on all tables in schema public to anon;
    `);

    try {
      await db.exec("set role anon");
      rlsRuntimeWorks = true;

      const sources = await db.query<{ count: number }>(
        "select count(*)::int as count from public.data_sources",
      );
      expect(Number((sources.rows[0] as { count: number }).count)).toBe(8);

      const hidden = await db.query<{ count: number }>(
        "select count(*)::int as count from public.environmental_observations",
      );
      expect(Number((hidden.rows[0] as { count: number }).count)).toBe(0);
    } finally {
      await db.exec("reset role");
    }

    expect(rlsRuntimeWorks).toBe(true);
  });
});
