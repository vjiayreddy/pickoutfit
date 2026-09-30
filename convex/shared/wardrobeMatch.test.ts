import { describe, expect, it } from "vitest";
import {
  bestRelation,
  inferProductWardrobeCategory,
  relationSortRank,
  scorePairs,
  scoreSimilar,
  type MatchItem,
  type MatchProduct,
} from "./wardrobeMatch";

const shirt: MatchItem = {
  _id: "item_shirt",
  name: "White pinstripe shirt",
  category: "top",
  subcategory: "shirt",
  colours: { primary: "white", secondary: [], hex: ["#f5f5f5"] },
  pattern: "pinstripe",
  material: "cotton",
  formality: "formal",
};

const jeans: MatchItem = {
  _id: "item_jeans",
  name: "Dark wash jeans",
  category: "bottom",
  subcategory: "jeans",
  colours: { primary: "blue", secondary: [], hex: ["#1a2744"] },
  pattern: "solid",
  material: "denim",
  formality: "casual",
};

const catalogShirt: MatchProduct = {
  name: "White pinstripe shirt",
  category: "clothes",
  subcategory: "Shirt",
  productType: "shirt",
  colours: { primary: "white", secondary: [], hex: ["#ffffff"] },
  pattern: "stripe",
  material: "cotton",
  formality: "formal",
};

const catalogTrouser: MatchProduct = {
  name: "Navy tailored trousers",
  category: "clothes",
  subcategory: "Trouser",
  productType: "trouser",
  colours: { primary: "navy", secondary: [], hex: [] },
  pattern: "solid",
  material: "wool",
  formality: "formal",
};

describe("inferProductWardrobeCategory", () => {
  it("maps product types to wardrobe categories", () => {
    expect(inferProductWardrobeCategory(catalogShirt)).toBe("top");
    expect(inferProductWardrobeCategory(catalogTrouser)).toBe("bottom");
    expect(inferProductWardrobeCategory({ name: "Tote", category: "accessories", productType: "bag" })).toBe(
      "bag",
    );
  });
});

describe("scoreSimilar", () => {
  it("flags a white pinstripe catalog shirt against the owned twin", () => {
    expect(scoreSimilar(catalogShirt, shirt)).toBeGreaterThanOrEqual(4);
  });

  it("does not treat trousers as similar to a shirt", () => {
    expect(scoreSimilar(catalogTrouser, shirt)).toBe(0);
  });
});

describe("scorePairs", () => {
  it("pairs formal trousers with a formal shirt", () => {
    expect(scorePairs(catalogTrouser, shirt)).toBeGreaterThanOrEqual(2);
  });

  it("does not pair two tops", () => {
    expect(scorePairs(catalogShirt, shirt)).toBe(0);
  });
});

describe("bestRelation", () => {
  it("prefers similar over pairs when the catalog item duplicates owned", () => {
    const relation = bestRelation(catalogShirt, [shirt, jeans]);
    expect(relation?.kind).toBe("similar");
    expect(relation?.itemId).toBe("item_shirt");
  });

  it("returns pairs when the product completes an owned piece", () => {
    const relation = bestRelation(catalogTrouser, [shirt]);
    expect(relation?.kind).toBe("pairs");
    expect(relation?.itemId).toBe("item_shirt");
  });
});

describe("relationSortRank", () => {
  it("promotes pairs and demotes similar", () => {
    expect(relationSortRank("pairs")).toBeLessThan(relationSortRank(null));
    expect(relationSortRank(null)).toBeLessThan(relationSortRank("similar"));
  });
});
