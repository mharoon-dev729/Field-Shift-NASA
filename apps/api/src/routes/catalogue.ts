/**
 * GET /api/v1/crops and GET /api/v1/sources (API_CONTRACT.md §3, §5).
 *
 * Both return reference data. Neither returns a measurement or a score.
 */

import { cropsQuerySchema } from "@fieldshift/shared";
import { Router, type NextFunction, type Request, type Response } from "express";

import { AppError } from "../lib/errors.js";
import type { CropsHandler, SourcesHandler } from "../services/catalogue.js";

export function createCatalogueRouter(crops: CropsHandler, sources: SourcesHandler): Router {
  const router = Router();

  router.get("/crops", async (req: Request, res: Response, next: NextFunction) => {
    const parsed = cropsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      next(
        new AppError("VALIDATION_ERROR", issue?.message ?? "Invalid catalogue query", {
          details: { field: issue?.path.join(".") ?? "query" },
        }),
      );
      return;
    }
    try {
      const body = await crops(parsed.data);
      // Reference data: cacheable, but never private.
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  router.get("/sources", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const body = await sources();
      res.setHeader("Cache-Control", "public, max-age=300");
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
