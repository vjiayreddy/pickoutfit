import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { addCartLine, cartLines, setCartQuantity, toCartView } from "./model/products";
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
    let total = 0;
    for (const line of lines) {
      const product = await ctx.db.get(line.productId);
      if (product?.active) total += line.quantity;
    }
    return total;
  },
});

export const add = mutation({
  args: { productId: v.id("products"), quantity: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { productId, quantity }) => {
    const user = await requireUser(ctx);
    await addCartLine(ctx, user, productId, quantity ?? 1);
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
