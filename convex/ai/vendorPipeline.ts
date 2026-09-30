import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";
import { appError } from "../lib/errors";
import { appendResult, setStep } from "../model/jobs";
import { bumpDailyStats } from "../model/stats";
import { usageToUsd } from "../shared/credits";
import { vTokenUsage } from "../shared/validators";

/**
 * Transactional half of the vendor extraction pipeline. `ai/openai.extractProductCutout` reads
 * `productExtractContext`, does the image edit, then lands everything in `productCutoutReady`.
 */

export const productExtractContext = internalQuery({
  args: { productId: v.id("products") },
  returns: v.object({
    vendorId: v.id("vendors"),
    description: v.string(),
    name: v.string(),
    photoStorageId: v.id("_storage"),
  }),
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId);
    if (!product || !product.vendorId) throw appError("NOT_FOUND", "That product no longer exists.");
    const photoStorageId = product.referenceStorageId;
    if (!photoStorageId) throw appError("NOT_FOUND", "The look photo for this product is gone.");
    return {
      vendorId: product.vendorId,
      description: product.description ?? product.name,
      name: product.name,
      photoStorageId,
    };
  },
});

/** Cutout saved: it becomes the cover, the reference photo moves behind it, swatches are filled. */
export const productCutoutReady = internalMutation({
  args: {
    productId: v.id("products"),
    jobId: v.id("jobs"),
    stepKey: v.string(),
    storageId: v.id("_storage"),
    hex: v.array(v.string()),
    usage: vTokenUsage,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const product = await ctx.db.get(args.productId);
    if (!product || !product.vendorId) {
      await ctx.storage.delete(args.storageId);
      await setStep(ctx, args.jobId, args.stepKey, { status: "failed", error: "The draft was deleted." });
      return null;
    }
    const now = Date.now();
    const rows = await ctx.db
      .query("productImages")
      .withIndex("by_productId_and_position", (q) => q.eq("productId", args.productId))
      .take(8);
    // Any earlier cutout from a retry is replaced.
    for (const row of rows) {
      if (row.kind === "cutout") {
        await ctx.db.delete(row._id);
        if (row.storageId !== args.storageId) await ctx.storage.delete(row.storageId);
      }
    }
    const remaining = rows.filter((row) => row.kind !== "cutout");
    for (const [index, row] of remaining.entries()) {
      if (row.position !== index + 1) await ctx.db.patch(row._id, { position: index + 1 });
    }
    await ctx.db.insert("productImages", {
      productId: args.productId,
      vendorId: product.vendorId,
      storageId: args.storageId,
      kind: "cutout",
      position: 0,
      createdAt: now,
    });
    const colours = product.colours ?? { primary: "", secondary: [], hex: [] };
    await ctx.db.patch(args.productId, {
      cutoutStorageId: args.storageId,
      imageIds: [args.storageId, ...remaining.map((row) => row.storageId)],
      storageId: args.storageId,
      colours: { ...colours, hex: args.hex.length > 0 ? args.hex : colours.hex },
      updatedAt: now,
    });
    const costUsd = usageToUsd(args.usage);
    if (costUsd > 0) await bumpDailyStats(ctx, { cogsUsd: costUsd });
    await appendResult(ctx, args.jobId, args.productId);
    await setStep(ctx, args.jobId, args.stepKey, {
      status: "done",
      meta: { productId: args.productId, costUsd },
    });
    return null;
  },
});

/** The draft keeps its reference photo so the vendor can retry or shoot it properly. */
export const productCutoutFailed = internalMutation({
  args: { productId: v.id("products"), jobId: v.id("jobs"), stepKey: v.string(), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await setStep(ctx, args.jobId, args.stepKey, {
      status: "failed",
      error: args.error,
      meta: { productId: args.productId },
    });
    return null;
  },
});

/** Drafts from one job that still have no cutout, for retries. */
export const productsWithoutCutout = internalQuery({
  args: { productIds: v.array(v.id("products")) },
  returns: v.array(v.id("products")),
  handler: async (ctx, { productIds }): Promise<Id<"products">[]> => {
    const out: Id<"products">[] = [];
    for (const productId of productIds) {
      const product = await ctx.db.get(productId);
      if (product && !product.cutoutStorageId) out.push(productId);
    }
    return out;
  },
});
