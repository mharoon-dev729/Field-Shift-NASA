/**
 * Express application factory.
 *
 * `createApp` is separated from `index.ts` so tests can drive the real
 * middleware stack with supertest without binding a port.
 */

import { createClient } from "@supabase/supabase-js";
import type { EvidenceResponse } from "@fieldshift/shared";
import express, { type NextFunction, type Request, type Response } from "express";

import { config, describeConfig } from "./config.js";
import { EvidenceCache, SupabaseCacheStore } from "./db/cache.js";
import { createSupabaseCatalogueStore, type CatalogueStore, type SelectClient } from "./db/catalogue.js";
import { createSupabaseSourceStore, type SourceStore } from "./db/sources.js";
import { createCatalogueService, type CropsHandler, type SourcesHandler } from "./services/catalogue.js";
import { createCatalogueRouter } from "./routes/catalogue.js";
import { AppError, toErrorEnvelope } from "./lib/errors.js";
import { createCompareRouter } from "./routes/compare.js";
import { createEvidenceRouter, type EvidenceHandler } from "./routes/evidence.js";
import { createCompareService, type CompareHandler } from "./services/compare.js";
import { createEvidenceService, type EvidenceDeps } from "./services/evidence.js";

export interface AppOptions {
  evidenceHandler?: EvidenceHandler;
  evidenceDeps?: EvidenceDeps;
  compareHandler?: CompareHandler;
  catalogueStore?: CatalogueStore;
  sourceStore?: SourceStore;
  cropsHandler?: CropsHandler;
  sourcesHandler?: SourcesHandler;
}

const CACHE_TTL_SECONDS = Number(process.env["CACHE_TTL_SECONDS"] ?? 7 * 24 * 60 * 60);

/** Server-side Supabase client (service role), or null when unconfigured. */
function buildSupabaseClient() {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
  try {
    return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}

/** Supabase-backed cache, or null when credentials are absent/invalid. */
function buildPersistentCache(): EvidenceCache | null {
  if (!config.supabase.url || !config.supabase.serviceRoleKey) return null;
  try {
    const client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const store = new SupabaseCacheStore(
      client as unknown as ConstructorParameters<typeof SupabaseCacheStore>[0],
    );
    return new EvidenceCache(store, CACHE_TTL_SECONDS, (message) => {
      // Message text only; never keys or row contents.
      console.warn(`[cache] ${message}`);
    });
  } catch {
    return null;
  }
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "64kb" }));

  // --- Explicit CORS allowlist (contract §0) ---
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.header("origin");
    if (origin) {
      res.setHeader("Vary", "Origin");
      if (config.corsAllowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      }
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  const persistent = buildPersistentCache();
  const supabaseClient = buildSupabaseClient();
  const evidenceDeps: EvidenceDeps = {
    cache: persistent ?? new EvidenceCache(null, CACHE_TTL_SECONDS),
    soilCache: new EvidenceCache(null, 24 * 60 * 60),
    powerEnabled: config.dataSources.power,
    soilEnabled: config.dataSources.soilgrids,
    ...options.evidenceDeps,
  };
  const evidenceHandler = options.evidenceHandler ?? createEvidenceService(evidenceDeps);

  /**
   * The decision engine uses POWER only (C1/C2/C4 wetness/C5); soil never feeds a
   * criterion, because C3 is built from cited catalogue attributes. Asking for
   * soil here would add a SoilGrids timeout to every comparison for no evidence,
   * so the comparison path requests environmental series without soil.
   */
  const compareEvidenceHandler =
    options.evidenceHandler ?? createEvidenceService({ ...evidenceDeps, soilEnabled: false });

  app.get("/api/v1/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      version: "1.0.0",
      time: new Date().toISOString(),
      phase: "3 (decision engine)",
      config: describeConfig(),
      dependencies: {
        // Presence only: no values, no connectivity claims.
        supabase: {
          configured: Boolean(config.supabase.url && config.supabase.serviceRoleKey),
          cacheBackend: persistent ? "supabase+memory" : "memory",
        },
        nasa_power: { enabled: config.dataSources.power },
        soilgrids: { enabled: config.dataSources.soilgrids },
      },
    });
  });

  const catalogueStore =
    options.catalogueStore ??
    (supabaseClient
      ? createSupabaseCatalogueStore(supabaseClient as unknown as SelectClient)
      : {
          async load(): Promise<never> {
            throw new AppError(
              "SOURCE_UNAVAILABLE",
              "The crop catalogue is unavailable because the database is not configured",
              { retryable: false },
            );
          },
        });

  const unavailableStore: SourceStore = {
    async load(): Promise<never> {
      throw new AppError(
        "SOURCE_UNAVAILABLE",
        "The data-source register is unavailable because the database is not configured",
      );
    },
  };
  const sourceStore =
    options.sourceStore ??
    (supabaseClient ? createSupabaseSourceStore(supabaseClient as unknown as SelectClient) : unavailableStore);

  const catalogueService = createCatalogueService({ catalogue: catalogueStore, sources: sourceStore });
  const cropsHandler = options.cropsHandler ?? catalogueService.crops;
  const sourcesHandler = options.sourcesHandler ?? catalogueService.sources;

  const compareHandler =
    options.compareHandler ??
    createCompareService({
      // The evidence handler is the Phase 2 pipeline, unchanged.
      evidence: (query) => compareEvidenceHandler(query) as Promise<EvidenceResponse>,
      catalogue: catalogueStore,
    });

  app.use("/api/v1", createEvidenceRouter(evidenceHandler));
  app.use("/api/v1", createCompareRouter(compareHandler));
  app.use("/api/v1", createCatalogueRouter(cropsHandler, sourcesHandler));

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: `No route for ${req.method} ${req.path}`,
        details: {},
      },
    });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = toErrorEnvelope(err);
    if (status >= 500 && config.nodeEnv !== "test") {
      // Log the message only: never request bodies, secrets or stack traces.
      console.error("[api] error:", body.error.code, body.error.message);
    }
    res.status(status).json(body);
  });

  return app;
}
