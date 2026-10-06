import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  MAX_ATTRIBUTES_PER_TYPE,
  MAX_ATTRIBUTE_TYPES,
  SEED_ATTRIBUTE_TYPES,
  attributeSlug,
} from "../shared/attributes";

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
  return row;
}

async function assertOwnedCategories(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  categoryIds: Id<"categories">[],
): Promise<void> {
  for (const categoryId of categoryIds) {
    const row = await ctx.db.get(categoryId);
    if (!row || row.vendorId !== vendorId) {
      throw appError("NOT_FOUND", "One of the selected categories doesn't exist.");
    }
  }
}

export async function listAttributeTypes(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  opts: { activeOnly?: boolean } = {},
): Promise<Doc<"attributeTypes">[]> {
  const rows = await ctx.db
    .query("attributeTypes")
    .withIndex("by_vendorId_and_sortOrder", (q) => q.eq("vendorId", vendorId))
    .take(MAX_ATTRIBUTE_TYPES);
  const filtered = opts.activeOnly ? rows.filter((row) => row.isActive) : rows;
  return filtered.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export async function listAttributes(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  opts: {
    attributeTypeId?: Id<"attributeTypes">;
    activeOnly?: boolean;
    categoryId?: Id<"categories">;
  } = {},
): Promise<Doc<"attributes">[]> {
  let rows: Doc<"attributes">[];
  if (opts.attributeTypeId) {
    await assertOwnedAttributeType(ctx, vendorId, opts.attributeTypeId);
    rows = await ctx.db
      .query("attributes")
      .withIndex("by_vendorId_and_attributeTypeId", (q) =>
        q.eq("vendorId", vendorId).eq("attributeTypeId", opts.attributeTypeId!),
      )
      .take(MAX_ATTRIBUTES_PER_TYPE);
  } else {
    rows = await ctx.db
      .query("attributes")
      .withIndex("by_vendorId", (q) => q.eq("vendorId", vendorId))
      .take(MAX_ATTRIBUTE_TYPES * MAX_ATTRIBUTES_PER_TYPE);
  }
  let filtered = opts.activeOnly ? rows.filter((row) => row.isActive) : rows;
  if (opts.categoryId) {
    filtered = filtered.filter(
      (row) => row.categoryIds.length === 0 || row.categoryIds.includes(opts.categoryId!),
    );
  }
  return filtered.sort((a, b) => a.label.localeCompare(b.label));
}

export async function createAttributeType(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  input: {
    label: string;
    displayLabel?: string;
    slug?: string;
    isEnableFilter?: boolean;
    sortOrder?: number;
  },
): Promise<Id<"attributeTypes">> {
  const label = input.label.trim();
  if (label.length < 1 || label.length > 40) {
    throw appError("INVALID_INPUT", "Type label must be 1–40 characters.");
  }
  const displayLabel = (input.displayLabel?.trim() || label).slice(0, 60);
  const slug = attributeSlug(input.slug?.trim() || label);
  if (!slug) throw appError("INVALID_INPUT", "Type needs a valid slug.");
  const existing = await ctx.db
    .query("attributeTypes")
    .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", slug))
    .unique();
  if (existing) throw appError("CONFLICT", "An attribute type with that slug already exists.");
  const types = await listAttributeTypes(ctx, vendorId);
  if (types.length >= MAX_ATTRIBUTE_TYPES) {
    throw appError("RATE_LIMITED", `At most ${MAX_ATTRIBUTE_TYPES} attribute types.`);
  }
  const now = Date.now();
  return ctx.db.insert("attributeTypes", {
    vendorId,
    label,
    displayLabel,
    slug,
    isActive: true,
    isEnableFilter: input.isEnableFilter ?? true,
    sortOrder: input.sortOrder ?? types.length,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateAttributeType(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  attributeTypeId: Id<"attributeTypes">,
  patch: {
    label?: string;
    displayLabel?: string;
    isActive?: boolean;
    isEnableFilter?: boolean;
    sortOrder?: number;
  },
): Promise<void> {
  await assertOwnedAttributeType(ctx, vendorId, attributeTypeId);
  const next: Partial<Doc<"attributeTypes">> = { updatedAt: Date.now() };
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (label.length < 1 || label.length > 40) {
      throw appError("INVALID_INPUT", "Type label must be 1–40 characters.");
    }
    next.label = label;
  }
  if (patch.displayLabel !== undefined) {
    const displayLabel = patch.displayLabel.trim();
    if (displayLabel.length < 1 || displayLabel.length > 60) {
      throw appError("INVALID_INPUT", "Display label must be 1–60 characters.");
    }
    next.displayLabel = displayLabel;
  }
  if (patch.isActive !== undefined) next.isActive = patch.isActive;
  if (patch.isEnableFilter !== undefined) next.isEnableFilter = patch.isEnableFilter;
  if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
  await ctx.db.patch(attributeTypeId, next);
}

export async function createAttribute(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  input: {
    attributeTypeId: Id<"attributeTypes">;
    label: string;
    value?: string;
    categoryIds?: Id<"categories">[];
    mediaStorageId?: Id<"_storage">;
    sortOrder?: number;
  },
): Promise<Id<"attributes">> {
  await assertOwnedAttributeType(ctx, vendorId, input.attributeTypeId);
  const label = input.label.trim();
  if (label.length < 1 || label.length > 60) {
    throw appError("INVALID_INPUT", "Attribute label must be 1–60 characters.");
  }
  const value = attributeSlug(input.value?.trim() || label);
  if (!value) throw appError("INVALID_INPUT", "Attribute needs a valid value.");
  const slug = attributeSlug(label);
  const categoryIds = input.categoryIds ?? [];
  await assertOwnedCategories(ctx, vendorId, categoryIds);

  const clash = await ctx.db
    .query("attributes")
    .withIndex("by_attributeTypeId_and_value", (q) =>
      q.eq("attributeTypeId", input.attributeTypeId).eq("value", value),
    )
    .unique();
  if (clash && clash.vendorId === vendorId) {
    throw appError("CONFLICT", "That attribute value already exists on this type.");
  }

  const existing = await listAttributes(ctx, vendorId, {
    attributeTypeId: input.attributeTypeId,
  });
  if (existing.length >= MAX_ATTRIBUTES_PER_TYPE) {
    throw appError("RATE_LIMITED", `At most ${MAX_ATTRIBUTES_PER_TYPE} attributes per type.`);
  }

  const now = Date.now();
  return ctx.db.insert("attributes", {
    vendorId,
    attributeTypeId: input.attributeTypeId,
    label,
    value,
    slug,
    categoryIds,
    mediaStorageId: input.mediaStorageId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateAttribute(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  attributeId: Id<"attributes">,
  patch: {
    label?: string;
    categoryIds?: Id<"categories">[];
    mediaStorageId?: Id<"_storage"> | null;
    isActive?: boolean;
  },
): Promise<void> {
  const row = await ctx.db.get(attributeId);
  if (!row || row.vendorId !== vendorId) {
    throw appError("NOT_FOUND", "That attribute doesn't exist.");
  }
  const next: Partial<Doc<"attributes">> = { updatedAt: Date.now() };
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (label.length < 1 || label.length > 60) {
      throw appError("INVALID_INPUT", "Attribute label must be 1–60 characters.");
    }
    next.label = label;
    next.slug = attributeSlug(label);
  }
  if (patch.categoryIds !== undefined) {
    await assertOwnedCategories(ctx, vendorId, patch.categoryIds);
    next.categoryIds = patch.categoryIds;
  }
  if (patch.mediaStorageId !== undefined) {
    next.mediaStorageId = patch.mediaStorageId ?? undefined;
  }
  if (patch.isActive !== undefined) next.isActive = patch.isActive;
  await ctx.db.patch(attributeId, next);
}

/** Idempotent Size + Colour attribute catalog for one store. */
export async function seedAttributeCatalog(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
): Promise<{ types: number; attributes: number }> {
  let types = 0;
  let attributes = 0;
  for (const [typeIndex, seed] of SEED_ATTRIBUTE_TYPES.entries()) {
    const existingType = await ctx.db
      .query("attributeTypes")
      .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", seed.slug))
      .unique();
    const now = Date.now();
    let typeId: Id<"attributeTypes">;
    if (existingType) {
      await ctx.db.patch(existingType._id, {
        label: seed.label,
        displayLabel: seed.displayLabel,
        sortOrder: typeIndex,
        isActive: true,
        isEnableFilter: true,
        updatedAt: now,
      });
      typeId = existingType._id;
    } else {
      typeId = await ctx.db.insert("attributeTypes", {
        vendorId,
        label: seed.label,
        displayLabel: seed.displayLabel,
        slug: seed.slug,
        isActive: true,
        isEnableFilter: true,
        sortOrder: typeIndex,
        createdAt: now,
        updatedAt: now,
      });
    }
    types += 1;

    for (const value of seed.values) {
      const existingAttr = await ctx.db
        .query("attributes")
        .withIndex("by_attributeTypeId_and_value", (q) =>
          q.eq("attributeTypeId", typeId).eq("value", value.value),
        )
        .unique();
      if (existingAttr && existingAttr.vendorId === vendorId) {
        await ctx.db.patch(existingAttr._id, {
          label: value.label,
          slug: attributeSlug(value.label),
          isActive: true,
          updatedAt: Date.now(),
        });
      } else if (!existingAttr) {
        await ctx.db.insert("attributes", {
          vendorId,
          attributeTypeId: typeId,
          label: value.label,
          value: value.value,
          slug: attributeSlug(value.label),
          categoryIds: [],
          isActive: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      attributes += 1;
    }
  }
  return { types, attributes };
}
