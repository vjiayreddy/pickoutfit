import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertVendorWritable, getAppUser, requireVendor } from "./lib/auth";
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

/** Platform catalog editors: admins, or vendor managers/owners on a writable store. */
async function requireVariantManager(ctx: Parameters<typeof getAppUser>[0]): Promise<void> {
  const user = await getAppUser(ctx);
  if (user?.role === "admin") return;
  const { vendor } = await requireVendor(ctx, { minRole: "manager" });
  assertVendorWritable(vendor);
}

async function canManageVariants(ctx: Parameters<typeof getAppUser>[0]): Promise<boolean> {
  const user = await getAppUser(ctx);
  if (user?.role === "admin") return true;
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

/** Full catalog of types + options for vendor product editors and shop selectors. */
export const catalog = query({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(vVariantTypeView),
  handler: async (ctx, { activeOnly }) => {
    const wantInactive = activeOnly === false;
    if (wantInactive && !(await canManageVariants(ctx))) {
      return toCatalogView(await loadVariantCatalog(ctx, { activeOnly: true }));
    }
    return toCatalogView(await loadVariantCatalog(ctx, { activeOnly: activeOnly ?? true }));
  },
});

export const listTypes = query({
  args: { activeOnly: v.optional(v.boolean()) },
  returns: v.array(vVariantTypeDoc),
  handler: async (ctx, { activeOnly }) => {
    if (activeOnly === false) {
      if (!(await canManageVariants(ctx))) {
        return listVariantTypes(ctx, { activeOnly: true });
      }
      return listVariantTypes(ctx, { activeOnly: false });
    }
    return listVariantTypes(ctx, { activeOnly: true });
  },
});

export const listOptions = query({
  args: {
    variantTypeId: v.id("variantTypes"),
    activeOnly: v.optional(v.boolean()),
  },
  returns: v.array(vVariantOptionDoc),
  handler: async (ctx, { variantTypeId, activeOnly }) => {
    if (activeOnly === false) {
      if (!(await canManageVariants(ctx))) {
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
    await requireVariantManager(ctx);
    return createVariantType(ctx, args);
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
    await requireVariantManager(ctx);
    await updateVariantType(ctx, variantTypeId, patch);
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
    await requireVariantManager(ctx);
    return createVariantOption(ctx, args);
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
    await requireVariantManager(ctx);
    await updateVariantOption(ctx, variantOptionId, patch);
    return null;
  },
});

/** Idempotent Size + Colour seed. Admin, or any vendor (so desks can bootstrap once). */
export const seedDefaults = mutation({
  args: {},
  returns: v.object({ types: v.number(), options: v.number() }),
  handler: async (ctx) => {
    await requireVariantManager(ctx);
    return seedVariantTypes(ctx);
  },
});
