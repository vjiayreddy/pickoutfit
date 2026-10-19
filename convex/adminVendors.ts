import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { appError } from "./lib/errors";
import { requireVendorDoc, toVendorView } from "./model/vendors";
import { vVendorPlanId, vVendorStatus, vVendorView, VENDOR_PLANS } from "./shared/vendors";

export const vAdminVendorRow = v.object({
  vendor: vVendorView,
  ownerEmail: v.union(v.string(), v.null()),
  ownerName: v.union(v.string(), v.null()),
});

/** Every store, newest first, or one status bucket. */
export const list = query({
  args: { status: v.optional(vVendorStatus), now: v.number(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vAdminVendorRow),
  handler: async (ctx, { status, now, paginationOpts }) => {
    await requireAdmin(ctx);
    const result = status
      ? await ctx.db
          .query("vendors")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db.query("vendors").withIndex("by_createdAt").order("desc").paginate(paginationOpts);
    const page = [];
    for (const vendor of result.page) {
      const owner = await ctx.db.get(vendor.ownerUserId);
      page.push({
        vendor: await toVendorView(ctx, vendor, now),
        ownerEmail: owner?.email ?? null,
        ownerName: owner?.name ?? null,
      });
    }
    return { ...result, page };
  },
});

export const counts = query({
  args: {},
  returns: v.object({ pending: v.number(), active: v.number(), suspended: v.number(), closed: v.number() }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const out = { pending: 0, active: 0, suspended: 0, closed: 0 };
    for (const status of ["pending", "active", "suspended", "closed"] as const) {
      const rows = await ctx.db
        .query("vendors")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(1000);
      out[status] = rows.length;
    }
    return out;
  },
});

/** Approve, suspend, reopen or close a store. Closing also unlists everything it sells. */
export const setStatus = mutation({
  args: { vendorId: v.id("vendors"), status: vVendorStatus },
  returns: v.null(),
  handler: async (ctx, { vendorId, status }) => {
    await requireAdmin(ctx);
    const vendor = await requireVendorDoc(ctx, vendorId);
    if (vendor.status === status) return null;
    await ctx.db.patch(vendor._id, { status, updatedAt: Date.now() });
    if (status === "closed") {
      const live = await ctx.db
        .query("products")
        .withIndex("by_vendorId_and_status", (q) => q.eq("vendorId", vendor._id).eq("status", "active"))
        .take(500);
      for (const product of live) {
        await ctx.db.patch(product._id, { status: "archived", active: false, updatedAt: Date.now() });
      }
    }
    return null;
  },
});

export const setCommission = mutation({
  args: { vendorId: v.id("vendors"), commissionBps: v.number() },
  returns: v.null(),
  handler: async (ctx, { vendorId, commissionBps }) => {
    await requireAdmin(ctx);
    const vendor = await requireVendorDoc(ctx, vendorId);
    if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > 5000) {
      throw appError("INVALID_INPUT", "Commission must be between 0 and 5000 basis points.");
    }
    await ctx.db.patch(vendor._id, { commissionBps, updatedAt: Date.now() });
    return null;
  },
});

/** Manually move a store onto a plan (billing is wired in a later phase). */
export const setPlan = mutation({
  args: { vendorId: v.id("vendors"), plan: vVendorPlanId },
  returns: v.null(),
  handler: async (ctx, { vendorId, plan }) => {
    await requireAdmin(ctx);
    const vendor = await requireVendorDoc(ctx, vendorId);
    await ctx.db.patch(vendor._id, {
      plan,
      planStatus: "active",
      commissionBps: VENDOR_PLANS[plan].commissionBps,
      updatedAt: Date.now(),
    });
    return null;
  },
});
