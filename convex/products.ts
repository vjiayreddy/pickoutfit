import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  getPublicProduct,
  getPublicProductById,
  listCatalog,
  listStorefront,
  shopTheLook,
} from "./model/catalog";
import { toStorefrontView } from "./model/vendors";
import { vProductCategory, vProductView } from "./shared/products";
import { vStorefrontView, vendorSellable } from "./shared/vendors";

/** Active catalog rows for the signed-in user's presentation. */
export const listForCategory = query({
  args: { category: vProductCategory, vendorId: v.optional(v.id("vendors")) },
  returns: v.array(vProductView),
  handler: async (ctx, { category, vendorId }) => {
    const user = await requireUser(ctx);
    return listCatalog(ctx, category, user.prefs.presentation, { vendorId });
  },
});

export const get = query({
  args: { productId: v.id("products") },
  returns: vProductView,
  handler: async (ctx, { productId }) => {
    await requireUser(ctx);
    return getPublicProductById(ctx, productId);
  },
});

/** A store's public page: profile plus everything it has live. */
export const storefront = query({
  args: { slug: v.string() },
  returns: v.union(
    v.object({ vendor: vStorefrontView, products: v.array(vProductView) }),
    v.null(),
  ),
  handler: async (ctx, { slug }) => {
    await requireUser(ctx);
    const vendor = await ctx.db
      .query("vendors")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!vendor || !vendorSellable(vendor)) return null;
    return {
      vendor: await toStorefrontView(ctx, vendor),
      products: await listStorefront(ctx, vendor),
    };
  },
});

/** One live product by store and product slug, with the rest of its look. */
export const bySlug = query({
  args: { vendorSlug: v.string(), productSlug: v.string() },
  returns: v.union(
    v.object({ product: vProductView, look: v.array(vProductView) }),
    v.null(),
  ),
  handler: async (ctx, { vendorSlug, productSlug }) => {
    await requireUser(ctx);
    const product = await getPublicProduct(ctx, vendorSlug, productSlug);
    if (!product) return null;
    const doc = await ctx.db.get(product.id);
    if (!doc) throw appError("NOT_FOUND", "That product is not available.");
    return { product, look: await shopTheLook(ctx, doc) };
  },
});
