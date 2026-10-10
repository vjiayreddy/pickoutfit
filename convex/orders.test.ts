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

describe("buyer orders", () => {
  test("listMine returns own orders newest first; other user sees none", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);
    const stranger = await seedUser(t);

    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    const mine = await asUser(t, shopper).query(api.orders.listMine, {});
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(orderId);
    expect(mine[0].status).toBe("placed");
    expect(mine[0].itemCount).toBe(1);
    expect(mine[0].itemPreview[0]).toBeTruthy();

    expect(await asUser(t, stranger).query(api.orders.listMine, {})).toEqual([]);
  });

  test("getMine rejects other users and missing orders", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);
    const stranger = await seedUser(t);

    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    await expect(asUser(t, stranger).query(api.orders.getMine, { orderId })).rejects.toThrow(
      /doesn't exist/i,
    );

    const fakeId = await t.run(async (ctx) => {
      const order = await ctx.db.query("orders").first();
      if (!order) throw new Error("expected order");
      // Use a valid Id shape that won't match — clone shopper's cart id won't work.
      // Delete then query: recreate by using another user's non-owned path is enough.
      return order._id;
    });
    await t.run(async (ctx) => {
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_orderId", (q) => q.eq("orderId", fakeId))
        .take(30);
      for (const item of items) await ctx.db.delete(item._id);
      await ctx.db.delete(fakeId);
    });
    await expect(asUser(t, shopper).query(api.orders.getMine, { orderId: fakeId })).rejects.toThrow(
      /doesn't exist/i,
    );
  });

  test("getMine timeline includes placed, shipped, and delivered with tracking", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);

    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
    const { orderId } = await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    let detail = await asUser(t, shopper).query(api.orders.getMine, { orderId });
    expect(detail.timeline.map((e) => e.kind)).toEqual(["placed"]);
    expect(detail.shipments).toHaveLength(0);

    const vendorDetail = await asUser(t, owner).query(api.vendorOrders.get, { orderId });
    await asUser(t, owner).mutation(api.vendorOrders.shipLines, {
      orderItemIds: [vendorDetail.items[0].id],
      carrier: "Delhivery",
      trackingNumber: "DLV123",
    });

    detail = await asUser(t, shopper).query(api.orders.getMine, { orderId });
    expect(detail.timeline.map((e) => e.kind)).toEqual(["placed", "shipped"]);
    expect(detail.shipments).toHaveLength(1);
    expect(detail.shipments[0].carrier).toBe("Delhivery");
    expect(detail.shipments[0].trackingNumber).toBe("DLV123");
    expect(detail.timeline.find((e) => e.kind === "shipped")?.trackingNumber).toBe("DLV123");

    await asUser(t, owner).mutation(api.vendorOrders.markDelivered, {
      shipmentId: detail.shipments[0].id,
    });

    detail = await asUser(t, shopper).query(api.orders.getMine, { orderId });
    expect(detail.timeline.map((e) => e.kind)).toEqual(["placed", "shipped", "delivered"]);
    expect(detail.shipments[0].status).toBe("delivered");
    expect(detail.shipments[0].deliveredAt).toBeTruthy();
  });
});
