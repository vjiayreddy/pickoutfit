import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, harness, PRODUCT_INPUT, seedUser, VENDOR_PROFILE } from "../tests/convex-harness";

async function activeVendor() {
  const t = harness();
  const owner = await seedUser(t);
  const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
  await t.run((ctx) => ctx.db.patch(vendorId, { status: "active" }));
  return { t, owner, vendorId };
}

async function sizeColourVariants(
  t: ReturnType<typeof harness>,
  actor: Awaited<ReturnType<typeof seedUser>>,
) {
  // Register already seeds attributes; ensure catalog exists.
  await asUser(t, actor).mutation(api.attributes.seedDefaults, {});
  const types = await asUser(t, actor).query(api.attributes.listTypes, { activeOnly: true });
  const sizeType = types.find((row) => row.slug === "size");
  const colourType = types.find((row) => row.slug === "colour");
  expect(sizeType).toBeTruthy();
  expect(colourType).toBeTruthy();

  const sizeAttrs = await asUser(t, actor).query(api.attributes.list, {
    attributeTypeId: sizeType!._id,
    activeOnly: true,
  });
  const colourAttrs = await asUser(t, actor).query(api.attributes.list, {
    attributeTypeId: colourType!._id,
    activeOnly: true,
  });
  const m = sizeAttrs.find((row) => row.value === "m");
  const s = sizeAttrs.find((row) => row.value === "s");
  const navy = colourAttrs.find((row) => row.value === "navy");
  expect(m).toBeTruthy();
  expect(s).toBeTruthy();
  expect(navy).toBeTruthy();

  const categories = await asUser(t, actor).query(api.categories.list, { activeOnly: true });
  expect(categories.length).toBeGreaterThan(0);
  const categoryId = categories[0]!._id;

  const sizePick = [m!, s!, ...sizeAttrs.filter((row) => row._id !== m!._id && row._id !== s!._id)].slice(
    0,
    5,
  );
  const colourPick = [navy!, ...colourAttrs.filter((row) => row._id !== navy!._id)].slice(0, 5);

  const sizeId = await asUser(t, actor).mutation(api.variants.upsert, {
    title: "Size",
    attributeTypeId: sizeType!._id,
    categoryIds: [categoryId],
    attributeIds: sizePick.map((row) => row._id),
  });
  const colourId = await asUser(t, actor).mutation(api.variants.upsert, {
    title: "Colour",
    attributeTypeId: colourType!._id,
    categoryIds: [categoryId],
    attributeIds: colourPick.map((row) => row._id),
  });

  return {
    categoryId,
    size: { id: sizeId },
    colour: { id: colourId },
    m: m!,
    s: s!,
    navy: navy!,
  };
}

describe("variants catalog", () => {
  test("register seeds attributes; catalog empty until Variants are created", async () => {
    const { t, owner } = await activeVendor();
    const types = await asUser(t, owner).query(api.attributes.listTypes, { activeOnly: true });
    expect(types.map((row) => row.slug).sort()).toEqual(["colour", "size"]);
    expect(await asUser(t, owner).query(api.variants.catalog, {})).toEqual([]);
  });

  test("upsert creates a variant visible in catalog and list", async () => {
    const { t, owner } = await activeVendor();
    const { size, m } = await sizeColourVariants(t, owner);

    const list = await asUser(t, owner).query(api.variants.list, {});
    expect(list.some((row) => row._id === size.id)).toBe(true);

    const catalog = await asUser(t, owner).query(api.variants.catalog, {});
    const row = catalog.find((item) => item.id === size.id);
    expect(row?.label).toBe("Size");
    expect(row?.options.some((option) => option.id === m._id)).toBe(true);
  });

  test("variants are isolated between stores", async () => {
    const { t, owner } = await activeVendor();
    const rival = await seedUser(t, { email: "rival@example.com" });
    const rivalVendorId = await asUser(t, rival).mutation(api.vendors.register, {
      ...VENDOR_PROFILE,
      name: "Rival Co",
    });
    await t.run((ctx) => ctx.db.patch(rivalVendorId, { status: "active" }));

    const { size } = await sizeColourVariants(t, owner);
    const ownerCatalog = await asUser(t, owner).query(api.variants.catalog, {});
    const rivalCatalog = await asUser(t, rival).query(api.variants.catalog, {});
    expect(ownerCatalog.some((row) => row.id === size.id)).toBe(true);
    expect(rivalCatalog.some((row) => row.id === size.id)).toBe(false);
  });
});

describe("vendorProducts with attributeIds", () => {
  test("create resolves attributeIds into size/colour and returns options on get", async () => {
    const { t, owner } = await activeVendor();
    const { size, colour, m, navy, categoryId } = await sizeColourVariants(t, owner);

    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, {
      ...PRODUCT_INPUT,
      categoryId,
      variantCategoryIds: [size.id, colour.id],
      variants: [
        {
          attributeIds: [m._id, navy._id],
          stock: 5,
          active: true,
        },
      ],
    });

    const view = await asUser(t, owner).query(api.vendorProducts.get, { productId });
    expect(view.variantCategoryIds).toEqual([size.id, colour.id]);
    expect(view.variants).toHaveLength(1);
    expect(view.variants[0].attributeIds).toEqual([m._id, navy._id]);
    expect(view.variants[0].size).toBe("M");
    expect(view.variants[0].colour).toMatchObject({ name: "Navy", hex: "#1b2a4a" });
    expect(view.variants[0].options.map((o) => o.value).sort()).toEqual(["m", "navy"]);
  });

  test("rejects two options from the same variant", async () => {
    const { t, owner } = await activeVendor();
    const { size, m, s, categoryId } = await sizeColourVariants(t, owner);

    await expect(
      asUser(t, owner).mutation(api.vendorProducts.create, {
        ...PRODUCT_INPUT,
        categoryId,
        variantCategoryIds: [size.id],
        variants: [{ attributeIds: [m._id, s._id], stock: 1, active: true }],
      }),
    ).rejects.toThrow(/one option per variant/i);
  });

  test("rejects an option whose variant is not enabled on the product", async () => {
    const { t, owner } = await activeVendor();
    const { size, colour, m, navy, categoryId } = await sizeColourVariants(t, owner);

    await expect(
      asUser(t, owner).mutation(api.vendorProducts.create, {
        ...PRODUCT_INPUT,
        categoryId,
        variantCategoryIds: [size.id],
        variants: [{ attributeIds: [m._id, navy._id], stock: 1, active: true }],
      }),
    ).rejects.toThrow(/not enabled/i);

    await expect(
      asUser(t, owner).mutation(api.vendorProducts.create, {
        ...PRODUCT_INPUT,
        categoryId,
        variantCategoryIds: [colour.id],
        variants: [{ attributeIds: [m._id], stock: 1, active: true }],
      }),
    ).rejects.toThrow(/not enabled/i);
  });

  test("legacy free-form size/colour still works without attributeIds", async () => {
    const { t, owner } = await activeVendor();
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, PRODUCT_INPUT);
    const view = await asUser(t, owner).query(api.vendorProducts.get, { productId });
    expect(view.variants[0].size).toBe("M");
    expect(view.variants[0].attributeIds).toEqual([]);
    expect(view.variants[0].options).toEqual([]);
  });
});
