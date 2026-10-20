import { describe, expect, it } from "vitest";
import { garmentLinesFromOutfitSlots } from "./tryOnGarments";
import type { Id } from "../_generated/dataModel";

const item = (n: string) => n as Id<"items">;

describe("garmentLinesFromOutfitSlots", () => {
  it("maps wardrobe slots to item garment lines", () => {
    const lines = garmentLinesFromOutfitSlots({
      top: item("top1"),
      bottom: item("bottom1"),
      accessories: [item("acc1"), item("acc2")],
    });
    expect(lines).toEqual([
      { slot: "top", source: "item", itemId: "top1" },
      { slot: "bottom", source: "item", itemId: "bottom1" },
      { slot: "accessories", source: "item", itemId: "acc1" },
      { slot: "accessories", source: "item", itemId: "acc2" },
    ]);
  });

  it("returns empty when no pieces", () => {
    expect(garmentLinesFromOutfitSlots({ accessories: [] })).toEqual([]);
  });
});
