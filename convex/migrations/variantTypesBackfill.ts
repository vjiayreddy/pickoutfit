import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";

/**
 * Remap products that still point at legacy variant types (missing vendorId)
 * onto this store's Size / Colour (matched by slug).
 *
 *   npx convex run migrations/variantTypesBackfill:run
 */
const BATCH = 40;

export const run = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("products")
      .withIndex("by_createdAt")
      .order("asc")
      .paginate({ cursor: cursor ?? null, numItems: BATCH });

    for (const product of page.page) {
      if (!product.vendorId || !product.variantTypeIds?.length) continue;

      const vendorTypes = await ctx.db
        .query("variantTypes")
        .withIndex("by_vendorId", (q) => q.eq("vendorId", product.vendorId))
        .take(50);
      const bySlug = new Map(vendorTypes.filter((row) => row.isActive).map((row) => [row.slug, row._id]));

      const next: typeof product.variantTypeIds = [];
      let changed = false;
      for (const id of product.variantTypeIds) {
        const type = await ctx.db.get(id);
        if (type && type.isActive && type.vendorId === product.vendorId) {
          if (!next.includes(id)) next.push(id);
          continue;
        }
        changed = true;
        const mapped = type?.slug ? bySlug.get(type.slug) : undefined;
        if (mapped && !next.includes(mapped)) next.push(mapped);
      }

      if (!changed) continue;
      await ctx.db.patch(product._id, {
        variantTypeIds: next.length > 0 ? next : undefined,
        updatedAt: Date.now(),
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.variantTypesBackfill.run, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
