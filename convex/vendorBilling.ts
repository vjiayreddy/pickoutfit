import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { requireVendor } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  cancelSubscription,
  createCustomer,
  createPlan,
  createSubscription,
  isRazorpayConfigured,
} from "./lib/razorpay";
import {
  PLAN_GRACE_DAYS,
  VENDOR_PLANS,
  vVendorPlanId,
  vVendorPlanStatus,
  type VendorPlanId,
} from "./shared/vendors";

const PLAN_CACHE: Partial<Record<VendorPlanId, string>> = {};

export const status = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    plan: vVendorPlanId,
    planName: v.string(),
    planStatus: vVendorPlanStatus,
    planPeriodEnd: v.union(v.number(), v.null()),
    planBlurb: v.string(),
    commissionBps: v.number(),
    priceInr: v.number(),
    razorpaySubscriptionId: v.union(v.string(), v.null()),
    plans: v.array(
      v.object({
        id: vVendorPlanId,
        name: v.string(),
        priceInr: v.number(),
        commissionBps: v.number(),
        extractionQuota: v.number(),
        maxProducts: v.number(),
        blurb: v.string(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const plan = VENDOR_PLANS[vendor.plan];
    return {
      configured: isRazorpayConfigured(),
      plan: vendor.plan,
      planName: plan.name,
      planStatus: vendor.planStatus,
      planPeriodEnd: vendor.planPeriodEnd ?? null,
      planBlurb: plan.blurb,
      commissionBps: vendor.commissionBps,
      priceInr: plan.priceInr,
      razorpaySubscriptionId: vendor.razorpaySubscriptionId ?? null,
      plans: Object.values(VENDOR_PLANS).map((row) => ({
        id: row.id,
        name: row.name,
        priceInr: row.priceInr,
        commissionBps: row.commissionBps,
        extractionQuota: row.extractionQuota,
        maxProducts: row.maxProducts,
        blurb: row.blurb,
      })),
    };
  },
});

export const billingProfile = internalQuery({
  args: {},
  returns: v.object({
    vendorId: v.id("vendors"),
    name: v.string(),
    supportEmail: v.string(),
    supportPhone: v.union(v.string(), v.null()),
    plan: vVendorPlanId,
    razorpayCustomerId: v.union(v.string(), v.null()),
    razorpaySubscriptionId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx, { minRole: "owner" });
    return {
      vendorId: vendor._id,
      name: vendor.name,
      supportEmail: vendor.supportEmail,
      supportPhone: vendor.supportPhone ?? null,
      plan: vendor.plan,
      razorpayCustomerId: vendor.razorpayCustomerId ?? null,
      razorpaySubscriptionId: vendor.razorpaySubscriptionId ?? null,
    };
  },
});

export const patchVendorPlan = internalMutation({
  args: {
    vendorId: v.id("vendors"),
    plan: vVendorPlanId,
    planStatus: vVendorPlanStatus,
    planPeriodEnd: v.optional(v.number()),
    razorpayCustomerId: v.optional(v.string()),
    razorpaySubscriptionId: v.optional(v.string()),
    clearSubscription: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = VENDOR_PLANS[args.plan];
    await ctx.db.patch(args.vendorId, {
      plan: args.plan,
      planStatus: args.planStatus,
      commissionBps: plan.commissionBps,
      ...(args.planPeriodEnd !== undefined ? { planPeriodEnd: args.planPeriodEnd } : {}),
      ...(args.razorpayCustomerId ? { razorpayCustomerId: args.razorpayCustomerId } : {}),
      ...(args.clearSubscription
        ? { razorpaySubscriptionId: undefined }
        : args.razorpaySubscriptionId
          ? { razorpaySubscriptionId: args.razorpaySubscriptionId }
          : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const applySubscriptionEvent = internalMutation({
  args: {
    subscriptionId: v.string(),
    planStatus: vVendorPlanStatus,
    planPeriodEnd: v.optional(v.number()),
    plan: v.optional(vVendorPlanId),
  },
  returns: v.null(),
  handler: async (ctx, { subscriptionId, planStatus, planPeriodEnd, plan }) => {
    const vendor = await ctx.db
      .query("vendors")
      .withIndex("by_razorpaySubscriptionId", (q) =>
        q.eq("razorpaySubscriptionId", subscriptionId),
      )
      .unique();
    if (!vendor) return null;
    const nextPlan = plan ?? vendor.plan;
    const def = VENDOR_PLANS[nextPlan];
    await ctx.db.patch(vendor._id, {
      plan: nextPlan,
      planStatus,
      commissionBps: def.commissionBps,
      ...(planPeriodEnd !== undefined ? { planPeriodEnd } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Cancel past_due stores whose grace window lapsed. */
export const expirePastDue = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const graceMs = PLAN_GRACE_DAYS * 24 * 60 * 60 * 1000;
    const rows = await ctx.db
      .query("vendors")
      .withIndex("by_planStatus_and_planPeriodEnd", (q) => q.eq("planStatus", "past_due"))
      .take(50);
    let count = 0;
    for (const vendor of rows) {
      if (!vendor.planPeriodEnd || now < vendor.planPeriodEnd + graceMs) continue;
      await ctx.db.patch(vendor._id, {
        planStatus: "cancelled",
        updatedAt: now,
      });
      count += 1;
    }
    return count;
  },
});

export const subscribe = action({
  args: { plan: vVendorPlanId },
  returns: v.object({
    subscriptionId: v.string(),
    shortUrl: v.union(v.string(), v.null()),
    plan: vVendorPlanId,
  }),
  handler: async (ctx, { plan }) => {
    if (!isRazorpayConfigured()) {
      throw appError(
        "INVALID_INPUT",
        "Billing is not configured yet. Set Razorpay keys on the Convex deployment.",
      );
    }
    const def = VENDOR_PLANS[plan];
    if (def.priceInr <= 0) {
      const profile = await ctx.runQuery(internal.vendorBilling.billingProfile, {});
      if (profile.razorpaySubscriptionId) {
        await cancelSubscription(profile.razorpaySubscriptionId);
      }
      await ctx.runMutation(internal.vendorBilling.patchVendorPlan, {
        vendorId: profile.vendorId,
        plan: "starter",
        planStatus: "active",
        clearSubscription: true,
      });
      return { subscriptionId: "", shortUrl: null, plan: "starter" as const };
    }

    const profile = await ctx.runQuery(internal.vendorBilling.billingProfile, {});
    let customerId = profile.razorpayCustomerId;
    if (!customerId) {
      const customer = await createCustomer({
        name: profile.name,
        email: profile.supportEmail,
        ...(profile.supportPhone ? { contact: profile.supportPhone } : {}),
        notes: { vendorId: profile.vendorId },
      });
      customerId = customer.id;
    }

    let planId = PLAN_CACHE[plan];
    if (!planId) {
      const rzPlan = await createPlan({
        period: "monthly",
        interval: 1,
        amountInr: def.priceInr,
        name: `WardrobeAI Vendor ${def.name}`,
      });
      planId = rzPlan.id;
      PLAN_CACHE[plan] = planId;
    }

    if (profile.razorpaySubscriptionId) {
      await cancelSubscription(profile.razorpaySubscriptionId);
    }

    const subscription = await createSubscription({
      planId,
      customerId,
      notes: { vendorId: profile.vendorId, plan },
    });

    const periodEnd = subscription.current_end
      ? subscription.current_end * 1000
      : Date.now() + 30 * 24 * 60 * 60 * 1000;

    await ctx.runMutation(internal.vendorBilling.patchVendorPlan, {
      vendorId: profile.vendorId,
      plan,
      planStatus: "active",
      planPeriodEnd: periodEnd,
      razorpayCustomerId: customerId,
      razorpaySubscriptionId: subscription.id,
    });

    return {
      subscriptionId: subscription.id,
      shortUrl: subscription.short_url ?? null,
      plan,
    };
  },
});
