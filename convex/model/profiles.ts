import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import type {
  BeardGoal,
  BeardNow,
  BudgetTier,
  HairGoal,
  HairLength,
  HairTexture,
} from "../shared/services";
import { isServiceAvailable } from "../shared/services";

const PROFILE_SCAN = 8;

export type ServiceProfileInput = {
  serviceId: "hairstyle" | "beard";
  budget: { tier: BudgetTier; monthlyInr?: number };
  hairLength?: HairLength;
  texture?: HairTexture;
  hairGoal?: HairGoal;
  beardNow?: BeardNow;
  beardGoal?: BeardGoal;
};

export async function listProfiles(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"serviceProfiles">[]> {
  return ctx.db
    .query("serviceProfiles")
    .withIndex("by_user_service", (q) => q.eq("userId", userId))
    .take(PROFILE_SCAN);
}

export function cleanBudget(budget: {
  tier: BudgetTier;
  monthlyInr?: number;
}): { tier: BudgetTier; monthlyInr?: number } {
  if (budget.monthlyInr === undefined) return { tier: budget.tier };
  if (
    !Number.isFinite(budget.monthlyInr) ||
    budget.monthlyInr < 0 ||
    budget.monthlyInr > 1_000_000
  ) {
    throw appError("INVALID_INPUT", "Enter a monthly budget in rupees, up to 10,00,000.");
  }
  return { tier: budget.tier, monthlyInr: Math.round(budget.monthlyInr) };
}

/**
 * Replaces hairstyle and beard profiles with the submitted set.
 * A service left out is removed, so turning it off in settings sticks.
 */
export async function replaceGroomingProfiles(
  ctx: MutationCtx,
  user: Doc<"users">,
  profiles: ServiceProfileInput[],
): Promise<void> {
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (seen.has(profile.serviceId)) {
      throw appError("INVALID_INPUT", "Each service can only be saved once.");
    }
    seen.add(profile.serviceId);
    if (!isServiceAvailable(profile.serviceId, user)) {
      throw appError("INVALID_INPUT", "That service is not available for this wardrobe.");
    }
  }

  const existing = await listProfiles(ctx, user._id);
  const wanted = new Set(profiles.map((profile) => profile.serviceId));
  for (const row of existing) {
    if (
      (row.serviceId === "hairstyle" || row.serviceId === "beard") &&
      !wanted.has(row.serviceId)
    ) {
      await ctx.db.delete(row._id);
    }
  }

  const now = Date.now();
  for (const profile of profiles) {
    const budget = cleanBudget(profile.budget);
    const doc = {
      userId: user._id,
      serviceId: profile.serviceId,
      budget,
      updatedAt: now,
      ...(profile.serviceId === "hairstyle" && profile.hairLength
        ? { hairLength: profile.hairLength }
        : {}),
      ...(profile.serviceId === "hairstyle" && profile.texture
        ? { texture: profile.texture }
        : {}),
      ...(profile.serviceId === "hairstyle" && profile.hairGoal
        ? { hairGoal: profile.hairGoal }
        : {}),
      ...(profile.serviceId === "beard" && profile.beardNow
        ? { beardNow: profile.beardNow }
        : {}),
      ...(profile.serviceId === "beard" && profile.beardGoal
        ? { beardGoal: profile.beardGoal }
        : {}),
    };
    const current = existing.find((row) => row.serviceId === profile.serviceId);
    if (current) {
      await ctx.db.replace(current._id, doc);
    } else {
      await ctx.db.insert("serviceProfiles", doc);
    }
  }
}
