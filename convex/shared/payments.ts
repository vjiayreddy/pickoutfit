import { literals } from "./validators";

/** Buyer payment state on an order. Legacy rows omit this (treated as paid COD). */
export const PAYMENT_STATUSES = ["pending", "paid", "refunded", "failed"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CHECKOUT_INTENT_STATUSES = ["open", "paid", "expired", "failed"] as const;
export type CheckoutIntentStatus = (typeof CHECKOUT_INTENT_STATUSES)[number];

export const SETTLEMENT_STATUSES = [
  "pending",
  "transferring",
  "paid",
  "failed",
  "held",
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const vPaymentStatus = literals(PAYMENT_STATUSES);
export const vCheckoutIntentStatus = literals(CHECKOUT_INTENT_STATUSES);
export const vSettlementStatus = literals(SETTLEMENT_STATUSES);

/** How long a checkout intent stays open before expiry cron clears it. */
export const CHECKOUT_INTENT_TTL_MS = 30 * 60 * 1000;

export function commissionInr(grossInr: number, commissionBps: number): number {
  return Math.floor((grossInr * commissionBps) / 10_000);
}

export function netPayoutInr(grossInr: number, commissionBps: number): number {
  return Math.max(0, grossInr - commissionInr(grossInr, commissionBps));
}

/** Legacy unpaid COD rows have no paymentStatus; treat them as paid for fulfillment. */
export function isOrderPaid(order: { paymentStatus?: PaymentStatus }): boolean {
  return order.paymentStatus === undefined || order.paymentStatus === "paid";
}
