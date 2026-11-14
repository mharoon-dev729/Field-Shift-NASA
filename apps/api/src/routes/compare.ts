/**
 * POST /api/v1/compare — deterministic rotation comparison (API_CONTRACT.md §6).
 *
 * Validation happens here with the shared zod schema. An insufficient-evidence
 * outcome is a 200: it is a valid answer, not a failure.
 */

import { compareRequestSchema } from "@fieldshift/shared";
import { Router, type NextFunction, type Request, type Response } from "express";

import { AppError } from "../lib/errors.js";
import type { CompareHandler } from "../services/compare.js";

export function createCompareRouter(handler: CompareHandler): Router {
  const router = Router();

  router.post("/compare", async (req: Request, res: Response, next: NextFunction) => {
    const parsed = compareRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      next(
        new AppError("VALIDATION_ERROR", issue?.message ?? "Invalid comparison request", {
          details: { field: issue?.path.join(".") ?? "body" },
        }),
      );
      return;
    }

    try {
      const result = await handler(parsed.data);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
