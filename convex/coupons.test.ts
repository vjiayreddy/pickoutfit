import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  asUser,
  harness,
  PRODUCT_INPUT,
  seedUser,
  VENDOR_PROFILE,
  type Harness,
  type SeededUser,
} from "../tests/convex-harness";

const CHECKOUT = {
  name: "Asha Rao",
  email: "asha@example.com",
  phone: "9876543210",
  address: "14 MG Road",
  city: "Bengaluru",
  pincode: "560001",
};

async function activeStore(t: Harness, profile = VENDOR_PROFILE) {
  const owner = await seedUser(t);
  const vendorId = await asUser(t, owner).mutation(api.vendors.register, profile);
  await t.run((ctx) => ctx.db.patch(vendorId, { status: "active", commissionBps: 1000 }));
  return { owner, vendorId };
}

async function publishProduct(
  t: Harness,
  owner: SeededUser,
  input: typeof PRODUCT_INPUT = PRODUCT_INPUT,
) {
  const productId = await asUser(t, owner).mutation(api.vendorProducts.create, input);
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["png"])));
  await asUser(t, owner).mutation(api.vendorProducts.update, {
    productId,
    ...input,
    imageIds: [storageId],
  });
  await asUser(t, owner).mutation(api.vendorProducts.publish, { productId });
  return productId;
}

describe("coupons", () => {
  test("promo code reduces checkout total and increments usedCount", async () => {
    const t = harness();
    const { owner, vendorId } = await activeStore(t);
    const productId = await publishProduct(t, owner);
    const now = Date.now();

    await asUser(t, owner).mutation(api.vendorDiscounts.create, {
      name: "Launch code",
      redemption: "code",
      code: "SAVE200",
      kind: "flat",
      value: 200,
      scope: "all",
      startsAt: now - 1000,
      active: true,
    });

    const shopper = await seedUser(t);
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    await asUser(t, shopper).mutation(api.coupons.applyCode, { code: "save200" });

    const cart = await asUser(t, shopper).query(api.cart.current, {});
    expect(cart.subtotalInr).toBe(2499);
    expect(cart.couponSavingsInr).toBe(200);
    expect(cart.totalInr).toBe(2299);
    expect(cart.coupons).toHaveLength(1);
    expect(cart.coupons[0]?.vendorId).toBe(vendorId);

    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);
    const order = (await t.run(async (ctx) => ctx.db.get(orderId))) as Doc<"orders"> | null;
    expect(order?.totalInr).toBe(2299);
    expect(order?.couponSavingsInr).toBe(200);
    expect(order?.coupons?.[0]?.code).toBe("SAVE200");

    const discounts = await asUser(t, owner).query(api.vendorDiscounts.list, {});
    expect(discounts[0]?.usedCount).toBe(1);

    const redemptions = (await t.run(async (ctx) =>
      ctx.db
        .query("couponRedemptions")
        .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
        .take(5),
    )) as Doc<"couponRedemptions">[];
    expect(redemptions).toHaveLength(1);
  });

  test("multi-vendor cart applies one coupon per vendor", async () => {
    const t = harness();
    const storeA = await activeStore(t, { ...VENDOR_PROFILE, name: "Store A", supportEmail: "a@ex.com" });
    const storeB = await activeStore(t, {
      ...VENDOR_PROFILE,
      name: "Store B",
      supportEmail: "b@ex.com",
    });
    const productA = await publishProduct(t, storeA.owner, {
      ...PRODUCT_INPUT,
      name: "Shirt A",
      priceInr: 1000,
    });
    const productB = await publishProduct(t, storeB.owner, {
      ...PRODUCT_INPUT,
      name: "Trouser B",
      priceInr: 2000,
    });
    const now = Date.now();

    await asUser(t, storeA.owner).mutation(api.vendorDiscounts.create, {
      name: "A code",
      redemption: "code",
      code: "A100",
      kind: "flat",
      value: 100,
      scope: "all",
      startsAt: now - 1000,
      active: true,
    });
    await asUser(t, storeB.owner).mutation(api.vendorDiscounts.create, {
      name: "B code",
      redemption: "code",
      code: "B10PCT",
      kind: "percent",
      value: 10,
      scope: "all",
      startsAt: now - 1000,
      active: true,
    });

    const shopper = await seedUser(t);
    await asUser(t, shopper).mutation(api.cart.add, { productId: productA, quantity: 2 });
    await asUser(t, shopper).mutation(api.cart.add, { productId: productB, quantity: 2 });
    await asUser(t, shopper).mutation(api.coupons.applyCode, { code: "A100" });
    await asUser(t, shopper).mutation(api.coupons.applyCode, { code: "B10PCT" });

    const cart = await asUser(t, shopper).query(api.cart.current, {});
    // 2*1000 + 2*2000 = 6000; A saves 100; B saves 10% of 4000 = 400
    expect(cart.subtotalInr).toBe(6000);
    expect(cart.couponSavingsInr).toBe(500);
    expect(cart.totalInr).toBe(5500);
    expect(cart.coupons).toHaveLength(2);

    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);
    const order = (await t.run(async (ctx) => ctx.db.get(orderId))) as Doc<"orders"> | null;
    expect(order?.totalInr).toBe(5500);
    expect(order?.coupons).toHaveLength(2);
  });

  test("clip coupon attaches per vendor and clears with clearForVendor", async () => {
    const t = harness();
    const { owner, vendorId } = await activeStore(t);
    const productId = await publishProduct(t, owner);
    const now = Date.now();

    const discountId = await asUser(t, owner).mutation(api.vendorDiscounts.create, {
      name: "Clip me",
      redemption: "clip",
      kind: "percent",
      value: 10,
      scope: "all",
      startsAt: now - 1000,
      active: true,
    });

    const shopper = await seedUser(t);
    const listed = await asUser(t, shopper).query(api.coupons.listForProduct, { productId });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.clipped).toBe(false);

    await asUser(t, shopper).mutation(api.coupons.clip, { discountId });
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });

    const cart = await asUser(t, shopper).query(api.cart.current, {});
    expect(cart.coupons).toHaveLength(1);
    expect(cart.couponSavingsInr).toBe(250); // 10% of 2499 rounded via applyDiscount

    await asUser(t, shopper).mutation(api.coupons.clearForVendor, { vendorId });
    const cleared = await asUser(t, shopper).query(api.cart.current, {});
    expect(cleared.coupons).toHaveLength(0);
    expect(cleared.totalInr).toBe(2499);
  });

  test("rejects another shopper's maxUsesPerUser", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const productId = await publishProduct(t, owner);
    const now = Date.now();

    await asUser(t, owner).mutation(api.vendorDiscounts.create, {
      name: "Once",
      redemption: "code",
      code: "ONCE",
      kind: "flat",
      value: 50,
      scope: "all",
      maxUsesPerUser: 1,
      startsAt: now - 1000,
      active: true,
    });

    const shopper = await seedUser(t);
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    await asUser(t, shopper).mutation(api.coupons.applyCode, { code: "ONCE" });
    await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    await expect(
      asUser(t, shopper).mutation(api.coupons.applyCode, { code: "ONCE" }),
    ).rejects.toThrow(/maximum/i);
  });

  test("auto offers still apply without coupon redemption", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const productId = await publishProduct(t, owner);
    const now = Date.now();

    await asUser(t, owner).mutation(api.vendorDiscounts.create, {
      name: "Auto 10",
      redemption: "auto",
      kind: "percent",
      value: 10,
      scope: "all",
      startsAt: now - 1000,
      active: true,
    });

    const shopper = await seedUser(t);
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    const cart = await asUser(t, shopper).query(api.cart.current, {});
    expect(cart.lines[0]?.priceInr).toBe(2249);
    expect(cart.couponSavingsInr).toBe(0);
  });
});
