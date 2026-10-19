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

describe("vendor carts", () => {
  test("lists this vendor's bag lines grouped by shopper with email", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId } = await publishProduct(t, owner);
    const shopper = await seedUser(t, { email: "buyer@example.com" });

    await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 2, addedFrom: "store" });

    const list = await asUser(t, owner).query(api.vendorCarts.list, {});
    expect(list.shopperCount).toBe(1);
    expect(list.lineCount).toBe(1);
    expect(list.shoppers[0].email).toBe("buyer@example.com");
    expect(list.shoppers[0].phone).toBeNull();
    expect(list.shoppers[0].lines).toHaveLength(1);
    expect(list.shoppers[0].lines[0].name).toBe("Linen Overshirt");
    expect(list.shoppers[0].lines[0].quantity).toBe(2);
    expect(list.shoppers[0].lines[0].addedFrom).toBe("store");
    expect(list.shoppers[0].itemCount).toBe(2);

    const counts = await asUser(t, owner).query(api.vendorCarts.counts, {});
    expect(counts).toEqual({ shoppers: 1, lines: 1 });
  });

  test("does not show another vendor's cart lines", async () => {
    const t = harness();
    const storeA = await activeStore(t, { ...VENDOR_PROFILE, name: "John Fashion", supportEmail: "a@ex.com" });
    const storeB = await activeStore(t, {
      ...VENDOR_PROFILE,
      name: "Mudra Fashion",
      supportEmail: "b@ex.com",
      address: { ...VENDOR_PROFILE.address, line1: "9 Silk Row" },
    });
    const productA = await publishProduct(t, storeA.owner, { ...PRODUCT_INPUT, name: "Brown Suit" });
    const productB = await publishProduct(t, storeB.owner, {
      ...PRODUCT_INPUT,
      name: "White Shirt",
      variants: [{ size: "L", stock: 3, active: true }],
    });
    const shopper = await seedUser(t);

    await asUser(t, shopper).mutation(api.cart.add, { productId: productA.productId, quantity: 1 });
    await asUser(t, shopper).mutation(api.cart.add, { productId: productB.productId, quantity: 1 });

    const listA = await asUser(t, storeA.owner).query(api.vendorCarts.list, {});
    const listB = await asUser(t, storeB.owner).query(api.vendorCarts.list, {});

    expect(listA.shoppers).toHaveLength(1);
    expect(listA.shoppers[0].lines.map((l) => l.name)).toEqual(["Brown Suit"]);
    expect(listB.shoppers).toHaveLength(1);
    expect(listB.shoppers[0].lines.map((l) => l.name)).toEqual(["White Shirt"]);
  });

  test("attaches phone from a prior order and clears after checkout", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const first = await publishProduct(t, owner, { ...PRODUCT_INPUT, name: "First Piece" });
    const second = await publishProduct(t, owner, {
      ...PRODUCT_INPUT,
      name: "Second Piece",
      variants: [{ size: "S", stock: 4, active: true }],
    });
    const shopper = await seedUser(t, { email: "asha@example.com" });

    await asUser(t, shopper).mutation(api.cart.add, { productId: first.productId, quantity: 1 });
    await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);

    await asUser(t, shopper).mutation(api.cart.add, { productId: second.productId, quantity: 1 });

    const list = await asUser(t, owner).query(api.vendorCarts.list, {});
    expect(list.shopperCount).toBe(1);
    expect(list.shoppers[0].phone).toBe("9876543210");
    expect(list.shoppers[0].lines.map((l) => l.name)).toEqual(["Second Piece"]);

    await asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);
    const after = await asUser(t, owner).query(api.vendorCarts.list, {});
    expect(after.shopperCount).toBe(0);
    expect(after.lineCount).toBe(0);
  });
});
