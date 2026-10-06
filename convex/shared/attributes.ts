import { v } from "convex/values";

/** Soft caps so one vendor cannot blow the attribute tables. */
export const MAX_ATTRIBUTE_TYPES = 40;
export const MAX_ATTRIBUTES_PER_TYPE = 200;
export const MAX_VARIANT_CATEGORIES = 40;

export function attributeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const vAttributeTypeDoc = v.object({
  _id: v.id("attributeTypes"),
  _creationTime: v.number(),
  vendorId: v.id("vendors"),
  label: v.string(),
  displayLabel: v.string(),
  slug: v.string(),
  isActive: v.boolean(),
  isEnableFilter: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const vAttributeDoc = v.object({
  _id: v.id("attributes"),
  _creationTime: v.number(),
  vendorId: v.id("vendors"),
  attributeTypeId: v.id("attributeTypes"),
  label: v.string(),
  value: v.string(),
  slug: v.string(),
  categoryIds: v.array(v.id("categories")),
  mediaStorageId: v.optional(v.id("_storage")),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const vAttributeListRow = vAttributeDoc.extend({
  mediaUrl: v.union(v.string(), v.null()),
  attributeTypeLabel: v.string(),
});

export const vVariantCategoryDoc = v.object({
  _id: v.id("variantCategories"),
  _creationTime: v.number(),
  vendorId: v.id("vendors"),
  title: v.string(),
  slug: v.string(),
  attributeTypeId: v.id("attributeTypes"),
  categoryIds: v.array(v.id("categories")),
  attributeIds: v.array(v.id("attributes")),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const vVariantCategoryView = vVariantCategoryDoc.extend({
  attributeTypeLabel: v.string(),
  variantTypeId: v.union(v.id("variantTypes"), v.null()),
  optionCount: v.number(),
});

/** Default attribute type + value seeds (aligned with SEED_VARIANT_TYPES). */
export const SEED_ATTRIBUTE_TYPES: Array<{
  label: string;
  displayLabel: string;
  slug: string;
  values: Array<{ label: string; value: string }>;
}> = [
  {
    label: "Size",
    displayLabel: "Size",
    slug: "size",
    values: [
      { label: "XS", value: "xs" },
      { label: "S", value: "s" },
      { label: "M", value: "m" },
      { label: "L", value: "l" },
      { label: "XL", value: "xl" },
      { label: "XXL", value: "xxl" },
      { label: "28", value: "28" },
      { label: "30", value: "30" },
      { label: "32", value: "32" },
      { label: "34", value: "34" },
      { label: "36", value: "36" },
      { label: "38", value: "38" },
      { label: "40", value: "40" },
      { label: "One size", value: "one-size" },
    ],
  },
  {
    label: "Colour",
    displayLabel: "Colour",
    slug: "colour",
    values: [
      { label: "Black", value: "black" },
      { label: "White", value: "white" },
      { label: "Navy", value: "navy" },
      { label: "Grey", value: "grey" },
      { label: "Beige", value: "beige" },
      { label: "Brown", value: "brown" },
      { label: "Red", value: "red" },
      { label: "Blue", value: "blue" },
      { label: "Green", value: "green" },
      { label: "Pink", value: "pink" },
      { label: "Yellow", value: "yellow" },
      { label: "Orange", value: "orange" },
      { label: "Purple", value: "purple" },
      { label: "Multi", value: "multi" },
    ],
  },
];
