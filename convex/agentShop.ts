"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { vShopSearchHit, type ShopSearchHit } from "./model/shopLooks";

/**
 * Vector-search AI-recommended catalog products for the stylist.
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
    const embedding = (await ctx.runAction(internal.ai.productEmbed.embedQuery, {
      text: args.query,
    })) as number[];
    const matches = (await ctx.vectorSearch("productEmbeddings", "by_embedding", {
      vector: embedding,
      limit: Math.min(limit * 2, 48),
    })) as Array<{ _id: Id<"productEmbeddings">; _score: number }>;
    const hits = matches.map((match) => ({ embeddingId: match._id, score: match._score }));
    return (await ctx.runQuery(internal.productEmbeddings.hydrateShopHits, {
      serviceKey: args.serviceKey,
      authId: args.authId,
      hits,
      limit,
      maxPriceInr: args.maxPriceInr,
    })) as ShopSearchHit[];
  },
});
