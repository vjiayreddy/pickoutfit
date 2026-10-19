import { describe, expect, test } from "vitest";
import type { CategoryTreeNode } from "./categories";
import {
  matchBrandFromDraft,
  matchCategoryFromDraft,
  resolvePhotoFill,
  type PhotoFillDraft,
} from "./productPhotoFill";

function node(
  id: string,
  name: string,
  slug: string,
  path: string,
  children: CategoryTreeNode[] = [],
): CategoryTreeNode {
  return {
    _id: id,
    name,
    slug,
    path,
    parentId: null,
    sortOrder: 0,
    isActive: true,
    children,
  };
}

const tree: CategoryTreeNode[] = [
  node("men", "Men", "men", "men", [
    node("men-top", "Topwear", "topwear", "men/topwear", [
      node("men-shirts", "Shirts", "shirts", "men/topwear/shirts", [
        node("men-formal", "Formal", "formal", "men/topwear/shirts/formal"),
        node("men-casual", "Casual", "casual", "men/topwear/shirts/casual"),
      ]),
    ]),
  ]),
  node("women", "Women", "women", "women", [
    node("women-top", "Topwear", "topwear", "women/topwear", [
      node("women-shirts", "Shirts", "shirts", "women/topwear/shirts"),
    ]),
  ]),
];

const draftShirt: PhotoFillDraft = {
  name: "Navy Formal Shirt",
  brand: "Louis Philippe",
  subcategory: "formal shirt",
  productType: "shirt",
  description: "A navy formal shirt.",
  category: "clothes",
  presentation: "masculine",
  colours: { primary: "Navy", secondary: [], hex: "#001f3f" },
  size: "M",
  ageGroup: "adult",
  occasion: "work",
};

describe("productPhotoFill", () => {
  test("matches mens formal shirt leaf using subcategory hint", () => {
    const pick = matchCategoryFromDraft(tree, draftShirt);
    expect(pick?.path).toBe("men/topwear/shirts/formal");
  });

  test("matches brand by name case-insensitively", () => {
    const brand = matchBrandFromDraft(
      [{ _id: "b1", name: "Louis Philippe", slug: "louis-philippe" }],
      "louis philippe",
    );
    expect(brand?._id).toBe("b1");
  });

  test("resolvePhotoFill applies colour/size/age and suggests unmatched brand", () => {
    const result = resolvePhotoFill({
      draft: draftShirt,
      brands: [],
      categoryTree: tree,
      attributeTypes: [
        { _id: "t-colour", label: "Colour", slug: "colour" },
        { _id: "t-size", label: "Size", slug: "size" },
        { _id: "t-age", label: "Age", slug: "age" },
        { _id: "t-aud", label: "Audience", slug: "audience" },
      ],
      attributes: [
        {
          _id: "a-navy",
          attributeTypeId: "t-colour",
          label: "Navy",
          value: "navy",
          slug: "navy",
          hex: "#001f3f",
        },
        {
          _id: "a-m",
          attributeTypeId: "t-size",
          label: "M",
          value: "m",
          slug: "m",
        },
        {
          _id: "a-adult",
          attributeTypeId: "t-age",
          label: "Adult",
          value: "adult",
          slug: "adult",
        },
        {
          _id: "a-men",
          attributeTypeId: "t-aud",
          label: "Men",
          value: "men",
          slug: "men",
        },
      ],
    });
    expect(result.categoryId).toBe("men-formal");
    expect(result.attributeSelections).toEqual(
      expect.arrayContaining([
        { attributeTypeId: "t-colour", attributeIds: ["a-navy"] },
        { attributeTypeId: "t-size", attributeIds: ["a-m"] },
        { attributeTypeId: "t-age", attributeIds: ["a-adult"] },
        { attributeTypeId: "t-aud", attributeIds: ["a-men"] },
      ]),
    );
    expect(result.suggestions.some((row) => row.kind === "brand")).toBe(true);
  });
});
