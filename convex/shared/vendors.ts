import { v } from "convex/values";
import { literals } from "./validators";

/**
 * Vendor-side constants. Vendors sell through the platform catalog; the platform keeps a
 * commission on every sub-order and charges a monthly plan. Extraction of garments from a
 * look photo is billed against a monthly listing quota instead of user credits.
 */

export const VENDOR_PLAN_IDS = ["starter", "growth", "pro"] as const;
export type VendorPlanId = (typeof VENDOR_PLAN_IDS)[number];

export type VendorPlanDefinition = {
  id: VendorPlanId;
  name: string;
  priceInr: number;
  /** Garment extractions from look photos per calendar month. */
  extractionQuota: number;
  /** Platform commission in basis points (1000 = 10%). Snapshotted on each sub-order. */
  commissionBps: number;
  maxProducts: number;
  blurb: string;
};

export const VENDOR_PLANS: Record<VendorPlanId, VendorPlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    priceInr: 0,
    extractionQuota: 50,
    commissionBps: 1500,
    maxProducts: 100,
    blurb: "Free to list. 15% commission, 50 extractions a month, 100 products.",
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceInr: 1499,
    extractionQuota: 300,
    commissionBps: 1000,
    maxProducts: 1000,
    blurb: "10% commission, 300 extractions a month, 1,000 products.",
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceInr: 3999,
    extractionQuota: 1000,
    commissionBps: 700,
    maxProducts: 10000,
    blurb: "7% commission, 1,000 extractions a month, 10,000 products.",
  },
};

export const VENDOR_STATUSES = ["pending", "active", "suspended", "closed"] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const VENDOR_PLAN_STATUSES = ["trial", "active", "past_due", "cancelled"] as const;
export type VendorPlanStatus = (typeof VENDOR_PLAN_STATUSES)[number];

export const PAYOUT_STATUSES = ["none", "pending", "activated", "rejected"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const VENDOR_ROLES = ["owner", "manager", "staff"] as const;
export type VendorRole = (typeof VENDOR_ROLES)[number];

/** Days after delivery before a sub-order's money is transferred to the vendor. */
export const DEFAULT_HOLD_DAYS = 7;
/** Grace period after a failed plan charge before the storefront hides the vendor. */
export const PLAN_GRACE_DAYS = 7;

export const MAX_VENDOR_MEMBERS = 10;
export const MAX_PRODUCT_VARIANTS = 40;
export const MAX_VENDOR_DISCOUNTS = 50;
export const MAX_COLLECTION_PRODUCTS = 200;

export const vVendorPlanId = literals(VENDOR_PLAN_IDS);
export const vVendorStatus = literals(VENDOR_STATUSES);
export const vVendorPlanStatus = literals(VENDOR_PLAN_STATUSES);
export const vPayoutStatus = literals(PAYOUT_STATUSES);
export const vVendorRole = literals(VENDOR_ROLES);

export const vVendorAddress = v.object({
  line1: v.string(),
  line2: v.optional(v.string()),
  city: v.string(),
  state: v.string(),
  pincode: v.string(),
  country: v.string(),
});

export const vListingQuota = v.object({
  monthKey: v.string(),
  extractionsUsed: v.number(),
});

export const vVendorView = v.object({
  _id: v.id("vendors"),
  name: v.string(),
  slug: v.string(),
  code: v.string(),
  status: vVendorStatus,
  description: v.union(v.string(), v.null()),
  supportEmail: v.string(),
  supportPhone: v.union(v.string(), v.null()),
  legalName: v.union(v.string(), v.null()),
  gstin: v.union(v.string(), v.null()),
  pan: v.union(v.string(), v.null()),
  address: vVendorAddress,
  logoUrl: v.union(v.string(), v.null()),
  bannerUrl: v.union(v.string(), v.null()),
  payoutStatus: vPayoutStatus,
  commissionBps: v.number(),
  holdDays: v.number(),
  plan: vVendorPlanId,
  planStatus: vVendorPlanStatus,
  planPeriodEnd: v.union(v.number(), v.null()),
  quota: v.object({
    monthKey: v.string(),
    used: v.number(),
    limit: v.number(),
  }),
  createdAt: v.number(),
});

/** Public storefront view: only what a shopper needs. */
export const vStorefrontView = v.object({
  _id: v.id("vendors"),
  name: v.string(),
  slug: v.string(),
  description: v.union(v.string(), v.null()),
  logoUrl: v.union(v.string(), v.null()),
  bannerUrl: v.union(v.string(), v.null()),
});

/** Month key in UTC used for listing quotas: "2026-09". */
export function monthKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7);
}

export function isVendorPlanId(value: string): value is VendorPlanId {
  return (VENDOR_PLAN_IDS as readonly string[]).includes(value);
}

/** True when the vendor's plan lets the storefront show its products. */
export function vendorPlanInGoodStanding(
  vendor: { planStatus: VendorPlanStatus; planPeriodEnd?: number },
  now: number,
): boolean {
  if (vendor.planStatus === "trial" || vendor.planStatus === "active") return true;
  if (vendor.planStatus === "past_due" && vendor.planPeriodEnd) {
    return now < vendor.planPeriodEnd + PLAN_GRACE_DAYS * 24 * 60 * 60 * 1000;
  }
  return false;
}

/**
 * Storefront, similar-products and cart eligibility share this check. It reads no clock:
 * a cron moves `past_due` stores to `cancelled` once the grace period lapses.
 */
export function vendorSellable(vendor: {
  status: VendorStatus;
  planStatus: VendorPlanStatus;
}): boolean {
  return vendor.status === "active" && vendor.planStatus !== "cancelled";
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

export function isValidGstin(value: string): boolean {
  return GSTIN_RE.test(value.trim().toUpperCase());
}

export function isValidPan(value: string): boolean {
  return PAN_RE.test(value.trim().toUpperCase());
}
