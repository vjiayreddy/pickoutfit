import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  applyDiscount,
  type DiscountKind,
  type DiscountRedemption,
  vDiscountKind,
  vDiscountRedemption,
} from "./products";

export function normaliseCouponCode(code: string | undefined): string | undefined {
  const clean = code?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return clean ? clean.slice(0, 24) : undefined;
}

/** Resolve redemption for legacy rows that predate the field. */
export function discountRedemption(discount: Doc<"discounts">): DiscountRedemption {
  if (discount.redemption) return discount.redemption;
  return discount.code ? "code" : "auto";
}

export function couponSavingsOnSubtotal(
  subtotalInr: number,
  discount: { kind: DiscountKind; value: number },
): number {
  if (subtotalInr <= 0) return 0;
  const after = applyDiscount(subtotalInr, discount);
  return Math.max(0, subtotalInr - after);
}

/**
 * Distribute savings across eligible lines so unit prices stay integers and
 * settlements remain seller-funded. Remainder cents land on the last line.
 */
export function applySavingsToLines<T extends { priceInr: number; quantity: number }>(
  lines: T[],
  savingsInr: number,
): T[] {
  if (savingsInr <= 0 || lines.length === 0) return lines;
  const totals = lines.map((line) => line.priceInr * line.quantity);
  const subtotal = totals.reduce((sum, value) => sum + value, 0);
  if (subtotal <= 0) return lines;
  const capped = Math.min(savingsInr, subtotal);
  let remaining = capped;
  return lines.map((line, index) => {
    const lineTotal = totals[index]!;
    const isLast = index === lines.length - 1;
    const share = isLast
      ? remaining
      : Math.min(remaining, Math.round((lineTotal / subtotal) * capped));
    remaining -= share;
    const nextTotal = Math.max(0, lineTotal - share);
    const nextUnit = Math.floor(nextTotal / line.quantity);
    return { ...line, priceInr: nextUnit };
  });
}

export const vClipCouponView = v.object({
  id: v.id("discounts"),
  name: v.string(),
  badge: v.union(v.string(), v.null()),
  kind: vDiscountKind,
  value: v.number(),
  redemption: v.literal("clip"),
  endsAt: v.union(v.number(), v.null()),
  clipped: v.boolean(),
});
