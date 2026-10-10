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

describe("attributes + variants", () => {
  test("seed attribute catalog, create variant, appears in catalog without sync table", async () => {
    const { t, owner } = await activeVendor();

    const seeded = await asUser(t, owner).mutation(api.attributes.seedDefaults, {});
    expect(seeded.types).toBeGreaterThanOrEqual(2);
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

    const variantId = await asUser(t, owner).mutation(api.variants.upsert, {
      title: "Men Size",
      attributeTypeId: sizeType!._id,
      categoryIds: [categoryId],
      attributeIds: sizeAttrs.slice(0, 3).map((row) => row._id),
    });

    const rows = await asUser(t, owner).query(api.variants.list, {});
    const row = rows.find((item) => item._id === variantId);
    expect(row).toBeTruthy();
    expect(row!.optionCount).toBe(3);

    const catalog = await asUser(t, owner).query(api.variants.catalog, {});
    const catalogRow = catalog.find((item) => item.id === variantId);
    expect(catalogRow).toBeTruthy();
    expect(catalogRow!.label).toBe("Men Size");
    expect(catalogRow!.categoryIds).toEqual([categoryId]);
    expect(catalogRow!.options).toHaveLength(3);

    await asUser(t, owner).mutation(api.variants.upsert, {
      variantCategoryId: variantId,
      title: "Men Size",
      attributeTypeId: sizeType!._id,
      categoryIds: [categoryId],
      attributeIds: sizeAttrs.slice(0, 2).map((row) => row._id),
    });
    const after = await asUser(t, owner).query(api.variants.catalog, {});
    const updated = after.find((item) => item.id === variantId);
    expect(updated!.options).toHaveLength(2);
  });

  test("create attribute requires value and rejects duplicates", async () => {
    const { t, owner } = await activeVendor();
    const typeId = await asUser(t, owner).mutation(api.attributes.createType, {
      label: "Fabric",
    });

    const id = await asUser(t, owner).mutation(api.attributes.create, {
      attributeTypeId: typeId,
      label: "Cotton",
      value: "cotton",
    });
    expect(id).toBeTruthy();

    const rows = await asUser(t, owner).query(api.attributes.list, {
      attributeTypeId: typeId,
      activeOnly: false,
    });
    const cotton = rows.find((row) => row._id === id);
    expect(cotton?.label).toBe("Cotton");
    expect(cotton?.value).toBe("cotton");
    expect(cotton?.slug).toBe("cotton");

    await expect(
      asUser(t, owner).mutation(api.attributes.create, {
        attributeTypeId: typeId,
        label: "Cotton blend",
        value: "cotton",
      }),
    ).rejects.toThrow(/already exists/i);

    await asUser(t, owner).mutation(api.attributes.update, {
      attributeId: id,
      value: "organic-cotton",
    });
    const updated = await asUser(t, owner).query(api.attributes.list, {
      attributeTypeId: typeId,
      activeOnly: false,
    });
    expect(updated.find((row) => row._id === id)?.value).toBe("organic-cotton");

    const otherId = await asUser(t, owner).mutation(api.attributes.create, {
      attributeTypeId: typeId,
      label: "Linen",
      value: "linen",
    });
    await expect(
      asUser(t, owner).mutation(api.attributes.update, {
        attributeId: otherId,
        value: "organic-cotton",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  test("variant facets return options scoped by category ancestry", async () => {
    const { t, owner, vendorId } = await activeVendor();
    await asUser(t, owner).mutation(api.attributes.seedDefaults, {});

    const tree = await asUser(t, owner).query(api.categories.tree, { activeOnly: true });
    const men = tree.find((node) => node.slug === "men");
    expect(men).toBeTruthy();
    const topwear = men!.children.find((node: { slug: string }) => node.slug === "topwear");
    expect(topwear).toBeTruthy();
    const shirts = topwear!.children.find((node: { slug: string }) => node.slug === "shirts");
    expect(shirts).toBeTruthy();

    const types = await asUser(t, owner).query(api.attributes.listTypes, { activeOnly: true });
    const sizeType = types.find((row) => row.slug === "size");
    expect(sizeType).toBeTruthy();

    const sizeAttrs = await asUser(t, owner).query(api.attributes.list, {
      attributeTypeId: sizeType!._id,
      activeOnly: true,
    });
    const optionIds = sizeAttrs.slice(0, 3).map((row) => row._id);

    await asUser(t, owner).mutation(api.variants.upsert, {
      title: "Topwear Size",
      attributeTypeId: sizeType!._id,
      categoryIds: [topwear!._id],
      attributeIds: optionIds,
    });

    const shopper = await seedUser(t);
    const facets = await asUser(t, shopper).query(api.variants.facets, {
      vendorId,
      categoryId: shirts!._id,
    });
    const sizeFacet = facets.find((row) => row._id === sizeType!._id);
    expect(sizeFacet).toBeTruthy();
    expect(sizeFacet!.values.map((value) => value._id).sort()).toEqual([...optionIds].sort());

    const women = tree.find((node) => node.slug === "women");
    expect(women).toBeTruthy();
    const womenFacets = await asUser(t, shopper).query(api.variants.facets, {
      vendorId,
      categoryId: women!._id,
    });
    expect(womenFacets.some((row) => row._id === sizeType!._id)).toBe(false);
  });
});
