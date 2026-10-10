import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { categoryScopeMatches, type CategoryTreeNode } from "../shared/categories";
import type { vVariantOptionRef } from "../shared/products";
import { COLOUR_HEX } from "../shared/variants";
import { getTree } from "./categories";
import { listVariantCategories } from "./variantCategories";

type Ctx = QueryCtx | MutationCtx;
export type VariantOptionRef = Infer<typeof vVariantOptionRef>;

export type VariantFacetValue = {
  _id: Id<"attributes">;
  label: string;
  value: string;
  slug: string;
  hex: string | null;
  mediaUrl: string | null;
};

export type VariantFacetType = {
  _id: Id<"attributeTypes">;
  label: string;
  displayLabel: string;
  slug: string;
  sortOrder: number;
  values: VariantFacetValue[];
};

export type VariantCatalogRow = {
  id: Id<"variantCategories">;
  label: string;
  slug: string;
  attributeTypeId: Id<"attributeTypes">;
  attributeTypeSlug: string;
  categoryIds: Id<"categories">[];
  options: Array<{
    id: Id<"attributes">;
    variantCategoryId: Id<"variantCategories">;
    label: string;
    value: string;
    slug: string;
    sortOrder: number;
    isActive: boolean;
    hex: string | null;
  }>;
};

/**
 * PLP facets from variant categories (SKU axes), not product attributeSelections.
 * Options are merged by attribute type; scoped by selected taxonomy category.
 */
export async function listVariantFilterFacets(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  opts: { categoryId?: Id<"categories"> } = {},
): Promise<VariantFacetType[]> {
  const catalog = await loadVariantCatalog(ctx, vendorId);
  let tree: CategoryTreeNode[] | null = null;
  if (opts.categoryId) {
    tree = (await getTree(ctx, vendorId, { activeOnly: true })) as CategoryTreeNode[];
  }

  const byType = new Map<
    string,
    {
      _id: Id<"attributeTypes">;
      label: string;
      displayLabel: string;
      slug: string;
      sortOrder: number;
      values: Map<string, VariantFacetValue>;
    }
  >();

  for (const recipe of catalog) {
    if (opts.categoryId && tree) {
      if (!categoryScopeMatches(opts.categoryId, recipe.categoryIds, tree)) continue;
    }
    const type = await ctx.db.get(recipe.attributeTypeId);
    if (!type || !type.isActive) continue;

    let group = byType.get(recipe.attributeTypeId);
    if (!group) {
      group = {
        _id: type._id,
        label: type.label,
        displayLabel: type.displayLabel || type.label,
        slug: type.slug,
        sortOrder: type.sortOrder,
        values: new Map(),
      };
      byType.set(recipe.attributeTypeId, group);
    }

    for (const option of recipe.options) {
      if (!option.isActive) continue;
      if (group.values.has(option.id)) continue;
      group.values.set(option.id, {
        _id: option.id,
        label: option.label,
        value: option.value,
        slug: option.slug,
        hex: option.hex,
        mediaUrl: null,
      });
    }
  }

  return [...byType.values()]
    .map((group) => ({
      _id: group._id,
      label: group.label,
      displayLabel: group.displayLabel,
      slug: group.slug,
      sortOrder: group.sortOrder,
      values: [...group.values.values()].sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .filter((group) => group.values.length > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/** Variants (recipes) + attribute options for the product editor. */
export async function loadVariantCatalog(
  ctx: Ctx,
  vendorId: Id<"vendors">,
): Promise<VariantCatalogRow[]> {
  const recipes = await listVariantCategories(ctx, vendorId);
  const out: VariantCatalogRow[] = [];
  for (const recipe of recipes) {
    const type = await ctx.db.get(recipe.attributeTypeId);
    if (!type || !type.isActive) continue;
    const options = [];
    for (const [index, attributeId] of recipe.attributeIds.entries()) {
      const attr = await ctx.db.get(attributeId);
      if (!attr || attr.vendorId !== vendorId || !attr.isActive) continue;
      options.push({
        id: attr._id,
        variantCategoryId: recipe._id,
        label: attr.label,
        value: attr.value,
        slug: attr.slug,
        sortOrder: index,
        isActive: attr.isActive,
        hex: attr.hex ?? null,
      });
    }
    out.push({
      id: recipe._id,
      label: recipe.title,
      slug: recipe.slug,
      attributeTypeId: recipe.attributeTypeId,
      attributeTypeSlug: type.slug,
      categoryIds: recipe.categoryIds,
      options,
    });
  }
  return out;
}

export async function requireActiveVariantCategories(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  variantCategoryIds: Id<"variantCategories">[],
): Promise<Id<"variantCategories">[]> {
  const unique = [...new Set(variantCategoryIds)];
  const valid: Id<"variantCategories">[] = [];
  for (const id of unique) {
    const row = await ctx.db.get(id);
    if (row && row.vendorId === vendorId) valid.push(id);
  }
  if (unique.length > 0 && valid.length === 0) {
    throw appError(
      "NOT_FOUND",
      "Those variants are outdated. Turn them off and on again, then save.",
    );
  }
  return valid;
}

export async function resolveAttributeIds(
  ctx: Ctx,
  attributeIds: Id<"attributes">[],
  allowedCategoryIds?: Id<"variantCategories">[],
  vendorId?: Id<"vendors">,
): Promise<{
  attributeIds: Id<"attributes">[];
  attributes: Doc<"attributes">[];
  categories: Map<Id<"variantCategories">, Doc<"variantCategories">>;
  types: Map<Id<"attributeTypes">, Doc<"attributeTypes">>;
}> {
  if (attributeIds.length === 0) {
    return {
      attributeIds: [],
      attributes: [],
      categories: new Map(),
      types: new Map(),
    };
  }
  const unique = [...new Set(attributeIds)];
  if (unique.length !== attributeIds.length) {
    throw appError("INVALID_INPUT", "Each option can only be selected once.");
  }

  const recipes =
    allowedCategoryIds && allowedCategoryIds.length > 0
      ? (
          await Promise.all(allowedCategoryIds.map((id) => ctx.db.get(id)))
        ).filter((row): row is Doc<"variantCategories"> => Boolean(row))
      : [];

  const attributes: Doc<"attributes">[] = [];
  const categories = new Map<Id<"variantCategories">, Doc<"variantCategories">>();
  const types = new Map<Id<"attributeTypes">, Doc<"attributeTypes">>();
  const seenCategories = new Set<Id<"variantCategories">>();

  for (const attributeId of unique) {
    const attr = await ctx.db.get(attributeId);
    if (!attr || !attr.isActive) {
      throw appError("NOT_FOUND", "One of the selected options no longer exists.");
    }
    if (vendorId && attr.vendorId !== vendorId) {
      throw appError("FORBIDDEN", "That option belongs to another store.");
    }

    const matchingRecipes = recipes.filter(
      (recipe) =>
        recipe.attributeTypeId === attr.attributeTypeId &&
        recipe.attributeIds.includes(attr._id),
    );
    if (allowedCategoryIds && allowedCategoryIds.length > 0) {
      if (matchingRecipes.length === 0) {
        throw appError("INVALID_INPUT", "That option is not enabled on this product.");
      }
      const recipe = matchingRecipes[0]!;
      if (seenCategories.has(recipe._id)) {
        throw appError(
          "INVALID_INPUT",
          "Pick only one option per variant (e.g. one size, one colour).",
        );
      }
      seenCategories.add(recipe._id);
      categories.set(recipe._id, recipe);
    } else {
      // No enabled dimensions — still enforce one attribute per attribute type.
      if (types.has(attr.attributeTypeId)) {
        throw appError(
          "INVALID_INPUT",
          "Pick only one option per variant (e.g. one size, one colour).",
        );
      }
    }

    let type = types.get(attr.attributeTypeId);
    if (!type) {
      const loaded = await ctx.db.get(attr.attributeTypeId);
      if (!loaded || !loaded.isActive) {
        throw appError("NOT_FOUND", "An attribute type for this option is missing.");
      }
      type = loaded;
      types.set(loaded._id, loaded);
    }
    attributes.push(attr);
  }

  return { attributeIds: unique, attributes, categories, types };
}

/** Derive legacy size/colour from structured attributes so cart labels keep working. */
export function legacyFieldsFromAttributes(
  attributes: Doc<"attributes">[],
  types: Map<Id<"attributeTypes">, Doc<"attributeTypes">>,
): { size?: string; colour?: { name: string; hex: string } } {
  let size: string | undefined;
  let colour: { name: string; hex: string } | undefined;
  for (const attr of attributes) {
    const type = types.get(attr.attributeTypeId);
    if (!type) continue;
    if (type.slug === "size") size = attr.label;
    if (type.slug === "colour" || type.slug === "color") {
      colour = {
        name: attr.label,
        hex: attr.hex ?? COLOUR_HEX[attr.value] ?? "#707072",
      };
    }
  }
  return {
    ...(size ? { size } : {}),
    ...(colour ? { colour } : {}),
  };
}

export async function attributeRefsFor(
  ctx: Ctx,
  attributeIds: Id<"attributes">[] | undefined,
  variantCategoryIds?: Id<"variantCategories">[],
): Promise<VariantOptionRef[]> {
  if (!attributeIds?.length) return [];
  const recipes =
    variantCategoryIds && variantCategoryIds.length > 0
      ? (
          await Promise.all(variantCategoryIds.map((id) => ctx.db.get(id)))
        ).filter((row): row is Doc<"variantCategories"> => Boolean(row))
      : [];

  const refs: VariantOptionRef[] = [];
  for (const attributeId of attributeIds) {
    const attr = await ctx.db.get(attributeId);
    if (!attr) continue;
    const recipe =
      recipes.find(
        (row) =>
          row.attributeTypeId === attr.attributeTypeId &&
          row.attributeIds.includes(attr._id),
      ) ?? null;
    refs.push({
      id: attr._id,
      variantCategoryId: recipe?._id ?? null,
      label: attr.label,
      value: attr.value,
    });
  }
  return refs;
}
