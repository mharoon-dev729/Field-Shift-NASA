/**
 * GET /api/v1/evidence
 * Query is validated with the shared zod schema, so the contract in
 * docs/API_CONTRACT.md and the server cannot drift.
 */

import { evidenceQuerySchema, type EvidenceQuery } from "@fieldshift/shared";
import { Router, type Request, type Response, type NextFunction } from "express";

import { AppError } from "../lib/errors.js";

export type EvidenceHandler = (query: EvidenceQuery) => Promise<unknown>;

export function createEvidenceRouter(handler: EvidenceHandler): Router {
  const router = Router();

  router.get("/evidence", async (req: Request, res: Response, next: NextFunction) => {
    const parsed = evidenceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      next(
        new AppError("VALIDATION_ERROR", issue?.message ?? "Invalid query parameters", {
          details: {
            field: issue?.path.join(".") ?? "query",
            received: issue?.path.length ? req.query[String(issue.path[0])] : undefined,
          },
        }),
      );
      return;
    }

    try {
      const body = await handler(parsed.data);
      // Personalised/derived evidence is never cached by intermediaries.
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json(body);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
