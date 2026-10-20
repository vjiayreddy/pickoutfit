import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { vendorSellable } from "../shared/vendors";
import {
  type GarmentLine,
  type vOutfitSlots,
} from "../shared/validators";
import { inferProductWardrobeCategory } from "../shared/wardrobeMatch";
import {
  LAYER_ORDER,
  SLOT_CATEGORIES,
  slotForCategory,
  type Slot,
} from "../shared/wardrobe";

export type { GarmentLine };

function productIsActive(product: Doc<"products">): boolean {
  return (product.status ?? (product.active ? "active" : "draft")) === "active";
}

function slotHintForProduct(product: Doc<"products">): Slot | null {
  const wardrobeCategory = inferProductWardrobeCategory({
    name: product.name,
    category: product.category,
    subcategory: product.subcategory,
    productType: product.productType,
    colours: product.colours,
    pattern: product.pattern,
    material: product.material,
    formality: product.formality,
    attributes: product.attributes,
  });
  if (!wardrobeCategory) return null;
  return slotForCategory(wardrobeCategory);
}

type Ctx = QueryCtx | MutationCtx;

type OutfitSlots = Infer<typeof vOutfitSlots>;

export type ResolvedGarment = {
  name: string;
  slot: Slot;
  storageId: Id<"_storage">;
  itemId?: Id<"items">;
  productId?: Id<"products">;
};

/** Convert wardrobe outfit slots into garment lines (item source). */
export function garmentLinesFromOutfitSlots(slots: OutfitSlots): GarmentLine[] {
  const lines: GarmentLine[] = [];
  const push = (slot: Exclude<Slot, "accessories">, id: Id<"items"> | undefined) => {
    if (id) lines.push({ slot, source: "item", itemId: id });
  };
  push("outerwear", slots.outerwear);
  push("top", slots.top);
  push("bottom", slots.bottom);
  push("dress", slots.dress);
  push("shoes", slots.shoes);
  for (const itemId of slots.accessories) {
    lines.push({ slot: "accessories", source: "item", itemId });
  }
  return lines;
}

/** Prefer the denormalized cutout; fall back to a cutout image row. */
export async function resolveProductCutoutId(
  ctx: Ctx,
  product: Doc<"products">,
): Promise<Id<"_storage"> | null> {
  if (product.cutoutStorageId) return product.cutoutStorageId;
  const images = await ctx.db
    .query("productImages")
    .withIndex("by_productId_and_position", (q) => q.eq("productId", product._id))
    .take(24);
  const cutout = images.find((row) => row.kind === "cutout");
  return cutout?.storageId ?? null;
}

/** Slot + cutout check for product cards / PDP Try on gating. */
export async function productTryOnMeta(
  ctx: Ctx,
  product: Doc<"products">,
): Promise<{ canTryOn: boolean; tryOnSlot: Slot | null }> {
  if (!productIsActive(product)) {
    return { canTryOn: false, tryOnSlot: null };
  }
  const tryOnSlot = slotHintForProduct(product);
  if (!tryOnSlot) return { canTryOn: false, tryOnSlot: null };
  const cutoutId = await resolveProductCutoutId(ctx, product);
  return { canTryOn: Boolean(cutoutId), tryOnSlot };
}

/**
 * Throws INVALID_INPUT unless every line is owned/sellable, has a cutout, and
 * matches its slot. Returns human-readable problems when `collect` is true.
 */
export async function validateGarmentLines(
  ctx: Ctx,
  user: Doc<"users">,
  lines: GarmentLine[],
  collect = false,
): Promise<string[]> {
  const problems: string[] = [];
  if (lines.length === 0) {
    problems.push("pick at least one piece to try on");
  }
  if (lines.length > 15) {
    problems.push("at most 15 garments per try-on");
  }

  const usedSingles = new Set<Slot>();
  let hasDress = false;
  let hasTopOrBottom = false;

  for (const line of lines) {
    if (line.slot === "accessories") {
      // accessories may repeat
    } else if (usedSingles.has(line.slot)) {
      problems.push(`${line.slot}: only one piece per slot`);
    } else {
      usedSingles.add(line.slot);
    }
    if (line.slot === "dress") hasDress = true;
    if (line.slot === "top" || line.slot === "bottom") hasTopOrBottom = true;

    if (line.source === "item") {
      const item = await ctx.db.get(line.itemId);
      if (!item || item.userId !== user._id) {
        problems.push(`${line.slot}: item is not in your wardrobe`);
        continue;
      }
      if (item.status !== "ready") {
        problems.push(`${line.slot}: "${item.name}" isn't ready to use`);
        continue;
      }
      if (!SLOT_CATEGORIES[line.slot].includes(item.category)) {
        problems.push(
          `${line.slot}: "${item.name}" is a ${item.category}, not ${line.slot}`,
        );
        continue;
      }
      if (!item.storageId) {
        problems.push(`${line.slot}: "${item.name}" has no cutout yet`);
      }
    } else {
      const product = await ctx.db.get(line.productId);
      if (!product || !productIsActive(product)) {
        problems.push(`${line.slot}: that product is not available`);
        continue;
      }
      const vendor = product.vendorId ? await ctx.db.get(product.vendorId) : null;
      if (!vendor || !vendorSellable(vendor)) {
        problems.push(`${line.slot}: that store is not available`);
        continue;
      }
      const hinted = slotHintForProduct(product);
      if (!hinted) {
        problems.push(`${line.slot}: "${product.name}" cannot be tried on`);
        continue;
      }
      if (hinted !== line.slot) {
        problems.push(
          `${line.slot}: "${product.name}" belongs in ${hinted}, not ${line.slot}`,
        );
        continue;
      }
      const cutoutId = await resolveProductCutoutId(ctx, product);
      if (!cutoutId) {
        problems.push(
          `${line.slot}: "${product.name}" has no try-on cutout yet`,
        );
      }
    }
  }

  if (hasDress && hasTopOrBottom) {
    problems.push("a dress replaces top and bottom");
  }

  if (problems.length > 0 && !collect) {
    throw appError("INVALID_INPUT", problems[0], { problems });
  }
  return problems;
}

/** Resolve cutouts in layer order for the image pipeline. */
export async function layeredGarments(
  ctx: Ctx,
  lines: GarmentLine[],
): Promise<ResolvedGarment[]> {
  const bySlot = new Map<Slot, GarmentLine[]>();
  for (const line of lines) {
    const list = bySlot.get(line.slot) ?? [];
    list.push(line);
    bySlot.set(line.slot, list);
  }

  const ordered: ResolvedGarment[] = [];
  for (const slot of LAYER_ORDER) {
    for (const line of bySlot.get(slot) ?? []) {
      if (line.source === "item") {
        const item = await ctx.db.get(line.itemId);
        if (!item?.storageId) continue;
        ordered.push({
          name: item.name,
          slot,
          storageId: item.storageId,
          itemId: item._id,
        });
      } else {
        const product = await ctx.db.get(line.productId);
        if (!product) continue;
        const storageId = await resolveProductCutoutId(ctx, product);
        if (!storageId) continue;
        ordered.push({
          name: product.name,
          slot,
          storageId,
          productId: product._id,
        });
      }
    }
  }
  return ordered;
}

/** Display name for a catalog / mixed try-on in Lookbook. */
export async function lookNameFromGarmentLines(
  ctx: Ctx,
  lines: GarmentLine[],
): Promise<string> {
  const names: string[] = [];
  for (const line of lines.slice(0, 3)) {
    if (line.source === "item") {
      const item = await ctx.db.get(line.itemId);
      if (item) names.push(item.name);
    } else {
      const product = await ctx.db.get(line.productId);
      if (product) names.push(product.name);
    }
  }
  if (names.length === 0) return "Shop look";
  if (lines.length > 3) return `${names.join(" · ")} +${lines.length - 3}`;
  return names.join(" · ");
}
