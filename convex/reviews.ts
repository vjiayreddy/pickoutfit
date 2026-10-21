import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAppUser, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  applyVisibleRatingDelta,
  canReviewProduct,
  findEligiblePurchase,
  findExistingReview,
  normalizeReviewInput,
  productReviewSummary,
  toMineReview,
  toPublicReview,
} from "./model/reviews";
import {
  vCanReview,
  vOrderReviewAction,
  vReviewMine,
  vReviewPublic,
  vReviewSummary,
} from "./shared/reviews";

export const summaryForProduct = query({
  args: { productId: v.id("products") },
  returns: vReviewSummary,
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId);
    if (!product) {
      return { count: 0, average: null };
    }
    return productReviewSummary(product);
  },
});

export const listForProduct = query({
  args: {
    productId: v.id("products"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vReviewPublic),
  handler: async (ctx, { productId, paginationOpts }) => {
    const page = await ctx.db
      .query("productReviews")
      .withIndex("by_productId_and_status_and_createdAt", (q) =>
        q.eq("productId", productId).eq("status", "visible"),
      )
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(page.page.map((row) => toPublicReview(ctx, row))),
    };
  },
});

export const mineForProduct = query({
  args: { productId: v.id("products") },
  returns: v.union(vReviewMine, v.null()),
  handler: async (ctx, { productId }) => {
    const user = await getAppUser(ctx);
    if (!user) return null;
    const existing = await findExistingReview(ctx, user._id, productId);
    if (!existing) return null;
    return toMineReview(ctx, existing);
  },
});

export const canReview = query({
  args: { productId: v.id("products") },
  returns: vCanReview,
  handler: async (ctx, { productId }) => {
    const user = await getAppUser(ctx);
    if (!user) {
      return {
        eligible: false,
        reason: "Sign in to leave a review.",
        existingReviewId: null,
        orderId: null,
        orderItemId: null,
      };
    }
    return canReviewProduct(ctx, user._id, productId);
  },
});

/** Per-line review CTAs for an order detail page. */
export const actionsForOrder = query({
  args: { orderId: v.id("orders") },
  returns: v.array(vOrderReviewAction),
  handler: async (ctx, { orderId }) => {
    const user = await requireUser(ctx);
    const order = await ctx.db.get(orderId);
    if (!order || order.userId !== user._id) {
      throw appError("NOT_FOUND", "That order doesn't exist.");
    }
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .take(50);

    const actions = [];
    for (const item of items) {
      if (!item.productId) {
        actions.push({
          orderItemId: item._id,
          productId: null,
          vendorSlug: null,
          productSlug: null,
          eligible: false,
          reason: "This line can't be reviewed.",
          existingReviewId: null,
        });
        continue;
      }
      const product = await ctx.db.get(item.productId);
      const vendor = product?.vendorId
        ? await ctx.db.get(product.vendorId)
        : null;
      const status = await canReviewProduct(ctx, user._id, item.productId);
      actions.push({
        orderItemId: item._id,
        productId: item.productId,
        vendorSlug: vendor?.slug ?? null,
        productSlug: product?.slug ?? null,
        eligible: status.eligible,
        reason: status.reason,
        existingReviewId: status.existingReviewId,
      });
    }
    return actions;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    productId: v.id("products"),
    rating: v.number(),
    title: v.optional(v.string()),
    body: v.string(),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.id("productReviews"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product || !product.vendorId) {
      throw appError("NOT_FOUND", "That product doesn't exist.");
    }
    const existing = await findExistingReview(ctx, user._id, args.productId);
    if (existing) {
      throw appError("CONFLICT", "You already reviewed this product.");
    }
    const purchase = await findEligiblePurchase(ctx, user._id, args.productId);
    if (!purchase) {
      throw appError("FORBIDDEN", "Buy this product to leave a review.");
    }
    if (purchase.vendorId !== product.vendorId) {
      throw appError("FORBIDDEN", "Buy this product to leave a review.");
    }
    const input = normalizeReviewInput(args);
    const now = Date.now();
    const reviewId = await ctx.db.insert("productReviews", {
      productId: args.productId,
      vendorId: product.vendorId,
      userId: user._id,
      orderId: purchase.orderId,
      orderItemId: purchase.orderItemId,
      rating: input.rating,
      title: input.title,
      body: input.body,
      imageStorageIds:
        input.imageStorageIds.length > 0 ? input.imageStorageIds : undefined,
      status: "visible",
      createdAt: now,
      updatedAt: now,
    });
    await applyVisibleRatingDelta(ctx, args.productId, 1, input.rating);
    return reviewId;
  },
});

export const update = mutation({
  args: {
    reviewId: v.id("productReviews"),
    rating: v.number(),
    title: v.optional(v.string()),
    body: v.string(),
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.userId !== user._id) {
      throw appError("NOT_FOUND", "That review doesn't exist.");
    }
    const input = normalizeReviewInput(args);
    const previousRating = review.rating;
    const wasVisible = review.status === "visible";
    const now = Date.now();
    const {
      _id,
      _creationTime,
      title: _oldTitle,
      imageStorageIds: _oldImages,
      ...rest
    } = review;
    await ctx.db.replace(_id, {
      ...rest,
      rating: input.rating,
      body: input.body,
      updatedAt: now,
      ...(input.title ? { title: input.title } : {}),
      ...(input.imageStorageIds.length > 0
        ? { imageStorageIds: input.imageStorageIds }
        : {}),
    });
    if (wasVisible && input.rating !== previousRating) {
      await applyVisibleRatingDelta(
        ctx,
        review.productId,
        0,
        input.rating - previousRating,
      );
    }
    return null;
  },
});

export const remove = mutation({
  args: { reviewId: v.id("productReviews") },
  returns: v.null(),
  handler: async (ctx, { reviewId }) => {
    const user = await requireUser(ctx);
    const review = await ctx.db.get(reviewId);
    if (!review || review.userId !== user._id) {
      throw appError("NOT_FOUND", "That review doesn't exist.");
    }
    if (review.status === "visible") {
      await applyVisibleRatingDelta(ctx, review.productId, -1, -review.rating);
    }
    for (const storageId of review.imageStorageIds ?? []) {
      await ctx.storage.delete(storageId);
    }
    await ctx.db.delete(reviewId);
    return null;
  },
});

/** Discard an uploaded photo that was never attached to a saved review. */
export const discardImage = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    await requireUser(ctx);
    await ctx.storage.delete(storageId);
    return null;
  },
});
