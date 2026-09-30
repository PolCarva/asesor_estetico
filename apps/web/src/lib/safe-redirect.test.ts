import { describe, expect, it } from "vitest";

import { DEFAULT_AFTER_LOGIN, safeNextPath } from "./safe-redirect";

describe("safeNextPath", () => {
  it("acepta rutas internas", () => {
    expect(safeNextPath("/app/looks")).toBe("/app/looks");
    expect(safeNextPath("/app/cart?x=1")).toBe("/app/cart?x=1");
  });

  it("rechaza redirecciones externas o raras (open redirect)", () => {
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
      "app",
      "/a\nb",
      undefined,
      42,
    ]) {
      expect(safeNextPath(value)).toBe(DEFAULT_AFTER_LOGIN);
    }
  });
});
