import { v } from "convex/values";

/** Soft caps for per-store Variants (dimensions built from attributes). */
export const MAX_VARIANT_CATEGORIES = 40;
export const MAX_OPTIONS_PER_VARIANT = 80;

/** Common colour hex fallbacks when an attribute is mapped into legacy `colour`. */
export const COLOUR_HEX: Record<string, string> = {
  black: "#111111",
  white: "#ffffff",
  navy: "#1b2a4a",
  grey: "#707072",
  beige: "#d6c6a8",
  brown: "#6b3f2a",
  red: "#d30005",
  blue: "#1151ff",
  green: "#007d48",
  pink: "#ed1aa0",
  yellow: "#e6b800",
  orange: "#e65c00",
  purple: "#6b4cff",
  multi: "#9e9ea0",
};

/** Catalog row for the product editor: one Variant + its attribute options. */
export const vVariantCatalogOption = v.object({
  id: v.id("attributes"),
  variantCategoryId: v.id("variantCategories"),
  label: v.string(),
  value: v.string(),
  slug: v.string(),
  sortOrder: v.number(),
  isActive: v.boolean(),
  hex: v.union(v.string(), v.null()),
});

export const vVariantCatalogRow = v.object({
  id: v.id("variantCategories"),
  label: v.string(),
  slug: v.string(),
  attributeTypeId: v.id("attributeTypes"),
  /** Attribute type slug (`size`, `colour`, …) for legacy size/colour labels. */
  attributeTypeSlug: v.string(),
  categoryIds: v.array(v.id("categories")),
  options: v.array(vVariantCatalogOption),
});
