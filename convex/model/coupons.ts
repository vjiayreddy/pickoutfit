import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  applySavingsToLines,
  couponSavingsOnSubtotal,
  discountRedemption,
  normaliseCouponCode,
} from "../shared/coupons";
import { productMatchesOffer } from "./offers";

type Ctx = QueryCtx | MutationCtx;

export type CheckoutLineForCoupon = {
  productId: Id<"products">;
  vendorId: Id<"vendors">;
  priceInr: number;
  quantity: number;
  category?: Doc<"products">["category"];
  attributes?: Doc<"products">["attributes"];
};

export type AppliedCouponSnapshot = {
  discountId: Id<"discounts">;
  vendorId: Id<"vendors">;
  name: string;
  code?: string;
  amountInr: number;
};

export type CartCouponPreview = {
  vendorId: Id<"vendors">;
  vendorName: string;
  discountId: Id<"discounts">;
  name: string;
  code: string | null;
  redemption: "clip" | "code";
  kind: Doc<"discounts">["kind"];
  value: number;
  savingsInr: number;
  valid: boolean;
  message: string | null;
};

function windowOk(discount: Doc<"discounts">, now: number): boolean {
  if (!discount.active) return false;
  if (now < discount.startsAt) return false;
  if (discount.endsAt !== undefined && now >= discount.endsAt) return false;
  if (discount.maxUses !== undefined && discount.usedCount >= discount.maxUses) return false;
  return true;
}

export function isCouponLive(discount: Doc<"discounts">, now: number = Date.now()): boolean {
  const redemption = discountRedemption(discount);
  if (redemption !== "clip" && redemption !== "code") return false;
  return windowOk(discount, now);
}

async function userRedemptionCount(
  ctx: Ctx,
  userId: Id<"users">,
  discountId: Id<"discounts">,
): Promise<number> {
  const rows = await ctx.db
    .query("couponRedemptions")
    .withIndex("by_userId_and_discountId", (q) =>
      q.eq("userId", userId).eq("discountId", discountId),
    )
    .take(100);
  return rows.length;
}

export async function assertUserMayRedeem(
  ctx: Ctx,
  userId: Id<"users">,
  discount: Doc<"discounts">,
): Promise<void> {
  if (discount.maxUsesPerUser === undefined) return;
  const used = await userRedemptionCount(ctx, userId, discount._id);
  if (used >= discount.maxUsesPerUser) {
    throw appError("INVALID_INPUT", "You've already used this coupon the maximum number of times.");
  }
}

export async function loadCartCoupons(
  ctx: Ctx,
  cartId: Id<"carts">,
): Promise<Doc<"cartCoupons">[]> {
  return ctx.db
    .query("cartCoupons")
    .withIndex("by_cartId", (q) => q.eq("cartId", cartId))
    .take(40);
}

export async function clearCartCoupons(ctx: MutationCtx, cartId: Id<"carts">): Promise<void> {
  const rows = await loadCartCoupons(ctx, cartId);
  for (const row of rows) await ctx.db.delete(row._id);
}

async function replaceCartCoupon(
  ctx: MutationCtx,
  args: {
    cartId: Id<"carts">;
    userId: Id<"users">;
    vendorId: Id<"vendors">;
    discountId: Id<"discounts">;
    code?: string;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("cartCoupons")
    .withIndex("by_cartId_and_vendorId", (q) =>
      q.eq("cartId", args.cartId).eq("vendorId", args.vendorId),
    )
    .unique();
  if (existing) await ctx.db.delete(existing._id);
  await ctx.db.insert("cartCoupons", {
    cartId: args.cartId,
    userId: args.userId,
    vendorId: args.vendorId,
    discountId: args.discountId,
    ...(args.code ? { code: args.code } : {}),
    createdAt: Date.now(),
  });
}

export async function clipCouponToCart(
  ctx: MutationCtx,
  user: Doc<"users">,
  discountId: Id<"discounts">,
): Promise<void> {
  const discount = await ctx.db.get(discountId);
  if (!discount || discountRedemption(discount) !== "clip" || !isCouponLive(discount)) {
    throw appError("INVALID_INPUT", "That coupon isn't available.");
  }
  await assertUserMayRedeem(ctx, user._id, discount);

  let cart = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!cart) {
    const cartId = await ctx.db.insert("carts", { userId: user._id, updatedAt: Date.now() });
    cart = (await ctx.db.get(cartId))!;
  }

  await replaceCartCoupon(ctx, {
    cartId: cart._id,
    userId: user._id,
    vendorId: discount.vendorId,
    discountId: discount._id,
  });
}

export async function unclipCouponFromCart(
  ctx: MutationCtx,
  user: Doc<"users">,
  discountId: Id<"discounts">,
): Promise<void> {
  const cart = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!cart) return;
  const rows = await loadCartCoupons(ctx, cart._id);
  for (const row of rows) {
    if (row.discountId === discountId) await ctx.db.delete(row._id);
  }
}

export async function applyCouponCodeToCart(
  ctx: MutationCtx,
  user: Doc<"users">,
  rawCode: string,
): Promise<{ vendorId: Id<"vendors">; discountId: Id<"discounts"> }> {
  const code = normaliseCouponCode(rawCode);
  if (!code) throw appError("INVALID_INPUT", "Enter a promo code.");

  const discount = await ctx.db
    .query("discounts")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  if (!discount || discountRedemption(discount) !== "code" || !isCouponLive(discount)) {
    throw appError("INVALID_INPUT", "That promo code isn't valid.");
  }
  await assertUserMayRedeem(ctx, user._id, discount);

  const cart = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!cart) throw appError("INVALID_INPUT", "Add something to your bag before applying a code.");

  await replaceCartCoupon(ctx, {
    cartId: cart._id,
    userId: user._id,
    vendorId: discount.vendorId,
    discountId: discount._id,
    code,
  });
  return { vendorId: discount.vendorId, discountId: discount._id };
}

export async function clearVendorCouponFromCart(
  ctx: MutationCtx,
  user: Doc<"users">,
  vendorId: Id<"vendors">,
): Promise<void> {
  const cart = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!cart) return;
  const row = await ctx.db
    .query("cartCoupons")
    .withIndex("by_cartId_and_vendorId", (q) => q.eq("cartId", cart._id).eq("vendorId", vendorId))
    .unique();
  if (row) await ctx.db.delete(row._id);
}

async function eligibleSubtotal(
  ctx: Ctx,
  discount: Doc<"discounts">,
  lines: CheckoutLineForCoupon[],
): Promise<{ subtotalInr: number; eligibleIndexes: number[] }> {
  let subtotalInr = 0;
  const eligibleIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.vendorId !== discount.vendorId) continue;
    const product = await ctx.db.get(line.productId);
    if (!product) continue;
    const match = await productMatchesOffer(
      ctx,
      {
        _id: product._id,
        category: product.category,
        attributes: product.attributes,
      },
      discount,
    );
    if (!match) continue;
    eligibleIndexes.push(i);
    subtotalInr += line.priceInr * line.quantity;
  }
  return { subtotalInr, eligibleIndexes };
}

export async function evaluateCartCoupon(
  ctx: Ctx,
  userId: Id<"users">,
  row: Doc<"cartCoupons">,
  lines: CheckoutLineForCoupon[],
  now: number = Date.now(),
): Promise<CartCouponPreview> {
  const discount = await ctx.db.get(row.discountId);
  const vendor = await ctx.db.get(row.vendorId);
  const vendorName = vendor?.name ?? "Store";
  const base = {
    vendorId: row.vendorId,
    vendorName,
    discountId: row.discountId,
    name: discount?.name ?? "Coupon",
    code: row.code ?? discount?.code ?? null,
    redemption: (discount ? discountRedemption(discount) : "code") as "clip" | "code",
    kind: discount?.kind ?? ("percent" as const),
    value: discount?.value ?? 0,
  };

  if (!discount || !isCouponLive(discount, now)) {
    return { ...base, savingsInr: 0, valid: false, message: "This coupon is no longer available." };
  }
  if (discount.maxUsesPerUser !== undefined) {
    const used = await userRedemptionCount(ctx, userId, discount._id);
    if (used >= discount.maxUsesPerUser) {
      return {
        ...base,
        savingsInr: 0,
        valid: false,
        message: "You've already used this coupon the maximum number of times.",
      };
    }
  }

  const { subtotalInr } = await eligibleSubtotal(ctx, discount, lines);
  if (subtotalInr <= 0) {
    return {
      ...base,
      savingsInr: 0,
      valid: false,
      message: "No eligible items from this store in your bag.",
    };
  }
  if (discount.minOrderInr !== undefined && subtotalInr < discount.minOrderInr) {
    return {
      ...base,
      savingsInr: 0,
      valid: false,
      message: `Spend at least ₹${discount.minOrderInr} on eligible items from this store.`,
    };
  }

  const savingsInr = couponSavingsOnSubtotal(subtotalInr, discount);
  return {
    ...base,
    redemption: discountRedemption(discount) as "clip" | "code",
    kind: discount.kind,
    value: discount.value,
    name: discount.name,
    code: row.code ?? discount.code ?? null,
    savingsInr,
    valid: savingsInr > 0,
    message: savingsInr > 0 ? null : "This coupon doesn't reduce the total.",
  };
}

export async function previewCartCoupons(
  ctx: Ctx,
  userId: Id<"users">,
  cartId: Id<"carts">,
  lines: CheckoutLineForCoupon[],
  now: number = Date.now(),
): Promise<{ coupons: CartCouponPreview[]; couponSavingsInr: number }> {
  const rows = await loadCartCoupons(ctx, cartId);
  const coupons: CartCouponPreview[] = [];
  let couponSavingsInr = 0;
  for (const row of rows) {
    const preview = await evaluateCartCoupon(ctx, userId, row, lines, now);
    coupons.push(preview);
    if (preview.valid) couponSavingsInr += preview.savingsInr;
  }
  return { coupons, couponSavingsInr };
}

/**
 * Apply each valid per-vendor coupon by reducing eligible line unit prices.
 * Returns adjusted lines + snapshots for order/intent storage.
 */
export async function applyCouponsToCheckoutLines(
  ctx: Ctx,
  userId: Id<"users">,
  cartId: Id<"carts">,
  lines: CheckoutLineForCoupon[],
  now: number = Date.now(),
): Promise<{
  lines: CheckoutLineForCoupon[];
  coupons: AppliedCouponSnapshot[];
  couponSavingsInr: number;
}> {
  const rows = await loadCartCoupons(ctx, cartId);
  let working = lines.map((line) => ({ ...line }));
  const coupons: AppliedCouponSnapshot[] = [];
  let couponSavingsInr = 0;

  for (const row of rows) {
    const preview = await evaluateCartCoupon(ctx, userId, row, working, now);
    if (!preview.valid || preview.savingsInr <= 0) continue;
    const discount = await ctx.db.get(row.discountId);
    if (!discount) continue;
    const { eligibleIndexes } = await eligibleSubtotal(ctx, discount, working);
    if (eligibleIndexes.length === 0) continue;

    const eligible = eligibleIndexes.map((i) => working[i]!);
    const adjusted = applySavingsToLines(eligible, preview.savingsInr);
    for (let j = 0; j < eligibleIndexes.length; j++) {
      working[eligibleIndexes[j]!] = {
        ...working[eligibleIndexes[j]!],
        priceInr: adjusted[j]!.priceInr,
      };
    }
    coupons.push({
      discountId: discount._id,
      vendorId: discount.vendorId,
      name: discount.name,
      ...(preview.code ? { code: preview.code } : {}),
      amountInr: preview.savingsInr,
    });
    couponSavingsInr += preview.savingsInr;
  }

  return { lines: working, coupons, couponSavingsInr };
}

export async function redeemCouponsOnOrder(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    orderId: Id<"orders">;
    coupons: AppliedCouponSnapshot[];
  },
): Promise<void> {
  const now = Date.now();
  for (const coupon of args.coupons) {
    const discount = await ctx.db.get(coupon.discountId);
    // Re-check limits at redeem time (OCC retries on concurrent usedCount bumps).
    // Always write an audit row for the paid snapshot; only bump usedCount when still live.
    if (discount && isCouponLive(discount, now)) {
      const perUserOk =
        discount.maxUsesPerUser === undefined ||
        (await userRedemptionCount(ctx, args.userId, discount._id)) < discount.maxUsesPerUser;
      if (perUserOk) {
        await ctx.db.patch(discount._id, {
          usedCount: discount.usedCount + 1,
          updatedAt: now,
        });
      }
    }
    await ctx.db.insert("couponRedemptions", {
      discountId: coupon.discountId,
      vendorId: coupon.vendorId,
      userId: args.userId,
      orderId: args.orderId,
      amountInr: coupon.amountInr,
      ...(coupon.code ? { code: coupon.code } : {}),
      createdAt: now,
    });
  }
}

export async function listClipCouponsForProduct(
  ctx: Ctx,
  userId: Id<"users"> | null,
  product: Doc<"products">,
  now: number = Date.now(),
): Promise<
  Array<{
    id: Id<"discounts">;
    name: string;
    badge: string | null;
    kind: Doc<"discounts">["kind"];
    value: number;
    redemption: "clip";
    endsAt: number | null;
    clipped: boolean;
  }>
> {
  if (!product.vendorId) return [];
  const rows = await ctx.db
    .query("discounts")
    .withIndex("by_vendorId_and_active", (q) =>
      q.eq("vendorId", product.vendorId!).eq("active", true),
    )
    .take(50);

  let clippedIds = new Set<Id<"discounts">>();
  if (userId) {
    const cart = await ctx.db
      .query("carts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (cart) {
      const attached = await loadCartCoupons(ctx, cart._id);
      clippedIds = new Set(attached.map((row) => row.discountId));
    }
  }

  const out = [];
  for (const discount of rows) {
    if (discountRedemption(discount) !== "clip") continue;
    if (!isCouponLive(discount, now)) continue;
    const match = await productMatchesOffer(
      ctx,
      {
        _id: product._id,
        category: product.category,
        attributes: product.attributes,
      },
      discount,
    );
    if (!match) continue;
    out.push({
      id: discount._id,
      name: discount.name,
      badge: discount.badge ?? null,
      kind: discount.kind,
      value: discount.value,
      redemption: "clip" as const,
      endsAt: discount.endsAt ?? null,
      clipped: clippedIds.has(discount._id),
    });
  }
  return out.slice(0, 10);
}
