import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { MAX_VARIANT_CATEGORIES, attributeSlug } from "../shared/attributes";
import { MAX_OPTIONS_PER_TYPE, MAX_VARIANT_TYPES, variantOptionValue } from "../shared/variants";
import { listVariantTypes } from "./variants";

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
  if (attributeIds.length > MAX_OPTIONS_PER_TYPE) {
    throw appError("RATE_LIMITED", `At most ${MAX_OPTIONS_PER_TYPE} options per recipe.`);
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

export async function findVariantTypeForCategory(
  ctx: Ctx,
  variantCategoryId: Id<"variantCategories">,
): Promise<Doc<"variantTypes"> | null> {
  return ctx.db
    .query("variantTypes")
    .withIndex("by_variantCategoryId", (q) => q.eq("variantCategoryId", variantCategoryId))
    .unique();
}

async function syncVariantOptionsFromAttributes(
  ctx: MutationCtx,
  variantTypeId: Id<"variantTypes">,
  attributes: Doc<"attributes">[],
): Promise<{ created: number; deleted: number; kept: number }> {
  const existing = await ctx.db
    .query("variantOptions")
    .withIndex("by_variantTypeId_and_sortOrder", (q) => q.eq("variantTypeId", variantTypeId))
    .take(MAX_OPTIONS_PER_TYPE);

  const selectedIds = new Set(attributes.map((row) => row._id));
  let deleted = 0;
  let kept = 0;
  let created = 0;

  for (const option of existing) {
    if (option.attributeId && selectedIds.has(option.attributeId)) {
      const attr = attributes.find((row) => row._id === option.attributeId);
      if (attr) {
        await ctx.db.patch(option._id, {
          label: attr.label,
          value: variantOptionValue(attr.value),
          isActive: true,
          updatedAt: Date.now(),
        });
      }
      kept += 1;
      continue;
    }
    await ctx.db.delete(option._id);
    deleted += 1;
  }

  const existingAttrIds = new Set(
    existing.map((row) => row.attributeId).filter((id): id is Id<"attributes"> => !!id),
  );

  for (const [index, attr] of attributes.entries()) {
    if (existingAttrIds.has(attr._id)) continue;
    const value = variantOptionValue(attr.value);
    const clash = await ctx.db
      .query("variantOptions")
      .withIndex("by_variantTypeId_and_value", (q) =>
        q.eq("variantTypeId", variantTypeId).eq("value", value),
      )
      .unique();
    if (clash) {
      await ctx.db.patch(clash._id, {
        attributeId: attr._id,
        label: attr.label,
        sortOrder: index,
        isActive: true,
        updatedAt: Date.now(),
      });
      kept += 1;
      continue;
    }
    const now = Date.now();
    await ctx.db.insert("variantOptions", {
      variantTypeId,
      attributeId: attr._id,
      label: attr.label,
      value,
      sortOrder: index,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    created += 1;
  }

  return { created, deleted, kept };
}

/**
 * Upsert a variant category recipe and sync its linked variantType + options
 * (mirrors bluetailor `afterChangeVariantCategories`).
 */
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
  const attributes = await assertOwnedAttributesForType(
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
      throw appError("NOT_FOUND", "That variant category doesn't exist.");
    }
    if (existing.slug !== slug) {
      const clash = await ctx.db
        .query("variantCategories")
        .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", slug))
        .unique();
      if (clash && clash._id !== variantCategoryId) {
        throw appError("CONFLICT", "A variant category with that title already exists.");
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
    if (clash) throw appError("CONFLICT", "A variant category with that title already exists.");
    const all = await listVariantCategories(ctx, vendorId);
    if (all.length >= MAX_VARIANT_CATEGORIES) {
      throw appError("RATE_LIMITED", `At most ${MAX_VARIANT_CATEGORIES} variant categories.`);
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

  let variantType = await findVariantTypeForCategory(ctx, variantCategoryId);
  if (!variantType) {
    const types = await listVariantTypes(ctx, vendorId);
    if (types.length >= MAX_VARIANT_TYPES) {
      throw appError("RATE_LIMITED", `At most ${MAX_VARIANT_TYPES} variant types.`);
    }
    // Prefer recipe slug; if a manual type already owns it, suffix with category id fragment.
    let typeSlug = slug;
    const slugTaken = await ctx.db
      .query("variantTypes")
      .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", typeSlug))
      .unique();
    if (slugTaken) {
      typeSlug = `${slug}-${String(variantCategoryId).slice(-6)}`;
    }
    const typeId = await ctx.db.insert("variantTypes", {
      vendorId,
      label: title,
      slug: typeSlug,
      sortOrder: types.length,
      isActive: true,
      attributeTypeId: input.attributeTypeId,
      categoryIds: input.categoryIds,
      variantCategoryId,
      createdAt: now,
      updatedAt: now,
    });
    variantType = (await ctx.db.get(typeId))!;
  } else {
    await ctx.db.patch(variantType._id, {
      label: title,
      attributeTypeId: input.attributeTypeId,
      categoryIds: input.categoryIds,
      isActive: true,
      updatedAt: now,
    });
  }

  await syncVariantOptionsFromAttributes(ctx, variantType._id, attributes);
  return variantCategoryId;
}

export async function removeVariantCategory(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  variantCategoryId: Id<"variantCategories">,
): Promise<void> {
  const row = await ctx.db.get(variantCategoryId);
  if (!row || row.vendorId !== vendorId) {
    throw appError("NOT_FOUND", "That variant category doesn't exist.");
  }

  const variantType = await findVariantTypeForCategory(ctx, variantCategoryId);
  if (variantType) {
    const options = await ctx.db
      .query("variantOptions")
      .withIndex("by_variantTypeId_and_sortOrder", (q) => q.eq("variantTypeId", variantType._id))
      .take(MAX_OPTIONS_PER_TYPE);
    const optionIds = new Set(options.map((option) => option._id));
    const skus = await ctx.db
      .query("productVariants")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendorId))
      .take(2000);
    const inUse = skus.some((sku) =>
      (sku.optionIds ?? []).some((optionId) => optionIds.has(optionId)),
    );
    if (inUse) {
      throw appError(
        "CONFLICT",
        "Remove this dimension from products before deleting the variant category.",
      );
    }

    for (const option of options) {
      await ctx.db.delete(option._id);
    }
    await ctx.db.delete(variantType._id);
  }

  await ctx.db.delete(variantCategoryId);
}
