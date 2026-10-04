import type { Infer } from "convex/values";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { vSlot } from "../shared/validators";
import type { Slot } from "../shared/wardrobe";
import { SLOTS, slotForCategory } from "../shared/wardrobe";
import { inferProductWardrobeCategory } from "../shared/wardrobeMatch";
import { vendorSellable } from "../shared/vendors";
import {
  addCartLine,
  coverUrl,
  isProductActive,
  loadVariants,
  productVisibleTo,
  vendorFor,
  type VendorCache,
} from "./products";
import { pricedUnitInr } from "./offers";

type Ctx = QueryCtx | MutationCtx;

export const vShopLookLine = v.object({
  slot: vSlot,
  productId: v.id("products"),
  variantId: v.union(v.id("productVariants"), v.null()),
  priceInr: v.number(),
  name: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  vendorName: v.string(),
});

export const vShopLookView = v.object({
  _id: v.id("shopLooks"),
  threadId: v.id("threads"),
  name: v.string(),
  brief: v.string(),
  reasoning: v.string(),
  occasion: v.union(v.string(), v.null()),
  lines: v.array(vShopLookLine),
  totalInr: v.number(),
  createdAt: v.number(),
});

export type ShopLookView = Infer<typeof vShopLookView>;

export const vShopSearchHit = v.object({
  productId: v.id("products"),
  name: v.string(),
  slot: v.union(vSlot, v.null()),
  category: v.string(),
  colours: v.array(v.string()),
  priceInr: v.number(),
  vendorName: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  score: v.number(),
});

export type ShopSearchHit = Infer<typeof vShopSearchHit>;

const SHOP_LOOK_LIST_LIMIT = 50;

export async function toShopLookView(ctx: Ctx, look: Doc<"shopLooks">): Promise<ShopLookView> {
  const cache: VendorCache = new Map();
  const lines = await Promise.all(
    look.lines.map(async (line) => {
      const product = await ctx.db.get(line.productId);
      const vendor = product ? await vendorFor(ctx, product.vendorId, cache) : null;
      return {
        slot: line.slot,
        productId: line.productId,
        variantId: line.variantId ?? null,
        priceInr: line.priceInr,
        name: line.name,
        imageUrl: product ? await coverUrl(ctx, product) : null,
        vendorName: vendor?.name ?? "",
      };
    }),
  );
  return {
    _id: look._id,
    threadId: look.threadId,
    name: look.name,
    brief: look.brief,
    reasoning: look.reasoning,
    occasion: look.occasion ?? null,
    lines,
    totalInr: look.totalInr,
    createdAt: look.createdAt,
  };
}

export async function listShopLooksForThread(
  ctx: Ctx,
  threadId: Id<"threads">,
): Promise<Doc<"shopLooks">[]> {
  const rows = await ctx.db
    .query("shopLooks")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .order("desc")
    .take(SHOP_LOOK_LIST_LIMIT);
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

export function slotHintForProduct(product: Doc<"products">): Slot | null {
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

/** First active variant with stock, for stylist add-look auto-pick. */
export async function firstInStockVariant(
  ctx: Ctx,
  productId: Id<"products">,
): Promise<Doc<"productVariants"> | null> {
  const variants = (await loadVariants(ctx, productId)).filter((row) => row.active && row.stock > 0);
  return variants[0] ?? null;
}

export type ShopLookLineInput = {
  slot: Slot;
  productId: Id<"products">;
  name?: string;
};

export async function composeOneShopLook(
  ctx: MutationCtx,
  user: Doc<"users">,
  thread: Doc<"threads">,
  input: {
    name: string;
    brief: string;
    reasoning: string;
    occasion?: string;
    lines: ShopLookLineInput[];
  },
): Promise<{ shopLookId: Id<"shopLooks"> | null; name: string; lines: ShopLookView["lines"]; problems: string[]; totalInr: number }> {
  const name = input.name.trim();
  const problems: string[] = [];
  if (!name) problems.push("every look needs a name");
  if (input.lines.length < 1) problems.push("add at least one product");
  if (input.lines.length > 8) problems.push("at most eight products per look");

  const usedSlots = new Set<string>();
  const resolved: Doc<"shopLooks">["lines"] = [];
  const cache: VendorCache = new Map();

  for (const line of input.lines) {
    if (!SLOTS.includes(line.slot)) {
      problems.push(`unknown slot ${line.slot}`);
      continue;
    }
    const slotKey = line.slot === "accessories" ? `accessories:${line.productId}` : line.slot;
    if (line.slot !== "accessories" && usedSlots.has(line.slot)) {
      problems.push(`only one product in ${line.slot}`);
      continue;
    }
    usedSlots.add(slotKey);

    const product = await ctx.db.get(line.productId);
    const vendor = product ? await vendorFor(ctx, product.vendorId, cache) : null;
    if (!product || !product.aiRecommend || !isProductActive(product) || !vendor || !vendorSellable(vendor)) {
      problems.push(`${line.name?.trim() || "a product"} is not available for AI shop looks`);
      continue;
    }
    if (!productVisibleTo(user.prefs.presentation, product, vendor)) {
      problems.push(`${product.name} does not match this shopper's presentation`);
      continue;
    }
    const variant = await firstInStockVariant(ctx, product._id);
    if (!variant && (product.hasVariants || (await loadVariants(ctx, product._id)).length > 0)) {
      // Single default variant with zero stock, or all sold out.
      const any = await loadVariants(ctx, product._id);
      if (any.length > 0 && !any.some((row) => row.active && row.stock > 0)) {
        problems.push(`${product.name} is sold out`);
        continue;
      }
    }
    const priceInr = await pricedUnitInr(ctx, product, variant);
    resolved.push({
      slot: line.slot,
      productId: product._id,
      ...(variant ? { variantId: variant._id } : {}),
      priceInr,
      name: product.name,
    });
  }

  if (problems.length > 0 || resolved.length === 0) {
    return { shopLookId: null, name: name || "Shop look", lines: [], problems, totalInr: 0 };
  }

  const totalInr = resolved.reduce((sum, row) => sum + row.priceInr, 0);
  const shopLookId = await ctx.db.insert("shopLooks", {
    userId: user._id,
    threadId: thread._id,
    name,
    brief: input.brief.trim(),
    reasoning: input.reasoning.trim(),
    ...(input.occasion?.trim() ? { occasion: input.occasion.trim() } : {}),
    lines: resolved,
    totalInr,
    createdAt: Date.now(),
  });
  await ctx.db.patch(thread._id, { lastMessageAt: Date.now() });
  const view = await toShopLookView(ctx, (await ctx.db.get(shopLookId))!);
  return { shopLookId, name, lines: view.lines, problems: [], totalInr };
}

export type AddLookResult = {
  added: number;
  skipped: Array<{ productId: Id<"products">; name: string; reason: string }>;
  totalInr: number;
};

export async function addShopLookToCart(
  ctx: MutationCtx,
  user: Doc<"users">,
  shopLookId: Id<"shopLooks">,
): Promise<AddLookResult> {
  const look = await ctx.db.get(shopLookId);
  if (!look || look.userId !== user._id) throw appError("NOT_FOUND", "That shop look no longer exists.");

  const skipped: AddLookResult["skipped"] = [];
  let added = 0;
  let totalInr = 0;

  for (const line of look.lines) {
    const product = await ctx.db.get(line.productId);
    const vendor = product?.vendorId ? await ctx.db.get(product.vendorId) : null;
    if (!product || !productVisibleTo(user.prefs.presentation, product, vendor)) {
      skipped.push({ productId: line.productId, name: line.name, reason: "no longer available" });
      continue;
    }
    const variant = (line.variantId ? await ctx.db.get(line.variantId) : null) ?? (await firstInStockVariant(ctx, product._id));
    if (!variant) {
      const variants = await loadVariants(ctx, product._id);
      if (variants.length > 1 || (variants.length === 1 && variants[0]!.stock < 1)) {
        skipped.push({ productId: line.productId, name: line.name, reason: "sold out" });
        continue;
      }
    }
    if (variant && variant.stock < 1) {
      skipped.push({ productId: line.productId, name: line.name, reason: "sold out" });
      continue;
    }
    try {
      await addCartLine(ctx, user, product._id, {
        ...(variant ? { variantId: variant._id } : {}),
        quantity: 1,
        addedFrom: "agent",
      });
      added += 1;
      totalInr += await pricedUnitInr(ctx, product, variant);
    } catch (error) {
      const message =
        error && typeof error === "object" && "data" in error
          ? String((error as { data?: { message?: string } }).data?.message ?? "could not add")
          : "could not add";
      skipped.push({ productId: line.productId, name: line.name, reason: message });
    }
  }

  return { added, skipped, totalInr };
}
