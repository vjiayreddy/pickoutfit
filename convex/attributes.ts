import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertVendorWritable, getVendorContext, requireVendor } from "./lib/auth";
import {
  createAttribute,
  createAttributeType,
  listAttributes,
  listAttributeTypes,
  seedAttributeCatalog,
  updateAttribute,
  updateAttributeType,
} from "./model/attributes";
import { vAttributeListRow, vAttributeTypeDoc } from "./shared/attributes";

async function requireAttributeEditor(ctx: Parameters<typeof requireVendor>[0]) {
  const { vendor } = await requireVendor(ctx, { minRole: "manager" });
  assertVendorWritable(vendor);
  return vendor;
}

async function canManageAttributes(ctx: Parameters<typeof requireVendor>[0]): Promise<boolean> {
  try {
    await requireVendor(ctx, { minRole: "manager" });
    return true;
  } catch {
    return false;
  }
}

export const listTypes = query({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(vAttributeTypeDoc),
  handler: async (ctx, { activeOnly }) => {
    const context = await getVendorContext(ctx);
    if (!context) return [];
    if (activeOnly === false && !(await canManageAttributes(ctx))) {
      return listAttributeTypes(ctx, context.vendor._id, { activeOnly: true });
    }
    return listAttributeTypes(ctx, context.vendor._id, {
      activeOnly: activeOnly ?? true,
    });
  },
});

export const list = query({
  args: {
    attributeTypeId: v.optional(v.id("attributeTypes")),
    categoryId: v.optional(v.id("categories")),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(vAttributeListRow),
  handler: async (ctx, args) => {
    const context = await getVendorContext(ctx);
    if (!context) return [];
    let activeOnly = args.activeOnly ?? true;
    if (args.activeOnly === false && !(await canManageAttributes(ctx))) {
      activeOnly = true;
    }
    const rows = await listAttributes(ctx, context.vendor._id, {
      attributeTypeId: args.attributeTypeId,
      categoryId: args.categoryId,
      activeOnly,
    });
    const typeCache = new Map<string, string>();
    const out = [];
    for (const row of rows) {
      let typeLabel = typeCache.get(row.attributeTypeId);
      if (!typeLabel) {
        const type = await ctx.db.get(row.attributeTypeId);
        typeLabel = type?.displayLabel || type?.label || "Attribute";
        typeCache.set(row.attributeTypeId, typeLabel);
      }
      out.push({
        ...row,
        attributeTypeLabel: typeLabel,
        mediaUrl: row.mediaStorageId
          ? ((await ctx.storage.getUrl(row.mediaStorageId)) ?? null)
          : null,
      });
    }
    return out;
  },
});

export const createType = mutation({
  args: {
    label: v.string(),
    displayLabel: v.optional(v.string()),
    slug: v.optional(v.string()),
    isEnableFilter: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.id("attributeTypes"),
  handler: async (ctx, args) => {
    const vendor = await requireAttributeEditor(ctx);
    return createAttributeType(ctx, vendor._id, args);
  },
});

export const updateType = mutation({
  args: {
    attributeTypeId: v.id("attributeTypes"),
    label: v.optional(v.string()),
    displayLabel: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isEnableFilter: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { attributeTypeId, ...patch }) => {
    const vendor = await requireAttributeEditor(ctx);
    await updateAttributeType(ctx, vendor._id, attributeTypeId, patch);
    return null;
  },
});

export const create = mutation({
  args: {
    attributeTypeId: v.id("attributeTypes"),
    label: v.string(),
    value: v.string(),
    hex: v.optional(v.string()),
    categoryIds: v.optional(v.array(v.id("categories"))),
    mediaStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("attributes"),
  handler: async (ctx, args) => {
    const vendor = await requireAttributeEditor(ctx);
    return createAttribute(ctx, vendor._id, args);
  },
});

export const update = mutation({
  args: {
    attributeId: v.id("attributes"),
    label: v.optional(v.string()),
    value: v.optional(v.string()),
    hex: v.optional(v.union(v.string(), v.null())),
    categoryIds: v.optional(v.array(v.id("categories"))),
    mediaStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { attributeId, ...patch }) => {
    const vendor = await requireAttributeEditor(ctx);
    await updateAttribute(ctx, vendor._id, attributeId, patch);
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAttributeEditor(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const seedDefaults = mutation({
  args: {},
  returns: v.object({ types: v.number(), attributes: v.number() }),
  handler: async (ctx) => {
    const vendor = await requireAttributeEditor(ctx);
    return seedAttributeCatalog(ctx, vendor._id);
  },
});
