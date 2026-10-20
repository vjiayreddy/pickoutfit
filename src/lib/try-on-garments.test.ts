import { describe, expect, it } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { garmentLinesFromProducts } from "./try-on-garments";

const product = (id: string) => id as Id<"products">;

describe("garmentLinesFromProducts", () => {
  it("keeps first product per single slot and accumulates accessories", () => {
    const lines = garmentLinesFromProducts([
      { id: product("a"), canTryOn: true, tryOnSlot: "top" },
      { id: product("b"), canTryOn: true, tryOnSlot: "top" },
      { id: product("c"), canTryOn: true, tryOnSlot: "bottom" },
      { id: product("d"), canTryOn: true, tryOnSlot: "accessories" },
      { id: product("e"), canTryOn: true, tryOnSlot: "accessories" },
      { id: product("f"), canTryOn: false, tryOnSlot: "shoes" },
    ]);
    expect(lines).toEqual([
      { slot: "top", source: "product", productId: "a" },
      { slot: "bottom", source: "product", productId: "c" },
      { slot: "accessories", source: "product", productId: "d" },
      { slot: "accessories", source: "product", productId: "e" },
    ]);
  });
});
