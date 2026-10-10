import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { upsertBrand } from "../model/brands";
import { resolveProductSearchText } from "../model/products";

/**
 * One-off: create vendor brand rows from free-text `products.brand`
 * and set `brandId`. Safe to re-run; skips rows that already have brandId.
 *
 *   npx convex run migrations/brandsBackfill:run
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
      if (product.brandId) continue;
      const name = product.brand?.trim() ?? "";
      if (!name || !product.vendorId) continue;

      const brandId = await upsertBrand(ctx, product.vendorId, { name });
      const brand = await ctx.db.get(brandId);
      await ctx.db.patch(product._id, {
        brandId,
        brand: brand?.name ?? name,
        searchText: await resolveProductSearchText(ctx, {
          name: product.name,
          brand: brand?.name ?? name,
          category: product.category,
          categoryPath: product.categoryPath,
          subcategory: product.subcategory,
          productType: product.productType,
          colours: product.colours,
          pattern: product.pattern,
          material: product.material,
          description: product.description,
          attributes: product.attributes,
          attributeSelections: product.attributeSelections,
        }),
        updatedAt: Date.now(),
      });
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.brandsBackfill.run, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
