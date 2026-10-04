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
  createCategory,
  getTree,
  listCategories,
  listChildren,
  removeCategory,
  seedCategories,
  updateCategory,
} from "./model/categories";
import { vCategoryDoc, vCategoryTreeNode } from "./shared/categories";

const vCategoryListRow = vCategoryDoc.extend({
  parentName: v.union(v.string(), v.null()),
  childCount: v.number(),
  depth: v.number(),
  imageUrl: v.union(v.string(), v.null()),
});

/** Vendor managers/owners on a writable store edit their own taxonomy only. */
async function requireCategoryEditor(ctx: Parameters<typeof requireVendor>[0]) {
  const { vendor } = await requireVendor(ctx, { minRole: "manager" });
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

/** Children of a node in one store. Omit `parentId` for roots. */
export const listChildrenOf = query({
  args: {
    vendorId: v.id("vendors"),
    parentId: v.optional(v.id("categories")),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(vCategoryDoc),
  handler: async (ctx, { vendorId, parentId, activeOnly }) => {
    const wantInactive = activeOnly === false;
    if (wantInactive && !(await canSeeInactiveForVendor(ctx, vendorId))) {
      return listChildren(ctx, vendorId, parentId, { activeOnly: true });
    }
    return listChildren(ctx, vendorId, parentId, { activeOnly: activeOnly ?? true });
  },
});

/** Flat list for the vendor management table (own store only). */
export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(vCategoryListRow),
  handler: async (ctx, { activeOnly }) => {
    const { vendor } = await requireVendor(ctx);
    return listCategories(ctx, vendor._id, { activeOnly: activeOnly ?? false });
  },
});

/** Nested tree for the product picker (own store) or a public storefront. */
export const tree = query({
  args: {
    vendorId: v.optional(v.id("vendors")),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(vCategoryTreeNode),
  handler: async (ctx, { vendorId, activeOnly }) => {
    let scope = vendorId;
    if (!scope) {
      const { vendor } = await requireVendor(ctx);
      scope = vendor._id;
    }
    const wantInactive = activeOnly === false;
    if (wantInactive && !(await canSeeInactiveForVendor(ctx, scope))) {
      return getTree(ctx, scope, { activeOnly: true });
    }
    return getTree(ctx, scope, { activeOnly: activeOnly ?? true });
  },
});

export const get = query({
  args: { categoryId: v.id("categories") },
  returns: v.union(vCategoryDoc, v.null()),
  handler: async (ctx, { categoryId }) => {
    const row = await ctx.db.get(categoryId);
    if (!row) return null;
    if (row.isActive) return row;
    if (row.vendorId && (await canSeeInactiveForVendor(ctx, row.vendorId))) return row;
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireCategoryEditor(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.optional(v.string()),
    parentId: v.optional(v.id("categories")),
    imageStorageId: v.optional(v.id("_storage")),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.id("categories"),
  handler: async (ctx, args) => {
    const vendor = await requireCategoryEditor(ctx);
    return createCategory(ctx, vendor._id, args);
  },
});

export const update = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    /** Pass `null` to move to root. Omit to leave unchanged. */
    parentId: v.optional(v.union(v.id("categories"), v.null())),
    /** Pass `null` to clear. Omit to leave unchanged. */
    imageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vendor = await requireCategoryEditor(ctx);
    await updateCategory(ctx, vendor._id, args);
    return null;
  },
});

export const remove = mutation({
  args: { categoryId: v.id("categories") },
  returns: v.null(),
  handler: async (ctx, { categoryId }) => {
    const vendor = await requireCategoryEditor(ctx);
    await removeCategory(ctx, vendor._id, categoryId);
    return null;
  },
});

/**
 * Vendors call this so Men / Women / Kids exists before the picker renders.
 * Safe to repeat — only inserts missing seed nodes for this store.
 */
export const ensureSeeded = mutation({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    assertVendorWritable(vendor);
    return seedCategories(ctx, vendor._id);
  },
});
