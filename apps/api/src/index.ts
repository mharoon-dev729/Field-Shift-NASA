/**
 * Field Shift API entry point.
 * Application wiring lives in app.ts so tests can import it without listening.
 */

import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`[api] Field Shift API listening on http://localhost:${config.port}`);
});
