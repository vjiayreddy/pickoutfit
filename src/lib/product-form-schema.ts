import { z } from "zod";
import {
  AGE_GROUPS,
  INFO_SECTION_KINDS,
  MAX_INFO_SECTIONS,
  PRODUCT_CATEGORIES,
  OCCASIONS,
} from "@convex/shared/products";
import { PRESENTATIONS } from "@convex/shared/wardrobe";
import { MAX_PRODUCT_VARIANTS } from "@convex/shared/vendors";

const hexColour = z
  .string()
  .refine((value) => value === "" || /^#[0-9a-fA-F]{6}$/.test(value), {
    message: "Use a hex colour like #c4a574.",
  });

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
  optionIds: z.array(z.string()),
  size: z.string().max(24, "Size must be 24 characters or fewer."),
  colourName: z.string().max(40, "Colour name must be 40 characters or fewer."),
  colourHex: hexColour,
  priceInr: moneyString("Option price", false),
  stock: stockString,
  active: z.boolean(),
});

export const attrRowSchema = z.object({
  key: z.string(),
  keyInput: z.string().max(40, "Key must be 40 characters or fewer."),
  label: z.string().max(80),
  value: z.string().max(120, "Value must be 120 characters or fewer."),
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
    productType: z.string(),
    subcategory: z.string().max(80),
    description: z.string().max(400, "Description must be 400 characters or fewer."),
    category: z.enum(PRODUCT_CATEGORIES),
    categoryId: z.string().nullable(),
    presentation: z.enum(PRESENTATIONS),
    colourPrimary: z.string().max(40, "Primary colour must be 40 characters or fewer."),
    colourSecondary: z.string().max(120),
    colourHex: hexColour,
    pattern: z.string().max(40, "Pattern must be 40 characters or fewer."),
    material: z.string().max(60, "Material must be 60 characters or fewer."),
    size: z.string().max(24, "Size must be 24 characters or fewer."),
    ageGroup: z.union([z.enum(AGE_GROUPS), z.literal("")]),
    occasion: z.union([z.enum(OCCASIONS), z.literal("")]),
    customAttributes: z.array(attrRowSchema),
    infoSections: z.array(infoRowSchema).max(MAX_INFO_SECTIONS),
    priceInr: moneyString("Price", true),
    compareAtPriceInr: moneyString("MRP", false),
    variantTypeIds: z.array(z.string()),
    variants: z
      .array(variantRowSchema)
      .min(1, "Add at least one size or option.")
      .max(MAX_PRODUCT_VARIANTS, `A product can have at most ${MAX_PRODUCT_VARIANTS} options.`),
    aiRecommend: z.boolean(),
  })
  .superRefine((values, ctx) => {
    const price = Number(values.priceInr);
    const compareAt = values.compareAtPriceInr ? Number(values.compareAtPriceInr) : undefined;
    if (
      compareAt !== undefined &&
      Number.isFinite(compareAt) &&
      compareAt > 0 &&
      Number.isFinite(price) &&
      compareAt < price
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["compareAtPriceInr"],
        message: "MRP must be at least the selling price.",
      });
    }

    values.customAttributes.forEach((row, index) => {
      const key = row.keyInput.trim();
      const value = row.value.trim();
      if ((key && !value) || (!key && value)) {
        ctx.addIssue({
          code: "custom",
          path: ["customAttributes", index, key && !value ? "value" : "keyInput"],
          message: "Fill both the key and value, or remove the row.",
        });
      }
    });
  });

export type ProductFormValues = z.infer<typeof productFormSchema>;

/** What the stylist embedding needs before "Recommend by AI" can turn on. */
export type AiRecommendInput = {
  name: string;
  description: string;
  colourPrimary: string;
  material: string;
  pattern: string;
  priceInr: string;
  hasImage: boolean;
};

export type AiRecommendReadiness = {
  ready: boolean;
  missing: string[];
};

/**
 * Style embeddings need a name, colour, price, cover photo, and at least one
 * style signal (description / material / pattern) so the stylist can match looks.
 */
export function aiRecommendReadiness(input: AiRecommendInput): AiRecommendReadiness {
  const missing: string[] = [];
  if (!input.name.trim()) missing.push("a name");
  if (!input.colourPrimary.trim()) missing.push("a primary colour");
  const price = Number(input.priceInr);
  if (!input.priceInr.trim() || !Number.isFinite(price) || price < 0) missing.push("a price");
  if (!input.hasImage) missing.push("at least one photo");
  if (!input.description.trim() && !input.material.trim() && !input.pattern.trim()) {
    missing.push("a description, material, or pattern");
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
