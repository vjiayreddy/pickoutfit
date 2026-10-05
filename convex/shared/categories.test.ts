import { describe, expect, test } from "vitest";
import {
  legacyProductCategoryFromPath,
  productTypeFromCategoryPath,
} from "./categories";

describe("productTypeFromCategoryPath", () => {
  test("maps seed leaf slugs to PRODUCT_TYPES enums", () => {
    expect(productTypeFromCategoryPath("men/topwear/shirts")).toBe("shirt");
    expect(productTypeFromCategoryPath("men/topwear/t-shirts")).toBe("t-shirt");
    expect(productTypeFromCategoryPath("men/bottomwear/trousers")).toBe("trouser");
    expect(productTypeFromCategoryPath("men/bottomwear/jeans")).toBe("jeans");
    expect(productTypeFromCategoryPath("women/dresses")).toBe("dress");
    expect(productTypeFromCategoryPath("men/accessories/shoes")).toBe("shoes");
    expect(productTypeFromCategoryPath("women/accessories/bags")).toBe("bag");
    expect(productTypeFromCategoryPath("men/accessories/belts")).toBe("belt");
    expect(productTypeFromCategoryPath("men/accessories/eyewear")).toBe("glasses");
  });

  test("walks up from style leaves under Shirts", () => {
    expect(productTypeFromCategoryPath("men/topwear/shirts/formal")).toBe("shirt");
    expect(productTypeFromCategoryPath("men/topwear/shirts/casual")).toBe("shirt");
    expect(productTypeFromCategoryPath("men/topwear/shirts/printed")).toBe("shirt");
  });

  test("returns null for gender / wear branches without a garment leaf", () => {
    expect(productTypeFromCategoryPath("men")).toBeNull();
    expect(productTypeFromCategoryPath("men/topwear")).toBeNull();
    expect(productTypeFromCategoryPath("kids/accessories")).toBeNull();
  });

  test("respects legacy category when validating the mapped type", () => {
    const path = "men/accessories/eyewear";
    expect(legacyProductCategoryFromPath(path)).toBe("eyewear");
    expect(productTypeFromCategoryPath(path, "eyewear")).toBe("glasses");
    // Wrong legacy bucket rejects the eyewear mapping.
    expect(productTypeFromCategoryPath(path, "clothes")).toBeNull();
  });
});
