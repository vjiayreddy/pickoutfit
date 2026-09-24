import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { prepareLookup, saveLookup } from "./model/shop";
import { vShopLookupView, vShopOffer, type ShopOffer } from "./shared/shop";

const vPrepare = v.union(
  v.object({ kind: v.literal("cached"), result: vShopLookupView }),
  v.object({ kind: v.literal("search"), query: v.string() }),
  v.object({ kind: v.literal("fallback"), query: v.string() }),
);

export const prepare = internalQuery({
  args: { itemId: v.id("items") },
  returns: vPrepare,
  handler: async (ctx, args) => prepareLookup(ctx, args.itemId),
});

export const save = internalMutation({
  args: { itemId: v.id("items"), query: v.string(), offers: v.array(vShopOffer) },
  returns: vShopLookupView,
  handler: async (ctx, args) => saveLookup(ctx, args.itemId, args.query, args.offers),
});

/** One cached shop-similar check. After 10 offer lookups, later items only get store search links. */
export const lookup = action({
  args: { itemId: v.id("items") },
  returns: vShopLookupView,
  handler: async (ctx, args): Promise<Infer<typeof vShopLookupView>> => {
    const prepared: Infer<typeof vPrepare> = await ctx.runQuery(internal.shop.prepare, {
      itemId: args.itemId,
    });
    if (prepared.kind === "cached") return prepared.result;
    if (prepared.kind === "fallback") {
      const saved: Infer<typeof vShopLookupView> = await ctx.runMutation(internal.shop.save, {
        itemId: args.itemId,
        query: prepared.query,
        offers: [],
      });
      return saved;
    }
    const offers: ShopOffer[] = await ctx.runAction(internal.ai.shop.search, {
      query: prepared.query,
    });
    const saved: Infer<typeof vShopLookupView> = await ctx.runMutation(internal.shop.save, {
      itemId: args.itemId,
      query: prepared.query,
      offers,
    });
    return saved;
  },
});
