"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { vShopSearchHit, type ShopSearchHit } from "./model/shopLooks";

/**
 * Hybrid search for the stylist: vector similarity + product `search_text`.
 * Eligibility (aiRecommend, active, vendorSellable, presentation) is applied when hydrating hits.
 */
export const searchShop = action({
  args: {
    serviceKey: v.string(),
    authId: v.string(),
    query: v.string(),
    limit: v.optional(v.number()),
    maxPriceInr: v.optional(v.number()),
  },
  returns: v.array(vShopSearchHit),
  handler: async (ctx, args): Promise<ShopSearchHit[]> => {
    const limit = Math.min(Math.max(args.limit ?? 16, 1), 24);
    const auth = { serviceKey: args.serviceKey, authId: args.authId };
    const embedding = (await ctx.runAction(internal.ai.productEmbed.embedQuery, {
      text: args.query,
    })) as number[];
    const matches = (await ctx.vectorSearch("productEmbeddings", "by_embedding", {
      vector: embedding,
      limit: Math.min(limit * 2, 48),
    })) as Array<{ _id: Id<"productEmbeddings">; _score: number }>;
    const hits = matches.map((match) => ({ embeddingId: match._id, score: match._score }));

    const [vectorHits, textHits] = await Promise.all([
      ctx.runQuery(internal.productEmbeddings.hydrateShopHits, {
        ...auth,
        hits,
        limit,
        maxPriceInr: args.maxPriceInr,
      }) as Promise<ShopSearchHit[]>,
      ctx.runQuery(internal.productEmbeddings.searchShopText, {
        ...auth,
        query: args.query,
        limit,
        maxPriceInr: args.maxPriceInr,
      }) as Promise<ShopSearchHit[]>,
    ]);

    const byProduct = new Map<string, ShopSearchHit>();
    for (const hit of vectorHits) byProduct.set(hit.productId, hit);
    for (const hit of textHits) {
      const existing = byProduct.get(hit.productId);
      if (!existing || hit.score > existing.score) byProduct.set(hit.productId, hit);
    }
    return [...byProduct.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },
});
