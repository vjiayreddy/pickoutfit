import { v } from "convex/values";
import { literals } from "./validators";

export const REVIEW_STATUSES = ["visible", "hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const vReviewStatus = literals(REVIEW_STATUSES);

export const MIN_REVIEW_RATING = 1;
export const MAX_REVIEW_RATING = 5;
export const MIN_REVIEW_BODY = 20;
export const MAX_REVIEW_BODY = 2000;
export const MAX_REVIEW_TITLE = 120;
export const MAX_REVIEW_IMAGES = 4;
/** How many recent orders to scan when checking purchase eligibility. */
export const REVIEW_ELIGIBILITY_ORDER_CAP = 100;

export const vReviewPublic = v.object({
  id: v.id("productReviews"),
  productId: v.id("products"),
  rating: v.number(),
  title: v.union(v.string(), v.null()),
  body: v.string(),
  imageUrls: v.array(v.string()),
  authorName: v.string(),
  vendorReply: v.union(v.string(), v.null()),
  vendorReplyAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const vReviewMine = v.object({
  id: v.id("productReviews"),
  productId: v.id("products"),
  rating: v.number(),
  title: v.union(v.string(), v.null()),
  body: v.string(),
  imageUrls: v.array(v.string()),
  imageStorageIds: v.array(v.id("_storage")),
  status: vReviewStatus,
  vendorReply: v.union(v.string(), v.null()),
  vendorReplyAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const vReviewSummary = v.object({
  count: v.number(),
  average: v.union(v.number(), v.null()),
});

export const vCanReview = v.object({
  eligible: v.boolean(),
  reason: v.union(v.string(), v.null()),
  existingReviewId: v.union(v.id("productReviews"), v.null()),
  orderId: v.union(v.id("orders"), v.null()),
  orderItemId: v.union(v.id("orderItems"), v.null()),
});

export const vOrderReviewAction = v.object({
  orderItemId: v.id("orderItems"),
  productId: v.union(v.id("products"), v.null()),
  vendorSlug: v.union(v.string(), v.null()),
  productSlug: v.union(v.string(), v.null()),
  eligible: v.boolean(),
  reason: v.union(v.string(), v.null()),
  existingReviewId: v.union(v.id("productReviews"), v.null()),
});

export const vVendorReviewListItem = v.object({
  id: v.id("productReviews"),
  productId: v.id("products"),
  productName: v.string(),
  productSlug: v.union(v.string(), v.null()),
  rating: v.number(),
  title: v.union(v.string(), v.null()),
  body: v.string(),
  imageUrls: v.array(v.string()),
  authorName: v.string(),
  status: vReviewStatus,
  vendorReply: v.union(v.string(), v.null()),
  vendorReplyAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});
