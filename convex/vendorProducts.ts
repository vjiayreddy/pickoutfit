import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertVendorWritable, requireVendor } from "./lib/auth";
import {
  adjustStock,
  archiveProduct,
  createProduct,
  discardUnusedProductImage,
  publishProduct,
  requireVendorProduct,
  toProductView,
  toProductViews,
  unpublishProduct,
  updateProduct,
} from "./model/products";
import {
  vAgeGroup,
  vInventoryReason,
  vOccasion,
  vProductAttribute,
  vProductCategory,
  vProductInfoSection,
  vProductStatus,
  vProductView,
  vVariantInput,
} from "./shared/products";
import { vColours, vFit, vFormality, vPresentation, vSeason } from "./shared/validators";

const vProductFields = {
  category: vProductCategory,
  categoryId: v.optional(v.id("categories")),
  presentation: vPresentation,
  name: v.string(),
  brand: v.optional(v.string()),
  description: v.string(),
  attributes: v.optional(v.array(vProductAttribute)),
  infoSections: v.optional(v.array(vProductInfoSection)),
  /** @deprecated Prefer attributes; still merged on write. */
  subcategory: v.optional(v.string()),
  productType: v.optional(v.string()),
  colours: v.optional(vColours),
  pattern: v.optional(v.string()),
  material: v.optional(v.string()),
  season: v.optional(v.array(vSeason)),
  formality: v.optional(vFormality),
  fit: v.optional(vFit),
  size: v.optional(v.string()),
  ageGroup: v.optional(vAgeGroup),
  occasion: v.optional(vOccasion),
  priceInr: v.number(),
  compareAtPriceInr: v.optional(v.number()),
  /** Payload-style dimensions enabled on this product (Size, Colour, …). */
  variantTypeIds: v.optional(v.array(v.id("variantTypes"))),
  imageIds: v.array(v.id("_storage")),
  variants: v.array(vVariantInput),
  aiRecommend: v.optional(v.boolean()),
};

export const list = query({
  args: { status: v.optional(vProductStatus), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vProductView),
  handler: async (ctx, { status, paginationOpts }) => {
    const { vendor } = await requireVendor(ctx);
    const result = status
      ? await ctx.db
          .query("products")
          .withIndex("by_vendorId_and_status", (q) => q.eq("vendorId", vendor._id).eq("status", status))
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("products")
          .withIndex("by_vendorId_and_status", (q) => q.eq("vendorId", vendor._id))
          .order("desc")
          .paginate(paginationOpts);
    return { ...result, page: await toProductViews(ctx, result.page) };
  },
});

export const counts = query({
  args: {},
  returns: v.object({ draft: v.number(), active: v.number(), archived: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const cap = 500;
    const out = { draft: 0, active: 0, archived: 0, capped: false };
    for (const status of ["draft", "active", "archived"] as const) {
      const rows = await ctx.db
        .query("products")
        .withIndex("by_vendorId_and_status", (q) => q.eq("vendorId", vendor._id).eq("status", status))
        .take(cap);
      out[status] = rows.length;
      if (rows.length === cap) out.capped = true;
    }
    return out;
  },
});

export const get = query({
  args: { productId: v.id("products") },
  returns: vProductView,
  handler: async (ctx, { productId }) => {
    const { vendor } = await requireVendor(ctx);
    const product = await requireVendorProduct(ctx, vendor, productId);
    return toProductView(ctx, product, new Map([[vendor._id, vendor]]));
  },
});

export const create = mutation({
  args: vProductFields,
  returns: v.id("products"),
  handler: async (ctx, input) => {
    const { vendor } = await requireVendor(ctx, { minRole: "staff" });
    assertVendorWritable(vendor);
    return createProduct(ctx, vendor, input);
  },
});

export const update = mutation({
  args: { productId: v.id("products"), ...vProductFields },
  returns: v.null(),
  handler: async (ctx, { productId, ...input }) => {
    const { vendor } = await requireVendor(ctx);
    assertVendorWritable(vendor);
    await updateProduct(ctx, vendor, productId, input);
    return null;
  },
});

export const publish = mutation({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, { productId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    await publishProduct(ctx, vendor, productId);
    return null;
  },
});

export const unpublish = mutation({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, { productId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    await unpublishProduct(ctx, vendor, productId);
    return null;
  },
});

export const archive = mutation({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, { productId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    await archiveProduct(ctx, vendor, productId);
    return null;
  },
});

export const adjustVariantStock = mutation({
  args: { variantId: v.id("productVariants"), delta: v.number(), reason: v.optional(vInventoryReason) },
  returns: v.number(),
  handler: async (ctx, { variantId, delta, reason }) => {
    const { user, vendor } = await requireVendor(ctx);
    assertVendorWritable(vendor);
    return adjustStock(ctx, vendor, variantId, delta, reason ?? "manual", { actorUserId: user._id });
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

/** Drops a photo the vendor uploaded but never saved onto a product. */
export const discardImage = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    await requireVendor(ctx);
    await discardUnusedProductImage(ctx, storageId);
    return null;
  },
});

export const vStockMovement = v.object({
  _id: v.id("inventoryMovements"),
  variantId: v.id("productVariants"),
  delta: v.number(),
  reason: vInventoryReason,
  stockAfter: v.number(),
  createdAt: v.number(),
});

export const stockHistory = query({
  args: { variantId: v.id("productVariants") },
  returns: v.array(vStockMovement),
  handler: async (ctx, { variantId }) => {
    const { vendor } = await requireVendor(ctx);
    const variant = await ctx.db.get(variantId);
    if (!variant || variant.vendorId !== vendor._id) return [];
    const rows = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_variantId_and_createdAt", (q) => q.eq("variantId", variantId))
      .order("desc")
      .take(50);
    return rows.map((row) => ({
      _id: row._id,
      variantId: row.variantId,
      delta: row.delta,
      reason: row.reason,
      stockAfter: row.stockAfter,
      createdAt: row.createdAt,
    }));
  },
});
