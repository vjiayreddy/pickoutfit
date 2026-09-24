import {
  createClient,
  type AuthFunctions,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { dayKey, PLANS } from "./shared/credits";

const siteUrl = process.env.SITE_URL!;

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    user: {
      onCreate: async (ctx, doc) => {
        const now = Date.now();
        const signupCredits = PLANS.free.signupCredits;
        const userId = await ctx.db.insert("users", {
          authId: doc._id,
          email: doc.email,
          name: doc.name,
          imageUrl: doc.image ?? undefined,
          role: "user",
          plan: "free",
          features: [],
          planCredits: 0,
          packCredits: signupCredits,
          dailySpend: { dayKey: dayKey(now), credits: 0 },
          prefs: {
            presentation: "neutral",
            fit: "regular",
            avoidColours: [],
            shopSimilar: true,
          },
          createdAt: now,
        });

        if (signupCredits > 0) {
          await ctx.db.insert("creditLedger", {
            userId,
            delta: signupCredits,
            bucket: "pack",
            kind: "signup_bonus",
            ref: `signup_bonus:${doc._id}`,
            note: "Welcome credits",
            balanceAfter: signupCredits,
            createdAt: now,
          });
        }
      },
      onUpdate: async (ctx, newDoc) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_authId", (q) => q.eq("authId", newDoc._id))
          .unique();
        if (!user) return;
        await ctx.db.patch(user._id, {
          email: newDoc.email,
          name: newDoc.name,
          imageUrl: newDoc.image ?? undefined,
        });
      },
      onDelete: async (_ctx, _doc) => {
        // App wardrobe cascade delete is handled by a dedicated product flow later.
      },
    },
  },
});

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [convex({ authConfig })],
  });
};

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.safeGetAuthUser(ctx);
  },
});
