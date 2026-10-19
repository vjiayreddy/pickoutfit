import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  DEFAULT_HOLD_DAYS,
  isValidGstin,
  isValidPan,
  monthKey,
  slugify,
  VENDOR_PLANS,
  type vVendorAddress,
  type vVendorView,
  type vStorefrontView,
} from "../shared/vendors";
import { seedCategories } from "./categories";
import { bumpSystemCounter } from "./stats";
import { seedAttributeCatalog } from "./attributes";

type Ctx = QueryCtx | MutationCtx;

export type VendorAddress = Infer<typeof vVendorAddress>;
export type VendorView = Infer<typeof vVendorView>;
export type StorefrontView = Infer<typeof vStorefrontView>;

export type VendorProfileInput = {
  name: string;
  description?: string;
  supportEmail: string;
  supportPhone?: string;
  legalName?: string;
  gstin?: string;
  pan?: string;
  address: VendorAddress;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanVendorProfile(input: VendorProfileInput): VendorProfileInput {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) {
    throw appError("INVALID_INPUT", "Store name must be 2–60 characters.");
  }
  const supportEmail = input.supportEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(supportEmail) || supportEmail.length > 120) {
    throw appError("INVALID_INPUT", "Enter a valid support email.");
  }
  const supportPhone = input.supportPhone?.trim() ?? "";
  if (supportPhone && !/^[0-9+\-\s]{8,20}$/.test(supportPhone)) {
    throw appError("INVALID_INPUT", "Enter a valid support phone number.");
  }
  const description = input.description?.trim() ?? "";
  if (description.length > 400) {
    throw appError("INVALID_INPUT", "Description must be 400 characters or fewer.");
  }
  const legalName = input.legalName?.trim() ?? "";
  if (legalName.length > 120) {
    throw appError("INVALID_INPUT", "Legal name must be 120 characters or fewer.");
  }
  const gstin = input.gstin?.trim().toUpperCase() ?? "";
  if (gstin && !isValidGstin(gstin)) throw appError("INVALID_INPUT", "Enter a valid GSTIN.");
  const pan = input.pan?.trim().toUpperCase() ?? "";
  if (pan && !isValidPan(pan)) throw appError("INVALID_INPUT", "Enter a valid PAN.");
  const address = cleanAddress(input.address);
  return {
    name,
    description: description || undefined,
    supportEmail,
    supportPhone: supportPhone || undefined,
    legalName: legalName || undefined,
    gstin: gstin || undefined,
    pan: pan || undefined,
    address,
  };
}

function cleanAddress(address: VendorAddress): VendorAddress {
  const line1 = address.line1.trim();
  const line2 = address.line2?.trim() ?? "";
  const city = address.city.trim();
  const state = address.state.trim();
  const pincode = address.pincode.trim();
  const country = (address.country.trim() || "IN").toUpperCase();
  if (line1.length < 1 || line1.length > 200) {
    throw appError("INVALID_INPUT", "Address line must be 1–200 characters.");
  }
  if (line2.length > 200) throw appError("INVALID_INPUT", "Address line 2 is too long.");
  if (city.length < 1 || city.length > 80) throw appError("INVALID_INPUT", "Enter a city.");
  if (state.length < 1 || state.length > 80) throw appError("INVALID_INPUT", "Enter a state.");
  if (!/^[0-9]{6}$/.test(pincode)) throw appError("INVALID_INPUT", "PIN code must be 6 digits.");
  return { line1, ...(line2 ? { line2 } : {}), city, state, pincode, country };
}

export async function nextVendorCode(ctx: MutationCtx): Promise<string> {
  const sequence = await bumpSystemCounter(ctx, "vendor_code", 1);
  return `V${String(sequence).padStart(4, "0")}`;
}

/** Slug from the store name, suffixed with the vendor code when taken. */
export async function uniqueVendorSlug(ctx: MutationCtx, name: string, code: string): Promise<string> {
  const base = slugify(name) || code.toLowerCase();
  const taken = await ctx.db
    .query("vendors")
    .withIndex("by_slug", (q) => q.eq("slug", base))
    .unique();
  return taken ? `${base}-${code.toLowerCase()}` : base;
}

export async function createVendor(
  ctx: MutationCtx,
  owner: Doc<"users">,
  input: VendorProfileInput,
  opts: { status?: Doc<"vendors">["status"] } = {},
): Promise<Id<"vendors">> {
  const clean = cleanVendorProfile(input);
  const existing = await ctx.db
    .query("vendorMembers")
    .withIndex("by_userId", (q) => q.eq("userId", owner._id))
    .first();
  if (existing) throw appError("CONFLICT", "You already have a store.");
  const now = Date.now();
  const code = await nextVendorCode(ctx);
  const slug = await uniqueVendorSlug(ctx, clean.name, code);
  const plan = VENDOR_PLANS.starter;
  const vendorId = await ctx.db.insert("vendors", {
    name: clean.name,
    slug,
    code,
    ownerUserId: owner._id,
    status: opts.status ?? "pending",
    ...(clean.description ? { description: clean.description } : {}),
    supportEmail: clean.supportEmail,
    ...(clean.supportPhone ? { supportPhone: clean.supportPhone } : {}),
    ...(clean.legalName ? { legalName: clean.legalName } : {}),
    ...(clean.gstin ? { gstin: clean.gstin } : {}),
    ...(clean.pan ? { pan: clean.pan } : {}),
    address: clean.address,
    payoutStatus: "none",
    commissionBps: plan.commissionBps,
    holdDays: DEFAULT_HOLD_DAYS,
    plan: plan.id,
    planStatus: "trial",
    listingQuota: { monthKey: monthKey(now), extractionsUsed: 0 },
    productCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("vendorMembers", {
    vendorId,
    userId: owner._id,
    role: "owner",
    createdAt: now,
  });
  if (owner.role === "user") await ctx.db.patch(owner._id, { role: "vendor" });
  await seedCategories(ctx, vendorId);
  await seedAttributeCatalog(ctx, vendorId);
  return vendorId;
}

export function quotaFor(vendor: Doc<"vendors">, now: number = Date.now()) {
  const key = monthKey(now);
  const used = vendor.listingQuota.monthKey === key ? vendor.listingQuota.extractionsUsed : 0;
  return { monthKey: key, used, limit: VENDOR_PLANS[vendor.plan].extractionQuota };
}

/** Throws when `count` more extractions would exceed this month's quota. */
export function assertQuota(vendor: Doc<"vendors">, count: number, now: number = Date.now()): void {
  const quota = quotaFor(vendor, now);
  if (quota.used + count > quota.limit) {
    throw appError(
      "RATE_LIMITED",
      `This month's listing quota is ${quota.limit} extractions; ${quota.used} used. Upgrade the plan or wait for next month.`,
      { used: quota.used, limit: quota.limit, requested: count },
    );
  }
}

export async function consumeQuota(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  count: number,
  now: number = Date.now(),
): Promise<void> {
  const vendor = await ctx.db.get(vendorId);
  if (!vendor) return;
  const key = monthKey(now);
  const used = vendor.listingQuota.monthKey === key ? vendor.listingQuota.extractionsUsed : 0;
  await ctx.db.patch(vendor._id, {
    listingQuota: { monthKey: key, extractionsUsed: used + count },
    updatedAt: now,
  });
}

/** Gives back quota for extractions that failed. Only the current month can be refunded. */
export async function refundQuota(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  count: number,
  now: number = Date.now(),
): Promise<void> {
  const vendor = await ctx.db.get(vendorId);
  if (!vendor || count <= 0 || vendor.listingQuota.monthKey !== monthKey(now)) return;
  await ctx.db.patch(vendor._id, {
    listingQuota: {
      monthKey: vendor.listingQuota.monthKey,
      extractionsUsed: Math.max(0, vendor.listingQuota.extractionsUsed - count),
    },
    updatedAt: now,
  });
}

export async function toVendorView(ctx: Ctx, vendor: Doc<"vendors">, now: number): Promise<VendorView> {
  return {
    _id: vendor._id,
    name: vendor.name,
    slug: vendor.slug,
    code: vendor.code,
    status: vendor.status,
    description: vendor.description ?? null,
    supportEmail: vendor.supportEmail,
    supportPhone: vendor.supportPhone ?? null,
    legalName: vendor.legalName ?? null,
    gstin: vendor.gstin ?? null,
    pan: vendor.pan ?? null,
    address: vendor.address,
    logoUrl: vendor.logoStorageId ? await ctx.storage.getUrl(vendor.logoStorageId) : null,
    bannerUrl: vendor.bannerStorageId ? await ctx.storage.getUrl(vendor.bannerStorageId) : null,
    payoutStatus: vendor.payoutStatus,
    commissionBps: vendor.commissionBps,
    holdDays: vendor.holdDays,
    plan: vendor.plan,
    planStatus: vendor.planStatus,
    planPeriodEnd: vendor.planPeriodEnd ?? null,
    quota: quotaFor(vendor, now),
    createdAt: vendor.createdAt,
  };
}

export async function toStorefrontView(ctx: Ctx, vendor: Doc<"vendors">): Promise<StorefrontView> {
  return {
    _id: vendor._id,
    name: vendor.name,
    slug: vendor.slug,
    description: vendor.description ?? null,
    logoUrl: vendor.logoStorageId ? await ctx.storage.getUrl(vendor.logoStorageId) : null,
    bannerUrl: vendor.bannerStorageId ? await ctx.storage.getUrl(vendor.bannerStorageId) : null,
  };
}

export async function requireVendorDoc(ctx: Ctx, vendorId: Id<"vendors">): Promise<Doc<"vendors">> {
  const vendor = await ctx.db.get(vendorId);
  if (!vendor) throw appError("NOT_FOUND", "That store doesn't exist.");
  return vendor;
}
