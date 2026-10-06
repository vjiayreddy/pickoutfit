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

describe("attributes + variantCategories", () => {
  test("seed attribute catalog, create recipe, syncs variant type/options", async () => {
    const { t, owner } = await activeVendor();

    const seeded = await asUser(t, owner).mutation(api.attributes.seedDefaults, {});
    expect(seeded.types).toBe(2);
    expect(seeded.attributes).toBeGreaterThan(0);

    const types = await asUser(t, owner).query(api.attributes.listTypes, { activeOnly: true });
    const sizeType = types.find((row) => row.slug === "size");
    expect(sizeType).toBeTruthy();

    const sizeAttrs = await asUser(t, owner).query(api.attributes.list, {
      attributeTypeId: sizeType!._id,
      activeOnly: true,
    });
    expect(sizeAttrs.length).toBeGreaterThan(2);

    const categories = await asUser(t, owner).query(api.categories.list, { activeOnly: true });
    expect(categories.length).toBeGreaterThan(0);
    const categoryId = categories[0]!._id;

    const recipeId = await asUser(t, owner).mutation(api.variantCategories.upsert, {
      title: "Men Size",
      attributeTypeId: sizeType!._id,
      categoryIds: [categoryId],
      attributeIds: sizeAttrs.slice(0, 3).map((row) => row._id),
    });

    const recipes = await asUser(t, owner).query(api.variantCategories.list, {});
    const recipe = recipes.find((row) => row._id === recipeId);
    expect(recipe).toBeTruthy();
    expect(recipe!.variantTypeId).toBeTruthy();
    expect(recipe!.optionCount).toBe(3);

    const catalog = await asUser(t, owner).query(api.variants.catalog, { activeOnly: false });
    const synced = catalog.find((row) => row.id === recipe!.variantTypeId);
    expect(synced).toBeTruthy();
    expect(synced!.label).toBe("Men Size");
    expect(synced!.categoryIds).toEqual([categoryId]);
    expect(synced!.options).toHaveLength(3);
    expect(synced!.options.every((option) => option.attributeId !== null)).toBe(true);

    // Update recipe options (drop one, keep two) and re-sync.
    await asUser(t, owner).mutation(api.variantCategories.upsert, {
      variantCategoryId: recipeId,
      title: "Men Size",
      attributeTypeId: sizeType!._id,
      categoryIds: [categoryId],
      attributeIds: sizeAttrs.slice(0, 2).map((row) => row._id),
    });
    const after = await asUser(t, owner).query(api.variants.catalog, { activeOnly: false });
    const updated = after.find((row) => row.id === recipe!.variantTypeId);
    expect(updated!.options).toHaveLength(2);
  });
});
