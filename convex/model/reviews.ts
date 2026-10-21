import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { isOrderPaid } from "../shared/payments";
import {
  MAX_REVIEW_BODY,
  MAX_REVIEW_IMAGES,
  MAX_REVIEW_RATING,
  MAX_REVIEW_TITLE,
  MIN_REVIEW_BODY,
  MIN_REVIEW_RATING,
  REVIEW_ELIGIBILITY_ORDER_CAP,
} from "../shared/reviews";
import { lineStatusOf } from "./orders";

type Ctx = QueryCtx | MutationCtx;

export type EligiblePurchase = {
  orderId: Id<"orders">;
  orderItemId: Id<"orderItems">;
  vendorId: Id<"vendors">;
};

export type NormalizedReviewInput = {
  rating: number;
  title: string | undefined;
  body: string;
  imageStorageIds: Id<"_storage">[];
};

function displayName(user: Doc<"users">): string {
  const name = user.name?.trim();
  if (name) return name;
  const email = user.email?.trim();
  if (email) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }
  return "Shopper";
}

export async function imageUrlsFor(
  ctx: Ctx,
  storageIds: Id<"_storage">[] | undefined,
): Promise<string[]> {
  const ids = storageIds ?? [];
  const urls: string[] = [];
  for (const storageId of ids) {
    const url = await ctx.storage.getUrl(storageId);
    if (url) urls.push(url);
  }
  return urls;
}

export async function toPublicReview(ctx: Ctx, review: Doc<"productReviews">) {
  const author = await ctx.db.get(review.userId);
  return {
    id: review._id,
    productId: review.productId,
    rating: review.rating,
    title: review.title ?? null,
    body: review.body,
    imageUrls: await imageUrlsFor(ctx, review.imageStorageIds),
    authorName: author ? displayName(author) : "Shopper",
    vendorReply: review.vendorReply ?? null,
    vendorReplyAt: review.vendorReplyAt ?? null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

export async function toMineReview(ctx: Ctx, review: Doc<"productReviews">) {
  return {
    id: review._id,
    productId: review.productId,
    rating: review.rating,
    title: review.title ?? null,
    body: review.body,
    imageUrls: await imageUrlsFor(ctx, review.imageStorageIds),
    imageStorageIds: review.imageStorageIds ?? [],
    status: review.status,
    vendorReply: review.vendorReply ?? null,
    vendorReplyAt: review.vendorReplyAt ?? null,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

export function productReviewSummary(product: Doc<"products">) {
  const count = product.reviewCount ?? 0;
  const sum = product.ratingSum ?? 0;
  return {
    count,
    average: count > 0 ? Math.round((sum / count) * 10) / 10 : null,
  };
}

export async function findExistingReview(
  ctx: Ctx,
  userId: Id<"users">,
  productId: Id<"products">,
) {
  return ctx.db
    .query("productReviews")
    .withIndex("by_userId_and_productId", (q) =>
      q.eq("userId", userId).eq("productId", productId),
    )
    .unique();
}

/** Paid order line for this product that is not cancelled. */
export async function findEligiblePurchase(
  ctx: Ctx,
  userId: Id<"users">,
  productId: Id<"products">,
): Promise<EligiblePurchase | null> {
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
    .order("desc")
    .take(REVIEW_ELIGIBILITY_ORDER_CAP);

  for (const order of orders) {
    if (!isOrderPaid(order)) continue;
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .take(50);
    for (const item of items) {
      if (item.productId !== productId) continue;
      if (lineStatusOf(item) === "cancelled") continue;
      if (!item.vendorId) continue;
      return {
        orderId: order._id,
        orderItemId: item._id,
        vendorId: item.vendorId,
      };
    }
  }
  return null;
}

export async function canReviewProduct(
  ctx: Ctx,
  userId: Id<"users">,
  productId: Id<"products">,
) {
  const existing = await findExistingReview(ctx, userId, productId);
  if (existing) {
    return {
      eligible: false,
      reason: "You already reviewed this product.",
      existingReviewId: existing._id,
      orderId: existing.orderId,
      orderItemId: existing.orderItemId ?? null,
    };
  }
  const purchase = await findEligiblePurchase(ctx, userId, productId);
  if (!purchase) {
    return {
      eligible: false,
      reason: "Buy this product to leave a review.",
      existingReviewId: null,
      orderId: null,
      orderItemId: null,
    };
  }
  return {
    eligible: true,
    reason: null,
    existingReviewId: null,
    orderId: purchase.orderId,
    orderItemId: purchase.orderItemId,
  };
}

export function normalizeReviewInput(args: {
  rating: number;
  title?: string;
  body: string;
  imageStorageIds?: Id<"_storage">[];
}): NormalizedReviewInput {
  const rating = Math.round(args.rating);
  if (
    !Number.isFinite(rating) ||
    rating < MIN_REVIEW_RATING ||
    rating > MAX_REVIEW_RATING
  ) {
    throw appError("INVALID_INPUT", "Rating must be between 1 and 5.");
  }
  const body = args.body.trim();
  if (body.length < MIN_REVIEW_BODY) {
    throw appError(
      "INVALID_INPUT",
      `Write at least ${MIN_REVIEW_BODY} characters.`,
    );
  }
  if (body.length > MAX_REVIEW_BODY) {
    throw appError(
      "INVALID_INPUT",
      `Keep the review under ${MAX_REVIEW_BODY} characters.`,
    );
  }
  const titleRaw = args.title?.trim() ?? "";
  if (titleRaw.length > MAX_REVIEW_TITLE) {
    throw appError(
      "INVALID_INPUT",
      `Keep the title under ${MAX_REVIEW_TITLE} characters.`,
    );
  }
  const imageStorageIds = args.imageStorageIds ?? [];
  if (imageStorageIds.length > MAX_REVIEW_IMAGES) {
    throw appError(
      "INVALID_INPUT",
      `You can attach up to ${MAX_REVIEW_IMAGES} photos.`,
    );
  }
  return {
    rating,
    title: titleRaw.length > 0 ? titleRaw : undefined,
    body,
    imageStorageIds,
  };
}

export async function applyVisibleRatingDelta(
  ctx: MutationCtx,
  productId: Id<"products">,
  deltaCount: number,
  deltaSum: number,
) {
  const product = await ctx.db.get(productId);
  if (!product) return;
  const nextCount = Math.max(0, (product.reviewCount ?? 0) + deltaCount);
  const nextSum = Math.max(0, (product.ratingSum ?? 0) + deltaSum);
  await ctx.db.patch(productId, {
    reviewCount: nextCount,
    ratingSum: nextSum,
    updatedAt: Date.now(),
  });
}

export async function setReviewVisibility(
  ctx: MutationCtx,
  review: Doc<"productReviews">,
  status: "visible" | "hidden",
) {
  if (review.status === status) return;
  const now = Date.now();
  await ctx.db.patch(review._id, { status, updatedAt: now });
  if (status === "hidden") {
    await applyVisibleRatingDelta(ctx, review.productId, -1, -review.rating);
  } else {
    await applyVisibleRatingDelta(ctx, review.productId, 1, review.rating);
  }
}
