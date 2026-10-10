import { describe, expect, test } from "vitest";
import {
  categoryPathMatchesFilter,
  categoryScopeMatches,
  legacyProductCategoryFromPath,
  productTypeFromCategoryPath,
  type CategoryTreeNode,
} from "./categories";

function node(
  id: string,
  name: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    _id: id,
    name,
    slug: name.toLowerCase(),
    path: name.toLowerCase(),
    parentId: null,
    sortOrder: 0,
    isActive: true,
    children,
  };
}

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

describe("categoryScopeMatches", () => {
  const formal = node("formal", "Formal");
  const shirts = node("shirts", "Shirts", [formal]);
  const topwear = node("topwear", "Topwear", [shirts]);
  const men = node("men", "Men", [topwear]);
  const tree = [men];

  test("empty scope matches any product category", () => {
    expect(categoryScopeMatches("formal", [], tree)).toBe(true);
    expect(categoryScopeMatches(null, [], tree)).toBe(true);
  });

  test("product leaf matches parent-scoped variant", () => {
    expect(categoryScopeMatches("formal", ["shirts"], tree)).toBe(true);
    expect(categoryScopeMatches("formal", ["men"], tree)).toBe(true);
    expect(categoryScopeMatches("formal", ["formal"], tree)).toBe(true);
  });

  test("unrelated branch does not match", () => {
    expect(categoryScopeMatches("formal", ["other"], tree)).toBe(false);
    expect(categoryScopeMatches(null, ["shirts"], tree)).toBe(false);
  });
});

describe("categoryPathMatchesFilter", () => {
  const leaf = "men/topwear/shirts/formal";

  test("matches self and every ancestor path", () => {
    expect(categoryPathMatchesFilter(leaf, "men")).toBe(true);
    expect(categoryPathMatchesFilter(leaf, "men/topwear")).toBe(true);
    expect(categoryPathMatchesFilter(leaf, "men/topwear/shirts")).toBe(true);
    expect(categoryPathMatchesFilter(leaf, leaf)).toBe(true);
  });

  test("does not match sibling branches", () => {
    expect(categoryPathMatchesFilter(leaf, "men/bottomwear")).toBe(false);
    expect(categoryPathMatchesFilter(leaf, "women/topwear")).toBe(false);
  });
});
