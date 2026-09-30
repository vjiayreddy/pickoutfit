import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  harness,
  PRODUCT_INPUT,
  seedUser,
  VENDOR_PROFILE,
  type Harness,
  type SeededUser,
} from "../tests/convex-harness";
import type { Id } from "./_generated/dataModel";

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
  await t.run((ctx) => ctx.db.patch(vendorId, { status: "active" }));
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
  const view = await asUser(t, owner).query(api.vendorProducts.get, { productId });
  return { productId, variantId: view.variants[0].id as Id<"productVariants">, view };
}

describe("vendor orders fulfillment & returns", () => {
  test("checkout reserves stock and stamps vendor/variant on lines", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId, variantId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);

    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 2 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    const order = await asUser(t, shopper).query(api.orders.getMine, { orderId });
    expect(order.items).toHaveLength(1);
    expect(order.items[0].variantId).toBe(variantId);
    expect(order.items[0].vendorId).toBeTruthy();
    expect(order.items[0].lineStatus).toBe("placed");
    expect(order.items[0].sku).toBeTruthy();

    const stock = await t.run(async (ctx) => (await ctx.db.get(variantId))?.stock);
    expect(stock).toBe(3);

    const movements = await asUser(t, owner).query(api.vendorProducts.stockHistory, { variantId });
    expect(movements[0]?.reason).toBe("order_reserve");
    expect(movements[0]?.delta).toBe(-2);
  });

  test("insufficient stock fails checkout without writing an order", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId, variantId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);

    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 5 });
    await t.run((ctx) => ctx.db.patch(variantId, { stock: 1 }));

    await expect(asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT)).rejects.toThrow(
      /available|stock|empty/i,
    );
    const orders = await t.run(async (ctx) => ctx.db.query("orders").take(10));
    expect(orders).toHaveLength(0);
  });

  test("vendor A cannot see or act on vendor B lines", async () => {
    const t = harness();
    const a = await activeStore(t, { ...VENDOR_PROFILE, name: "Alpha Co" });
    const b = await activeStore(t, { ...VENDOR_PROFILE, name: "Beta Co" });
    const { productId } = await publishProduct(t, a.owner, { ...PRODUCT_INPUT, name: "Alpha Shirt" });
    const shopper = await seedUser(t);
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    await expect(asUser(t, b.owner).query(api.vendorOrders.get, { orderId })).rejects.toThrow(
      /doesn't exist/i,
    );

    const detail = await asUser(t, a.owner).query(api.vendorOrders.get, { orderId });
    await expect(
      asUser(t, b.owner).mutation(api.vendorOrders.shipLines, {
        orderItemIds: [detail.items[0].id],
      }),
    ).rejects.toThrow(/doesn't exist/i);
  });

  test("ship, cancel, and return restock with the right reasons", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId, variantId } = await publishProduct(t, owner, {
      ...PRODUCT_INPUT,
      variants: [{ size: "M", stock: 10, active: true }],
    });
    const shopper = await seedUser(t);

    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 4 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);
    let detail = await asUser(t, owner).query(api.vendorOrders.get, { orderId });
    const [line] = detail.items;

    // Cancel  — restore via order_cancel. Place a second order for ship/return path.
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 3 });
    const second = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);
    const secondDetail = await asUser(t, owner).query(api.vendorOrders.get, { orderId: second.orderId });
    const secondLine = secondDetail.items[0];

    await asUser(t, owner).mutation(api.vendorOrders.cancelLines, { orderItemIds: [line.id] });
    // 10 − 4 − 3 + 4 cancel = 7
    expect((await t.run(async (ctx) => (await ctx.db.get(variantId))?.stock))).toBe(7);
    const afterCancel = await asUser(t, owner).query(api.vendorProducts.stockHistory, { variantId });
    expect(afterCancel[0]?.reason).toBe("order_cancel");

    await asUser(t, owner).mutation(api.vendorOrders.shipLines, {
      orderItemIds: [secondLine.id],
      carrier: "Delhivery",
      trackingNumber: "DL123",
    });
    detail = await asUser(t, owner).query(api.vendorOrders.get, { orderId: second.orderId });
    expect(detail.items[0].lineStatus).toBe("shipped");
    expect(detail.shipments).toHaveLength(1);
    expect(detail.orderStatus).toBe("fulfilled");

    const returnId = await asUser(t, owner).mutation(api.vendorOrders.createReturn, {
      orderItemId: secondLine.id,
      quantity: 2,
      reason: "Wrong size",
    });
    await asUser(t, owner).mutation(api.vendorOrders.resolveReturn, {
      returnId,
      status: "accepted",
    });
    // 7 + 2 return = 9
    expect((await t.run(async (ctx) => (await ctx.db.get(variantId))?.stock))).toBe(9);
    const afterReturn = await asUser(t, owner).query(api.vendorProducts.stockHistory, { variantId });
    expect(afterReturn[0]?.reason).toBe("return");

    detail = await asUser(t, owner).query(api.vendorOrders.get, { orderId: second.orderId });
    expect(detail.items[0].lineStatus).toBe("shipped"); // partial return

    const rejectId = await asUser(t, owner).mutation(api.vendorOrders.createReturn, {
      orderItemId: secondLine.id,
      quantity: 1,
      reason: "Changed mind",
    });
    const stockBeforeReject = await t.run(async (ctx) => (await ctx.db.get(variantId))?.stock);
    await asUser(t, owner).mutation(api.vendorOrders.resolveReturn, {
      returnId: rejectId,
      status: "rejected",
    });
    expect(await t.run(async (ctx) => (await ctx.db.get(variantId))?.stock)).toBe(stockBeforeReject);
  });

  test("multi-vendor cart: each vendor ships their lines; order fulfills when both ship", async () => {
    const t = harness();
    const a = await activeStore(t, { ...VENDOR_PROFILE, name: "North Loom" });
    const b = await activeStore(t, { ...VENDOR_PROFILE, name: "South Loom" });
    const aProduct = await publishProduct(t, a.owner, { ...PRODUCT_INPUT, name: "North Tee" });
    const bProduct = await publishProduct(t, b.owner, { ...PRODUCT_INPUT, name: "South Tee" });
    const shopper = await seedUser(t);

    await asUser(t, shopper).mutation(api.cart.add, { productId: aProduct.productId, quantity: 1 });
    await asUser(t, shopper).mutation(api.cart.add, { productId: bProduct.productId, quantity: 1 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    const aDetail = await asUser(t, a.owner).query(api.vendorOrders.get, { orderId });
    const bDetail = await asUser(t, b.owner).query(api.vendorOrders.get, { orderId });
    expect(aDetail.items).toHaveLength(1);
    expect(bDetail.items).toHaveLength(1);
    expect(aDetail.orderStatus).toBe("placed");

    await asUser(t, a.owner).mutation(api.vendorOrders.shipLines, {
      orderItemIds: [aDetail.items[0].id],
    });
    expect((await asUser(t, shopper).query(api.orders.getMine, { orderId })).status).toBe("placed");

    await asUser(t, b.owner).mutation(api.vendorOrders.shipLines, {
      orderItemIds: [bDetail.items[0].id],
    });
    expect((await asUser(t, shopper).query(api.orders.getMine, { orderId })).status).toBe("fulfilled");
  });

  test("full return marks the line returned", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);
    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);
    const detail = await asUser(t, owner).query(api.vendorOrders.get, { orderId });
    await asUser(t, owner).mutation(api.vendorOrders.shipLines, {
      orderItemIds: [detail.items[0].id],
    });
    const returnId = await asUser(t, owner).mutation(api.vendorOrders.createReturn, {
      orderItemId: detail.items[0].id,
      quantity: 1,
      reason: "Damaged",
    });
    await asUser(t, owner).mutation(api.vendorOrders.resolveReturn, {
      returnId,
      status: "accepted",
    });
    const after = await asUser(t, owner).query(api.vendorOrders.get, { orderId });
    expect(after.items[0].lineStatus).toBe("returned");
    expect(after.orderStatus).toBe("fulfilled");
  });
});
