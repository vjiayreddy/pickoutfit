import { v } from "convex/values";
import { COLOUR_HEX, MAX_VARIANT_CATEGORIES } from "./variants";

/** Soft caps so one vendor cannot blow the attribute tables. */
export const MAX_ATTRIBUTE_TYPES = 40;
export const MAX_ATTRIBUTES_PER_TYPE = 200;
export { MAX_VARIANT_CATEGORIES };

export function attributeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/** Normalize `#RGB` / `#RRGGBB` to lowercase `#rrggbb`, or null if invalid. */
export function normalizeAttributeHex(value: string | undefined | null): string | null {
  if (value == null) return null;
  const raw = value.trim();
  if (!raw) return null;
  const withHash = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-fA-F]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const match = HEX_RE.exec(withHash);
  return match ? withHash.toLowerCase() : null;
}

export function isColourAttributeType(slug: string): boolean {
  return slug === "colour" || slug === "color";
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
  hex: v.optional(v.string()),
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
  optionCount: v.number(),
});

/** Default attribute type + value seeds (Size, Colour, Audience, Age). */
export const SEED_ATTRIBUTE_TYPES: Array<{
  label: string;
  displayLabel: string;
  slug: string;
  values: Array<{ label: string; value: string; hex?: string }>;
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
      { label: "Black", value: "black", hex: COLOUR_HEX.black },
      { label: "White", value: "white", hex: COLOUR_HEX.white },
      { label: "Navy", value: "navy", hex: COLOUR_HEX.navy },
      { label: "Grey", value: "grey", hex: COLOUR_HEX.grey },
      { label: "Beige", value: "beige", hex: COLOUR_HEX.beige },
      { label: "Brown", value: "brown", hex: COLOUR_HEX.brown },
      { label: "Red", value: "red", hex: COLOUR_HEX.red },
      { label: "Blue", value: "blue", hex: COLOUR_HEX.blue },
      { label: "Green", value: "green", hex: COLOUR_HEX.green },
      { label: "Pink", value: "pink", hex: COLOUR_HEX.pink },
      { label: "Yellow", value: "yellow", hex: COLOUR_HEX.yellow },
      { label: "Orange", value: "orange", hex: COLOUR_HEX.orange },
      { label: "Purple", value: "purple", hex: COLOUR_HEX.purple },
      { label: "Multi", value: "multi", hex: COLOUR_HEX.multi },
    ],
  },
  {
    label: "Audience",
    displayLabel: "Audience",
    slug: "audience",
    values: [
      { label: "Men", value: "men" },
      { label: "Women", value: "women" },
      { label: "Unisex", value: "unisex" },
      { label: "Kids", value: "kids" },
    ],
  },
  {
    label: "Age",
    displayLabel: "Age",
    slug: "age",
    values: [
      { label: "Adult", value: "adult" },
      { label: "Child", value: "child" },
      { label: "All ages", value: "all" },
    ],
  },
];
