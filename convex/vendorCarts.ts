import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { requireVendor } from "./lib/auth";
import { pricedUnitInr } from "./model/offers";
import {
  coverUrl,
  resolveCartLine,
  variantLabel,
  type VendorCache,
} from "./model/products";
import { vVendorCartListView } from "./shared/products";

const LIST_CAP = 500;

async function latestOrderPhone(ctx: QueryCtx, userId: Id<"users">): Promise<string | null> {
  const order = await ctx.db
    .query("orders")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  const phone = order?.phone?.trim();
  return phone ? phone : null;
}

/**
 * Active bags that still hold this vendor's products. Grouped by shopper so the
 * desk can follow up via email / WhatsApp before checkout.
 */
export const list = query({
  args: {},
  returns: vVendorCartListView,
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const rows = await ctx.db
      .query("cartItems")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
      .take(LIST_CAP);

    const byUser = new Map<Id<"users">, Doc<"cartItems">[]>();
    for (const line of rows) {
      const list = byUser.get(line.userId) ?? [];
      list.push(line);
      byUser.set(line.userId, list);
    }

    const cache: VendorCache = new Map();
    const shoppers = [];
    for (const [userId, lines] of byUser) {
      const user = await ctx.db.get(userId);
      if (!user) continue;
      const cart = await ctx.db
        .query("carts")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      const phone = await latestOrderPhone(ctx, userId);

      const lineViews = [];
      let itemCount = 0;
      let totalInr = 0;
      for (const line of lines) {
        const { product, variant, available } = await resolveCartLine(ctx, line, cache);
        const priceInr =
          product && available ? await pricedUnitInr(ctx, product, variant) : line.priceInr;
        lineViews.push({
          id: line._id,
          productId: line.productId,
          variantId: line.variantId ?? null,
          variantLabel: variant ? variantLabel(variant) : null,
          name: line.name,
          quantity: line.quantity,
          priceInr,
          imageUrl: product ? await coverUrl(ctx, product) : null,
          available,
          addedFrom: line.addedFrom ?? null,
          addedAt: line._creationTime,
        });
        if (available) {
          itemCount += line.quantity;
          totalInr += priceInr * line.quantity;
        }
      }

      shoppers.push({
        userId,
        name: user.name?.trim() || "Shopper",
        email: user.email ?? null,
        phone,
        cartUpdatedAt: cart?.updatedAt ?? Math.max(...lines.map((l) => l._creationTime)),
        itemCount,
        totalInr,
        lines: lineViews.sort((a, b) => b.addedAt - a.addedAt),
      });
    }

    shoppers.sort((a, b) => b.cartUpdatedAt - a.cartUpdatedAt);
    return {
      shoppers,
      shopperCount: shoppers.length,
      lineCount: rows.length,
    };
  },
});

export const counts = query({
  args: {},
  returns: v.object({
    shoppers: v.number(),
    lines: v.number(),
  }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const rows = await ctx.db
      .query("cartItems")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
      .take(LIST_CAP);
    const userIds = new Set(rows.map((row) => row.userId));
    return { shoppers: userIds.size, lines: rows.length };
  },
});
