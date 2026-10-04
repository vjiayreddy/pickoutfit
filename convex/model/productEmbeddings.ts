import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isProductActive } from "./products";

type Ctx = QueryCtx | MutationCtx;

export async function getProductEmbedding(
  ctx: Ctx,
  productId: Id<"products">,
): Promise<Doc<"productEmbeddings"> | null> {
  return ctx.db
    .query("productEmbeddings")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .unique();
}

export async function deleteProductEmbedding(
  ctx: MutationCtx,
  productId: Id<"products">,
): Promise<void> {
  const existing = await getProductEmbedding(ctx, productId);
  if (existing) await ctx.db.delete(existing._id);
}

export async function upsertProductEmbedding(
  ctx: MutationCtx,
  product: Doc<"products">,
  embedding: number[],
): Promise<void> {
  if (!product.vendorId) return;
  const existing = await getProductEmbedding(ctx, product._id);
  if (existing) {
    await ctx.db.patch(existing._id, { embedding, vendorId: product.vendorId });
    return;
  }
  await ctx.db.insert("productEmbeddings", {
    productId: product._id,
    vendorId: product.vendorId,
    embedding,
  });
}

/** True when this product should have a live style embedding. */
export function shouldEmbedProduct(product: Doc<"products">): boolean {
  return Boolean(product.aiRecommend) && isProductActive(product) && Boolean(product.vendorId);
}

/**
 * Schedules an embed when the product should be searchable by the stylist,
 * or deletes the row when it should not. Call after create/update/publish/archive.
 */
export async function syncProductEmbeddingSchedule(
  ctx: MutationCtx,
  productId: Id<"products">,
): Promise<void> {
  const product = await ctx.db.get(productId);
  if (!product || !shouldEmbedProduct(product)) {
    await deleteProductEmbedding(ctx, productId);
    return;
  }
  await ctx.scheduler.runAfter(0, internal.ai.productEmbed.embedProduct, { productId });
}
