import { describe, expect, test } from "vitest";
import { buildProductSearchText } from "./products";

describe("buildProductSearchText", () => {
  test("includes category path segments and selection labels", () => {
    const text = buildProductSearchText({
      name: "Classic Oxford",
      brand: "Acme",
      category: "clothes",
      categoryPath: "men/topwear/shirts/formal",
      description: "Crisp cotton oxford",
      selectionLabels: ["Colour", "Navy", "Pattern", "Solid", "Material", "Cotton"],
    });
    expect(text).toContain("Classic Oxford");
    expect(text).toContain("Acme");
    expect(text).toContain("men");
    expect(text).toContain("shirts");
    expect(text).toContain("formal");
    expect(text).toContain("Colour");
    expect(text).toContain("Navy");
    expect(text).toContain("Solid");
    expect(text).toContain("Cotton");
    expect(text).toContain("Crisp cotton oxford");
  });

  test("dedupes overlapping tokens case-insensitively", () => {
    const text = buildProductSearchText({
      name: "Shirt",
      category: "clothes",
      subcategory: "Shirt",
      selectionLabels: ["shirt", "Navy"],
    });
    expect(text.toLowerCase().split(/\s+/).filter((p) => p === "shirt")).toHaveLength(1);
    expect(text).toContain("Navy");
  });
});
