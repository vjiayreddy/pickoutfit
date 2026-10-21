import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { requireServiceUser } from "./lib/auth";
import {
  deleteProductEmbedding,
  shouldEmbedProduct,
  upsertProductEmbedding,
} from "./model/productEmbeddings";
import { pricedUnitInr } from "./model/offers";
import {
  coverUrl,
  isProductActive,
  resolveProductSearchText,
  vendorFor,
  type VendorCache,
} from "./model/products";
import { slotHintForProduct, vShopSearchHit, type ShopSearchHit } from "./model/shopLooks";
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
    // Always rebuild so catalog attribute labels + category path stay in the vector.
    const searchText = await resolveProductSearchText(ctx, {
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
      attributes: product.attributes,
      attributeSelections: product.attributeSelections,
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

async function toShopSearchHit(
  ctx: QueryCtx,
  user: Doc<"users">,
  product: Doc<"products">,
  score: number,
  maxPriceInr: number | undefined,
  cache: VendorCache,
  avoid: Set<string>,
): Promise<ShopSearchHit | null> {
  if (!product.aiRecommend || !isProductActive(product)) return null;
  const vendor = await vendorFor(ctx, product.vendorId, cache);
  if (!vendor || !vendorSellable(vendor)) return null;
  if (user.prefs.presentation !== "neutral") {
    if (product.presentation !== user.prefs.presentation && product.presentation !== "neutral") {
      return null;
    }
  }
  const colours = [product.colours?.primary, ...(product.colours?.secondary ?? [])].filter(
    (c): c is string => Boolean(c?.trim()),
  );
  if (avoid.size > 0 && colours.some((c) => avoid.has(c.toLowerCase()))) return null;
  const priceInr = await pricedUnitInr(ctx, product, null);
  if (maxPriceInr !== undefined && priceInr > maxPriceInr) return null;
  return {
    productId: product._id,
    name: product.name,
    slot: slotHintForProduct(product),
    category: product.category,
    colours,
    priceInr,
    vendorName: vendor.name,
    imageUrl: await coverUrl(ctx, product),
    score,
  };
}

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
    const out: ShopSearchHit[] = [];

    for (const hit of args.hits) {
      if (out.length >= args.limit) break;
      const row = await ctx.db.get(hit.embeddingId);
      if (!row) continue;
      const product = await ctx.db.get(row.productId);
      if (!product) continue;
      const card = await toShopSearchHit(
        ctx,
        user,
        product,
        hit.score,
        args.maxPriceInr,
        cache,
        avoid,
      );
      if (card) out.push(card);
    }
    return out;
  },
});

/** Full-text catalog search for the stylist (complements vector search). */
export const searchShopText = internalQuery({
  args: {
    serviceKey: v.string(),
    authId: v.string(),
    query: v.string(),
    limit: v.number(),
    maxPriceInr: v.optional(v.number()),
  },
  returns: v.array(vShopSearchHit),
  handler: async (ctx, args) => {
    const user = await requireServiceUser(ctx, args);
    const term = args.query.trim().toLowerCase();
    if (!term) return [];
    const avoid = new Set(user.prefs.avoidColours.map((c) => c.trim().toLowerCase()).filter(Boolean));
    const cache: VendorCache = new Map();
    const rows = await ctx.db
      .query("products")
      .withSearchIndex("search_text", (q) => q.search("searchText", term).eq("status", "active"))
      .take(Math.min(Math.max(args.limit * 2, args.limit), 48));

    const out: ShopSearchHit[] = [];
    for (const product of rows) {
      if (out.length >= args.limit) break;
      // Text hits score below typical vector cosine so vectors win on merge ties.
      const card = await toShopSearchHit(ctx, user, product, 0.35, args.maxPriceInr, cache, avoid);
      if (card) out.push(card);
    }
    return out;
  },
});
