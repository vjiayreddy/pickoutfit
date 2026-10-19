import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  getPublicProduct,
  getPublicProductById,
  listCatalogForWardrobe,
  listMarketplaceLooks as loadMarketplaceLooks,
  listShopCatalog,
  listStorefront,
  shopTheLook,
} from "./model/catalog";
import { toStorefrontView } from "./model/vendors";
import {
  vLiveOfferBanner,
  vProductCategory,
  vProductView,
  vRailProductView,
} from "./shared/products";
import { vStorefrontView, vendorSellable } from "./shared/vendors";

const MARKETPLACE_STORE_LIMIT = 48;

/**
 * Active catalog rows for the signed-in user's presentation, tagged against their wardrobe
 * (similar / pairs) and sorted for the buy rail.
 */
export const listForCategory = query({
  args: { category: vProductCategory, vendorId: v.optional(v.id("vendors")) },
  returns: v.array(vRailProductView),
  handler: async (ctx, { category, vendorId }) => {
    const user = await requireUser(ctx);
    return listCatalogForWardrobe(ctx, user._id, category, user.prefs.presentation, { vendorId });
  },
});

/** @deprecated Prefer marketplace looks/stores; kept for older clients. */
export const listShop = query({
  args: { category: v.optional(vProductCategory) },
  returns: v.array(vProductView),
  handler: async (ctx, { category }) => {
    const user = await requireUser(ctx);
    return listShopCatalog(ctx, user.prefs.presentation, { category });
  },
});

const vMarketplaceLookProduct = v.object({
  id: v.id("products"),
  name: v.string(),
  slug: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  priceInr: v.number(),
});

const vMarketplaceLook = v.object({
  uploadId: v.id("uploads"),
  imageUrl: v.string(),
  vendorName: v.string(),
  vendorSlug: v.string(),
  vendorLogoUrl: v.union(v.string(), v.null()),
  totalInr: v.number(),
  createdAt: v.number(),
  products: v.array(vMarketplaceLookProduct),
});

/** Open stores for the marketplace home (not a product dump). */
export const listMarketplaceStores = query({
  args: {},
  returns: v.array(vStorefrontView),
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("vendors")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(MARKETPLACE_STORE_LIMIT);
    const sellable = rows.filter((row) => vendorSellable(row));
    return Promise.all(sellable.map((row) => toStorefrontView(ctx, row)));
  },
});

/** Cross-store look photos (2+ live pieces) for marketplace discovery. */
export const listMarketplaceLooks = query({
  args: {},
  returns: v.array(vMarketplaceLook),
  handler: async (ctx) => {
    await requireUser(ctx);
    return loadMarketplaceLooks(ctx);
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

/** A store's public page: profile, live products (sale-priced), and offer banner. */
export const storefront = query({
  args: { slug: v.string() },
  returns: v.union(
    v.object({
      vendor: vStorefrontView,
      products: v.array(vProductView),
      liveOffer: v.union(vLiveOfferBanner, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { slug }) => {
    await requireUser(ctx);
    const vendor = await ctx.db
      .query("vendors")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!vendor || !vendorSellable(vendor)) return null;
    const { products, banner } = await listStorefront(ctx, vendor);
    return {
      vendor: await toStorefrontView(ctx, vendor),
      products,
      liveOffer: banner,
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
