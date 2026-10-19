import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { productImageIds } from "../model/products";
import { createVendor } from "../model/vendors";
import { slugify } from "../shared/vendors";

/**
 * One-off: move the single-owner catalog onto a "House" vendor so every product has a
 * vendor, a status, a slug, image rows and a default variant.
 *
 * Run from the dashboard or CLI:
 *   npx convex run migrations/vendorsBackfill:run
 *
 * Safe to re-run; rows that already have a vendorId are skipped.
 */
const BATCH = 50;
/** Legacy rows never tracked stock. A generous default keeps them purchasable. */
const LEGACY_STOCK = 100;

export const run = internalMutation({
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const house = await ensureHouseVendor(ctx);
    const page = await ctx.db
      .query("products")
      .withIndex("by_createdAt")
      .order("asc")
      .paginate({ cursor: cursor ?? null, numItems: BATCH });
    let touched = 0;
    for (const product of page.page) {
      if (product.vendorId) continue;
      await backfillProduct(ctx, product, house);
      touched += 1;
    }
    if (touched > 0) {
      await ctx.db.patch(house._id, {
        productCount: house.productCount + touched,
        updatedAt: Date.now(),
      });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.vendorsBackfill.run, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

async function ensureHouseVendor(ctx: MutationCtx): Promise<Doc<"vendors">> {
  const existing = await ctx.db
    .query("vendors")
    .withIndex("by_slug", (q) => q.eq("slug", "house"))
    .unique();
  if (existing) return existing;
  const admin =
    (await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "admin"))
      .first()) ??
    (await ctx.db.query("users").withIndex("by_createdAt").order("asc").first());
  if (!admin) throw new Error("No users exist yet; sign in once before running the backfill.");
  const vendorId = await createVendor(
    ctx,
    admin,
    {
      name: "House",
      description: "Curated by the WardrobeAI team.",
      supportEmail: admin.email ?? "support@wardrobeai.app",
      address: { line1: "WardrobeAI", city: "Hyderabad", state: "Telangana", pincode: "500001", country: "IN" },
    },
    { status: "active" },
  );
  const vendor = await ctx.db.get(vendorId);
  if (!vendor) throw new Error("House vendor was not created.");
  if (vendor.slug !== "house") await ctx.db.patch(vendor._id, { slug: "house" });
  return (await ctx.db.get(vendorId)) ?? vendor;
}

async function backfillProduct(ctx: MutationCtx, product: Doc<"products">, house: Doc<"vendors">) {
  const now = Date.now();
  const images = productImageIds(product);
  for (const [position, storageId] of images.entries()) {
    await ctx.db.insert("productImages", {
      productId: product._id,
      vendorId: house._id,
      storageId,
      kind: "studio",
      position,
      createdAt: now,
    });
  }
  const sku = product.sku ?? `${house.code}-LEG-${String(product._creationTime).slice(-6)}`;
  const variantId: Id<"productVariants"> = await ctx.db.insert("productVariants", {
    productId: product._id,
    vendorId: house._id,
    sku: `${sku}-01`,
    ...(product.size ? { size: product.size } : {}),
    stock: LEGACY_STOCK,
    active: true,
    position: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("inventoryMovements", {
    vendorId: house._id,
    variantId,
    delta: LEGACY_STOCK,
    reason: "adjustment",
    stockAfter: LEGACY_STOCK,
    createdAt: now,
  });
  await ctx.db.patch(product._id, {
    vendorId: house._id,
    status: product.active ? "active" : "draft",
    slug: `${slugify(product.name) || "product"}-${sku.toLowerCase()}`,
    source: "manual",
    sku,
    hasVariants: false,
    soldCount: 0,
    viewCount: 0,
    ...(product.active ? { publishedAt: product.createdAt } : {}),
    updatedAt: now,
  });
}
