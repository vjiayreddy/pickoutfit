import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

/**
 * Stamp vendorId / variantId / lineStatus / createdAt on legacy orderItems.
 *
 * Run:
 *   npx convex run migrations/orderItemsBackfill:run
 *
 * Safe to re-run; rows that already have vendorId + lineStatus are skipped.
 */
const BATCH = 50;

export const run = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("orderItems")
      .paginate({ cursor: cursor ?? null, numItems: BATCH });

    for (const item of page.page) {
      if (item.vendorId && item.lineStatus && item.createdAt !== undefined) continue;

      const order = await ctx.db.get(item.orderId);
      const product = item.productId ? await ctx.db.get(item.productId) : null;
      const vendorId = item.vendorId ?? product?.vendorId;

      let variantId = item.variantId;
      let sku = item.sku;
      let size = item.size;
      let colour = item.colour;

      if (!variantId && product) {
        const variants = await ctx.db
          .query("productVariants")
          .withIndex("by_productId_and_position", (q) => q.eq("productId", product._id))
          .take(5);
        const only = variants.length === 1 ? variants[0] : null;
        if (only) {
          variantId = only._id;
          sku = sku ?? only.sku;
          size = size ?? only.size;
          colour = colour ?? only.colour?.name;
        }
      }

      const lineStatus =
        item.lineStatus ??
        (order?.status === "cancelled"
          ? "cancelled"
          : order?.status === "fulfilled"
            ? "shipped"
            : "placed");

      await ctx.db.patch(item._id, {
        ...(vendorId ? { vendorId } : {}),
        ...(variantId ? { variantId } : {}),
        ...(sku ? { sku } : {}),
        ...(size ? { size } : {}),
        ...(colour ? { colour } : {}),
        lineStatus,
        createdAt: item.createdAt ?? order?.createdAt ?? item._creationTime,
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.orderItemsBackfill.run, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
