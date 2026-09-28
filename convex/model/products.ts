import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  MAX_CART_LINES,
  MAX_CART_QTY,
  type ProductCategory,
} from "../shared/products";
import type { Presentation } from "../shared/wardrobe";

type Ctx = QueryCtx | MutationCtx;

export type ProductInput = {
  category: ProductCategory;
  presentation: Presentation;
  name: string;
  priceInr: number;
  storageId?: Id<"_storage">;
  active: boolean;
};

export function cleanProductInput(input: ProductInput): ProductInput {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw appError("INVALID_INPUT", "Product name must be 1–80 characters.");
  }
  if (!Number.isInteger(input.priceInr) || input.priceInr < 0 || input.priceInr > 10_000_000) {
    throw appError("INVALID_INPUT", "Price must be a whole number of rupees.");
  }
  return { ...input, name };
}

export async function toProductView(ctx: Ctx, product: Doc<"products">) {
  return {
    id: product._id,
    category: product.category,
    presentation: product.presentation,
    name: product.name,
    priceInr: product.priceInr,
    active: product.active,
    imageUrl: product.storageId ? await ctx.storage.getUrl(product.storageId) : null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export async function listCatalog(
  ctx: QueryCtx,
  category: ProductCategory,
  presentation: Presentation,
) {
  const presentations: Presentation[] =
    presentation === "neutral" ? ["masculine", "feminine", "neutral"] : [presentation, "neutral"];
  const pages = await Promise.all(
    presentations.map((value) =>
      ctx.db
        .query("products")
        .withIndex("by_category_and_presentation", (q) =>
          q.eq("category", category).eq("presentation", value),
        )
        .take(48),
    ),
  );
  const products = pages
    .flat()
    .filter((product) => product.active)
    .sort((a, b) => b.createdAt - a.createdAt);
  return Promise.all(products.map((product) => toProductView(ctx, product)));
}

export async function listAllProducts(ctx: QueryCtx) {
  const products = await ctx.db.query("products").withIndex("by_createdAt").order("desc").take(200);
  return Promise.all(products.map((product) => toProductView(ctx, product)));
}

export async function createProduct(ctx: MutationCtx, input: ProductInput) {
  const clean = cleanProductInput(input);
  const now = Date.now();
  return ctx.db.insert("products", {
    category: clean.category,
    presentation: clean.presentation,
    name: clean.name,
    priceInr: clean.priceInr,
    ...(clean.storageId ? { storageId: clean.storageId } : {}),
    active: clean.active,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateProduct(
  ctx: MutationCtx,
  productId: Id<"products">,
  input: ProductInput,
) {
  const product = await ctx.db.get(productId);
  if (!product) throw appError("NOT_FOUND", "That product doesn't exist.");
  const clean = cleanProductInput(input);
  const nextStorage = clean.storageId ?? product.storageId;
  if (clean.storageId && product.storageId && product.storageId !== clean.storageId) {
    await ctx.storage.delete(product.storageId);
  }
  await ctx.db.patch(product._id, {
    category: clean.category,
    presentation: clean.presentation,
    name: clean.name,
    priceInr: clean.priceInr,
    storageId: nextStorage,
    active: clean.active,
    updatedAt: Date.now(),
  });
}

export async function setProductActive(
  ctx: MutationCtx,
  productId: Id<"products">,
  active: boolean,
) {
  const product = await ctx.db.get(productId);
  if (!product) throw appError("NOT_FOUND", "That product doesn't exist.");
  await ctx.db.patch(product._id, { active, updatedAt: Date.now() });
}

export function productVisibleTo(userPresentation: Presentation, product: Doc<"products">): boolean {
  if (!product.active) return false;
  if (userPresentation === "neutral") return true;
  return product.presentation === userPresentation || product.presentation === "neutral";
}

export async function getOrCreateCart(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing;
  const cartId = await ctx.db.insert("carts", { userId, updatedAt: Date.now() });
  const created = await ctx.db.get(cartId);
  if (!created) throw appError("NOT_FOUND", "Could not open a cart.");
  return created;
}

export async function cartLines(ctx: Ctx, cartId: Id<"carts">) {
  return ctx.db
    .query("cartItems")
    .withIndex("by_cartId", (q) => q.eq("cartId", cartId))
    .take(MAX_CART_LINES);
}

export async function toCartView(ctx: Ctx, userId: Id<"users">) {
  const cart = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!cart) return { lines: [], itemCount: 0, totalInr: 0 };
  const rows = await cartLines(ctx, cart._id);
  const lines = await Promise.all(
    rows.map(async (line) => {
      const product = await ctx.db.get(line.productId);
      const available = product ? product.active : false;
      return {
        id: line._id,
        productId: line.productId,
        name: line.name,
        quantity: line.quantity,
        priceInr: line.priceInr,
        imageUrl: product?.storageId ? await ctx.storage.getUrl(product.storageId) : null,
        available,
      };
    }),
  );
  const availableLines = lines.filter((line) => line.available);
  return {
    lines,
    itemCount: availableLines.reduce((sum, line) => sum + line.quantity, 0),
    totalInr: availableLines.reduce((sum, line) => sum + line.priceInr * line.quantity, 0),
  };
}

export async function addCartLine(
  ctx: MutationCtx,
  user: Doc<"users">,
  productId: Id<"products">,
  quantity: number,
) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_QTY) {
    throw appError("INVALID_INPUT", `Quantity must be 1–${MAX_CART_QTY}.`);
  }
  const product = await ctx.db.get(productId);
  if (!product || !productVisibleTo(user.prefs.presentation, product)) {
    throw appError("NOT_FOUND", "That product is not available.");
  }
  const cart = await getOrCreateCart(ctx, user._id);
  const existing = await ctx.db
    .query("cartItems")
    .withIndex("by_cartId_and_productId", (q) =>
      q.eq("cartId", cart._id).eq("productId", productId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      quantity: Math.min(MAX_CART_QTY, existing.quantity + quantity),
      priceInr: product.priceInr,
      name: product.name,
    });
  } else {
    const count = (await cartLines(ctx, cart._id)).length;
    if (count >= MAX_CART_LINES) {
      throw appError("INVALID_INPUT", "The bag is full. Remove something before adding more.");
    }
    await ctx.db.insert("cartItems", {
      cartId: cart._id,
      userId: user._id,
      productId,
      quantity,
      priceInr: product.priceInr,
      name: product.name,
    });
  }
  await ctx.db.patch(cart._id, { updatedAt: Date.now() });
}

export async function setCartQuantity(
  ctx: MutationCtx,
  userId: Id<"users">,
  lineId: Id<"cartItems">,
  quantity: number,
) {
  const line = await ctx.db.get(lineId);
  if (!line || line.userId !== userId) throw appError("NOT_FOUND", "That bag line doesn't exist.");
  if (quantity === 0) {
    await ctx.db.delete(line._id);
    return;
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_QTY) {
    throw appError("INVALID_INPUT", `Quantity must be 1–${MAX_CART_QTY}.`);
  }
  await ctx.db.patch(line._id, { quantity });
}
