import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAppUser, requireUser } from "./lib/auth";
import {
  applyCouponCodeToCart,
  clearVendorCouponFromCart,
  clipCouponToCart,
  listClipCouponsForProduct,
  previewCartCoupons,
  unclipCouponFromCart,
} from "./model/coupons";
import { pricedUnitInr } from "./model/offers";
import { cartLines, resolveCartLine, type VendorCache } from "./model/products";
import { vClipCouponView } from "./shared/coupons";
import { vCartCouponView } from "./shared/products";

export const listForProduct = query({
  args: { productId: v.id("products") },
  returns: v.array(vClipCouponView),
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId);
    if (!product || product.status !== "active") return [];
    const user = await getAppUser(ctx);
    return listClipCouponsForProduct(ctx, user?._id ?? null, product);
  },
});

export const clip = mutation({
  args: { discountId: v.id("discounts") },
  returns: v.null(),
  handler: async (ctx, { discountId }) => {
    const user = await requireUser(ctx);
    await clipCouponToCart(ctx, user, discountId);
    return null;
  },
});

export const unclip = mutation({
  args: { discountId: v.id("discounts") },
  returns: v.null(),
  handler: async (ctx, { discountId }) => {
    const user = await requireUser(ctx);
    await unclipCouponFromCart(ctx, user, discountId);
    return null;
  },
});

export const applyCode = mutation({
  args: { code: v.string() },
  returns: v.object({
    vendorId: v.id("vendors"),
    discountId: v.id("discounts"),
  }),
  handler: async (ctx, { code }) => {
    const user = await requireUser(ctx);
    return applyCouponCodeToCart(ctx, user, code);
  },
});

export const clearForVendor = mutation({
  args: { vendorId: v.id("vendors") },
  returns: v.null(),
  handler: async (ctx, { vendorId }) => {
    const user = await requireUser(ctx);
    await clearVendorCouponFromCart(ctx, user, vendorId);
    return null;
  },
});

/** Cart coupon previews (also embedded on `cart.current`). */
export const preview = query({
  args: {},
  returns: v.array(vCartCouponView),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const cart = await ctx.db
      .query("carts")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (!cart) return [];
    const rows = await cartLines(ctx, cart._id);
    const cache: VendorCache = new Map();
    const lines = [];
    for (const line of rows) {
      const { product, variant, vendor, available } = await resolveCartLine(ctx, line, cache);
      if (!available || !product || !vendor) continue;
      lines.push({
        productId: product._id,
        vendorId: vendor._id,
        priceInr: await pricedUnitInr(ctx, product, variant),
        quantity: line.quantity,
      });
    }
    const { coupons } = await previewCartCoupons(ctx, user._id, cart._id, lines);
    return coupons;
  },
});
