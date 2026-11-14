import { describe, expect, it } from "vitest";

import appModule from "../../../api/[...path].js";

const app = appModule as unknown as { handle: unknown };

describe("Vercel API adapter", () => {
  it("initializes the existing Express application without starting a listener", () => {
    expect(typeof appModule).toBe("function");
    expect(typeof app.handle).toBe("function");
  });
});
