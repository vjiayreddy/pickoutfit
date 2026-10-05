import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { brandSlug, MAX_BRANDS_PER_VENDOR } from "../shared/brands";

type Ctx = QueryCtx | MutationCtx;

export type BrandListRow = Doc<"brands"> & {
  logoUrl: string | null;
  productCount: number;
};

async function listVendorBrands(ctx: Ctx, vendorId: Id<"vendors">): Promise<Doc<"brands">[]> {
  return ctx.db
    .query("brands")
    .withIndex("by_vendorId", (q) => q.eq("vendorId", vendorId))
    .take(MAX_BRANDS_PER_VENDOR);
}

export async function assertOwnedBrand(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  brandId: Id<"brands">,
): Promise<Doc<"brands">> {
  const row = await ctx.db.get(brandId);
  if (!row || row.vendorId !== vendorId) {
    throw appError("NOT_FOUND", "Brand not found.");
  }
  return row;
}

/** Flat list for the vendor picker / management table. */
export async function listBrands(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  opts: { activeOnly?: boolean } = {},
): Promise<BrandListRow[]> {
  const rows = await listVendorBrands(ctx, vendorId);
  const filtered = opts.activeOnly ? rows.filter((row) => row.isActive) : rows;
  const sorted = filtered
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug));

  return Promise.all(
    sorted.map(async (row) => {
      const products = await ctx.db
        .query("products")
        .withIndex("by_vendorId_and_brandId", (q) =>
          q.eq("vendorId", vendorId).eq("brandId", row._id),
        )
        .take(200);
      return {
        ...row,
        logoUrl: row.logoStorageId ? await ctx.storage.getUrl(row.logoStorageId) : null,
        productCount: products.length,
      };
    }),
  );
}

/**
 * Find-or-create by slug so "Nike" / "nike" / "NIKE" share one row.
 * Returns the existing id when the slug already exists (reactivates if inactive).
 */
export async function upsertBrand(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  args: { name: string; logoStorageId?: Id<"_storage"> },
): Promise<Id<"brands">> {
  const name = args.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw appError("INVALID_INPUT", "Brand name must be 1–80 characters.");
  }
  const slug = brandSlug(name);
  if (!slug) throw appError("INVALID_INPUT", "Brand name must include letters or numbers.");

  const existing = await ctx.db
    .query("brands")
    .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", slug))
    .unique();

  const now = Date.now();
  if (existing) {
    // Keep first-seen display casing ("Nike"); only reactivate / attach logo.
    if (!existing.isActive || args.logoStorageId) {
      await ctx.db.patch(existing._id, {
        isActive: true,
        ...(args.logoStorageId ? { logoStorageId: args.logoStorageId } : {}),
        updatedAt: now,
      });
    }
    return existing._id;
  }

  const all = await listVendorBrands(ctx, vendorId);
  if (all.length >= MAX_BRANDS_PER_VENDOR) {
    throw appError(
      "RATE_LIMITED",
      `At most ${MAX_BRANDS_PER_VENDOR} brands are allowed per store.`,
    );
  }

  return ctx.db.insert("brands", {
    vendorId,
    name,
    slug,
    ...(args.logoStorageId ? { logoStorageId: args.logoStorageId } : {}),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function createBrand(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  args: {
    name: string;
    slug?: string;
    logoStorageId?: Id<"_storage">;
    isActive?: boolean;
  },
): Promise<Id<"brands">> {
  const name = args.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw appError("INVALID_INPUT", "Brand name must be 1–80 characters.");
  }
  const slug = brandSlug(args.slug?.trim() || name);
  if (!slug) throw appError("INVALID_INPUT", "Brand slug is required.");

  const taken = await ctx.db
    .query("brands")
    .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", slug))
    .unique();
  if (taken) throw appError("CONFLICT", "A brand with that name already exists.");

  const all = await listVendorBrands(ctx, vendorId);
  if (all.length >= MAX_BRANDS_PER_VENDOR) {
    throw appError(
      "RATE_LIMITED",
      `At most ${MAX_BRANDS_PER_VENDOR} brands are allowed per store.`,
    );
  }

  const now = Date.now();
  return ctx.db.insert("brands", {
    vendorId,
    name,
    slug,
    ...(args.logoStorageId ? { logoStorageId: args.logoStorageId } : {}),
    isActive: args.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateBrand(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  args: {
    brandId: Id<"brands">;
    name?: string;
    slug?: string;
    logoStorageId?: Id<"_storage"> | null;
    isActive?: boolean;
  },
): Promise<void> {
  const row = await assertOwnedBrand(ctx, vendorId, args.brandId);

  const name = args.name !== undefined ? args.name.trim() : row.name;
  if (name.length < 1 || name.length > 80) {
    throw appError("INVALID_INPUT", "Brand name must be 1–80 characters.");
  }
  const slug = brandSlug(args.slug?.trim() || (args.name !== undefined ? name : row.slug));
  if (!slug) throw appError("INVALID_INPUT", "Brand slug is required.");

  if (slug !== row.slug) {
    const taken = await ctx.db
      .query("brands")
      .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", slug))
      .unique();
    if (taken && taken._id !== row._id) {
      throw appError("CONFLICT", "A brand with that name already exists.");
    }
  }

  const now = Date.now();
  const logoStorageId =
    args.logoStorageId === undefined
      ? row.logoStorageId
      : args.logoStorageId === null
        ? undefined
        : args.logoStorageId;

  if (
    args.logoStorageId === null &&
    row.logoStorageId &&
    row.logoStorageId !== logoStorageId
  ) {
    await ctx.storage.delete(row.logoStorageId);
  }

  await ctx.db.patch(row._id, {
    name,
    slug,
    logoStorageId,
    ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
    updatedAt: now,
  });

  // Keep denormalized product.brand in sync when the display name changes.
  if (name !== row.name) {
    const products = await ctx.db
      .query("products")
      .withIndex("by_vendorId_and_brandId", (q) =>
        q.eq("vendorId", vendorId).eq("brandId", row._id),
      )
      .take(MAX_BRANDS_PER_VENDOR);
    for (const product of products) {
      await ctx.db.patch(product._id, { brand: name, updatedAt: now });
    }
  }
}

export async function removeBrand(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  brandId: Id<"brands">,
): Promise<void> {
  const row = await assertOwnedBrand(ctx, vendorId, brandId);

  const products = await ctx.db
    .query("products")
    .withIndex("by_vendorId_and_brandId", (q) =>
      q.eq("vendorId", vendorId).eq("brandId", brandId),
    )
    .take(1);
  if (products.length > 0) {
    throw appError("CONFLICT", "Reassign products on this brand before removing it.");
  }

  if (row.logoStorageId) await ctx.storage.delete(row.logoStorageId);
  await ctx.db.delete(brandId);
}

/**
 * Resolve product brand fields: prefer `brandId`, else upsert from free-text `brand`.
 * Returns cleared fields when both are empty.
 */
export async function resolveProductBrand(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  opts: { brandId?: Id<"brands">; brand?: string },
): Promise<{ brandId?: Id<"brands">; brand?: string }> {
  if (opts.brandId) {
    const row = await assertOwnedBrand(ctx, vendorId, opts.brandId);
    if (!row.isActive) throw appError("INVALID_INPUT", "That brand is not active.");
    return { brandId: row._id, brand: row.name };
  }
  const name = opts.brand?.trim() ?? "";
  if (!name) return {};
  const brandId = await upsertBrand(ctx, vendorId, { name });
  const row = await ctx.db.get(brandId);
  return { brandId, brand: row?.name ?? name };
}
