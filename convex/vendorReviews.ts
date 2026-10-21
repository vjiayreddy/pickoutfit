import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertVendorOwns,
  assertVendorWritable,
  requireVendor,
} from "./lib/auth";
import { appError } from "./lib/errors";
import {
  imageUrlsFor,
  setReviewVisibility,
} from "./model/reviews";
import { vReviewStatus, vVendorReviewListItem } from "./shared/reviews";

const MIN_VENDOR_REPLY = 2;
const MAX_VENDOR_REPLY = 2000;

export const list = query({
  args: {
    status: v.optional(vReviewStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vVendorReviewListItem),
  handler: async (ctx, { status, paginationOpts }) => {
    const { vendor } = await requireVendor(ctx);
    const page = status
      ? await ctx.db
          .query("productReviews")
          .withIndex("by_vendorId_and_status_and_createdAt", (q) =>
            q.eq("vendorId", vendor._id).eq("status", status),
          )
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("productReviews")
          .withIndex("by_vendorId_and_createdAt", (q) =>
            q.eq("vendorId", vendor._id),
          )
          .order("desc")
          .paginate(paginationOpts);

    const items = [];
    for (const review of page.page) {
      const product = await ctx.db.get(review.productId);
      const author = await ctx.db.get(review.userId);
      items.push({
        id: review._id,
        productId: review.productId,
        productName: product?.name ?? "Product",
        productSlug: product?.slug ?? null,
        rating: review.rating,
        title: review.title ?? null,
        body: review.body,
        imageUrls: await imageUrlsFor(ctx, review.imageStorageIds),
        authorName: author?.name?.trim() || author?.email || "Shopper",
        status: review.status,
        vendorReply: review.vendorReply ?? null,
        vendorReplyAt: review.vendorReplyAt ?? null,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      });
    }

    return { ...page, page: items };
  },
});

export const reply = mutation({
  args: {
    reviewId: v.id("productReviews"),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { reviewId, body }) => {
    const { user, vendor } = await requireVendor(ctx, { minRole: "staff" });
    assertVendorWritable(vendor);
    const review = await ctx.db.get(reviewId);
    assertVendorOwns(review, vendor, "review");
    const text = body.trim();
    if (text.length < MIN_VENDOR_REPLY) {
      throw appError("INVALID_INPUT", "Write a short reply.");
    }
    if (text.length > MAX_VENDOR_REPLY) {
      throw appError(
        "INVALID_INPUT",
        `Keep the reply under ${MAX_VENDOR_REPLY} characters.`,
      );
    }
    const now = Date.now();
    await ctx.db.patch(reviewId, {
      vendorReply: text,
      vendorReplyAt: now,
      vendorReplyByUserId: user._id,
      updatedAt: now,
    });
    return null;
  },
});

export const clearReply = mutation({
  args: { reviewId: v.id("productReviews") },
  returns: v.null(),
  handler: async (ctx, { reviewId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "staff" });
    assertVendorWritable(vendor);
    const review = await ctx.db.get(reviewId);
    const owned = assertVendorOwns(review, vendor, "review");
    const {
      _id,
      _creationTime,
      vendorReply: _reply,
      vendorReplyAt: _at,
      vendorReplyByUserId: _by,
      ...rest
    } = owned;
    await ctx.db.replace(_id, {
      ...rest,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const hide = mutation({
  args: { reviewId: v.id("productReviews") },
  returns: v.null(),
  handler: async (ctx, { reviewId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const review = assertVendorOwns(await ctx.db.get(reviewId), vendor, "review");
    await setReviewVisibility(ctx, review, "hidden");
    return null;
  },
});

export const unhide = mutation({
  args: { reviewId: v.id("productReviews") },
  returns: v.null(),
  handler: async (ctx, { reviewId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const review = assertVendorOwns(await ctx.db.get(reviewId), vendor, "review");
    await setReviewVisibility(ctx, review, "visible");
    return null;
  },
});
