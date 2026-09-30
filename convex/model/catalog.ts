import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import type { ProductCategory } from "../shared/products";
import { vendorSellable } from "../shared/vendors";
import type { Presentation } from "../shared/wardrobe";
import { toProductView, toProductViews, vendorFor, type ProductView, type VendorCache } from "./products";

const CATALOG_PAGE = 48;
const STOREFRONT_PAGE = 96;

function presentationsFor(presentation: Presentation): Presentation[] {
  return presentation === "neutral" ? ["masculine", "feminine", "neutral"] : [presentation, "neutral"];
}

/** Drops products whose vendor can't sell right now. */
async function sellableOnly(ctx: QueryCtx, products: Doc<"products">[], cache: VendorCache) {
  const kept: Doc<"products">[] = [];
  for (const product of products) {
    const vendor = await vendorFor(ctx, product.vendorId, cache);
    if (vendor && vendorSellable(vendor)) kept.push(product);
  }
  return kept;
}

/** Active catalog rows in a category for a shopper's presentation, newest first. */
export async function listCatalog(
  ctx: QueryCtx,
  category: ProductCategory,
  presentation: Presentation,
  opts: { vendorId?: Id<"vendors">; limit?: number } = {},
): Promise<ProductView[]> {
  const cache: VendorCache = new Map();
  const pages = await Promise.all(
    presentationsFor(presentation).map((value) =>
      ctx.db
        .query("products")
        .withIndex("by_status_and_category_and_presentation", (q) =>
          q.eq("status", "active").eq("category", category).eq("presentation", value),
        )
        .order("desc")
        .take(opts.limit ?? CATALOG_PAGE),
    ),
  );
  let products = pages.flat();
  if (opts.vendorId) products = products.filter((product) => product.vendorId === opts.vendorId);
  products = await sellableOnly(ctx, products, cache);
  products.sort((a, b) => (b.publishedAt ?? b.createdAt) - (a.publishedAt ?? a.createdAt));
  const views: ProductView[] = [];
  for (const product of products.slice(0, opts.limit ?? CATALOG_PAGE)) {
    views.push(await toProductView(ctx, product, cache));
  }
  return views;
}

/** Everything a store has live, for its storefront page. */
export async function listStorefront(ctx: QueryCtx, vendor: Doc<"vendors">): Promise<ProductView[]> {
  if (!vendorSellable(vendor)) return [];
  const products = await ctx.db
    .query("products")
    .withIndex("by_vendorId_and_status", (q) => q.eq("vendorId", vendor._id).eq("status", "active"))
    .order("desc")
    .take(STOREFRONT_PAGE);
  return toProductViews(ctx, products);
}

export async function getPublicProduct(
  ctx: QueryCtx,
  vendorSlug: string,
  productSlug: string,
): Promise<ProductView | null> {
  const vendor = await ctx.db
    .query("vendors")
    .withIndex("by_slug", (q) => q.eq("slug", vendorSlug))
    .unique();
  if (!vendor || !vendorSellable(vendor)) return null;
  const product = await ctx.db
    .query("products")
    .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendor._id).eq("slug", productSlug))
    .unique();
  if (!product || product.status !== "active") return null;
  return toProductView(ctx, product, new Map([[vendor._id, vendor]]));
}

export async function getPublicProductById(ctx: QueryCtx, productId: Id<"products">): Promise<ProductView> {
  const product = await ctx.db.get(productId);
  const vendor = product?.vendorId ? await ctx.db.get(product.vendorId) : null;
  if (!product || product.status !== "active" || !vendor || !vendorSellable(vendor)) {
    throw appError("NOT_FOUND", "That product is not available.");
  }
  return toProductView(ctx, product, new Map([[vendor._id, vendor]]));
}

/** Other live products cut from the same look photo. */
export async function shopTheLook(
  ctx: QueryCtx,
  product: Doc<"products">,
): Promise<ProductView[]> {
  if (!product.sourceUploadId) return [];
  const siblings = await ctx.db
    .query("products")
    .withIndex("by_sourceUploadId", (q) => q.eq("sourceUploadId", product.sourceUploadId))
    .take(24);
  return toProductViews(
    ctx,
    siblings.filter((sibling) => sibling._id !== product._id && sibling.status === "active"),
  );
}
