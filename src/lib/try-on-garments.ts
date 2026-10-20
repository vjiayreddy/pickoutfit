import type { Id } from "@convex/_generated/dataModel";
import type { GarmentLine } from "@convex/shared/validators";
import type { Slot } from "@convex/shared/wardrobe";

type TryOnProduct = {
  id: Id<"products">;
  canTryOn: boolean;
  tryOnSlot: Slot | null;
};

/**
 * Build garment lines from one or more catalog products.
 * Single-slot pieces keep the first product per slot; accessories accumulate.
 */
export function garmentLinesFromProducts(products: TryOnProduct[]): GarmentLine[] {
  const lines: GarmentLine[] = [];
  const used = new Set<Slot>();
  for (const product of products) {
    if (!product.canTryOn || !product.tryOnSlot) continue;
    const slot = product.tryOnSlot;
    if (slot !== "accessories" && used.has(slot)) continue;
    if (slot !== "accessories") used.add(slot);
    lines.push({ slot, source: "product", productId: product.id });
  }
  return lines;
}
