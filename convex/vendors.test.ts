import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, harness, PRODUCT_INPUT, seedUser, VENDOR_PROFILE } from "../tests/convex-harness";

const NOW = 1_790_700_000_000;

describe("vendors.register", () => {
  test("opens a pending store, makes the caller its owner and flips their role", async () => {
    const t = harness();
    const user = await seedUser(t);
    const vendorId = await asUser(t, user).mutation(api.vendors.register, VENDOR_PROFILE);

    const vendor = await t.run((ctx) => ctx.db.get(vendorId));
    expect(vendor?.status).toBe("pending");
    expect(vendor?.slug).toBe("loom-thread");
    expect(vendor?.code).toBe("V0001");
    expect(vendor?.plan).toBe("starter");

    const me = await asUser(t, user).query(api.vendors.me, { now: NOW });
    expect(me?.membership.role).toBe("owner");
    expect(me?.vendor.quota.limit).toBeGreaterThan(0);

    const stored = await t.run((ctx) => ctx.db.get(user.userId));
    expect(stored?.role).toBe("vendor");
  });

  test("rejects a second store for the same account", async () => {
    const t = harness();
    const user = await seedUser(t);
    await asUser(t, user).mutation(api.vendors.register, VENDOR_PROFILE);
    await expect(asUser(t, user).mutation(api.vendors.register, VENDOR_PROFILE)).rejects.toThrow(/already/i);
  });

  test("requires sign-in but not a fitting photo", async () => {
    const t = harness();
    await expect(t.mutation(api.vendors.register, VENDOR_PROFILE)).rejects.toThrow(/sign in/i);
    const fresh = await seedUser(t, { onboarded: false });
    await expect(asUser(t, fresh).mutation(api.vendors.register, VENDOR_PROFILE)).resolves.toBeTruthy();
  });

  test("validates the profile", async () => {
    const t = harness();
    const user = await seedUser(t);
    await expect(
      asUser(t, user).mutation(api.vendors.register, { ...VENDOR_PROFILE, supportEmail: "nope" }),
    ).rejects.toThrow(/email/i);
    await expect(
      asUser(t, user).mutation(api.vendors.register, { ...VENDOR_PROFILE, gstin: "123" }),
    ).rejects.toThrow(/gstin/i);
  });
});

describe("vendor membership", () => {
  test("owner can invite an existing account; staff cannot", async () => {
    const t = harness();
    const owner = await seedUser(t);
    const helper = await seedUser(t, { email: "helper@example.com" });
    await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);

    await asUser(t, owner).mutation(api.vendors.inviteMember, { email: "Helper@Example.com", role: "staff" });
    const members = await asUser(t, helper).query(api.vendors.listMembers, {});
    expect(members.map((m) => m.role).sort()).toEqual(["owner", "staff"]);

    await expect(
      asUser(t, helper).mutation(api.vendors.inviteMember, { email: "x@example.com", role: "staff" }),
    ).rejects.toThrow(/owner/i);
  });

  test("a user with no store is refused at the desk", async () => {
    const t = harness();
    const user = await seedUser(t);
    expect(await asUser(t, user).query(api.vendors.me, { now: NOW })).toBeNull();
    await expect(asUser(t, user).query(api.vendorProducts.counts, {})).rejects.toThrow(/vendor account/i);
  });
});

describe("vendorProducts", () => {
  async function activeStore() {
    const t = harness();
    const owner = await seedUser(t);
    const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
    await t.run((ctx) => ctx.db.patch(vendorId, { status: "active" }));
    return { t, owner, vendorId };
  }

  test("creates a draft with a variant and SKU, then publishes once it has a photo", async () => {
    const { t, owner, vendorId } = await activeStore();
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, PRODUCT_INPUT);

    let view = await asUser(t, owner).query(api.vendorProducts.get, { productId });
    expect(view.status).toBe("draft");
    expect(view.sku).toBe("V0001-CL-0001");
    expect(view.variants).toHaveLength(1);
    expect(view.variants[0].sku).toBe("V0001-CL-0001-01");
    expect(view.totalStock).toBe(5);

    await expect(asUser(t, owner).mutation(api.vendorProducts.publish, { productId })).rejects.toThrow(/photo/i);

    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["png"])));
    await asUser(t, owner).mutation(api.vendorProducts.update, { productId, ...PRODUCT_INPUT, imageIds: [storageId] });
    await asUser(t, owner).mutation(api.vendorProducts.publish, { productId });

    view = await asUser(t, owner).query(api.vendorProducts.get, { productId });
    expect(view.status).toBe("active");
    expect(view.images).toHaveLength(1);

    const vendor = await t.run((ctx) => ctx.db.get(vendorId));
    expect(vendor?.productCount).toBe(1);

    const counts = await asUser(t, owner).query(api.vendorProducts.counts, {});
    expect(counts).toMatchObject({ draft: 0, active: 1, archived: 0 });
  });

  test("stock adjustments write inventory movements and never go negative", async () => {
    const { t, owner } = await activeStore();
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, PRODUCT_INPUT);
    const view = await asUser(t, owner).query(api.vendorProducts.get, { productId });
    const variantId = view.variants[0].id;

    expect(await asUser(t, owner).mutation(api.vendorProducts.adjustVariantStock, { variantId, delta: 3 })).toBe(8);
    await expect(
      asUser(t, owner).mutation(api.vendorProducts.adjustVariantStock, { variantId, delta: -20 }),
    ).rejects.toThrow(/stock/i);

    const history = await asUser(t, owner).query(api.vendorProducts.stockHistory, { variantId });
    expect(history.map((row) => row.delta)).toEqual([3, 5]);
  });

  test("another vendor cannot read or edit the product", async () => {
    const { t, owner } = await activeStore();
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, PRODUCT_INPUT);

    const rival = await seedUser(t);
    await asUser(t, rival).mutation(api.vendors.register, { ...VENDOR_PROFILE, name: "Rival Co" });
    await expect(asUser(t, rival).query(api.vendorProducts.get, { productId })).rejects.toThrow();
    await expect(asUser(t, rival).mutation(api.vendorProducts.archive, { productId })).rejects.toThrow();
  });

  test("shoppers only see active products from sellable stores", async () => {
    const { t, owner, vendorId } = await activeStore();
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, PRODUCT_INPUT);
    const shopper = await seedUser(t);

    expect(await asUser(t, shopper).query(api.products.listForCategory, { category: "clothes" })).toEqual([]);

    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["png"])));
    await asUser(t, owner).mutation(api.vendorProducts.update, { productId, ...PRODUCT_INPUT, imageIds: [storageId] });
    await asUser(t, owner).mutation(api.vendorProducts.publish, { productId });

    const listed = await asUser(t, shopper).query(api.products.listForCategory, { category: "clothes" });
    expect(listed.map((p) => p.id)).toEqual([productId]);
    expect(listed[0].vendorSlug).toBe("loom-thread");

    await t.run((ctx) => ctx.db.patch(vendorId, { status: "suspended" }));
    expect(await asUser(t, shopper).query(api.products.listForCategory, { category: "clothes" })).toEqual([]);
  });

  test("cart picks the only variant and enforces stock", async () => {
    const { t, owner } = await activeStore();
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, PRODUCT_INPUT);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["png"])));
    await asUser(t, owner).mutation(api.vendorProducts.update, { productId, ...PRODUCT_INPUT, imageIds: [storageId] });
    await asUser(t, owner).mutation(api.vendorProducts.publish, { productId });

    const shopper = await seedUser(t);
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 2 });
    const cart = await asUser(t, shopper).query(api.cart.current, {});
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].variantLabel).toBe("M");
    expect(cart.lines[0].quantity).toBe(2);
    expect(await asUser(t, shopper).query(api.cart.count, {})).toBe(2);

    await expect(asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 9 })).rejects.toThrow(/stock|left/i);
  });
});
