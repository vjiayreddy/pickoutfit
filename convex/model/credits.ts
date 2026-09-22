import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { envNumber } from "../lib/env";
import { appError } from "../lib/errors";
import {
  dayKey,
  LIMITS,
  PLANS,
  UNIT_ECONOMICS,
  type Feature,
  type PlanId,
} from "../shared/credits";
import { bumpDailyStats } from "./stats";

/**
 * The only module allowed to touch `users.planCredits`, `users.packCredits` and `creditLedger`
 * (except Better Auth onCreate signup bonus in auth.ts).
 * Spend plan first, refund pack first. Every ledger line has a unique `ref` for idempotency.
 */

type Bucket = Doc<"creditLedger">["bucket"];
type Kind = Doc<"creditLedger">["kind"];
export type Reservation = { plan: number; pack: number };
export type ShortfallReason = "balance" | "daily_cap" | "kill_switch";

const BILLING_FRESHNESS_MS = 60_000;

export function hasCurrentPlan(user: Doc<"users">, now = Date.now()): boolean {
  return (
    user.plan !== "free" &&
    user.planPeriodEnd !== undefined &&
    user.planPeriodEnd > now
  );
}

export function hasCurrentFeature(
  user: Doc<"users">,
  feature: Feature,
  now = Date.now(),
): boolean {
  return hasCurrentPlan(user, now) && user.features.includes(feature);
}

export function assertFreshBilling(user: Doc<"users">, now = Date.now()): void {
  if (
    user.plan !== "free" &&
    (!hasCurrentPlan(user, now) ||
      user.billingCheckedAt === undefined ||
      now - user.billingCheckedAt > BILLING_FRESHNESS_MS)
  ) {
    throw appError(
      "SUBSCRIPTION_REFRESH_REQUIRED",
      "Refresh your subscription before continuing.",
    );
  }
}

export type Balance = {
  plan: PlanId;
  planCredits: number;
  packCredits: number;
  total: number;
  planPeriodEnd?: number;
  features: Doc<"users">["features"];
  dailyRemaining: number;
  lowBalance: boolean;
};

export function getBalance(user: Doc<"users">, now = Date.now()): Balance {
  const currentPlan = hasCurrentPlan(user, now);
  const planCredits = currentPlan ? user.planCredits : 0;
  const total = planCredits + user.packCredits;
  const spentToday =
    user.dailySpend.dayKey === dayKey(now) ? user.dailySpend.credits : 0;
  return {
    plan: currentPlan ? user.plan : "free",
    planCredits,
    packCredits: user.packCredits,
    total,
    planPeriodEnd: user.planPeriodEnd,
    features: currentPlan ? user.features : [],
    dailyRemaining: Math.max(0, LIMITS.dailyCreditCap - spentToday),
    lowBalance: total <= LIMITS.lowBalanceThreshold,
  };
}

export type ReserveResult = {
  granted: number;
  shortfall: number;
  reservation: Reservation;
  reason?: ShortfallReason;
};

/**
 * Take up to `amount` credits for a job. Never throws for a partial grant: callers decide
 * whether a shortfall is fatal (renders) or means a partial run (ingest).
 */
export async function reserve(
  ctx: MutationCtx,
  user: Doc<"users">,
  amount: number,
  jobId: Id<"jobs">,
): Promise<ReserveResult> {
  if (amount <= 0) {
    return { granted: 0, shortfall: 0, reservation: { plan: 0, pack: 0 } };
  }
  const applied = await existingReservation(ctx, jobId);
  if (applied) {
    const granted = applied.plan + applied.pack;
    return {
      granted,
      shortfall: Math.max(0, amount - granted),
      reservation: applied,
    };
  }
  assertFreshBilling(user);
  const now = Date.now();
  const today = dayKey(now);
  const availablePlanCredits = hasCurrentPlan(user, now) ? user.planCredits : 0;
  const balance = availablePlanCredits + user.packCredits;
  const spentToday =
    user.dailySpend.dayKey === today ? user.dailySpend.credits : 0;
  const dailyRemaining = Math.max(0, LIMITS.dailyCreditCap - spentToday);
  const globalRemaining = await globalRemainingCredits(ctx, today);

  const granted = Math.max(
    0,
    Math.min(amount, balance, dailyRemaining, globalRemaining),
  );
  const reason: ShortfallReason | undefined =
    granted < amount
      ? globalRemaining <= granted
        ? "kill_switch"
        : dailyRemaining <= granted
          ? "daily_cap"
          : "balance"
      : undefined;

  const reservation: Reservation = {
    plan: Math.min(granted, availablePlanCredits),
    pack: 0,
  };
  reservation.pack = granted - reservation.plan;

  let running = user;
  if (reservation.plan > 0) {
    running = await writeLine(ctx, running, {
      delta: -reservation.plan,
      bucket: "plan",
      kind: "reserve",
      ref: `reserve:${jobId}:plan`,
      jobId,
    });
  }
  if (reservation.pack > 0) {
    await writeLine(ctx, running, {
      delta: -reservation.pack,
      bucket: "pack",
      kind: "reserve",
      ref: `reserve:${jobId}:pack`,
      jobId,
    });
  }
  if (granted > 0) {
    await ctx.db.patch(user._id, {
      dailySpend: { dayKey: today, credits: spentToday + granted },
    });
    await bumpGlobalCounter(ctx, today, granted);
    await ctx.db.patch(jobId, { reservation, updatedAt: now });
    await bumpDailyStats(ctx, { creditsSpent: granted }, now);
  }
  return {
    granted,
    shortfall: amount - granted,
    reservation,
    ...(reason ? { reason } : {}),
  };
}

/** Return unused credits from a job to the buckets they came from, pack first. */
export async function refund(
  ctx: MutationCtx,
  job: Doc<"jobs">,
  amount: number,
  note?: string,
): Promise<number> {
  if (amount <= 0) return 0;
  const now = Date.now();
  const user = await ctx.db.get(job.userId);
  if (!user) throw appError("NOT_FOUND", "User not found for refund.");
  const refundablePack = job.reservation.pack - job.refunds.pack;
  const refundablePlan = job.reservation.plan - job.refunds.plan;
  const packPart = Math.max(0, Math.min(amount, refundablePack));
  const planPart = Math.max(0, Math.min(amount - packPart, refundablePlan));
  const total = packPart + planPart;
  if (total === 0) return 0;

  const seq = job.refunds.pack + job.refunds.plan;
  const packRef = `refund:${job._id}:pack:${seq}`;
  const planRef = `refund:${job._id}:plan:${seq}`;
  if (packPart > 0 && (await ledgerHasRef(ctx, packRef))) return 0;
  if (planPart > 0 && (await ledgerHasRef(ctx, planRef))) return 0;

  let running = user;
  if (packPart > 0) {
    running = await writeLine(ctx, running, {
      delta: packPart,
      bucket: "pack",
      kind: "refund",
      ref: packRef,
      jobId: job._id,
      note,
    });
  }
  if (planPart > 0) {
    running = await writeLine(ctx, running, {
      delta: planPart,
      bucket: "plan",
      kind: "refund",
      ref: planRef,
      jobId: job._id,
      note,
    });
  }
  const today = dayKey(now);
  if (running.dailySpend.dayKey === today) {
    await ctx.db.patch(user._id, {
      dailySpend: {
        dayKey: today,
        credits: Math.max(0, running.dailySpend.credits - total),
      },
    });
  }
  await bumpGlobalCounter(ctx, today, -total);
  await ctx.db.patch(job._id, {
    refunds: {
      plan: job.refunds.plan + planPart,
      pack: job.refunds.pack + packPart,
    },
    updatedAt: now,
  });
  await bumpDailyStats(ctx, { creditsRefunded: total }, now);
  return total;
}

/**
 * Apply a paid plan allowance. Idempotent by `ref`. Only touches the plan bucket.
 * Wired to Stripe in Phase 6; usable now for admin/manual grants.
 */
export async function grantPlan(
  ctx: MutationCtx,
  user: Doc<"users">,
  plan: PlanId,
  ref: string,
  planPeriodEnd?: number,
): Promise<boolean> {
  if (plan === "free" && user.plan === "free") return false;
  if (await ledgerHasRef(ctx, ref)) return false;
  const definition = PLANS[plan];
  let running = user;
  if (running.planCredits > 0) {
    running = await writeLine(ctx, running, {
      delta: -running.planCredits,
      bucket: "plan",
      kind: "plan_reset",
      ref: `${ref}:reset`,
      note: `Cycle reset (${plan})`,
    });
  }
  await writeLine(ctx, running, {
    delta: definition.monthlyCredits,
    bucket: "plan",
    kind: "plan_grant",
    ref,
    note: `${definition.name} allowance`,
  });
  await ctx.db.patch(user._id, {
    plan,
    features: [...definition.features],
    planPeriodEnd,
  });
  await bumpDailyStats(ctx, {
    creditsGranted: definition.monthlyCredits,
    revenueUsd: definition.priceUsd,
  });
  return true;
}

export async function adminAdjust(
  ctx: MutationCtx,
  user: Doc<"users">,
  delta: number,
  bucket: Bucket,
  ref: string,
  note: string,
): Promise<boolean> {
  if (delta === 0 || (await ledgerHasRef(ctx, ref))) return false;
  await writeLine(ctx, user, { delta, bucket, kind: "admin", ref, note });
  if (delta > 0) await bumpDailyStats(ctx, { creditsGranted: delta });
  return true;
}

export function shortfallError(result: ReserveResult, needed: number) {
  const balanceText = `You need ${needed} credit${needed === 1 ? "" : "s"} and have ${needed - result.shortfall} available.`;
  switch (result.reason) {
    case "daily_cap":
      return appError(
        "DAILY_CAP_REACHED",
        `You've hit today's limit of ${LIMITS.dailyCreditCap} credits. Try again tomorrow.`,
        { needed, shortfall: result.shortfall },
      );
    case "kill_switch":
      return appError(
        "SPEND_KILL_SWITCH",
        "Rendering is paused for the moment. Please try again later.",
        { needed },
      );
    default:
      return appError(
        "INSUFFICIENT_CREDITS",
        `${balanceText} View your plan in Billing or choose fewer images.`,
        { needed, shortfall: result.shortfall },
      );
  }
}

async function writeLine(
  ctx: MutationCtx,
  user: Doc<"users">,
  line: {
    delta: number;
    bucket: Bucket;
    kind: Kind;
    ref: string;
    jobId?: Id<"jobs">;
    note?: string;
  },
): Promise<Doc<"users">> {
  const planCredits =
    line.bucket === "plan" ? user.planCredits + line.delta : user.planCredits;
  const packCredits =
    line.bucket === "pack" ? user.packCredits + line.delta : user.packCredits;
  if (planCredits < 0 || packCredits < 0) {
    throw appError("CONFLICT", "Credit balance would go negative.", {
      ref: line.ref,
    });
  }
  await ctx.db.patch(user._id, { planCredits, packCredits });
  await ctx.db.insert("creditLedger", {
    userId: user._id,
    delta: line.delta,
    bucket: line.bucket,
    kind: line.kind,
    ref: line.ref,
    jobId: line.jobId,
    note: line.note,
    balanceAfter: planCredits + packCredits,
    createdAt: Date.now(),
  });
  return { ...user, planCredits, packCredits };
}

async function existingReservation(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
): Promise<Reservation | null> {
  const lines = await Promise.all(
    (["plan", "pack"] as const).map((bucket) =>
      ctx.db
        .query("creditLedger")
        .withIndex("by_ref", (q) => q.eq("ref", `reserve:${jobId}:${bucket}`))
        .first(),
    ),
  );
  if (lines.every((line) => line === null)) return null;
  const job = await ctx.db.get(jobId);
  return job
    ? job.reservation
    : { plan: -(lines[0]?.delta ?? 0), pack: -(lines[1]?.delta ?? 0) };
}

async function ledgerHasRef(
  ctx: QueryCtx | MutationCtx,
  ref: string,
): Promise<boolean> {
  const existing = await ctx.db
    .query("creditLedger")
    .withIndex("by_ref", (q) => q.eq("ref", ref))
    .first();
  return existing !== null;
}

async function globalRemainingCredits(
  ctx: MutationCtx,
  today: string,
): Promise<number> {
  const maxUsd = envNumber("MAX_DAILY_SPEND_USD", Number.POSITIVE_INFINITY);
  if (!Number.isFinite(maxUsd)) return Number.POSITIVE_INFINITY;
  const counter = await ctx.db
    .query("systemCounters")
    .withIndex("by_day_key", (q) =>
      q.eq("dayKey", today).eq("key", "credits_reserved"),
    )
    .unique();
  const reserved = counter?.value ?? 0;
  return Math.max(
    0,
    Math.floor(maxUsd / UNIT_ECONOMICS.cogsUsdPerCredit) - reserved,
  );
}

async function bumpGlobalCounter(
  ctx: MutationCtx,
  today: string,
  delta: number,
): Promise<void> {
  const counter = await ctx.db
    .query("systemCounters")
    .withIndex("by_day_key", (q) =>
      q.eq("dayKey", today).eq("key", "credits_reserved"),
    )
    .unique();
  if (counter) {
    await ctx.db.patch(counter._id, {
      value: Math.max(0, counter.value + delta),
    });
  } else if (delta > 0) {
    await ctx.db.insert("systemCounters", {
      dayKey: today,
      key: "credits_reserved",
      value: delta,
    });
  }
}
