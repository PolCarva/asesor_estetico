import { describe, expect, it } from "vitest";

import { SizesFormSchema, sizesUpdateFrom } from "./sizes-form";

const LOOK = "11111111-1111-4111-8111-111111111111";

describe("formulario de talles", () => {
  it("guarda solo los talles elegidos; el calzado siempre con su sistema", () => {
    const form = SizesFormSchema.parse({ lookId: LOOK, bottom: "32", $ACTION_REF_1: "" });
    expect(sizesUpdateFrom(form)).toEqual({ bottom: "32" });
    expect(
      sizesUpdateFrom(SizesFormSchema.parse({ shoe: "9.5", shoe_size_system: "US", top: "M" })),
    ).toEqual({ top: "M", shoe: "9.5", shoe_size_system: "US" });
    // Sin número de calzado, el sistema solo no se guarda.
    expect(sizesUpdateFrom(SizesFormSchema.parse({ shoe_size_system: "US" }))).toEqual({});
  });

  it("rechaza sistemas de calzado y looks inválidos", () => {
    expect(SizesFormSchema.safeParse({ shoe: "9", shoe_size_system: "UK" }).success).toBe(false);
    expect(SizesFormSchema.safeParse({ lookId: "no-es-uuid" }).success).toBe(false);
    expect(SizesFormSchema.safeParse({ top: "X".repeat(11) }).success).toBe(false);
  });
});
