import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { vJob, toJobView } from "./jobs";
import { assertVendorWritable, requireVendor } from "./lib/auth";
import { toProductViews } from "./model/products";
import { toUploadView } from "./model/uploads";
import { bumpUsageCounter } from "./model/users";
import {
  confirmVendorSelection,
  createVendorBatch,
  MAX_VENDOR_PHOTOS_PER_BATCH,
  requireVendorUpload,
} from "./model/vendorIngest";
import { quotaFor } from "./model/vendors";
import { LIMITS } from "./shared/credits";
import { vProductView } from "./shared/products";
import { vPresentation } from "./shared/validators";
import { vUploadView } from "./views";

/**
 * Store import: a vendor scans look photos, picks the pieces to sell, and each becomes a draft
 * product with the look as its reference image and an AI cutout as its cover.
 */

export const limits = query({
  args: {},
  returns: v.object({ maxPhotosPerBatch: v.number(), maxItemsPerPhoto: v.number() }),
  handler: async () => ({
    maxPhotosPerBatch: MAX_VENDOR_PHOTOS_PER_BATCH,
    maxItemsPerPhoto: LIMITS.maxItemsPerPhoto,
  }),
});

/** This month's extraction quota, for the meter on the import page. */
export const quota = query({
  args: { now: v.number() },
  returns: v.object({ used: v.number(), limit: v.number(), monthKey: v.string() }),
  handler: async (ctx, { now }) => {
    const { vendor } = await requireVendor(ctx);
    return quotaFor(vendor, now);
  },
});

export const createBatch = mutation({
  args: {
    files: v.array(
      v.object({
        storageId: v.id("_storage"),
        fileName: v.string(),
        mimeType: v.string(),
        sizeBytes: v.number(),
      }),
    ),
  },
  returns: v.object({
    batchId: v.string(),
    uploads: v.array(v.object({ uploadId: v.id("uploads"), jobId: v.id("jobs") })),
  }),
  handler: async (ctx, { files }) => {
    const { user, vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    await bumpUsageCounter(ctx, user._id, "detect", LIMITS.detectCallsPerDay, files.length);
    return createVendorBatch(ctx, user, vendor, files);
  },
});

/** Recent look photos for this store with their scan / import job. */
export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(v.object({ upload: vUploadView, job: v.union(vJob, v.null()) })),
  handler: async (ctx, { limit }) => {
    const { vendor } = await requireVendor(ctx);
    const uploads = await ctx.db
      .query("uploads")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
      .order("desc")
      .take(Math.min(limit ?? 12, 50));
    return Promise.all(
      uploads.map(async (upload) => {
        const job = upload.jobId ? await ctx.db.get(upload.jobId) : null;
        return { upload: await toUploadView(ctx, upload), job: job ? toJobView(job) : null };
      }),
    );
  },
});

/** One look photo plus the drafts already cut from it. */
export const get = query({
  args: { uploadId: v.id("uploads") },
  returns: v.union(
    v.object({ upload: vUploadView, job: v.union(vJob, v.null()), products: v.array(vProductView) }),
    v.null(),
  ),
  handler: async (ctx, { uploadId }) => {
    const { vendor } = await requireVendor(ctx);
    const upload = await ctx.db.get(uploadId);
    if (!upload || upload.vendorId !== vendor._id) return null;
    const job = upload.jobId ? await ctx.db.get(upload.jobId) : null;
    const products = await ctx.db
      .query("products")
      .withIndex("by_sourceUploadId", (q) => q.eq("sourceUploadId", upload._id))
      .take(LIMITS.maxItemsPerPhoto);
    return {
      upload: await toUploadView(ctx, upload),
      job: job ? toJobView(job) : null,
      products: await toProductViews(ctx, products),
    };
  },
});

/**
 * Turns the chosen candidates into draft products and starts cutting them out. Charges one
 * extraction of this month's quota per piece; failed cutouts are refunded when the job settles.
 */
export const confirmSelection = mutation({
  args: {
    uploadId: v.id("uploads"),
    indices: v.array(v.number()),
    presentation: v.optional(vPresentation),
    priceInr: v.optional(v.number()),
  },
  returns: v.object({ jobId: v.id("jobs"), productIds: v.array(v.id("products")) }),
  handler: async (ctx, args) => {
    const { user, vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    return confirmVendorSelection(ctx, user, vendor, args.uploadId, args.indices, {
      presentation: args.presentation ?? "neutral",
      priceInr: args.priceInr ?? 0,
    });
  },
});

/** Drops a look photo that was scanned but never imported. Imported photos stay as references. */
export const remove = mutation({
  args: { uploadId: v.id("uploads") },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    const upload = requireVendorUpload(await ctx.db.get(uploadId), vendor);
    const linked = await ctx.db
      .query("products")
      .withIndex("by_sourceUploadId", (q) => q.eq("sourceUploadId", upload._id))
      .first();
    if (linked || upload.status === "extracting" || upload.status === "detecting") {
      // Keep the photo: drafts point at it, or a workflow is still using it.
      return null;
    }
    await ctx.storage.delete(upload.storageId);
    await ctx.db.delete(upload._id);
    return null;
  },
});
