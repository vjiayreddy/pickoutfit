import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertVendorWritable, getVendorContext, requireVendor } from "./lib/auth";
import {
  createVariantOption,
  createVariantType,
  listOptionsForType,
  listVariantTypes,
  loadVariantCatalog,
  seedVariantTypes,
  updateVariantOption,
  updateVariantType,
} from "./model/variants";
import { vVariantOptionDoc, vVariantTypeDoc, vVariantTypeView } from "./shared/variants";

/** Store managers/owners edit only their own Size/Colour (and custom) types. */
async function requireVariantManager(ctx: Parameters<typeof requireVendor>[0]) {
  const { vendor } = await requireVendor(ctx, { minRole: "manager" });
  assertVendorWritable(vendor);
  return vendor;
}

async function canManageOwnVariants(ctx: Parameters<typeof requireVendor>[0]): Promise<boolean> {
  try {
    await requireVendor(ctx, { minRole: "manager" });
    return true;
  } catch {
    return false;
  }
}

function toCatalogView(
  rows: Awaited<ReturnType<typeof loadVariantCatalog>>,
): Array<{
  id: (typeof rows)[number]["_id"];
  label: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  options: Array<{
    id: (typeof rows)[number]["options"][number]["_id"];
    variantTypeId: (typeof rows)[number]["options"][number]["variantTypeId"];
    label: string;
    value: string;
    sortOrder: number;
    isActive: boolean;
  }>;
}> {
  return rows.map((row) => ({
    id: row._id,
    label: row.label,
    slug: row.slug,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    options: row.options.map((option) => ({
      id: option._id,
      variantTypeId: option.variantTypeId,
      label: option.label,
      value: option.value,
      sortOrder: option.sortOrder,
      isActive: option.isActive,
    })),
  }));
}

/** Types + options for the signed-in store's product editor. */
export const catalog = query({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(vVariantTypeView),
  handler: async (ctx, { activeOnly }) => {
    const context = await getVendorContext(ctx);
    if (!context) return [];
    const wantInactive = activeOnly === false;
    if (wantInactive && !(await canManageOwnVariants(ctx))) {
      return toCatalogView(await loadVariantCatalog(ctx, context.vendor._id, { activeOnly: true }));
    }
    return toCatalogView(
      await loadVariantCatalog(ctx, context.vendor._id, { activeOnly: activeOnly ?? true }),
    );
  },
});

export const listTypes = query({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(vVariantTypeDoc),
  handler: async (ctx, { activeOnly }) => {
    const context = await getVendorContext(ctx);
    if (!context) return [];
    if (activeOnly === false) {
      if (!(await canManageOwnVariants(ctx))) {
        return listVariantTypes(ctx, context.vendor._id, { activeOnly: true });
      }
      return listVariantTypes(ctx, context.vendor._id, { activeOnly: false });
    }
    return listVariantTypes(ctx, context.vendor._id, { activeOnly: true });
  },
});

export const listOptions = query({
  args: {
    variantTypeId: v.id("variantTypes"),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(vVariantOptionDoc),
  handler: async (ctx, { variantTypeId, activeOnly }) => {
    const type = await ctx.db.get(variantTypeId);
    if (!type?.vendorId) return [];
    const context = await getVendorContext(ctx);
    if (!context || context.vendor._id !== type.vendorId) {
      return listOptionsForType(ctx, variantTypeId, { activeOnly: true });
    }
    if (activeOnly === false) {
      if (!(await canManageOwnVariants(ctx))) {
        return listOptionsForType(ctx, variantTypeId, { activeOnly: true });
      }
      return listOptionsForType(ctx, variantTypeId, { activeOnly: false });
    }
    return listOptionsForType(ctx, variantTypeId, { activeOnly: true });
  },
});

export const createType = mutation({
  args: {
    label: v.string(),
    slug: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.id("variantTypes"),
  handler: async (ctx, args) => {
    const vendor = await requireVariantManager(ctx);
    return createVariantType(ctx, vendor._id, args);
  },
});

export const updateType = mutation({
  args: {
    variantTypeId: v.id("variantTypes"),
    label: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { variantTypeId, ...patch }) => {
    const vendor = await requireVariantManager(ctx);
    await updateVariantType(ctx, vendor._id, variantTypeId, patch);
    return null;
  },
});

export const createOption = mutation({
  args: {
    variantTypeId: v.id("variantTypes"),
    label: v.string(),
    value: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  returns: v.id("variantOptions"),
  handler: async (ctx, args) => {
    const vendor = await requireVariantManager(ctx);
    return createVariantOption(ctx, vendor._id, args);
  },
});

export const updateOption = mutation({
  args: {
    variantOptionId: v.id("variantOptions"),
    label: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { variantOptionId, ...patch }) => {
    const vendor = await requireVariantManager(ctx);
    await updateVariantOption(ctx, vendor._id, variantOptionId, patch);
    return null;
  },
});

/** Idempotent Size + Colour seed for the signed-in store. */
export const seedDefaults = mutation({
  args: {},
  returns: v.object({ types: v.number(), options: v.number() }),
  handler: async (ctx) => {
    const vendor = await requireVariantManager(ctx);
    return seedVariantTypes(ctx, vendor._id);
  },
});
