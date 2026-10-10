import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertVendorWritable, getVendorContext, requireUser, requireVendor } from "./lib/auth";
import {
  listVariantCategories,
  removeVariantCategory,
  upsertVariantCategory,
} from "./model/variantCategories";
import { listVariantFilterFacets, loadVariantCatalog } from "./model/variants";
import { vAttributeFacetType, vVariantCategoryView } from "./shared/attributes";
import { vVariantCatalogRow } from "./shared/variants";

/** Store managers/owners edit Variants for their own catalog. */
async function requireVariantEditor(ctx: Parameters<typeof requireVendor>[0]) {
  const { vendor } = await requireVendor(ctx, { minRole: "manager" });
  assertVendorWritable(vendor);
  return vendor;
}

/** Variants list for the desk admin UI. */
export const list = query({
  args: {},
  returns: v.array(vVariantCategoryView),
  handler: async (ctx) => {
    const context = await getVendorContext(ctx);
    if (!context) return [];
    const rows = await listVariantCategories(ctx, context.vendor._id);
    const out = [];
    for (const row of rows) {
      const type = await ctx.db.get(row.attributeTypeId);
      out.push({
        ...row,
        attributeTypeLabel: type?.displayLabel || type?.label || "Attribute",
        optionCount: row.attributeIds.length,
      });
    }
    return out;
  },
});

/** Variants + attribute options for the product editor. */
export const catalog = query({
  args: {},
  returns: v.array(vVariantCatalogRow),
  handler: async (ctx) => {
    const context = await getVendorContext(ctx);
    if (!context) return [];
    return loadVariantCatalog(ctx, context.vendor._id);
  },
});

/**
 * Public PLP facets from variant categories (SKU axes).
 * Options merged by attribute type; scoped by optional taxonomy category.
 */
export const facets = query({
  args: {
    vendorId: v.id("vendors"),
    categoryId: v.optional(v.id("categories")),
  },
  returns: v.array(vAttributeFacetType),
  handler: async (ctx, { vendorId, categoryId }) => {
    await requireUser(ctx);
    const vendor = await ctx.db.get(vendorId);
    if (!vendor || vendor.status === "closed") return [];
    if (categoryId) {
      const category = await ctx.db.get(categoryId);
      if (!category || category.vendorId !== vendorId) return [];
    }
    return listVariantFilterFacets(ctx, vendorId, { categoryId });
  },
});

export const upsert = mutation({
  args: {
    variantCategoryId: v.optional(v.id("variantCategories")),
    title: v.string(),
    attributeTypeId: v.id("attributeTypes"),
    categoryIds: v.array(v.id("categories")),
    attributeIds: v.array(v.id("attributes")),
  },
  returns: v.id("variantCategories"),
  handler: async (ctx, args) => {
    const vendor = await requireVariantEditor(ctx);
    return upsertVariantCategory(ctx, vendor._id, args);
  },
});

export const remove = mutation({
  args: { variantCategoryId: v.id("variantCategories") },
  returns: v.null(),
  handler: async (ctx, { variantCategoryId }) => {
    const vendor = await requireVariantEditor(ctx);
    await removeVariantCategory(ctx, vendor._id, variantCategoryId);
    return null;
  },
});
