import { v } from "convex/values";

/** Caps for platform variant taxonomy (Payload-style types → options). */
export const MAX_VARIANT_TYPES = 40;
export const MAX_OPTIONS_PER_TYPE = 80;

export const VARIANT_TYPE_SLUGS = ["size", "colour"] as const;
export type VariantTypeSlug = (typeof VARIANT_TYPE_SLUGS)[number];

export type SeedVariantOption = { label: string; value: string };
export type SeedVariantType = {
  label: string;
  slug: VariantTypeSlug;
  options: SeedVariantOption[];
};

/** Default Size + Colour option trees, mirroring Payload ecommerce variantTypes/options. */
export const SEED_VARIANT_TYPES: SeedVariantType[] = [
  {
    label: "Size",
    slug: "size",
    options: [
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
    slug: "colour",
    options: [
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

/** Common colour hex fallbacks when an option is mapped into legacy `colour`. */
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

export function variantTypeSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function variantOptionValue(value: string): string {
  return variantTypeSlug(value) || "option";
}

export const vVariantTypeDoc = v.object({
  _id: v.id("variantTypes"),
  _creationTime: v.number(),
  label: v.string(),
  slug: v.string(),
  sortOrder: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const vVariantOptionDoc = v.object({
  _id: v.id("variantOptions"),
  _creationTime: v.number(),
  variantTypeId: v.id("variantTypes"),
  label: v.string(),
  value: v.string(),
  sortOrder: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const vVariantOptionView = v.object({
  id: v.id("variantOptions"),
  variantTypeId: v.id("variantTypes"),
  label: v.string(),
  value: v.string(),
  sortOrder: v.number(),
  isActive: v.boolean(),
});

export const vVariantTypeView = v.object({
  id: v.id("variantTypes"),
  label: v.string(),
  slug: v.string(),
  sortOrder: v.number(),
  isActive: v.boolean(),
  options: v.array(vVariantOptionView),
});
