import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, harness, seedUser, VENDOR_PROFILE } from "../tests/convex-harness";

async function activeVendor() {
  const t = harness();
  const owner = await seedUser(t);
  const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
  await t.run((ctx) => ctx.db.patch(vendorId, { status: "active" }));
  return { t, owner, vendorId };
}

describe("brands", () => {
  test("ensure collapses Nike / nike to one row", async () => {
    const { t, owner } = await activeVendor();
    const a = await asUser(t, owner).mutation(api.brands.ensure, { name: "Nike" });
    const b = await asUser(t, owner).mutation(api.brands.ensure, { name: "nike" });
    expect(a).toBe(b);

    const list = await asUser(t, owner).query(api.brands.list, { activeOnly: true });
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("Nike");
  });

  test("product create links brandId from free-text brand", async () => {
    const { t, owner } = await activeVendor();
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, {
      category: "clothes",
      presentation: "masculine",
      name: "Air Max Tee",
      brand: "Nike",
      description: "Classic tee",
      priceInr: 1999,
      imageIds: [],
      variants: [{ stock: 1, active: true }],
    });

    const product = await asUser(t, owner).query(api.vendorProducts.get, { productId });
    expect(product.brand).toBe("Nike");
    expect(product.brandId).toBeTruthy();

    const again = await asUser(t, owner).mutation(api.vendorProducts.create, {
      category: "clothes",
      presentation: "masculine",
      name: "Dunk Low",
      brand: "nike",
      description: "Sneaker",
      priceInr: 8999,
      imageIds: [],
      variants: [{ stock: 1, active: true }],
    });
    const second = await asUser(t, owner).query(api.vendorProducts.get, { productId: again });
    expect(second.brandId).toBe(product.brandId);
  });

  test("brands are scoped per store", async () => {
    const { t, owner } = await activeVendor();
    const brandId = await asUser(t, owner).mutation(api.brands.ensure, { name: "Nike" });

    const rival = await seedUser(t, { email: "rival-brand@example.com" });
    const rivalVendorId = await asUser(t, rival).mutation(api.vendors.register, {
      ...VENDOR_PROFILE,
      name: "Rival Co",
    });
    await t.run((ctx) => ctx.db.patch(rivalVendorId, { status: "active" }));
    const rivalBrand = await asUser(t, rival).mutation(api.brands.ensure, { name: "Nike" });
    expect(rivalBrand).not.toBe(brandId);
  });

  test("cannot remove a brand that still has products", async () => {
    const { t, owner } = await activeVendor();
    const brandId = await asUser(t, owner).mutation(api.brands.ensure, { name: "Louis Philippe" });
    await asUser(t, owner).mutation(api.vendorProducts.create, {
      category: "clothes",
      presentation: "masculine",
      name: "Formal Shirt",
      brandId,
      description: "Office shirt",
      priceInr: 2499,
      imageIds: [],
      variants: [{ stock: 1, active: true }],
    });

    await expect(
      asUser(t, owner).mutation(api.brands.remove, { brandId }),
    ).rejects.toThrow(/reassign/i);
  });
});
