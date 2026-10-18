import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
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
import { commissionInr, isOrderPaid } from "./shared/payments";

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

async function publishProduct(t: Harness, owner: SeededUser, input = PRODUCT_INPUT) {
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

describe("marketplace payments", () => {
  test("direct checkout stamps paid + commission snapshot", async () => {
    const t = harness();
    const { owner, vendorId } = await activeStore(t);
    const productId = await publishProduct(t, owner);
    const shopper = await seedUser(t);

    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 2 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    const order = (await t.run(async (ctx) => ctx.db.get(orderId))) as Doc<"orders"> | null;
    expect(order?.paymentStatus).toBe("paid");
    expect(isOrderPaid(order!)).toBe(true);

    const items = (await t.run(async (ctx) =>
      ctx.db
        .query("orderItems")
        .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
        .take(10),
    )) as Doc<"orderItems">[];
    expect(items).toHaveLength(1);
    expect(items[0].vendorId).toBe(vendorId);
    expect(items[0].commissionBps).toBe(1000);
  });

  test("settlement created on deliver when payout activated", async () => {
    const t = harness();
    const { owner, vendorId } = await activeStore(t);
    await t.run((ctx) =>
      ctx.db.patch(vendorId, {
        payoutStatus: "activated",
        payoutAccountId: "acc_test123",
        holdDays: 0,
      }),
    );
    const productId = await publishProduct(t, owner);
    const shopper = await seedUser(t);
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    const detail = await asUser(t, owner).query(api.vendorOrders.get, { orderId });
    const shipmentId = await asUser(t, owner).mutation(api.vendorOrders.shipLines, {
      orderItemIds: [detail.items[0].id],
    });
    await asUser(t, owner).mutation(api.vendorOrders.markDelivered, { shipmentId });

    const settlements = (await t.run(async (ctx) =>
      ctx.db
        .query("vendorSettlements")
        .withIndex("by_vendorId_and_createdAt", (q) => q.eq("vendorId", vendorId))
        .take(5),
    )) as Doc<"vendorSettlements">[];
    expect(settlements).toHaveLength(1);
    expect(settlements[0].status).toBe("pending");
    expect(settlements[0].grossInr).toBe(detail.items[0].priceInr);
    expect(settlements[0].commissionInr).toBe(
      commissionInr(detail.items[0].priceInr, 1000),
    );
    expect(settlements[0].netInr).toBe(
      detail.items[0].priceInr - commissionInr(detail.items[0].priceInr, 1000),
    );
  });

  test("fulfillCheckoutIntent is idempotent", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const productId = await publishProduct(t, owner);
    const shopper = await seedUser(t);
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });

    const prepared = await asUser(t, shopper).mutation(internal.orders.prepareCheckoutIntent, CHECKOUT);
    const intentId = await asUser(t, shopper).mutation(internal.orders.saveCheckoutIntent, {
      ...CHECKOUT,
      razorpayOrderId: "order_test_1",
      amountInr: prepared.amountInr,
      lines: prepared.lines,
      droppedNames: prepared.droppedNames,
    });

    const first = await asUser(t, shopper).mutation(internal.orders.fulfillPaidIntent, {
      intentId,
      razorpayOrderId: "order_test_1",
      razorpayPaymentId: "pay_test_1",
    });
    const second = await asUser(t, shopper).mutation(internal.orders.fulfillPaidIntent, {
      intentId,
      razorpayOrderId: "order_test_1",
      razorpayPaymentId: "pay_test_1",
    });
    expect(second.orderId).toBe(first.orderId);

    const orders = await t.run(async (ctx) => ctx.db.query("orders").take(10));
    expect(orders).toHaveLength(1);
  });

  test("expire past due vendor plans after grace", async () => {
    const t = harness();
    const { vendorId } = await activeStore(t);
    const past = Date.now() - 10 * 24 * 60 * 60 * 1000;
    await t.run((ctx) =>
      ctx.db.patch(vendorId, {
        planStatus: "past_due",
        planPeriodEnd: past,
      }),
    );
    const count = await t.mutation(internal.vendorBilling.expirePastDue, {});
    expect(count).toBe(1);
    const vendor = (await t.run(async (ctx) => ctx.db.get(vendorId))) as Doc<"vendors"> | null;
    expect(vendor?.planStatus).toBe("cancelled");
  });
});
