import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireEnv } from "./env";
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

export type VendorContext = {
  user: Doc<"users">;
  vendor: Doc<"vendors">;
  membership: Doc<"vendorMembers">;
};

const VENDOR_ROLE_RANK: Record<Doc<"vendorMembers">["role"], number> = {
  staff: 0,
  manager: 1,
  owner: 2,
};

/**
 * The signed-in user's vendor. The vendor is derived from `vendorMembers`, never from an
 * argument, so a member can only ever touch their own store. Suspended and closed stores
 * can still read their desk but every write should call `assertVendorWritable`.
 */
export async function requireVendor(
  ctx: Ctx,
  opts: { minRole?: Doc<"vendorMembers">["role"] } = {},
): Promise<VendorContext> {
  const user = await requireUser(ctx);
  const membership = await ctx.db
    .query("vendorMembers")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .first();
  if (!membership) throw appError("FORBIDDEN", "You don't have a vendor account yet.");
  const vendor = await ctx.db.get(membership.vendorId);
  if (!vendor || vendor.status === "closed") {
    throw appError("FORBIDDEN", "This store is closed.");
  }
  const needed = opts.minRole ?? "staff";
  if (VENDOR_ROLE_RANK[membership.role] < VENDOR_ROLE_RANK[needed]) {
    throw appError("FORBIDDEN", `This needs the ${needed} role on the store.`);
  }
  return { user, vendor, membership };
}

/** Same as `requireVendor` but returns null when the user has no store. */
export async function getVendorContext(ctx: Ctx): Promise<VendorContext | null> {
  const user = await getAppUser(ctx);
  if (!user) return null;
  const membership = await ctx.db
    .query("vendorMembers")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .first();
  if (!membership) return null;
  const vendor = await ctx.db.get(membership.vendorId);
  if (!vendor) return null;
  return { user, vendor, membership };
}

export function assertVendorWritable(vendor: Doc<"vendors">): void {
  if (vendor.status === "suspended") {
    throw appError("FORBIDDEN", "This store is suspended. Contact support.");
  }
  if (vendor.status === "closed") throw appError("FORBIDDEN", "This store is closed.");
}

/** Loads a document and checks it belongs to the vendor. */
export function assertVendorOwns<T extends { vendorId?: Id<"vendors"> }>(
  doc: T | null,
  vendor: Doc<"vendors">,
  what = "product",
): T {
  if (!doc || doc.vendorId !== vendor._id) {
    throw appError("NOT_FOUND", `That ${what} doesn't exist.`);
  }
  return doc;
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

/** Service-to-service auth for the stylist agent: shared secret + Better Auth user id. */
export async function requireServiceUser(
  ctx: Ctx,
  args: { serviceKey: string; authId: string },
): Promise<Doc<"users">> {
  if (!safeEqual(args.serviceKey, requireEnv("AGENT_SERVICE_KEY"))) {
    throw appError("FORBIDDEN", "Invalid service key.");
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", args.authId))
    .unique();
  if (!user) throw appError("NOT_FOUND", "Unknown user.");
  return user;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
