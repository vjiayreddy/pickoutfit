import type { Infer } from "convex/values";
import { appError } from "../lib/errors";
import {
  AGE_GROUPS,
  isProductType,
  OCCASIONS,
  PRODUCT_CATEGORIES,
  vProductDraft,
  type ProductCategory,
} from "../shared/products";
import { PRESENTATIONS, type Presentation } from "../shared/wardrobe";

export type ProductDraft = Infer<typeof vProductDraft>;

/** Turns the vision model's JSON into the shared product fields. Price is not part of this. */
export function parseProductDraft(raw: string): ProductDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw appError("UPSTREAM_FAILED", "The vision model returned something that isn't JSON.");
  }
  if (!isRecord(parsed)) {
    throw appError("UPSTREAM_FAILED", "The vision model returned an unexpected listing.");
  }
  const colours = isRecord(parsed.colours) ? parsed.colours : {};
  const name = asString(parsed.name).slice(0, 80);
  if (name.length < 1) {
    throw appError(
      "UPSTREAM_FAILED",
      "That photo didn't produce a product name. Type the details yourself.",
    );
  }
  const brand = asString(parsed.brand).slice(0, 80);
  const category = asCategory(parsed.category);
  const productType = asProductType(category, parsed.product_type ?? parsed.productType);
  const size = asString(parsed.size).slice(0, 24);
  return {
    category,
    presentation: asPresentation(parsed.presentation),
    name,
    brand: brand.length > 0 ? brand : null,
    subcategory: asString(parsed.subcategory).slice(0, 80),
    productType,
    description: asString(parsed.description).slice(0, 400),
    colours: {
      primary: asString(colours.primary).slice(0, 40),
      secondary: asStringArray(colours.secondary, 6).map((colour) => colour.slice(0, 40)),
      hex: asHex(colours.hex),
    },
    size: size.length > 0 ? size : null,
    ageGroup: asMember(parsed.age_group ?? parsed.ageGroup, AGE_GROUPS, "adult"),
    occasion: asMember(parsed.occasion, OCCASIONS, "casual"),
  };
}

function asProductType(category: ProductCategory, value: unknown): string | null {
  const type = asString(value).toLowerCase().replace(/\s+/g, "-");
  if (isProductType(category, type)) return type;
  if (isProductType(category, "other")) return "other";
  return null;
}

function asHex(value: unknown): string {
  const hex = asString(value).toLowerCase();
  const withHash = hex.startsWith("#") ? hex : `#${hex}`;
  return /^#[0-9a-f]{6}$/.test(withHash) ? withHash : "";
}

function asMember<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const member = asString(value).toLowerCase();
  return (allowed as readonly string[]).includes(member) ? (member as T) : fallback;
}

function asCategory(value: unknown): ProductCategory {
  const category = asString(value);
  return (PRODUCT_CATEGORIES as readonly string[]).includes(category)
    ? (category as ProductCategory)
    : "clothes";
}

function asPresentation(value: unknown): Presentation {
  const presentation = asString(value);
  return (PRESENTATIONS as readonly string[]).includes(presentation)
    ? (presentation as Presentation)
    : "neutral";
}

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .slice(0, limit);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
