import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { MAX_VARIANT_CATEGORIES, attributeSlug } from "../shared/attributes";
import { MAX_OPTIONS_PER_VARIANT } from "../shared/variants";

type Ctx = QueryCtx | MutationCtx;

async function assertOwnedAttributeType(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  attributeTypeId: Id<"attributeTypes">,
): Promise<Doc<"attributeTypes">> {
  const row = await ctx.db.get(attributeTypeId);
  if (!row || row.vendorId !== vendorId) {
    throw appError("NOT_FOUND", "That attribute type doesn't exist.");
  }
  if (!row.isActive) {
    throw appError("INVALID_INPUT", "That attribute type is inactive.");
  }
  return row;
}

async function assertOwnedCategories(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  categoryIds: Id<"categories">[],
): Promise<void> {
  if (categoryIds.length < 1) {
    throw appError("INVALID_INPUT", "Pick at least one category.");
  }
  for (const categoryId of categoryIds) {
    const row = await ctx.db.get(categoryId);
    if (!row || row.vendorId !== vendorId) {
      throw appError("NOT_FOUND", "One of the selected categories doesn't exist.");
    }
  }
}

async function assertOwnedAttributesForType(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  attributeTypeId: Id<"attributeTypes">,
  attributeIds: Id<"attributes">[],
): Promise<Doc<"attributes">[]> {
  if (attributeIds.length < 1) {
    throw appError("INVALID_INPUT", "Pick at least one attribute option.");
  }
  if (attributeIds.length > MAX_OPTIONS_PER_VARIANT) {
    throw appError("RATE_LIMITED", `At most ${MAX_OPTIONS_PER_VARIANT} options per variant.`);
  }
  const out: Doc<"attributes">[] = [];
  for (const attributeId of attributeIds) {
    const row = await ctx.db.get(attributeId);
    if (!row || row.vendorId !== vendorId) {
      throw appError("NOT_FOUND", "One of the selected attributes doesn't exist.");
    }
    if (row.attributeTypeId !== attributeTypeId) {
      throw appError("INVALID_INPUT", "All options must belong to the selected attribute type.");
    }
    if (!row.isActive) {
      throw appError("INVALID_INPUT", `“${row.label}” is inactive.`);
    }
    out.push(row);
  }
  return out;
}

export async function listVariantCategories(
  ctx: Ctx,
  vendorId: Id<"vendors">,
): Promise<Doc<"variantCategories">[]> {
  const rows = await ctx.db
    .query("variantCategories")
    .withIndex("by_vendorId", (q) => q.eq("vendorId", vendorId))
    .take(MAX_VARIANT_CATEGORIES);
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

/** Upsert a Variant (dimension recipe). No sync to a separate catalog table. */
export async function upsertVariantCategory(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  input: {
    variantCategoryId?: Id<"variantCategories">;
    title: string;
    attributeTypeId: Id<"attributeTypes">;
    categoryIds: Id<"categories">[];
    attributeIds: Id<"attributes">[];
  },
): Promise<Id<"variantCategories">> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 60) {
    throw appError("INVALID_INPUT", "Title must be 1–60 characters.");
  }
  const slug = attributeSlug(title);
  if (!slug) throw appError("INVALID_INPUT", "Title needs a valid slug.");

  await assertOwnedAttributeType(ctx, vendorId, input.attributeTypeId);
  await assertOwnedCategories(ctx, vendorId, input.categoryIds);
  await assertOwnedAttributesForType(
    ctx,
    vendorId,
    input.attributeTypeId,
    input.attributeIds,
  );

  const now = Date.now();
  let variantCategoryId = input.variantCategoryId;

  if (variantCategoryId) {
    const existing = await ctx.db.get(variantCategoryId);
    if (!existing || existing.vendorId !== vendorId) {
      throw appError("NOT_FOUND", "That variant doesn't exist.");
    }
    if (existing.slug !== slug) {
      const clash = await ctx.db
        .query("variantCategories")
        .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", slug))
        .unique();
      if (clash && clash._id !== variantCategoryId) {
        throw appError("CONFLICT", "A variant with that title already exists.");
      }
    }
    await ctx.db.patch(variantCategoryId, {
      title,
      slug,
      attributeTypeId: input.attributeTypeId,
      categoryIds: input.categoryIds,
      attributeIds: input.attributeIds,
      updatedAt: now,
    });
  } else {
    const clash = await ctx.db
      .query("variantCategories")
      .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", slug))
      .unique();
    if (clash) throw appError("CONFLICT", "A variant with that title already exists.");
    const all = await listVariantCategories(ctx, vendorId);
    if (all.length >= MAX_VARIANT_CATEGORIES) {
      throw appError("RATE_LIMITED", `At most ${MAX_VARIANT_CATEGORIES} variants.`);
    }
    variantCategoryId = await ctx.db.insert("variantCategories", {
      vendorId,
      title,
      slug,
      attributeTypeId: input.attributeTypeId,
      categoryIds: input.categoryIds,
      attributeIds: input.attributeIds,
      createdAt: now,
      updatedAt: now,
    });
  }

  return variantCategoryId;
}

export async function removeVariantCategory(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  variantCategoryId: Id<"variantCategories">,
): Promise<void> {
  const row = await ctx.db.get(variantCategoryId);
  if (!row || row.vendorId !== vendorId) {
    throw appError("NOT_FOUND", "That variant doesn't exist.");
  }

  const products = await ctx.db
    .query("products")
    .withIndex("by_vendorId_and_status", (q) => q.eq("vendorId", vendorId))
    .take(2000);
  const inUse = products.some((product) =>
    (product.variantCategoryIds ?? []).includes(variantCategoryId),
  );
  if (inUse) {
    throw appError(
      "CONFLICT",
      "Remove this dimension from products before deleting the variant.",
    );
  }

  await ctx.db.delete(variantCategoryId);
}
