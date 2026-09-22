import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAppUser, requireUser } from "./lib/auth";
import { getBalance } from "./model/credits";
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
