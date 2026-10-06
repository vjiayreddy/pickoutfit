import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertVendorWritable, getVendorContext, requireVendor } from "./lib/auth";
import {
  findVariantTypeForCategory,
  listVariantCategories,
  removeVariantCategory,
  upsertVariantCategory,
} from "./model/variantCategories";
import { listOptionsForType } from "./model/variants";
import { vVariantCategoryView } from "./shared/attributes";

async function requireVariantCategoryEditor(ctx: Parameters<typeof requireVendor>[0]) {
  const { vendor } = await requireVendor(ctx, { minRole: "manager" });
  assertVendorWritable(vendor);
  return vendor;
}

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
      const variantType = await findVariantTypeForCategory(ctx, row._id);
      const options = variantType
        ? await listOptionsForType(ctx, variantType._id, { activeOnly: false })
        : [];
      out.push({
        ...row,
        attributeTypeLabel: type?.displayLabel || type?.label || "Attribute",
        variantTypeId: variantType?._id ?? null,
        optionCount: options.length,
      });
    }
    return out;
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
    const vendor = await requireVariantCategoryEditor(ctx);
    return upsertVariantCategory(ctx, vendor._id, args);
  },
});

export const remove = mutation({
  args: { variantCategoryId: v.id("variantCategories") },
  returns: v.null(),
  handler: async (ctx, { variantCategoryId }) => {
    const vendor = await requireVariantCategoryEditor(ctx);
    await removeVariantCategory(ctx, vendor._id, variantCategoryId);
    return null;
  },
});
