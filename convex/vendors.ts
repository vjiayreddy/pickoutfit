import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import {
  assertVendorWritable,
  getVendorContext,
  requireUser,
  requireVendor,
} from "./lib/auth";
import { appError } from "./lib/errors";
import {
  cleanVendorProfile,
  createVendor,
  toVendorView,
} from "./model/vendors";
import {
  MAX_VENDOR_MEMBERS,
  VENDOR_PLANS,
  vVendorAddress,
  vVendorPlanId,
  vVendorRole,
  vVendorView,
} from "./shared/vendors";

const vProfileInput = {
  name: v.string(),
  description: v.optional(v.string()),
  supportEmail: v.string(),
  supportPhone: v.optional(v.string()),
  legalName: v.optional(v.string()),
  gstin: v.optional(v.string()),
  pan: v.optional(v.string()),
  address: vVendorAddress,
};

export const vMembership = v.object({
  role: vVendorRole,
});

export const vVendorMe = v.object({
  vendor: vVendorView,
  membership: vMembership,
  planName: v.string(),
  planBlurb: v.string(),
});

/** The signed-in user's store, or null when they have none. Takes `now` so quota reads stay pure. */
export const me = query({
  args: { now: v.number() },
  returns: v.union(vVendorMe, v.null()),
  handler: async (ctx, { now }) => {
    const context = await getVendorContext(ctx);
    if (!context) return null;
    const plan = VENDOR_PLANS[context.vendor.plan];
    return {
      vendor: await toVendorView(ctx, context.vendor, now),
      membership: { role: context.membership.role },
      planName: plan.name,
      planBlurb: plan.blurb,
    };
  },
});

/** Opens a store in `pending` state. Admins approve it from the admin desk. */
export const register = mutation({
  args: vProfileInput,
  returns: v.id("vendors"),
  handler: async (ctx, input) => {
    const user = await requireUser(ctx);
    return createVendor(ctx, user, input);
  },
});

export const updateProfile = mutation({
  args: vProfileInput,
  returns: v.null(),
  handler: async (ctx, input) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const clean = cleanVendorProfile(input);
    await ctx.db.patch(vendor._id, {
      name: clean.name,
      description: clean.description,
      supportEmail: clean.supportEmail,
      supportPhone: clean.supportPhone,
      legalName: clean.legalName,
      gstin: clean.gstin,
      pan: clean.pan,
      address: clean.address,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    assertVendorWritable(vendor);
    return ctx.storage.generateUploadUrl();
  },
});

export const setBranding = mutation({
  args: {
    logoStorageId: v.optional(v.id("_storage")),
    bannerStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    if (args.logoStorageId !== undefined && vendor.logoStorageId && vendor.logoStorageId !== args.logoStorageId) {
      await ctx.storage.delete(vendor.logoStorageId);
    }
    if (
      args.bannerStorageId !== undefined &&
      vendor.bannerStorageId &&
      vendor.bannerStorageId !== args.bannerStorageId
    ) {
      await ctx.storage.delete(vendor.bannerStorageId);
    }
    await ctx.db.patch(vendor._id, {
      ...(args.logoStorageId !== undefined ? { logoStorageId: args.logoStorageId } : {}),
      ...(args.bannerStorageId !== undefined ? { bannerStorageId: args.bannerStorageId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const vMemberView = v.object({
  _id: v.id("vendorMembers"),
  userId: v.id("users"),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: vVendorRole,
  createdAt: v.number(),
});

export const listMembers = query({
  args: {},
  returns: v.array(vMemberView),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const rows = await ctx.db
      .query("vendorMembers")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
      .take(MAX_VENDOR_MEMBERS);
    const members = [];
    for (const row of rows) {
      const user = await ctx.db.get(row.userId);
      members.push({
        _id: row._id,
        userId: row.userId,
        name: user?.name ?? null,
        email: user?.email ?? null,
        role: row.role,
        createdAt: row.createdAt,
      });
    }
    return members;
  },
});

/** Adds an existing account (by email) to the store. */
export const inviteMember = mutation({
  args: { email: v.string(), role: v.union(v.literal("manager"), v.literal("staff")) },
  returns: v.null(),
  handler: async (ctx, { email, role }) => {
    const { user, vendor } = await requireVendor(ctx, { minRole: "owner" });
    assertVendorWritable(vendor);
    const target = email.trim().toLowerCase();
    // Users are looked up by email through a bounded scan of recent accounts: there is no email index.
    const candidates = await ctx.db.query("users").withIndex("by_createdAt").order("desc").take(1000);
    const invitee = candidates.find((candidate) => candidate.email?.toLowerCase() === target);
    if (!invitee) throw appError("NOT_FOUND", "No account with that email. Ask them to sign up first.");
    const existing = await ctx.db
      .query("vendorMembers")
      .withIndex("by_userId", (q) => q.eq("userId", invitee._id))
      .first();
    if (existing) throw appError("CONFLICT", "That person already belongs to a store.");
    const count = await ctx.db
      .query("vendorMembers")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
      .take(MAX_VENDOR_MEMBERS);
    if (count.length >= MAX_VENDOR_MEMBERS) {
      throw appError("INVALID_INPUT", `A store can have at most ${MAX_VENDOR_MEMBERS} members.`);
    }
    await ctx.db.insert("vendorMembers", {
      vendorId: vendor._id,
      userId: invitee._id,
      role,
      invitedBy: user._id,
      createdAt: Date.now(),
    });
    if (invitee.role === "user") await ctx.db.patch(invitee._id, { role: "vendor" });
    return null;
  },
});

export const removeMember = mutation({
  args: { memberId: v.id("vendorMembers") },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "owner" });
    const member = await ctx.db.get(memberId);
    if (!member || member.vendorId !== vendor._id) throw appError("NOT_FOUND", "That member doesn't exist.");
    if (member.role === "owner") throw appError("INVALID_INPUT", "The owner cannot be removed.");
    await ctx.db.delete(member._id);
    const user = await ctx.db.get(member.userId);
    if (user && user.role === "vendor") await ctx.db.patch(user._id, { role: "user" });
    return null;
  },
});

export const plans = query({
  args: {},
  returns: v.array(
    v.object({
      id: vVendorPlanId,
      name: v.string(),
      priceInr: v.number(),
      extractionQuota: v.number(),
      commissionBps: v.number(),
      maxProducts: v.number(),
      blurb: v.string(),
    }),
  ),
  handler: async () =>
    Object.values(VENDOR_PLANS).map((plan) => ({
      id: plan.id,
      name: plan.name,
      priceInr: plan.priceInr,
      extractionQuota: plan.extractionQuota,
      commissionBps: plan.commissionBps,
      maxProducts: plan.maxProducts,
      blurb: plan.blurb,
    })),
});

/** Vendor check for actions, which cannot read the database themselves. */
export const assertMember = internalQuery({
  args: {},
  returns: v.id("vendors"),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    assertVendorWritable(vendor);
    return vendor._id;
  },
});
