/**
 * Environment configuration.
 *
 * Secrets are read once, here, and never logged. `describe()` exposes only
 * which variables are present, never their values.
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/**
 * Load the nearest `.env`, walking up from the working directory.
 *
 * `import "dotenv/config"` only checks `process.cwd()`, which is `apps/api` when
 * the API is started through its npm workspace script, so the repository-root
 * `.env` was silently ignored. Existing `process.env` values still win.
 */
function findEnvFile(start: string): string | null {
  let dir = path.resolve(start);
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envFile = findEnvFile(process.cwd());
if (envFile) dotenv.config({ path: envFile });

function str(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function bool(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true";
}

export const config = {
  nodeEnv: str("NODE_ENV", "development"),
  port: Number(str("API_PORT", "8000")),
  corsAllowedOrigins: str("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  supabase: {
    url: str("SUPABASE_URL"),
    anonKey: str("SUPABASE_ANON_KEY"),
    /** Server-side only. Never send this to the browser. */
    serviceRoleKey: str("SUPABASE_SERVICE_ROLE_KEY"),
  },

  dataSources: {
    power: bool("DATA_SOURCE_POWER_ENABLED", true),
    gibs: bool("DATA_SOURCE_GIBS_ENABLED", true),
    cmr: bool("DATA_SOURCE_CMR_ENABLED", true),
    soilgrids: bool("DATA_SOURCE_SOILGRIDS_ENABLED", true),
  },

  /** Must stay false in any environment a user can reach. */
  allowSyntheticFixtures: bool("ALLOW_SYNTHETIC_FIXTURES", false),
} as const;

/** Presence map for /health. Values are never included. */
export function describeConfig() {
  return {
    supabaseUrl: config.supabase.url.length > 0,
    supabaseAnonKey: config.supabase.anonKey.length > 0,
    supabaseServiceRoleKey: config.supabase.serviceRoleKey.length > 0,
    allowSyntheticFixtures: config.allowSyntheticFixtures,
  };
}
