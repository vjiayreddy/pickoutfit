import { z } from "zod";
import {
  INFO_SECTION_KINDS,
  MAX_ATTRIBUTE_SELECTIONS,
  MAX_ATTRIBUTES_PER_SELECTION,
  MAX_INFO_SECTIONS,
  PRODUCT_CATEGORIES,
} from "@convex/shared/products";
import { PRESENTATIONS } from "@convex/shared/wardrobe";
import { MAX_PRODUCT_VARIANTS } from "@convex/shared/vendors";

const hexColour = z
  .string()
  .refine((value) => value === "" || /^#[0-9a-fA-F]{6}$/.test(value), {
    message: "Use a hex colour like #c4a574.",
  });

/** Base product price: required and must be a whole rupee greater than 0. */
const basePriceString = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (!value) {
      ctx.addIssue({ code: "custom", message: "Enter a price." });
      return;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      ctx.addIssue({ code: "custom", message: "Price must be greater than 0." });
      return;
    }
    if (!Number.isInteger(amount)) {
      ctx.addIssue({ code: "custom", message: "Price must be a whole number." });
    }
  });

/** Optional SKU override: empty = use base price; otherwise 0+ whole rupees. */
const moneyString = (label: string, required: boolean) =>
  z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      if (!value) {
        if (required) {
          ctx.addIssue({ code: "custom", message: `Enter a ${label.toLowerCase()}.` });
        }
        return;
      }
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0) {
        ctx.addIssue({ code: "custom", message: `${label} must be 0 or more.` });
        return;
      }
      if (!Number.isInteger(amount)) {
        ctx.addIssue({ code: "custom", message: `${label} must be a whole number.` });
      }
    });

const stockString = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    if (value === "") {
      ctx.addIssue({ code: "custom", message: "Enter stock." });
      return;
    }
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount < 0) {
      ctx.addIssue({ code: "custom", message: "Stock must be 0 or more." });
      return;
    }
    if (!Number.isInteger(amount)) {
      ctx.addIssue({ code: "custom", message: "Stock must be a whole number." });
    }
  });

export const variantRowSchema = z.object({
  key: z.string().min(1),
  id: z.string().optional(),
  attributeIds: z.array(z.string()),
  size: z.string().max(24, "Size must be 24 characters or fewer."),
  colourName: z.string().max(40, "Colour name must be 40 characters or fewer."),
  colourHex: hexColour,
  priceInr: moneyString("Option price", false),
  stock: stockString,
  active: z.boolean(),
});

export const attributeSelectionSchema = z.object({
  attributeTypeId: z.string().min(1, "Pick an attribute type."),
  /** Empty rows are dropped on save. */
  attributeIds: z.array(z.string()).max(MAX_ATTRIBUTES_PER_SELECTION),
});

export const infoRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(80, "Title must be 80 characters or fewer."),
  kind: z.enum(INFO_SECTION_KINDS),
  body: z.string().max(4000, "Section text must be 4000 characters or fewer."),
  rows: z.array(
    z.object({
      label: z.string().max(120),
      value: z.string().max(2000),
    }),
  ),
});

export const productFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter a product name.")
      .max(80, "Name must be 80 characters or fewer."),
    brandId: z.string().nullable(),
    brand: z.string().max(80, "Brand must be 80 characters or fewer."),
    /** Derived from category tree; kept for legacy/search. */
    productType: z.string(),
    subcategory: z.string().max(80),
    description: z.string().max(400, "Description must be 400 characters or fewer."),
    category: z.enum(PRODUCT_CATEGORIES),
    categoryId: z.string().nullable(),
    /**
     * Hidden: required by catalog schema. Derived from category path
     * (men → masculine, women → feminine); not shown in the form.
     */
    presentation: z.enum(PRESENTATIONS),
    attributeSelections: z
      .array(attributeSelectionSchema)
      .max(MAX_ATTRIBUTE_SELECTIONS, `At most ${MAX_ATTRIBUTE_SELECTIONS} attribute types.`),
    infoSections: z.array(infoRowSchema).max(MAX_INFO_SECTIONS),
    priceInr: basePriceString,
    variantCategoryIds: z.array(z.string()),
    variants: z
      .array(variantRowSchema)
      .min(1, "Add at least one option for stock.")
      .max(MAX_PRODUCT_VARIANTS, `A product can have at most ${MAX_PRODUCT_VARIANTS} options.`),
    aiRecommend: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const seenTypes = new Set<string>();
    values.attributeSelections.forEach((row, index) => {
      if (!row.attributeTypeId) return;
      if (seenTypes.has(row.attributeTypeId)) {
        ctx.addIssue({
          code: "custom",
          path: ["attributeSelections", index, "attributeTypeId"],
          message: "That attribute type is already added.",
        });
      }
      seenTypes.add(row.attributeTypeId);
    });
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;

/** What the stylist embedding needs before "Recommend by AI" can turn on. */
export type AiRecommendInput = {
  name: string;
  description: string;
  priceInr: string;
  hasImage: boolean;
  hasAttributes: boolean;
};

export type AiRecommendReadiness = {
  ready: boolean;
  missing: string[];
};

/**
 * Style embeddings need a name, price, cover photo, and a style signal
 * (description and/or catalog attributes).
 */
export function aiRecommendReadiness(input: AiRecommendInput): AiRecommendReadiness {
  const missing: string[] = [];
  if (!input.name.trim()) missing.push("a name");
  const price = Number(input.priceInr);
  if (!input.priceInr.trim() || !Number.isFinite(price) || price <= 0) missing.push("a price");
  if (!input.hasImage) missing.push("at least one photo");
  if (!input.description.trim() && !input.hasAttributes) {
    missing.push("a description or attributes");
  }
  return { ready: missing.length === 0, missing };
}

/** First field-level message for toast / alert banners. */
export function firstFormError(
  errors: Record<string, unknown>,
  prefix = "",
): string | null {
  for (const [key, value] of Object.entries(errors)) {
    if (!value || typeof value !== "object") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const record = value as { message?: string; root?: { message?: string } };
    if (typeof record.message === "string" && record.message) return record.message;
    if (record.root?.message) return record.root.message;
    const nested = firstFormError(value as Record<string, unknown>, path);
    if (nested) return nested;
  }
  return null;
}
