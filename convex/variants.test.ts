import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, harness, PRODUCT_INPUT, seedUser, VENDOR_PROFILE } from "../tests/convex-harness";
import { SEED_VARIANT_TYPES } from "./shared/variants";

const EXPECTED_TYPES = SEED_VARIANT_TYPES.length;
const EXPECTED_OPTIONS = SEED_VARIANT_TYPES.reduce((n, t) => n + t.options.length, 0);

async function activeVendor() {
  const t = harness();
  const owner = await seedUser(t);
  const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
  await t.run((ctx) => ctx.db.patch(vendorId, { status: "active" }));
  return { t, owner, vendorId };
}

async function seededCatalog(t: ReturnType<typeof harness>, actor: Awaited<ReturnType<typeof seedUser>>) {
  const counts = await asUser(t, actor).mutation(api.variants.seedDefaults, {});
  expect(counts).toEqual({ types: EXPECTED_TYPES, options: EXPECTED_OPTIONS });
  const catalog = await asUser(t, actor).query(api.variants.catalog, {});
  const size = catalog.find((row) => row.slug === "size");
  const colour = catalog.find((row) => row.slug === "colour");
  expect(size).toBeTruthy();
  expect(colour).toBeTruthy();
  const m = size!.options.find((o) => o.value === "m");
  const navy = colour!.options.find((o) => o.value === "navy");
  expect(m).toBeTruthy();
  expect(navy).toBeTruthy();
  return { catalog, size: size!, colour: colour!, m: m!, navy: navy! };
}

describe("variants.seedDefaults", () => {
  test("register seeds Size + Colour; seedDefaults is idempotent", async () => {
    const { t, owner } = await activeVendor();
    const catalog = await asUser(t, owner).query(api.variants.catalog, {});
    expect(catalog.map((row) => row.slug).sort()).toEqual(["colour", "size"]);
    expect(catalog.reduce((n, row) => n + row.options.length, 0)).toBe(EXPECTED_OPTIONS);

    const again = await asUser(t, owner).mutation(api.variants.seedDefaults, {});
    expect(again).toEqual({ types: EXPECTED_TYPES, options: EXPECTED_OPTIONS });
  });

  test("anonymous callers cannot seed", async () => {
    const t = harness();
    await expect(t.mutation(api.variants.seedDefaults, {})).rejects.toThrow(/sign in/i);
  });

  test("plain users without a store cannot seed", async () => {
    const t = harness();
    const user = await seedUser(t);
    await expect(asUser(t, user).mutation(api.variants.seedDefaults, {})).rejects.toThrow(/vendor/i);
  });
});

describe("variants catalog + CRUD", () => {
  test("catalog is empty without a store membership", async () => {
    const { t, owner } = await activeVendor();
    await asUser(t, owner).mutation(api.variants.seedDefaults, {});
    expect(await t.query(api.variants.catalog, {})).toEqual([]);
  });

  test("vendor owner can create a type and option; plain users cannot", async () => {
    const { t, owner } = await activeVendor();
    const stranger = await seedUser(t, { email: "stranger@example.com" });

    await expect(
      asUser(t, stranger).mutation(api.variants.createType, { label: "Fit" }),
    ).rejects.toThrow(/vendor/i);

    const typeId = await asUser(t, owner).mutation(api.variants.createType, {
      label: "Fit",
      slug: "fit",
    });
    const optionId = await asUser(t, owner).mutation(api.variants.createOption, {
      variantTypeId: typeId,
      label: "Relaxed",
    });

    const catalog = await asUser(t, owner).query(api.variants.catalog, { activeOnly: false });
    const fit = catalog.find((row) => row.id === typeId);
    expect(fit?.options.some((o) => o.id === optionId && o.value === "relaxed")).toBe(true);

    await asUser(t, owner).mutation(api.variants.updateOption, {
      variantOptionId: optionId,
      isActive: false,
    });
    const activeOnly = await asUser(t, owner).query(api.variants.catalog, {});
    expect(activeOnly.find((row) => row.id === typeId)?.options.some((o) => o.id === optionId)).toBe(
      false,
    );
  });

  test("variant types are isolated between stores", async () => {
    const { t, owner } = await activeVendor();
    const rival = await seedUser(t, { email: "rival@example.com" });
    const rivalVendorId = await asUser(t, rival).mutation(api.vendors.register, {
      ...VENDOR_PROFILE,
      name: "Rival Co",
    });
    await t.run((ctx) => ctx.db.patch(rivalVendorId, { status: "active" }));

    const typeId = await asUser(t, owner).mutation(api.variants.createType, {
      label: "Material",
      slug: "material",
    });
    const ownerCatalog = await asUser(t, owner).query(api.variants.catalog, {});
    const rivalCatalog = await asUser(t, rival).query(api.variants.catalog, {});
    expect(ownerCatalog.some((row) => row.id === typeId)).toBe(true);
    expect(rivalCatalog.some((row) => row.id === typeId)).toBe(false);
  });
});

describe("vendorProducts with optionIds", () => {
  test("create resolves optionIds into size/colour and returns options on get", async () => {
    const { t, owner } = await activeVendor();
    const { size, colour, m, navy } = await seededCatalog(t, owner);

    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, {
      ...PRODUCT_INPUT,
      variantTypeIds: [size.id, colour.id],
      variants: [
        {
          optionIds: [m.id, navy.id],
          stock: 5,
          active: true,
        },
      ],
    });

    const view = await asUser(t, owner).query(api.vendorProducts.get, { productId });
    expect(view.variantTypeIds).toEqual([size.id, colour.id]);
    expect(view.variants).toHaveLength(1);
    expect(view.variants[0].optionIds).toEqual([m.id, navy.id]);
    expect(view.variants[0].size).toBe("M");
    expect(view.variants[0].colour).toMatchObject({ name: "Navy", hex: "#1b2a4a" });
    expect(view.variants[0].options.map((o) => o.value).sort()).toEqual(["m", "navy"]);
  });

  test("rejects two options from the same type", async () => {
    const { t, owner } = await activeVendor();
    const { size, m } = await seededCatalog(t, owner);
    const s = size.options.find((o) => o.value === "s");
    expect(s).toBeTruthy();

    await expect(
      asUser(t, owner).mutation(api.vendorProducts.create, {
        ...PRODUCT_INPUT,
        variantTypeIds: [size.id],
        variants: [{ optionIds: [m.id, s!.id], stock: 1, active: true }],
      }),
    ).rejects.toThrow(/one option per type/i);
  });

  test("rejects an option whose type is not enabled on the product", async () => {
    const { t, owner } = await activeVendor();
    const { size, colour, m, navy } = await seededCatalog(t, owner);

    await expect(
      asUser(t, owner).mutation(api.vendorProducts.create, {
        ...PRODUCT_INPUT,
        variantTypeIds: [size.id],
        variants: [{ optionIds: [m.id, navy.id], stock: 1, active: true }],
      }),
    ).rejects.toThrow(/not enabled/i);

    await expect(
      asUser(t, owner).mutation(api.vendorProducts.create, {
        ...PRODUCT_INPUT,
        variantTypeIds: [colour.id],
        variants: [{ optionIds: [m.id], stock: 1, active: true }],
      }),
    ).rejects.toThrow(/not enabled/i);
  });

  test("legacy free-form size/colour still works without optionIds", async () => {
    const { t, owner } = await activeVendor();
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, PRODUCT_INPUT);
    const view = await asUser(t, owner).query(api.vendorProducts.get, { productId });
    expect(view.variants[0].size).toBe("M");
    expect(view.variants[0].optionIds).toEqual([]);
    expect(view.variants[0].options).toEqual([]);
  });
});
