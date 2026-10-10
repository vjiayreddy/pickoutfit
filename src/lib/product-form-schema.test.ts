import { describe, expect, test } from "vitest";
import { productFormSchema } from "./product-form-schema";

describe("product price validation", () => {
  const base = {
    name: "Tee",
    brandId: null,
    brand: "",
    productType: "t-shirt",
    subcategory: "tee",
    description: "",
    category: "clothes" as const,
    categoryId: "c1",
    presentation: "neutral" as const,
    attributeSelections: [],
    infoSections: [],
    variantCategoryIds: [],
    variants: [
      {
        key: "v1",
        attributeIds: [],
        size: "",
        colourName: "",
        colourHex: "",
        priceInr: "",
        stock: "1",
        active: true,
      },
    ],
    aiRecommend: false,
  };

  test("rejects empty and zero price", () => {
    expect(productFormSchema.safeParse({ ...base, priceInr: "" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...base, priceInr: "0" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...base, priceInr: "499" }).success).toBe(true);
  });
});
