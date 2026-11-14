/**
 * Remote migration runner.
 *
 * The direct Supabase database host (db.<ref>.supabase.co) is IPv6-only on many
 * networks; this machine cannot resolve it. Supabase's pooler is the documented
 * IPv4 path, so the runner tries the direct host first and then each pooler
 * region with the project-scoped user `postgres.<ref>`.
 *
 * Safety: the connection string is never printed, each migration runs inside a
 * transaction, and already-applied versions recorded in `schema_migrations` are
 * skipped. Idempotent re-runs are therefore safe.
 *
 * Usage: npm run db:migrate --workspace @fieldshift/api [-- --dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const migrationsDir = path.resolve(__dirname, "../src/db/migrations");

function loadEnv() {
  const envPath = path.join(repoRoot, ".env");
  if (!fs.existsSync(envPath)) throw new Error(".env not found at project root");
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

const REGIONS = [
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "ca-central-1",
  "sa-east-1",
];

const CACHE_FILE = path.join(__dirname, ".migrate-host.json");

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(candidate) {
  // Host/port/user only — never the password.
  fs.writeFileSync(CACHE_FILE, JSON.stringify(candidate, null, 2));
}

function buildCandidates(env) {
  const raw = env.SUPABASE_DB_URL;
  if (!raw) throw new Error("SUPABASE_DB_URL is not set in .env");
  const url = new URL(raw);
  const ref = (env.SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  const password = decodeURIComponent(url.password);
  const database = url.pathname.replace(/^\//, "") || "postgres";
  if (!password) throw new Error("SUPABASE_DB_URL has no password component");

  const candidates = [
    { label: "direct", host: url.hostname, port: Number(url.port || 5432), user: decodeURIComponent(url.username) },
  ];
  // Re-use a previously working pooler first: scanning regions costs minutes.
  const cached = readCache();
  if (cached) candidates.unshift({ ...cached, label: `${cached.label} (cached)` });
  if (ref) {
    for (const prefix of ["aws-0", "aws-1"]) {
      for (const region of REGIONS) {
        for (const port of [5432, 6543]) {
          candidates.push({
            label: `${prefix}-${region}:${port}`,
            host: `${prefix}-${region}.pooler.supabase.com`,
            port,
            user: `postgres.${ref}`,
          });
        }
      }
    }
  }
  return { candidates, password, database };
}

async function tryConnect(candidate, password, database) {
  const client = new pg.Client({
    host: candidate.host,
    port: candidate.port,
    user: candidate.user,
    password,
    database,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 60_000,
    query_timeout: 60_000,
  });
  client.on("error", () => {});
  await client.connect();
  await client.query("select 1");
  return client;
}

async function connect() {
  const { candidates, password, database } = buildCandidates(loadEnv());
  const failures = [];
  for (const candidate of candidates) {
    try {
      const client = await tryConnect(candidate, password, database);
      console.log(`connected via ${candidate.label}`);
      if (!candidate.label.includes("(cached)")) writeCache(candidate);
      return client;
    } catch (err) {
      const code = err.code || err.message;
      failures.push(`${candidate.label}=${code}`);
      // Only report the actionable classes, not every DNS miss.
      if (code !== "ENOTFOUND" && code !== "ETIMEDOUT" && code !== "ECONNREFUSED") {
        console.log(`  ${candidate.label}: ${code}`);
      }
    }
  }
  throw new Error(`could not connect to Postgres; attempts: ${failures.slice(0, 6).join(", ")} …`);
}

function migrationFiles() {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((file) => ({
      version: file.replace(/\.sql$/, ""),
      file,
      sql: fs.readFileSync(path.join(migrationsDir, file), "utf8"),
    }));
}

const dryRun = process.argv.includes("--dry-run");
const client = await connect();

try {
  await client.query(`
    create table if not exists public.schema_migrations (
      version     text primary key,
      applied_at  timestamptz not null default now()
    )
  `);
  const { rows } = await client.query("select version from public.schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  let appliedCount = 0;
  for (const migration of migrationFiles()) {
    if (applied.has(migration.version)) {
      console.log(`skip   ${migration.file} (already applied)`);
      continue;
    }
    if (dryRun) {
      console.log(`would apply ${migration.file} (${migration.sql.length} bytes)`);
      continue;
    }
    const started = Date.now();
    await client.query("begin");
    try {
      await client.query(migration.sql);
      // Some migration files record their own version; never fail on that.
      await client.query(
        "insert into public.schema_migrations (version) values ($1) on conflict (version) do nothing",
        [migration.version],
      );
      await client.query("commit");
      appliedCount += 1;
      console.log(`applied ${migration.file} (${Date.now() - started} ms)`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`${migration.file} failed: ${err.message}`);
    }
  }

  const counts = await client.query(`
    select
      (select count(*) from public.data_sources)            as sources,
      (select count(*) from public.crop_catalog)            as crops,
      (select count(*) from public.rotation_templates)      as rotations,
      (select count(*) from public.environmental_observations) as observations,
      (select count(*) from public.analysis_runs)           as runs,
      (select count(*) from pg_policies where schemaname = 'public') as policies
  `);
  console.log("applied now:", appliedCount);
  console.log("row counts:", JSON.stringify(counts.rows[0]));
} finally {
  await client.end();
}
