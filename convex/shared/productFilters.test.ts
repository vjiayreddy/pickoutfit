import { describe, expect, test } from "vitest";
import {
  groupAttributeIdsByType,
  productMatchesFilters,
  type ProductFilterable,
} from "./productFilters";

const product = (
  categoryPath: string | null,
  variants: Array<{ active: boolean; attributeIds: string[] }> = [],
): ProductFilterable => ({
  categoryPath,
  variants,
});

describe("groupAttributeIdsByType", () => {
  test("groups ids via Map lookup", () => {
    const typeById = new Map([
      ["a1", "colour"],
      ["a2", "colour"],
      ["a3", "size"],
    ]);
    expect(groupAttributeIdsByType(["a1", "a3", "a2", "missing"], typeById)).toEqual({
      colour: ["a1", "a2"],
      size: ["a3"],
    });
  });

  test("groups ids via map entries", () => {
    expect(
      groupAttributeIdsByType(["x", "y"], new Map([["x", "fit"], ["y", "fit"]])),
    ).toEqual({ fit: ["x", "y"] });
  });
});

describe("productMatchesFilters", () => {
  const shirt = product("men/topwear/shirts/formal", [
    { active: true, attributeIds: ["red", "m"] },
    { active: true, attributeIds: ["navy", "m"] },
    { active: false, attributeIds: ["green", "l"] },
  ]);

  test("empty filters match everything", () => {
    expect(productMatchesFilters(shirt, {})).toBe(true);
    expect(productMatchesFilters(shirt, { categoryPath: "", selectedByType: {} })).toBe(
      true,
    );
  });

  test("category path prefix match", () => {
    expect(productMatchesFilters(shirt, { categoryPath: "men/topwear" })).toBe(true);
    expect(productMatchesFilters(shirt, { categoryPath: "men/bottomwear" })).toBe(false);
    expect(productMatchesFilters(product(null), { categoryPath: "men" })).toBe(false);
  });

  test("variant attribute OR within type", () => {
    expect(
      productMatchesFilters(shirt, {
        selectedByType: { colour: ["red"] },
      }),
    ).toBe(true);
    expect(
      productMatchesFilters(shirt, {
        selectedByType: { colour: ["green", "navy"] },
      }),
    ).toBe(true);
    expect(
      productMatchesFilters(shirt, {
        selectedByType: { colour: ["green"] },
      }),
    ).toBe(false);
  });

  test("AND across types requires one active SKU", () => {
    expect(
      productMatchesFilters(shirt, {
        selectedByType: { colour: ["red"], size: ["m"] },
      }),
    ).toBe(true);
    // green+l only on inactive variant
    expect(
      productMatchesFilters(shirt, {
        selectedByType: { colour: ["green"], size: ["l"] },
      }),
    ).toBe(false);
    // red and l never on the same active SKU
    expect(
      productMatchesFilters(shirt, {
        selectedByType: { colour: ["red"], size: ["l"] },
      }),
    ).toBe(false);
  });

  test("category and variants combine", () => {
    expect(
      productMatchesFilters(shirt, {
        categoryPath: "men/topwear",
        selectedByType: { colour: ["navy"] },
      }),
    ).toBe(true);
    expect(
      productMatchesFilters(shirt, {
        categoryPath: "women",
        selectedByType: { colour: ["navy"] },
      }),
    ).toBe(false);
  });

  test("product with no active variants fails attribute filters", () => {
    expect(
      productMatchesFilters(product("men", [{ active: false, attributeIds: ["red"] }]), {
        selectedByType: { colour: ["red"] },
      }),
    ).toBe(false);
  });
});
