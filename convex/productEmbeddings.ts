import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireServiceUser } from "./lib/auth";
import {
  deleteProductEmbedding,
  shouldEmbedProduct,
  upsertProductEmbedding,
} from "./model/productEmbeddings";
import { pricedUnitInr } from "./model/offers";
import { buildProductSearchText, coverUrl, isProductActive, vendorFor, type VendorCache } from "./model/products";
import { slotHintForProduct, vShopSearchHit } from "./model/shopLooks";
import { vendorSellable } from "./shared/vendors";

export const productForEmbed = internalQuery({
  args: { productId: v.id("products") },
  returns: v.union(
    v.null(),
    v.object({
      productId: v.id("products"),
      vendorId: v.id("vendors"),
      searchText: v.string(),
    }),
  ),
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId);
    if (!product || !shouldEmbedProduct(product) || !product.vendorId) return null;
    const searchText =
      product.searchText?.trim() ||
      buildProductSearchText({
        name: product.name,
        brand: product.brand,
        category: product.category,
        subcategory: product.subcategory,
        productType: product.productType,
        colours: product.colours,
        pattern: product.pattern,
        material: product.material,
        description: product.description,
        attributes: product.attributes,
      });
    if (!searchText) return null;
    return { productId: product._id, vendorId: product.vendorId, searchText };
  },
});

export const saveEmbedding = internalMutation({
  args: {
    productId: v.id("products"),
    embedding: v.array(v.float64()),
  },
  returns: v.null(),
  handler: async (ctx, { productId, embedding }) => {
    const product = await ctx.db.get(productId);
    if (!product || !shouldEmbedProduct(product)) {
      await deleteProductEmbedding(ctx, productId);
      return null;
    }
    await upsertProductEmbedding(ctx, product, embedding);
    return null;
  },
});

/** Turn vector hits into sellable shop cards for the stylist. */
export const hydrateShopHits = internalQuery({
  args: {
    serviceKey: v.string(),
    authId: v.string(),
    hits: v.array(v.object({ embeddingId: v.id("productEmbeddings"), score: v.number() })),
    limit: v.number(),
    maxPriceInr: v.optional(v.number()),
  },
  returns: v.array(vShopSearchHit),
  handler: async (ctx, args) => {
    const user = await requireServiceUser(ctx, args);
    const avoid = new Set(user.prefs.avoidColours.map((c) => c.trim().toLowerCase()).filter(Boolean));
    const cache: VendorCache = new Map();
    const out = [];

    for (const hit of args.hits) {
      if (out.length >= args.limit) break;
      const row = await ctx.db.get(hit.embeddingId);
      if (!row) continue;
      const product = await ctx.db.get(row.productId);
      if (!product || !product.aiRecommend || !isProductActive(product)) continue;
      const vendor = await vendorFor(ctx, product.vendorId, cache);
      if (!vendor || !vendorSellable(vendor)) continue;
      if (user.prefs.presentation !== "neutral") {
        if (product.presentation !== user.prefs.presentation && product.presentation !== "neutral") continue;
      }
      const colours = [product.colours?.primary, ...(product.colours?.secondary ?? [])].filter(
        (c): c is string => Boolean(c?.trim()),
      );
      if (avoid.size > 0 && colours.some((c) => avoid.has(c.toLowerCase()))) continue;
      const priceInr = await pricedUnitInr(ctx, product, null);
      if (args.maxPriceInr !== undefined && priceInr > args.maxPriceInr) continue;
      out.push({
        productId: product._id,
        name: product.name,
        slot: slotHintForProduct(product),
        category: product.category,
        colours,
        priceInr,
        vendorName: vendor.name,
        imageUrl: await coverUrl(ctx, product),
        score: hit.score,
      });
    }
    return out;
  },
});
