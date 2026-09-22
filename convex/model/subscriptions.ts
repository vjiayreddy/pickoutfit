import { components } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  isStripeCheckoutConfigured,
  optionalEnv,
} from "../lib/env";
import {
  assertFreshBilling,
  grantPlan,
  hasCurrentPlan,
} from "./credits";
import { PLANS, type PlanId } from "../shared/credits";

const BILLING_FRESHNESS_MS = 60_000;

type StripeSub = {
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: number;
  priceId: string;
};

/** Stripe timestamps are seconds; tolerate ms if already converted. */
export function normalizePeriodEnd(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

export function planFromPriceId(priceId: string): PlanId | null {
  const pro = optionalEnv("STRIPE_PRICE_PRO");
  const plus = optionalEnv("STRIPE_PRICE_PLUS");
  if (pro && priceId === pro) return "pro";
  if (plus && priceId === plus) return "plus";
  return null;
}

/**
 * Sync Stripe component subscriptions → users.plan / features / planCredits.
 * When Stripe prices are not configured yet, only stamps `billingCheckedAt`
 * so test grants and free users keep working.
 */
export async function reconcileUser(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<Doc<"users">> {
  const now = Date.now();

  if (!isStripeCheckoutConfigured()) {
    await ctx.db.patch(user._id, { billingCheckedAt: now });
    return (await ctx.db.get(user._id))!;
  }

  const subscriptions = (await ctx.runQuery(
    components.stripe.public.listSubscriptionsByUserId,
    { userId: user.authId },
  )) as StripeSub[];

  const active = subscriptions
    .filter((sub) => sub.status === "active" || sub.status === "trialing")
    .sort((a, b) => b.currentPeriodEnd - a.currentPeriodEnd)[0];

  if (!active) {
    if (user.plan !== "free" || user.planCredits > 0 || user.planPeriodEnd) {
      await grantPlan(ctx, user, "free", `stripe:clear:${user.authId}:${now}`);
    }
    await ctx.db.patch(user._id, {
      plan: "free",
      features: [],
      planPeriodEnd: undefined,
      billingCheckedAt: now,
    });
    return (await ctx.db.get(user._id))!;
  }

  const plan = planFromPriceId(active.priceId);
  if (!plan) {
    if (user.plan !== "free") {
      await grantPlan(
        ctx,
        user,
        "free",
        `stripe:unknown:${active.stripeSubscriptionId}:${now}`,
      );
    }
    await ctx.db.patch(user._id, {
      plan: "free",
      features: [],
      planPeriodEnd: undefined,
      billingCheckedAt: now,
    });
    return (await ctx.db.get(user._id))!;
  }

  const periodEnd = normalizePeriodEnd(active.currentPeriodEnd);
  const ref = `stripe:${active.stripeSubscriptionId}:${periodEnd}`;
  const fresh = await ctx.db.get(user._id);
  if (!fresh) return user;
  await grantPlan(ctx, fresh, plan, ref, periodEnd);
  await ctx.db.patch(user._id, {
    plan,
    features: [...PLANS[plan].features],
    planPeriodEnd: periodEnd,
    billingCheckedAt: now,
  });
  return (await ctx.db.get(user._id))!;
}

/**
 * Refresh from Stripe when stale, then enforce the paid-plan freshness gate.
 */
export async function ensureFreshBilling(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<Doc<"users">> {
  const now = Date.now();
  const freshEnough =
    user.billingCheckedAt !== undefined &&
    now - user.billingCheckedAt <= BILLING_FRESHNESS_MS;

  if (freshEnough) {
    assertFreshBilling(user, now);
    return user;
  }

  const updated = await reconcileUser(ctx, user);
  assertFreshBilling(updated, Date.now());
  return updated;
}

/** Manual / admin grant used before Stripe Dashboard is wired. */
export async function grantPlanForTesting(
  ctx: MutationCtx,
  user: Doc<"users">,
  plan: PlanId,
  days = 30,
): Promise<Doc<"users">> {
  const now = Date.now();
  const periodEnd =
    plan === "free" ? undefined : now + days * 24 * 60 * 60 * 1000;
  const ref = `test:${plan}:${user.authId}:${now}`;
  await grantPlan(ctx, user, plan, ref, periodEnd);
  await ctx.db.patch(user._id, {
    plan,
    features: [...PLANS[plan].features],
    planPeriodEnd: periodEnd,
    billingCheckedAt: now,
  });
  return (await ctx.db.get(user._id))!;
}

export function billingStatus(user: Doc<"users">, now = Date.now()) {
  const configured = isStripeCheckoutConfigured();
  const current = hasCurrentPlan(user, now);
  return {
    configured,
    plan: current ? user.plan : ("free" as PlanId),
    planPeriodEnd: current ? user.planPeriodEnd : undefined,
    features: current ? user.features : [],
    billingCheckedAt: user.billingCheckedAt,
  };
}
