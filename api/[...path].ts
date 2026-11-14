/**
 * Single Vercel Function entry point for every `/api/*` request.
 *
 * Local development continues to use `apps/api/src/index.ts`, which starts an
 * HTTP listener. Vercel invokes this exported Express application directly.
 */
import { createApp } from "../apps/api/src/app.js";

export default createApp();
