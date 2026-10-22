import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, harness, seedUser } from "../tests/convex-harness";

describe("adminSurfaces", () => {
  test("admin can seed and toggle visibility; wardrobe stays locked live", async () => {
    const t = harness();
    const admin = await seedUser(t, { role: "admin" });
    const asAdmin = asUser(t, admin);

    const seeded = await asAdmin.mutation(api.adminSurfaces.ensureSeeded, {});
    expect(seeded.inserted).toBeGreaterThan(0);

    const again = await asAdmin.mutation(api.adminSurfaces.ensureSeeded, {});
    expect(again.inserted).toBe(0);

    const list = await asAdmin.query(api.adminSurfaces.list, {});
    expect(list.some((row) => row.id === "wardrobe" && row.visibility === "live")).toBe(true);
    expect(list.some((row) => row.id === "hair_color" && row.visibility === "hidden")).toBe(true);

    await asAdmin.mutation(api.adminSurfaces.setVisibility, {
      surfaceId: "hairstyle",
      visibility: "live",
    });
    const after = await asAdmin.query(api.adminSurfaces.list, {});
    expect(after.find((row) => row.id === "hairstyle")?.visibility).toBe("live");

    await expect(
      asAdmin.mutation(api.adminSurfaces.setVisibility, {
        surfaceId: "wardrobe",
        visibility: "hidden",
      }),
    ).rejects.toThrow(/must stay live/i);
  });

  test("listForUser only returns live primary-nav surfaces", async () => {
    const t = harness();
    const admin = await seedUser(t, { role: "admin" });
    const user = await seedUser(t, { email: "shopper@example.com" });
    await asUser(t, admin).mutation(api.adminSurfaces.ensureSeeded, {});

    const surfaces = await asUser(t, user).query(api.platformSurfaces.listForUser, {});
    const navIds = surfaces.nav.map((row) => row.id);
    expect(navIds).toContain("wardrobe");
    expect(navIds).toContain("shop");
    expect(navIds).toContain("stylist");
    expect(navIds).not.toContain("hair_color");
    expect(navIds).not.toContain("hairstyle");
    expect(surfaces.hub).toEqual([]);
  });
});
