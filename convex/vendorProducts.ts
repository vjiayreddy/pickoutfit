import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertVendorWritable, requireVendor } from "./lib/auth";
import {
  adjustStock,
  archiveProduct,
  coverUrl,
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
  groupAttributeIdsByType,
  productMatchesFilters,
} from "./shared/productFilters";
import {
  vAgeGroup,
  vInventoryReason,
  vOccasion,
  vOtherDetail,
  vProductAttribute,
  vProductAttributeSelection,
  vProductCategory,
  vProductInfoSection,
  vProductStatus,
  vProductView,
  vVariantInput,
  vVendorProductPickerItem,
} from "./shared/products";
import { vColours, vFit, vFormality, vPresentation, vSeason } from "./shared/validators";

const vProductFields = {
  category: vProductCategory,
  categoryId: v.optional(v.id("categories")),
  presentation: vPresentation,
  name: v.string(),
  brandId: v.optional(v.id("brands")),
  brand: v.optional(v.string()),
  description: v.string(),
  /** @deprecated Prefer attributeSelections. */
  attributes: v.optional(v.array(vProductAttribute)),
  attributeSelections: v.optional(v.array(vProductAttributeSelection)),
  infoSections: v.optional(v.array(vProductInfoSection)),
  otherDetails: v.optional(v.array(vOtherDetail)),
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
  /** @deprecated Prefer discounts table. */
  compareAtPriceInr: v.optional(v.number()),
  /** Variants (dimensions) enabled on this product. */
  variantCategoryIds: v.optional(v.array(v.id("variantCategories"))),
  imageIds: v.array(v.id("_storage")),
  /** Empty → one default variation for inventory. */
  variants: v.array(vVariantInput),
  aiRecommend: v.optional(v.boolean()),
};

export const list = query({
  args: {
    status: v.optional(vProductStatus),
    categoryPath: v.optional(v.string()),
    attributeIds: v.optional(v.array(v.id("attributes"))),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vProductView),
  handler: async (ctx, { status, categoryPath, attributeIds, paginationOpts }) => {
    const { vendor } = await requireVendor(ctx);
    const filterPath = categoryPath?.trim() ?? "";
    const ids = attributeIds ?? [];
    const needsFilter = Boolean(filterPath) || ids.length > 0;

    const typeById = new Map<string, string>();
    if (needsFilter) {
      for (const id of ids) {
        const row = await ctx.db.get(id);
        if (row && row.vendorId === vendor._id) {
          typeById.set(row._id, row.attributeTypeId);
        }
      }
    }
    const selectedByType = groupAttributeIdsByType(ids, typeById);

    // When filtering in JS, keep walking pages until we fill numItems (or run out),
    // so clients don't see sparse / empty pages mid-catalog.
    const target = paginationOpts.numItems;
    const maxScans = needsFilter ? 8 : 1;
    const matched = [];
    let cursor = paginationOpts.cursor;
    let isDone = false;
    let continueCursor = cursor ?? "";
    let scans = 0;

    while (matched.length < target && !isDone && scans < maxScans) {
      scans += 1;
      const batchSize = needsFilter
        ? Math.min(Math.max(target * 2, target), 100)
        : target;
      const result = status
        ? await ctx.db
            .query("products")
            .withIndex("by_vendorId_and_status", (q) =>
              q.eq("vendorId", vendor._id).eq("status", status),
            )
            .order("desc")
            .paginate({ numItems: batchSize, cursor })
        : await ctx.db
            .query("products")
            .withIndex("by_vendorId_and_status", (q) => q.eq("vendorId", vendor._id))
            .order("desc")
            .paginate({ numItems: batchSize, cursor });

      const page = await toProductViews(ctx, result.page);
      for (const product of page) {
        if (matched.length >= target) break;
        if (!needsFilter) {
          matched.push(product);
          continue;
        }
        if (
          productMatchesFilters(
            {
              categoryPath: product.categoryPath,
              variants: product.variants.map((variant) => ({
                active: variant.active,
                attributeIds: variant.attributeIds,
              })),
            },
            { categoryPath: filterPath || null, selectedByType },
          )
        ) {
          matched.push(product);
        }
      }
      isDone = result.isDone;
      continueCursor = result.continueCursor;
      cursor = result.continueCursor;
    }

    return {
      page: matched,
      isDone,
      continueCursor,
    };
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

/**
 * Compact product rows for discount/collection pickers.
 * Empty `q` → recent products; otherwise full-text search within this store.
 */
export const pickerSearch = query({
  args: {
    q: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(vVendorProductPickerItem),
  handler: async (ctx, { q: rawQuery, limit }) => {
    const { vendor } = await requireVendor(ctx);
    const cap = Math.min(Math.max(limit ?? 40, 1), 80);
    const term = rawQuery?.trim().toLowerCase() ?? "";
    const rows =
      term.length > 0
        ? await ctx.db
            .query("products")
            .withSearchIndex("search_text", (search) =>
              search.search("searchText", term).eq("vendorId", vendor._id),
            )
            .take(cap)
        : await ctx.db
            .query("products")
            .withIndex("by_vendorId_and_status", (idx) => idx.eq("vendorId", vendor._id))
            .order("desc")
            .take(cap);

    const out = [];
    for (const product of rows) {
      if (product.vendorId !== vendor._id) continue;
      if (product.status === "archived") continue;
      out.push({
        id: product._id,
        name: product.name,
        priceInr: product.priceInr,
        imageUrl: await coverUrl(ctx, product),
        status: product.status ?? (product.active ? ("active" as const) : ("draft" as const)),
      });
      if (out.length >= cap) break;
    }
    return out;
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
    const { vendor } = await requireVendor(ctx);
    assertVendorWritable(vendor);
    await discardUnusedProductImage(ctx, storageId, vendor);
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
