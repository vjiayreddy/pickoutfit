import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { assertVendorWritable, requireVendor } from "./lib/auth";
import { appError } from "./lib/errors";
import { vCollectionView } from "./shared/products";
import { MAX_COLLECTION_PRODUCTS, slugify } from "./shared/vendors";

const MAX_COLLECTIONS = 50;

const vCollectionFields = {
  name: v.string(),
  description: v.optional(v.string()),
  coverStorageId: v.optional(v.id("_storage")),
  productIds: v.array(v.id("products")),
  active: v.boolean(),
};

async function toView(ctx: QueryCtx, collection: Doc<"collections">) {
  return {
    id: collection._id,
    name: collection.name,
    slug: collection.slug,
    description: collection.description ?? null,
    coverStorageId: collection.coverStorageId ?? null,
    coverUrl: collection.coverStorageId ? await ctx.storage.getUrl(collection.coverStorageId) : null,
    productIds: collection.productIds,
    active: collection.active,
    createdAt: collection.createdAt,
  };
}

async function uniqueSlug(ctx: MutationCtx, vendorId: Id<"vendors">, name: string, selfId?: Id<"collections">) {
  const base = slugify(name) || "collection";
  for (let attempt = 0; attempt < 20; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await ctx.db
      .query("collections")
      .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", slug))
      .unique();
    if (!clash || clash._id === selfId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function cleanCollection(
  ctx: MutationCtx,
  vendor: Doc<"vendors">,
  input: { name: string; description?: string; coverStorageId?: Id<"_storage">; productIds: Id<"products">[]; active: boolean },
) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw appError("INVALID_INPUT", "Give the collection a name.");
  if (input.productIds.length > MAX_COLLECTION_PRODUCTS) {
    throw appError("INVALID_INPUT", `A collection holds at most ${MAX_COLLECTION_PRODUCTS} products.`);
  }
  const productIds = Array.from(new Set(input.productIds));
  for (const productId of productIds) {
    const product = await ctx.db.get(productId);
    if (!product || product.vendorId !== vendor._id) throw appError("FORBIDDEN", "That product isn't yours.");
  }
  return {
    name,
    description: input.description?.trim().slice(0, 600) || undefined,
    coverStorageId: input.coverStorageId,
    productIds,
    active: input.active,
  };
}

async function requireOwn(ctx: MutationCtx, vendor: Doc<"vendors">, collectionId: Id<"collections">) {
  const collection = await ctx.db.get(collectionId);
  if (!collection || collection.vendorId !== vendor._id) {
    throw appError("NOT_FOUND", "That collection doesn't exist.");
  }
  return collection;
}

export const list = query({
  args: {},
  returns: v.array(vCollectionView),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const rows = await ctx.db
      .query("collections")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
      .order("desc")
      .take(MAX_COLLECTIONS);
    return Promise.all(rows.map((row) => toView(ctx, row)));
  },
});

export const create = mutation({
  args: vCollectionFields,
  returns: v.id("collections"),
  handler: async (ctx, input) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const existing = await ctx.db
      .query("collections")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
      .take(MAX_COLLECTIONS);
    if (existing.length >= MAX_COLLECTIONS) {
      throw appError("INVALID_INPUT", `You can keep at most ${MAX_COLLECTIONS} collections.`);
    }
    const clean = await cleanCollection(ctx, vendor, input);
    const now = Date.now();
    return ctx.db.insert("collections", {
      vendorId: vendor._id,
      ...clean,
      slug: await uniqueSlug(ctx, vendor._id, clean.name),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { collectionId: v.id("collections"), ...vCollectionFields },
  returns: v.null(),
  handler: async (ctx, { collectionId, ...input }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const collection = await requireOwn(ctx, vendor, collectionId);
    const clean = await cleanCollection(ctx, vendor, input);
    if (collection.coverStorageId && collection.coverStorageId !== clean.coverStorageId) {
      await ctx.storage.delete(collection.coverStorageId);
    }
    await ctx.db.patch(collection._id, {
      ...clean,
      slug:
        clean.name === collection.name
          ? collection.slug
          : await uniqueSlug(ctx, vendor._id, clean.name, collection._id),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const remove = mutation({
  args: { collectionId: v.id("collections") },
  returns: v.null(),
  handler: async (ctx, { collectionId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    const collection = await requireOwn(ctx, vendor, collectionId);
    if (collection.coverStorageId) await ctx.storage.delete(collection.coverStorageId);
    await ctx.db.delete(collection._id);
    return null;
  },
});
