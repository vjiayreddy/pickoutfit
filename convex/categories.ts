import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertVendorWritable,
  getAppUser,
  getVendorContext,
  requireAdmin,
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

/** Admin or any active vendor member may see inactive taxonomy nodes. */
async function canSeeInactiveCategories(ctx: Parameters<typeof getAppUser>[0]): Promise<boolean> {
  const user = await getAppUser(ctx);
  if (user?.role === "admin") return true;
  return (await getVendorContext(ctx)) !== null;
}

/** Children of a node. Omit `parentId` for roots. Public callers only see active nodes. */
export const listChildrenOf = query({
  args: {
    parentId: v.optional(v.id("categories")),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(vCategoryDoc),
  handler: async (ctx, { parentId, activeOnly }) => {
    const wantInactive = activeOnly === false;
    if (wantInactive && !(await canSeeInactiveCategories(ctx))) {
      return listChildren(ctx, parentId, { activeOnly: true });
    }
    return listChildren(ctx, parentId, { activeOnly: activeOnly ?? true });
  },
});

/** Flat list for the vendor/admin management table. */
export const list = query({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(vCategoryListRow),
  handler: async (ctx, { activeOnly }) => {
    const user = await getAppUser(ctx);
    if (user?.role !== "admin") await requireVendor(ctx);
    return listCategories(ctx, { activeOnly: activeOnly ?? false });
  },
});

/** Full nested tree for nav / pickers. Public callers only see active nodes. */
export const tree = query({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(vCategoryTreeNode),
  handler: async (ctx, { activeOnly }) => {
    const wantInactive = activeOnly === false;
    if (wantInactive && !(await canSeeInactiveCategories(ctx))) {
      return getTree(ctx, { activeOnly: true });
    }
    return getTree(ctx, { activeOnly: activeOnly ?? true });
  },
});

export const get = query({
  args: { categoryId: v.id("categories") },
  returns: v.union(vCategoryDoc, v.null()),
  handler: async (ctx, { categoryId }) => {
    const row = await ctx.db.get(categoryId);
    if (!row) return null;
    if (row.isActive) return row;
    if (!(await canSeeInactiveCategories(ctx))) return null;
    return row;
  },
});

/** Admin, or vendor manager/owner on a writable store. */
async function requireCategoryEditor(ctx: Parameters<typeof requireAdmin>[0]) {
  const user = await getAppUser(ctx);
  if (user?.role === "admin") return;
  const { vendor } = await requireVendor(ctx, { minRole: "manager" });
  assertVendorWritable(vendor);
}

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
    await requireCategoryEditor(ctx);
    return createCategory(ctx, args);
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
    await requireCategoryEditor(ctx);
    await updateCategory(ctx, args);
    return null;
  },
});

export const remove = mutation({
  args: { categoryId: v.id("categories") },
  returns: v.null(),
  handler: async (ctx, { categoryId }) => {
    await requireCategoryEditor(ctx);
    await removeCategory(ctx, categoryId);
    return null;
  },
});

/** Idempotent seed of Clothes → Men → Accessories/Shirt. Admin-only. */
export const seed = mutation({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return seedCategories(ctx);
  },
});

/**
 * Vendors call this so the catalog tree exists before the picker renders.
 * Safe to repeat — only inserts missing seed nodes.
 */
export const ensureSeeded = mutation({
  args: {},
  returns: v.object({ created: v.number() }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    assertVendorWritable(vendor);
    return seedCategories(ctx);
  },
});
