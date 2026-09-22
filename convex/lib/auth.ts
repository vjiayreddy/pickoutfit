import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";

type Ctx = QueryCtx | MutationCtx;

export async function getAppUser(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .unique();
}

/** The signed-in user's document. Throws UNAUTHENTICATED when signed out or not yet stored. */
export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .unique();
  if (!user) {
    throw appError(
      "UNAUTHENTICATED",
      "Your account is still being set up. Try again in a moment.",
    );
  }
  return user;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "admin") throw appError("FORBIDDEN", "Admins only.");
  return user;
}

export async function requireOnboarded(ctx: Ctx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!user.onboardedAt) {
    throw appError("ONBOARDING_REQUIRED", "Add an avatar photo first.");
  }
  return user;
}

export function assertOwner<T extends { userId: Id<"users"> }>(
  doc: T | null,
  user: Doc<"users">,
  what = "item",
): T {
  if (!doc || doc.userId !== user._id) {
    throw appError("NOT_FOUND", `That ${what} doesn't exist.`);
  }
  return doc;
}
