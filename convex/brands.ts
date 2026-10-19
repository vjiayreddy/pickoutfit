import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  assertVendorWritable,
  getAppUser,
  getVendorContext,
  requireVendor,
} from "./lib/auth";
import {
  createBrand,
  listBrands,
  removeBrand,
  updateBrand,
  upsertBrand,
} from "./model/brands";
import { vBrandDoc, vBrandListRow } from "./shared/brands";

/** Vendor managers/owners on a writable store edit their brand catalog. */
async function requireBrandEditor(ctx: Parameters<typeof requireVendor>[0]) {
  const { vendor } = await requireVendor(ctx, { minRole: "manager" });
  assertVendorWritable(vendor);
  return vendor;
}

/** Staff+ can ensure brands while saving products. */
async function requireBrandWriter(ctx: Parameters<typeof requireVendor>[0]) {
  const { vendor } = await requireVendor(ctx, { minRole: "staff" });
  assertVendorWritable(vendor);
  return vendor;
}

async function canSeeInactiveForVendor(
  ctx: Parameters<typeof getAppUser>[0],
  vendorId: Id<"vendors">,
): Promise<boolean> {
  const user = await getAppUser(ctx);
  if (user?.role === "admin") return true;
  const membership = await getVendorContext(ctx);
  return membership?.vendor._id === vendorId;
}

/** Flat list for the product picker (own store) or a public storefront. */
export const list = query({
  args: {
    vendorId: v.optional(v.id("vendors")),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(vBrandListRow),
  handler: async (ctx, { vendorId, activeOnly }) => {
    let scope = vendorId;
    if (!scope) {
      const { vendor } = await requireVendor(ctx);
      scope = vendor._id;
    }
    const wantInactive = activeOnly === false;
    if (wantInactive && !(await canSeeInactiveForVendor(ctx, scope))) {
      return listBrands(ctx, scope, { activeOnly: true });
    }
    return listBrands(ctx, scope, { activeOnly: activeOnly ?? true });
  },
});

export const get = query({
  args: { brandId: v.id("brands") },
  returns: v.union(vBrandDoc, v.null()),
  handler: async (ctx, { brandId }) => {
    const row = await ctx.db.get(brandId);
    if (!row) return null;
    if (row.isActive) return row;
    if (await canSeeInactiveForVendor(ctx, row.vendorId)) return row;
    return null;
  },
});

/**
 * Find-or-create by name (case-insensitive slug). Prefer this from the product form
 * so "Nike" and "nike" share one row.
 */
export const ensure = mutation({
  args: {
    name: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("brands"),
  handler: async (ctx, args) => {
    const vendor = await requireBrandWriter(ctx);
    return upsertBrand(ctx, vendor._id, args);
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireBrandEditor(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("brands"),
  handler: async (ctx, args) => {
    const vendor = await requireBrandEditor(ctx);
    return createBrand(ctx, vendor._id, args);
  },
});

export const update = mutation({
  args: {
    brandId: v.id("brands"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    /** Pass `null` to clear. Omit to leave unchanged. */
    logoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vendor = await requireBrandEditor(ctx);
    await updateBrand(ctx, vendor._id, args);
    return null;
  },
});

export const remove = mutation({
  args: { brandId: v.id("brands") },
  returns: v.null(),
  handler: async (ctx, { brandId }) => {
    const vendor = await requireBrandEditor(ctx);
    await removeBrand(ctx, vendor._id, brandId);
    return null;
  },
});
