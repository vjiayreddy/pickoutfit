import { categoryPathMatchesFilter } from "./categories";

export type ProductFilterVariant = {
  active: boolean;
  attributeIds: readonly string[];
};

export type ProductFilterable = {
  categoryPath?: string | null;
  /** SKU rows; only `active` variants are considered for attribute filters. */
  variants?: readonly ProductFilterVariant[] | null;
};

export type ProductListFilters = {
  /** Nested taxonomy path; empty/null = no category filter. */
  categoryPath?: string | null;
  /**
   * Selected attribute value ids grouped by attribute type id.
   * Within a type: OR. Across types: AND on a single active variant
   * (e.g. Size=M and Colour=Navy must appear on the same SKU).
   */
  selectedByType?: Readonly<Record<string, readonly string[]>> | null;
};

/** Group selected attribute ids by their type using a type lookup map. */
export function groupAttributeIdsByType(
  attributeIds: readonly string[],
  typeById: ReadonlyMap<string, string>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of attributeIds) {
    const typeId = typeById.get(id);
    if (!typeId) continue;
    const bucket = out[typeId] ?? [];
    bucket.push(id);
    out[typeId] = bucket;
  }
  return out;
}

function variantMatchesAllTypes(
  attributeIds: readonly string[],
  typeEntries: ReadonlyArray<readonly [string, readonly string[]]>,
): boolean {
  const owned = new Set(attributeIds);
  for (const [, ids] of typeEntries) {
    if (!ids.some((id) => owned.has(id))) return false;
  }
  return true;
}

/**
 * True when the product matches category path (prefix) and variant facets
 * (OR within type, AND across types on one active SKU).
 */
export function productMatchesFilters(
  product: ProductFilterable,
  filters: ProductListFilters,
): boolean {
  const filterPath = filters.categoryPath?.trim() ?? "";
  if (filterPath) {
    const productPath = product.categoryPath?.trim() ?? "";
    if (!categoryPathMatchesFilter(productPath, filterPath)) return false;
  }

  const byType = filters.selectedByType;
  if (!byType) return true;
  const typeEntries = Object.entries(byType).filter(([, ids]) => ids.length > 0);
  if (typeEntries.length === 0) return true;

  const variants = product.variants ?? [];
  for (const variant of variants) {
    if (!variant.active) continue;
    if (variantMatchesAllTypes(variant.attributeIds, typeEntries)) return true;
  }
  return false;
}
