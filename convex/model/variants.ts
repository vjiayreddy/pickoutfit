import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  COLOUR_HEX,
  MAX_OPTIONS_PER_TYPE,
  MAX_VARIANT_TYPES,
  SEED_VARIANT_TYPES,
  variantOptionValue,
  variantTypeSlug,
  type SeedVariantType,
} from "../shared/variants";
import type { Infer } from "convex/values";
import type { vVariantOptionRef } from "../shared/products";

type Ctx = QueryCtx | MutationCtx;
export type VariantOptionRef = Infer<typeof vVariantOptionRef>;

export async function listVariantTypes(
  ctx: Ctx,
  opts: { activeOnly?: boolean } = {},
): Promise<Doc<"variantTypes">[]> {
  const rows = await ctx.db.query("variantTypes").withIndex("by_sortOrder").take(MAX_VARIANT_TYPES);
  const filtered = opts.activeOnly ? rows.filter((row) => row.isActive) : rows;
  return filtered.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export async function listOptionsForType(
  ctx: Ctx,
  variantTypeId: Id<"variantTypes">,
  opts: { activeOnly?: boolean } = {},
): Promise<Doc<"variantOptions">[]> {
  const rows = await ctx.db
    .query("variantOptions")
    .withIndex("by_variantTypeId_and_sortOrder", (q) => q.eq("variantTypeId", variantTypeId))
    .take(MAX_OPTIONS_PER_TYPE);
  const filtered = opts.activeOnly ? rows.filter((row) => row.isActive) : rows;
  return filtered.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export async function loadVariantCatalog(
  ctx: Ctx,
  opts: { activeOnly?: boolean } = {},
): Promise<
  Array<
    Doc<"variantTypes"> & {
      options: Doc<"variantOptions">[];
    }
  >
> {
  const types = await listVariantTypes(ctx, opts);
  const out = [];
  for (const type of types) {
    out.push({ ...type, options: await listOptionsForType(ctx, type._id, opts) });
  }
  return out;
}

export async function createVariantType(
  ctx: MutationCtx,
  input: { label: string; slug?: string; sortOrder?: number },
): Promise<Id<"variantTypes">> {
  const label = input.label.trim();
  if (label.length < 1 || label.length > 40) {
    throw appError("INVALID_INPUT", "Type label must be 1–40 characters.");
  }
  const slug = variantTypeSlug(input.slug?.trim() || label);
  if (!slug) throw appError("INVALID_INPUT", "Type needs a valid slug.");
  const existing = await ctx.db
    .query("variantTypes")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (existing) throw appError("CONFLICT", "A type with that slug already exists.");
  const types = await listVariantTypes(ctx);
  if (types.length >= MAX_VARIANT_TYPES) {
    throw appError("RATE_LIMITED", `At most ${MAX_VARIANT_TYPES} variant types.`);
  }
  const now = Date.now();
  return ctx.db.insert("variantTypes", {
    label,
    slug,
    sortOrder: input.sortOrder ?? types.length,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateVariantType(
  ctx: MutationCtx,
  variantTypeId: Id<"variantTypes">,
  patch: { label?: string; sortOrder?: number; isActive?: boolean },
): Promise<void> {
  const row = await ctx.db.get(variantTypeId);
  if (!row) throw appError("NOT_FOUND", "That variant type doesn't exist.");
  const next: Partial<Doc<"variantTypes">> = { updatedAt: Date.now() };
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (label.length < 1 || label.length > 40) {
      throw appError("INVALID_INPUT", "Type label must be 1–40 characters.");
    }
    next.label = label;
  }
  if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) next.isActive = patch.isActive;
  await ctx.db.patch(variantTypeId, next);
}

export async function createVariantOption(
  ctx: MutationCtx,
  input: { variantTypeId: Id<"variantTypes">; label: string; value?: string; sortOrder?: number },
): Promise<Id<"variantOptions">> {
  const type = await ctx.db.get(input.variantTypeId);
  if (!type) throw appError("NOT_FOUND", "That variant type doesn't exist.");
  const label = input.label.trim();
  if (label.length < 1 || label.length > 40) {
    throw appError("INVALID_INPUT", "Option label must be 1–40 characters.");
  }
  const value = variantOptionValue(input.value?.trim() || label);
  const clash = await ctx.db
    .query("variantOptions")
    .withIndex("by_variantTypeId_and_value", (q) =>
      q.eq("variantTypeId", input.variantTypeId).eq("value", value),
    )
    .unique();
  if (clash) throw appError("CONFLICT", "That option value already exists on this type.");
  const options = await listOptionsForType(ctx, input.variantTypeId);
  if (options.length >= MAX_OPTIONS_PER_TYPE) {
    throw appError("RATE_LIMITED", `At most ${MAX_OPTIONS_PER_TYPE} options per type.`);
  }
  const now = Date.now();
  return ctx.db.insert("variantOptions", {
    variantTypeId: input.variantTypeId,
    label,
    value,
    sortOrder: input.sortOrder ?? options.length,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateVariantOption(
  ctx: MutationCtx,
  variantOptionId: Id<"variantOptions">,
  patch: { label?: string; sortOrder?: number; isActive?: boolean },
): Promise<void> {
  const row = await ctx.db.get(variantOptionId);
  if (!row) throw appError("NOT_FOUND", "That option doesn't exist.");
  const next: Partial<Doc<"variantOptions">> = { updatedAt: Date.now() };
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (label.length < 1 || label.length > 40) {
      throw appError("INVALID_INPUT", "Option label must be 1–40 characters.");
    }
    next.label = label;
  }
  if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) next.isActive = patch.isActive;
  await ctx.db.patch(variantOptionId, next);
}

async function ensureType(
  ctx: MutationCtx,
  seed: SeedVariantType,
  sortOrder: number,
): Promise<Id<"variantTypes">> {
  const existing = await ctx.db
    .query("variantTypes")
    .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      label: seed.label,
      sortOrder,
      isActive: true,
      updatedAt: now,
    });
    return existing._id;
  }
  return ctx.db.insert("variantTypes", {
    label: seed.label,
    slug: seed.slug,
    sortOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function ensureOption(
  ctx: MutationCtx,
  variantTypeId: Id<"variantTypes">,
  label: string,
  value: string,
  sortOrder: number,
): Promise<void> {
  const existing = await ctx.db
    .query("variantOptions")
    .withIndex("by_variantTypeId_and_value", (q) =>
      q.eq("variantTypeId", variantTypeId).eq("value", value),
    )
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, { label, sortOrder, isActive: true, updatedAt: now });
    return;
  }
  await ctx.db.insert("variantOptions", {
    variantTypeId,
    label,
    value,
    sortOrder,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

/** Idempotent seed of Size + Colour (Payload default dimensions). */
export async function seedVariantTypes(ctx: MutationCtx): Promise<{ types: number; options: number }> {
  let types = 0;
  let options = 0;
  for (const [typeIndex, seed] of SEED_VARIANT_TYPES.entries()) {
    const typeId = await ensureType(ctx, seed, typeIndex);
    types += 1;
    for (const [optionIndex, option] of seed.options.entries()) {
      await ensureOption(ctx, typeId, option.label, option.value, optionIndex);
      options += 1;
    }
  }
  return { types, options };
}

export async function resolveOptionIds(
  ctx: Ctx,
  optionIds: Id<"variantOptions">[],
  allowedTypeIds?: Id<"variantTypes">[],
): Promise<{
  optionIds: Id<"variantOptions">[];
  options: Doc<"variantOptions">[];
  types: Map<Id<"variantTypes">, Doc<"variantTypes">>;
}> {
  if (optionIds.length === 0) {
    return { optionIds: [], options: [], types: new Map() };
  }
  const unique = [...new Set(optionIds)];
  if (unique.length !== optionIds.length) {
    throw appError("INVALID_INPUT", "Each option can only be selected once.");
  }
  const options: Doc<"variantOptions">[] = [];
  const types = new Map<Id<"variantTypes">, Doc<"variantTypes">>();
  const seenTypes = new Set<Id<"variantTypes">>();
  for (const optionId of unique) {
    const option = await ctx.db.get(optionId);
    if (!option || !option.isActive) {
      throw appError("NOT_FOUND", "One of the selected options no longer exists.");
    }
    if (allowedTypeIds && !allowedTypeIds.includes(option.variantTypeId)) {
      throw appError("INVALID_INPUT", "That option is not enabled on this product.");
    }
    if (seenTypes.has(option.variantTypeId)) {
      throw appError("INVALID_INPUT", "Pick only one option per type (e.g. one size, one colour).");
    }
    seenTypes.add(option.variantTypeId);
    let type = types.get(option.variantTypeId);
    if (!type) {
      const loaded = await ctx.db.get(option.variantTypeId);
      if (!loaded || !loaded.isActive) {
        throw appError("NOT_FOUND", "A variant type for this option is missing.");
      }
      type = loaded;
      types.set(loaded._id, loaded);
    }
    options.push(option);
  }
  return { optionIds: unique, options, types };
}

/** Derive legacy size/colour from structured options so cart labels keep working. */
export function legacyFieldsFromOptions(
  options: Doc<"variantOptions">[],
  types: Map<Id<"variantTypes">, Doc<"variantTypes">>,
): { size?: string; colour?: { name: string; hex: string } } {
  let size: string | undefined;
  let colour: { name: string; hex: string } | undefined;
  for (const option of options) {
    const type = types.get(option.variantTypeId);
    if (!type) continue;
    if (type.slug === "size") size = option.label;
    if (type.slug === "colour") {
      colour = {
        name: option.label,
        hex: COLOUR_HEX[option.value] ?? "#707072",
      };
    }
  }
  return {
    ...(size ? { size } : {}),
    ...(colour ? { colour } : {}),
  };
}

export async function optionRefsFor(
  ctx: Ctx,
  optionIds: Id<"variantOptions">[] | undefined,
): Promise<VariantOptionRef[]> {
  if (!optionIds?.length) return [];
  const refs: VariantOptionRef[] = [];
  for (const optionId of optionIds) {
    const option = await ctx.db.get(optionId);
    if (!option) continue;
    refs.push({
      id: option._id,
      variantTypeId: option.variantTypeId,
      label: option.label,
      value: option.value,
    });
  }
  return refs;
}

export async function requireActiveVariantTypes(
  ctx: Ctx,
  variantTypeIds: Id<"variantTypes">[],
): Promise<Id<"variantTypes">[]> {
  const unique = [...new Set(variantTypeIds)];
  for (const id of unique) {
    const type = await ctx.db.get(id);
    if (!type || !type.isActive) {
      throw appError("NOT_FOUND", "One of the selected variant types is missing.");
    }
  }
  return unique;
}
