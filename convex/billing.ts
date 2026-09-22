import { StripeSubscriptions } from "@convex-dev/stripe";
import { v } from "convex/values";
import { components } from "./_generated/api";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  isStripeCheckoutConfigured,
  optionalEnv,
  requireEnv,
} from "./lib/env";
import { appError } from "./lib/errors";
import { getJob } from "./model/jobs";
import {
  billingStatus,
  grantPlanForTesting,
  reconcileUser,
} from "./model/subscriptions";
import { PLANS } from "./shared/credits";
import { vFeature, vPlanId } from "./shared/validators";

const stripeClient = new StripeSubscriptions(components.stripe, {});

const PLAN_IDS_FOR_UI = ["free", "pro", "plus"] as const;

function priceIdForPlan(plan: "pro" | "plus"): string {
  if (!isStripeCheckoutConfigured()) {
    throw appError(
      "INVALID_INPUT",
      "Billing is not configured yet. Set Stripe keys and price IDs on the Convex deployment.",
    );
  }
  return plan === "pro"
    ? requireEnv("STRIPE_PRICE_PRO")
    : requireEnv("STRIPE_PRICE_PLUS");
}

function siteUrl(): string {
  return optionalEnv("SITE_URL") ?? "http://localhost:3000";
}

export const vBillingStatus = v.object({
  configured: v.boolean(),
  canTestGrant: v.boolean(),
  plan: vPlanId,
  planPeriodEnd: v.optional(v.number()),
  features: v.array(vFeature),
  billingCheckedAt: v.optional(v.number()),
  plans: v.array(
    v.object({
      id: vPlanId,
      name: v.string(),
      priceUsd: v.number(),
      monthlyCredits: v.number(),
      maxAvatars: v.number(),
      features: v.array(vFeature),
      blurb: v.string(),
    }),
  ),
});

export const status = query({
  args: {},
  returns: vBillingStatus,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const live = billingStatus(user);
    const allowSmoke = optionalEnv("ALLOW_DEV_SMOKE") === "1";
    return {
      ...live,
      canTestGrant: user.role === "admin" || allowSmoke,
      plans: PLAN_IDS_FOR_UI.map((id) => {
        const plan = PLANS[id];
        return {
          id: plan.id,
          name: plan.name,
          priceUsd: plan.priceUsd,
          monthlyCredits: plan.monthlyCredits,
          maxAvatars: plan.maxAvatars,
          features: [...plan.features],
          blurb: plan.blurb,
        };
      }),
    };
  },
});

/** Re-read Stripe → grant/downgrade. Safe after Checkout return. */
export const refresh = mutation({
  args: {},
  returns: vPlanId,
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const updated = await reconcileUser(ctx, user);
    return billingStatus(updated).plan;
  },
});

export const createCheckout = action({
  args: { plan: v.union(v.literal("pro"), v.literal("plus")) },
  returns: v.object({
    sessionId: v.string(),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { plan }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw appError("UNAUTHENTICATED", "Sign in to continue.");
    }
    const priceId = priceIdForPlan(plan);
    const customer = await stripeClient.getOrCreateCustomer(ctx, {
      userId: identity.subject,
      email: identity.email,
      name: identity.name,
    });
    const base = siteUrl();
    return await stripeClient.createCheckoutSession(ctx, {
      priceId,
      customerId: customer.customerId,
      mode: "subscription",
      successUrl: `${base}/billing?checkout=success`,
      cancelUrl: `${base}/billing?checkout=canceled`,
      subscriptionMetadata: { userId: identity.subject },
      metadata: { userId: identity.subject, plan },
    });
  },
});

export const createPortal = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw appError("UNAUTHENTICATED", "Sign in to continue.");
    }
    if (!isStripeCheckoutConfigured()) {
      throw appError(
        "INVALID_INPUT",
        "Billing is not configured yet. Set Stripe keys and price IDs on the Convex deployment.",
      );
    }
    const customer = await stripeClient.getOrCreateCustomer(ctx, {
      userId: identity.subject,
      email: identity.email,
      name: identity.name,
    });
    return await stripeClient.createCustomerPortalSession(ctx, {
      customerId: customer.customerId,
      returnUrl: `${siteUrl()}/billing`,
    });
  },
});

/**
 * Admin or ALLOW_DEV_SMOKE=1: grant a plan without Stripe so HQ/sharing can be smoke-tested.
 */
export const grantForTesting = mutation({
  args: {
    plan: vPlanId,
    days: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { plan, days }) => {
    const user = await requireUser(ctx);
    const allowSmoke = optionalEnv("ALLOW_DEV_SMOKE") === "1";
    if (user.role !== "admin" && !allowSmoke) {
      throw appError(
        "FORBIDDEN",
        "Test grants require admin or ALLOW_DEV_SMOKE=1.",
      );
    }
    await grantPlanForTesting(ctx, user, plan, days ?? 30);
    return null;
  },
});

/** Used by ingest workflows before credit-sensitive steps. */
export const refreshForJob = internalMutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await getJob(ctx, jobId);
    const user = await ctx.db.get(job.userId);
    if (!user) return null;
    await reconcileUser(ctx, user);
    return null;
  },
});

/** Webhook path: reconcile by Better Auth subject. */
export const reconcileByAuthId = internalMutation({
  args: { authId: v.string() },
  returns: v.null(),
  handler: async (ctx, { authId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_authId", (q) => q.eq("authId", authId))
      .unique();
    if (!user) return null;
    await reconcileUser(ctx, user);
    return null;
  },
});
