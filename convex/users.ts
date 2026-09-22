import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { getAppUser, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { getBalance } from "./model/credits";
import {
  cancelActiveJobs,
  deleteUserRow,
  purgeUserBatch,
} from "./model/users";
import { vFeature, vPlanId, vPrefs } from "./shared/validators";

export const vBalance = v.object({
  plan: vPlanId,
  planCredits: v.number(),
  packCredits: v.number(),
  total: v.number(),
  planPeriodEnd: v.optional(v.number()),
  features: v.array(vFeature),
  dailyRemaining: v.number(),
  lowBalance: v.boolean(),
});

export const vMe = v.object({
  _id: v.id("users"),
  authId: v.string(),
  email: v.optional(v.string()),
  name: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  role: v.union(v.literal("user"), v.literal("admin")),
  onboardedAt: v.optional(v.number()),
  defaultAvatarId: v.optional(v.id("avatars")),
  prefs: vPrefs,
  balance: vBalance,
  createdAt: v.number(),
});

/** The signed-in app user with live balance, or null while signed out / not yet stored. */
export const me = query({
  args: {},
  returns: v.union(vMe, v.null()),
  handler: async (ctx) => {
    const user = await getAppUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      authId: user.authId,
      email: user.email,
      name: user.name,
      imageUrl: user.imageUrl,
      role: user.role,
      onboardedAt: user.onboardedAt,
      defaultAvatarId: user.defaultAvatarId,
      prefs: user.prefs,
      balance: getBalance(user),
      createdAt: user.createdAt,
    };
  },
});

export const updatePrefs = mutation({
  args: { prefs: vPrefs },
  returns: v.null(),
  handler: async (ctx, { prefs }) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, { prefs });
    return null;
  },
});

/** Finish onboarding once an avatar and an explicit wardrobe preference exist. */
export const completeOnboarding = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const avatar = await ctx.db
      .query("avatars")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!avatar) {
      throw appError(
        "INVALID_INPUT",
        "Add at least one photo of yourself first.",
      );
    }
    if (!user.onboardedAt) {
      if (
        user.prefs.presentation !== "masculine" &&
        user.prefs.presentation !== "feminine"
      ) {
        throw appError(
          "INVALID_INPUT",
          "Choose Men's wardrobe or Women's wardrobe to finish setup.",
        );
      }
      await ctx.db.patch(user._id, { onboardedAt: Date.now() });
    }
    return null;
  },
});

/**
 * Wipes every document and file the user made. The account itself survives:
 * row, ledger, balance, plan and role stay so wipe cannot re-mint signup credits.
 */
export const deleteAllData = mutation({
  args: { confirm: v.literal("DELETE") },
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    await ctx.db.patch(user._id, {
      defaultAvatarId: undefined,
      onboardedAt: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.users.purgeUserData, {
      userId: user._id,
      mode: "content",
    });
    return null;
  },
});

/** One transaction's worth of deletion, rescheduling itself until nothing is left. */
export const purgeUserData = internalMutation({
  args: {
    userId: v.id("users"),
    mode: v.union(v.literal("content"), v.literal("account")),
  },
  returns: v.null(),
  handler: async (ctx, { userId, mode }) => {
    const user = await ctx.db.get(userId);
    if (!user) return null;
    await cancelActiveJobs(ctx, userId);
    const done = await purgeUserBatch(ctx, userId, mode);
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.users.purgeUserData, {
        userId,
        mode,
      });
      return null;
    }
    if (mode === "account") await deleteUserRow(ctx, userId);
    return null;
  },
});
