import { EMPTY_USER_SIZES } from "@asesor/shared";
import { afterAll, beforeAll, expect, it } from "vitest";

import { getUserSizes, saveUserSizes } from "../../src/profile-sizes";
import { adminClient, createTestUser, deleteTestUser, describeIntegration } from "./setup";

/** Talles en el perfil (paso 07): solo el dueño, solo esas columnas, valores acotados. */
describeIntegration("talles del usuario en profiles", () => {
  const admin = adminClient();
  let owner: Awaited<ReturnType<typeof createTestUser>>;
  let other: Awaited<ReturnType<typeof createTestUser>>;

  beforeAll(async () => {
    owner = await createTestUser("sizes-owner");
    other = await createTestUser("sizes-other");
  });

  afterAll(async () => {
    for (const user of [owner, other]) if (user) await deleteTestUser(user.id);
  });

  it("el dueño guarda sus talles de a uno y se conservan los que no manda", async () => {
    expect(await getUserSizes(owner.client, owner.id)).toEqual(EMPTY_USER_SIZES);

    expect(await saveUserSizes(owner.client, owner.id, { top: "M" })).toEqual({
      ...EMPTY_USER_SIZES,
      top: "M",
    });
    const both = await saveUserSizes(owner.client, owner.id, {
      bottom: "32",
      shoe: "9.5",
      shoe_size_system: "US",
    });
    expect(both).toEqual({ top: "M", bottom: "32", shoe: "9.5", shoe_size_system: "US" });
    // Se leen igual con la sesión y con service role (persisten en el perfil).
    expect(await getUserSizes(owner.client, owner.id)).toEqual(both);
    expect(await getUserSizes(admin, owner.id)).toEqual(both);

    // null borra uno solo.
    expect(await saveUserSizes(owner.client, owner.id, { bottom: null })).toMatchObject({
      top: "M",
      bottom: null,
    });
  });

  it("rechaza talles fuera de las opciones y un calzado sin su sistema", async () => {
    await expect(saveUserSizes(owner.client, owner.id, { top: "42" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      saveUserSizes(owner.client, owner.id, { shoe: "9.5", shoe_size_system: "EU" }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(saveUserSizes(owner.client, owner.id, { shoe: "42" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    // Y la base también, aunque se saltee el helper.
    const system = await owner.client
      .from("profiles")
      .update({ shoe_size_system: "UK" })
      .eq("id", owner.id);
    expect(system.error?.code).toBe("23514");
    const long = await owner.client
      .from("profiles")
      .update({ top_size: "X".repeat(11) })
      .eq("id", owner.id);
    expect(long.error?.code).toBe("23514");
  });

  it("nadie más los cambia, y el dueño no toca columnas no permitidas", async () => {
    const before = await getUserSizes(admin, owner.id);
    const foreign = await other.client
      .from("profiles")
      .update({ top_size: "XXL" })
      .eq("id", owner.id)
      .select("id");
    expect(foreign.data).toEqual([]);
    await expect(saveUserSizes(other.client, owner.id, { top: "XXL" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await getUserSizes(admin, owner.id)).toEqual(before);

    // Los grants por columna siguen protegiendo role y país.
    const role = await owner.client.from("profiles").update({ role: "admin" }).eq("id", owner.id);
    expect(role.error?.code).toBe("42501");
    const country = await owner.client
      .from("profiles")
      .update({ top_size: "S", country_code: "AR" })
      .eq("id", owner.id);
    expect(country.error?.code).toBe("42501");
    expect((await getUserSizes(admin, owner.id)).top).toBe(before.top);
  });
});
