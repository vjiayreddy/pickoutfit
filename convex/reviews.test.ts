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

const REVIEW_BODY =
  "Fit is true to size and the linen breathes well on hot days. Would buy again.";

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
  return { productId };
}

async function buyProduct(t: Harness, shopper: SeededUser, productId: Id<"products">) {
  await asUser(t, shopper).mutation(api.cart.add, { productId, quantity: 1 });
  return asUser(t, shopper).mutation(api.orders.checkout, CHECKOUT);
}

describe("product reviews", () => {
  test("ineligible buyer cannot create; purchase unlocks one review", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);

    const blocked = await asUser(t, shopper).query(api.reviews.canReview, { productId });
    expect(blocked.eligible).toBe(false);

    await expect(
      asUser(t, shopper).mutation(api.reviews.create, {
        productId,
        rating: 5,
        body: REVIEW_BODY,
      }),
    ).rejects.toThrow(/Buy this product/i);

    await buyProduct(t, shopper, productId);

    const allowed = await asUser(t, shopper).query(api.reviews.canReview, { productId });
    expect(allowed.eligible).toBe(true);

    const reviewId = await asUser(t, shopper).mutation(api.reviews.create, {
      productId,
      rating: 5,
      title: "Great shirt",
      body: REVIEW_BODY,
    });
    expect(reviewId).toBeTruthy();

    await expect(
      asUser(t, shopper).mutation(api.reviews.create, {
        productId,
        rating: 4,
        body: REVIEW_BODY,
      }),
    ).rejects.toThrow(/already reviewed/i);

    const product = await t.run((ctx) => ctx.db.get(productId));
    expect(product?.reviewCount).toBe(1);
    expect(product?.ratingSum).toBe(5);
  });

  test("hidden reviews drop from public list and product average", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);
    await buyProduct(t, shopper, productId);

    const reviewId = await asUser(t, shopper).mutation(api.reviews.create, {
      productId,
      rating: 4,
      body: REVIEW_BODY,
    });

    const listed = await asUser(t, shopper).query(api.reviews.listForProduct, {
      productId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(listed.page).toHaveLength(1);

    await asUser(t, owner).mutation(api.vendorReviews.hide, { reviewId });

    const afterHide = await asUser(t, shopper).query(api.reviews.listForProduct, {
      productId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(afterHide.page).toHaveLength(0);

    const product = await t.run((ctx) => ctx.db.get(productId));
    expect(product?.reviewCount).toBe(0);
    expect(product?.ratingSum).toBe(0);

    await asUser(t, owner).mutation(api.vendorReviews.unhide, { reviewId });
    const restored = await t.run((ctx) => ctx.db.get(productId));
    expect(restored?.reviewCount).toBe(1);
    expect(restored?.ratingSum).toBe(4);
  });

  test("other vendor cannot reply or hide", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);
    await buyProduct(t, shopper, productId);
    const reviewId = await asUser(t, shopper).mutation(api.reviews.create, {
      productId,
      rating: 5,
      body: REVIEW_BODY,
    });

    const other = await activeStore(t, {
      ...VENDOR_PROFILE,
      name: "Other Store",
      supportEmail: "other@example.com",
    });

    await expect(
      asUser(t, other.owner).mutation(api.vendorReviews.reply, {
        reviewId,
        body: "Thanks for shopping with us!",
      }),
    ).rejects.toThrow(/doesn't exist/i);

    await expect(
      asUser(t, other.owner).mutation(api.vendorReviews.hide, { reviewId }),
    ).rejects.toThrow(/doesn't exist/i);
  });

  test("vendor reply and rating edit update stats", async () => {
    const t = harness();
    const { owner } = await activeStore(t);
    const { productId } = await publishProduct(t, owner);
    const shopper = await seedUser(t);
    await buyProduct(t, shopper, productId);

    const reviewId = await asUser(t, shopper).mutation(api.reviews.create, {
      productId,
      rating: 3,
      body: REVIEW_BODY,
    });

    await asUser(t, owner).mutation(api.vendorReviews.reply, {
      reviewId,
      body: "Thanks — glad it worked for you.",
    });

    const publicList = await asUser(t, shopper).query(api.reviews.listForProduct, {
      productId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(publicList.page[0]?.vendorReply).toMatch(/glad it worked/i);

    await asUser(t, shopper).mutation(api.reviews.update, {
      reviewId,
      rating: 5,
      body: REVIEW_BODY,
    });
    const product = await t.run((ctx) => ctx.db.get(productId));
    expect(product?.reviewCount).toBe(1);
    expect(product?.ratingSum).toBe(5);
  });
});
