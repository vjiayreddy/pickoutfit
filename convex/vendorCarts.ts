import { paginationOptsValidator, paginationResultValidator } from "convex/server";
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
import { vVendorCartListView, vVendorCartShopperView } from "./shared/products";

const COUNT_CAP = 500;

async function latestOrderPhone(ctx: QueryCtx, userId: Id<"users">): Promise<string | null> {
  const order = await ctx.db
    .query("orders")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  const phone = order?.phone?.trim();
  return phone ? phone : null;
}

async function toShopperView(
  ctx: QueryCtx,
  userId: Id<"users">,
  lines: Doc<"cartItems">[],
  cache: VendorCache,
) {
  const user = await ctx.db.get(userId);
  if (!user) return null;
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

  return {
    userId,
    name: user.name?.trim() || "Shopper",
    email: user.email ?? null,
    phone,
    cartUpdatedAt: cart?.updatedAt ?? Math.max(...lines.map((l) => l._creationTime)),
    itemCount,
    totalInr,
    lines: lineViews.sort((a, b) => b.addedAt - a.addedAt),
  };
}

/**
 * Active bags that still hold this vendor's products, newest cart activity first.
 * Scans `cartItems` and collapses to one shopper row so multi-line bags don't flood the desk.
 */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vVendorCartShopperView),
  handler: async (ctx, { paginationOpts }) => {
    const { vendor } = await requireVendor(ctx);
    const target = paginationOpts.numItems;
    const shoppers = [];
    const seenUsers = new Set<Id<"users">>();
    let cursor = paginationOpts.cursor;
    let isDone = false;
    let continueCursor = cursor ?? "";
    let scans = 0;
    const cache: VendorCache = new Map();

    while (shoppers.length < target && !isDone && scans < 8) {
      scans += 1;
      const result = await ctx.db
        .query("cartItems")
        .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
        .order("desc")
        .paginate({
          numItems: Math.min(Math.max(target * 3, target), 100),
          cursor,
        });

      const byUser = new Map<Id<"users">, Doc<"cartItems">[]>();
      for (const line of result.page) {
        if (seenUsers.has(line.userId)) continue;
        const list = byUser.get(line.userId) ?? [];
        list.push(line);
        byUser.set(line.userId, list);
      }

      for (const [userId, lines] of byUser) {
        if (shoppers.length >= target) break;
        if (seenUsers.has(userId)) continue;
        seenUsers.add(userId);
        const userLines = await ctx.db
          .query("cartItems")
          .withIndex("by_userId", (q) => q.eq("userId", userId))
          .take(40);
        const allLines = userLines.filter((line) => line.vendorId === vendor._id);
        const view = await toShopperView(
          ctx,
          userId,
          allLines.length > 0 ? allLines : lines,
          cache,
        );
        if (view) shoppers.push(view);
      }

      isDone = result.isDone;
      continueCursor = result.continueCursor;
      cursor = result.continueCursor;
    }

    shoppers.sort((a, b) => b.cartUpdatedAt - a.cartUpdatedAt);
    return { page: shoppers, isDone, continueCursor };
  },
});

/** Summary strip for the carts desk header. */
export const summary = query({
  args: {},
  returns: vVendorCartListView,
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const rows = await ctx.db
      .query("cartItems")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
      .take(COUNT_CAP);
    const userIds = new Set(rows.map((row) => row.userId));
    return {
      shoppers: [],
      shopperCount: userIds.size,
      lineCount: rows.length,
      capped: rows.length >= COUNT_CAP,
    };
  },
});

export const counts = query({
  args: {},
  returns: v.object({
    shoppers: v.number(),
    lines: v.number(),
    capped: v.boolean(),
  }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const rows = await ctx.db
      .query("cartItems")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
      .take(COUNT_CAP);
    const userIds = new Set(rows.map((row) => row.userId));
    return {
      shoppers: userIds.size,
      lines: rows.length,
      capped: rows.length >= COUNT_CAP,
    };
  },
});
