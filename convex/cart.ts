import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  addCartLine,
  cartLines,
  resolveCartLine,
  setCartQuantity,
  toCartView,
  type VendorCache,
} from "./model/products";
import { addShopLookToCart } from "./model/shopLooks";
import { vCartView } from "./shared/products";

export const current = query({
  args: {},
  returns: vCartView,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return toCartView(ctx, user._id);
  },
});

export const count = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const cart = await ctx.db
      .query("carts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!cart) return 0;
    const lines = await cartLines(ctx, cart._id);
    const cache: VendorCache = new Map();
    let total = 0;
    for (const line of lines) {
      const { available } = await resolveCartLine(ctx, line, cache);
      if (available) total += line.quantity;
    }
    return total;
  },
});

export const vAddedFrom = v.union(
  v.literal("similar"),
  v.literal("outfit"),
  v.literal("agent"),
  v.literal("rail"),
  v.literal("store"),
);

export const add = mutation({
  args: {
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    quantity: v.optional(v.number()),
    addedFrom: v.optional(vAddedFrom),
    sourceItemId: v.optional(v.id("items")),
  },
  returns: v.null(),
  handler: async (ctx, { productId, ...opts }) => {
    const user = await requireUser(ctx);
    await addCartLine(ctx, user, productId, opts);
    return null;
  },
});

export const setQuantity = mutation({
  args: { lineId: v.id("cartItems"), quantity: v.number() },
  returns: v.null(),
  handler: async (ctx, { lineId, quantity }) => {
    const user = await requireUser(ctx);
    await setCartQuantity(ctx, user._id, lineId, quantity);
    return null;
  },
});

/** Adds every in-stock line from a stylist shop look; auto-picks the first stocked variant. */
export const addLook = mutation({
  args: { shopLookId: v.id("shopLooks") },
  returns: v.object({
    added: v.number(),
    skipped: v.array(
      v.object({
        productId: v.id("products"),
        name: v.string(),
        reason: v.string(),
      }),
    ),
    totalInr: v.number(),
  }),
  handler: async (ctx, { shopLookId }) => {
    const user = await requireUser(ctx);
    return addShopLookToCart(ctx, user, shopLookId);
  },
});
