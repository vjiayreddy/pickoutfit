import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { attributesFromLegacy } from "../shared/products";
import { resolveProductSearchText } from "../model/products";

/**
 * One-off: copy legacy typed fashion columns into `products.attributes`
 * and refresh searchText.
 *
 *   npx convex run migrations/productAttributesBackfill:run
 *
 * Safe to re-run; skips rows that already have attributes.
 */
const BATCH = 50;

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
      if (product.attributes && product.attributes.length > 0) continue;
      const attributes = attributesFromLegacy({
        colours: product.colours,
        pattern: product.pattern,
        material: product.material,
        fit: product.fit,
        formality: product.formality,
        season: product.season,
        size: product.size,
        productType: product.productType,
        subcategory: product.subcategory,
        occasion: product.occasion,
      });
      if (attributes.length === 0) continue;
      await ctx.db.patch(product._id, {
        attributes,
        searchText: await resolveProductSearchText(ctx, {
          name: product.name,
          brand: product.brand,
          category: product.category,
          categoryPath: product.categoryPath,
          subcategory: product.subcategory,
          productType: product.productType,
          colours: product.colours,
          pattern: product.pattern,
          material: product.material,
          description: product.description,
          attributes,
          attributeSelections: product.attributeSelections,
        }),
        updatedAt: Date.now(),
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.productAttributesBackfill.run, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
