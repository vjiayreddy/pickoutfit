import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { PRODUCT_CATEGORIES, type ProductCategory, type vRailProductView } from "../shared/products";
import { vendorSellable } from "../shared/vendors";
import type { Presentation } from "../shared/wardrobe";
import {
  bestRelation,
  relationSortRank,
  type MatchItem,
} from "../shared/wardrobeMatch";
import { listForUser } from "./items";
import {
  applyOffersToViews,
  loadLiveAutoOffers,
  pickOfferForProduct,
  withOfferPricing,
  type LiveOfferBanner,
} from "./offers";
import { toProductView, toProductViews, vendorFor, type ProductView, type VendorCache } from "./products";

const CATALOG_PAGE = 48;
const STOREFRONT_PAGE = 96;

export type RailProductView = Infer<typeof vRailProductView>;

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
  return applyOffersByVendor(ctx, views);
}

/** Group by vendor so each store's live auto offers apply once. */
async function applyOffersByVendor(ctx: QueryCtx, views: ProductView[]): Promise<ProductView[]> {
  if (views.length === 0) return views;
  const byVendor = new Map<Id<"vendors">, ProductView[]>();
  for (const view of views) {
    const list = byVendor.get(view.vendorId) ?? [];
    list.push(view);
    byVendor.set(view.vendorId, list);
  }
  const priced = new Map<Id<"products">, ProductView>();
  for (const [vendorId, group] of byVendor) {
    const { products } = await applyOffersToViews(ctx, vendorId, group);
    for (const product of products) priced.set(product.id, product);
  }
  return views.map((view) => priced.get(view.id) ?? { ...view, offer: null });
}

/** Catalog for the wardrobe rail: tagged against owned pieces and reordered for buy intent. */
export async function listCatalogForWardrobe(
  ctx: QueryCtx,
  userId: Id<"users">,
  category: ProductCategory,
  presentation: Presentation,
  opts: { vendorId?: Id<"vendors">; limit?: number } = {},
): Promise<RailProductView[]> {
  const [views, wardrobe] = await Promise.all([
    listCatalog(ctx, category, presentation, opts),
    listForUser(ctx, userId, { status: "ready" }),
  ]);

  const matchItems: MatchItem[] = wardrobe.map((item) => ({
    _id: item._id,
    name: item.name,
    category: item.category,
    subcategory: item.subcategory,
    colours: item.colours,
    pattern: item.pattern,
    material: item.material,
    formality: item.formality,
  }));

  const itemImageUrls = new Map<string, string | null>();
  async function imageFor(itemId: string): Promise<string | null> {
    if (itemImageUrls.has(itemId)) return itemImageUrls.get(itemId) ?? null;
    const item = wardrobe.find((row) => row._id === itemId);
    const url = item?.storageId ? await ctx.storage.getUrl(item.storageId) : null;
    itemImageUrls.set(itemId, url);
    return url;
  }

  const rail: RailProductView[] = [];
  for (const view of views) {
    const match = bestRelation(view, matchItems);
    if (!match) {
      rail.push({ ...view, relation: null });
      continue;
    }
    rail.push({
      ...view,
      relation: {
        kind: match.kind,
        itemId: match.itemId as Id<"items">,
        itemName: match.itemName,
        itemImageUrl: await imageFor(match.itemId),
      },
    });
  }

  rail.sort((a, b) => {
    const rank = relationSortRank(a.relation?.kind ?? null) - relationSortRank(b.relation?.kind ?? null);
    if (rank !== 0) return rank;
    return b.createdAt - a.createdAt;
  });
  return rail;
}

/**
 * Cross-vendor shop browse: active products for the shopper's presentation from
 * sellable vendors. Optional category filter; otherwise merges all categories.
 */
export async function listShopCatalog(
  ctx: QueryCtx,
  presentation: Presentation,
  opts: { category?: ProductCategory; limit?: number } = {},
): Promise<ProductView[]> {
  const limit = opts.limit ?? STOREFRONT_PAGE;
  if (opts.category) {
    return listCatalog(ctx, opts.category, presentation, { limit });
  }
  const pages = await Promise.all(
    PRODUCT_CATEGORIES.map((category) => listCatalog(ctx, category, presentation, { limit })),
  );
  const byId = new Map<Id<"products">, ProductView>();
  for (const product of pages.flat()) {
    byId.set(product.id, product);
  }
  return [...byId.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** Everything a store has live, for its storefront page — with live auto-offer pricing. */
export async function listStorefront(
  ctx: QueryCtx,
  vendor: Doc<"vendors">,
): Promise<{ products: ProductView[]; banner: LiveOfferBanner | null }> {
  if (!vendorSellable(vendor)) return { products: [], banner: null };
  const products = await ctx.db
    .query("products")
    .withIndex("by_vendorId_and_status", (q) => q.eq("vendorId", vendor._id).eq("status", "active"))
    .order("desc")
    .take(STOREFRONT_PAGE);
  const views = await toProductViews(ctx, products);
  return applyOffersToViews(ctx, vendor._id, views);
}

async function withVendorOffer(
  ctx: QueryCtx,
  vendor: Doc<"vendors">,
  view: ProductView,
): Promise<ProductView> {
  const offers = await loadLiveAutoOffers(ctx, vendor._id);
  const offer = await pickOfferForProduct(
    ctx,
    { _id: view.id, category: view.category, attributes: view.attributes },
    offers,
    view.priceInr,
  );
  return withOfferPricing(view, offer);
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
  const view = await toProductView(ctx, product, new Map([[vendor._id, vendor]]));
  return withVendorOffer(ctx, vendor, view);
}

export async function getPublicProductById(ctx: QueryCtx, productId: Id<"products">): Promise<ProductView> {
  const product = await ctx.db.get(productId);
  const vendor = product?.vendorId ? await ctx.db.get(product.vendorId) : null;
  if (!product || product.status !== "active" || !vendor || !vendorSellable(vendor)) {
    throw appError("NOT_FOUND", "That product is not available.");
  }
  const view = await toProductView(ctx, product, new Map([[vendor._id, vendor]]));
  return withVendorOffer(ctx, vendor, view);
}

/** Other live products cut from the same look photo. */
export async function shopTheLook(
  ctx: QueryCtx,
  product: Doc<"products">,
): Promise<ProductView[]> {
  if (!product.sourceUploadId || !product.vendorId) return [];
  const siblings = await ctx.db
    .query("products")
    .withIndex("by_sourceUploadId", (q) => q.eq("sourceUploadId", product.sourceUploadId))
    .take(24);
  const views = await toProductViews(
    ctx,
    siblings.filter((sibling) => sibling._id !== product._id && sibling.status === "active"),
  );
  const { products } = await applyOffersToViews(ctx, product.vendorId, views);
  return products;
}

export type MarketplaceLook = {
  uploadId: Id<"uploads">;
  imageUrl: string;
  vendorName: string;
  vendorSlug: string;
  vendorLogoUrl: string | null;
  totalInr: number;
  createdAt: number;
  products: Array<{
    id: Id<"products">;
    name: string;
    slug: string;
    imageUrl: string | null;
    priceInr: number;
  }>;
};

const MARKETPLACE_LOOK_LIMIT = 48;

/**
 * Cross-store "Shop the look" cards: active products that share a look photo
 * (2+ pieces) from sellable vendors.
 */
export async function listMarketplaceLooks(ctx: QueryCtx): Promise<MarketplaceLook[]> {
  const vendors = await ctx.db
    .query("vendors")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .take(48);
  const looks: MarketplaceLook[] = [];

  for (const vendor of vendors) {
    if (!vendorSellable(vendor)) continue;
    const products = await ctx.db
      .query("products")
      .withIndex("by_vendorId_and_status", (q) => q.eq("vendorId", vendor._id).eq("status", "active"))
      .order("desc")
      .take(STOREFRONT_PAGE);

    const byUpload = new Map<
      Id<"uploads">,
      { products: Doc<"products">[]; referenceStorageId?: Id<"_storage">; createdAt: number }
    >();
    for (const product of products) {
      if (!product.sourceUploadId) continue;
      const bucket = byUpload.get(product.sourceUploadId) ?? {
        products: [],
        createdAt: product.createdAt,
      };
      bucket.products.push(product);
      if (product.referenceStorageId) bucket.referenceStorageId = product.referenceStorageId;
      bucket.createdAt = Math.max(bucket.createdAt, product.createdAt);
      byUpload.set(product.sourceUploadId, bucket);
    }

    const logoUrl = vendor.logoStorageId ? await ctx.storage.getUrl(vendor.logoStorageId) : null;
    const views = await toProductViews(ctx, products);
    const { products: priced } = await applyOffersToViews(ctx, vendor._id, views);
    const priceById = new Map(priced.map((row) => [row.id, row]));

    for (const [uploadId, bucket] of byUpload) {
      if (bucket.products.length < 2 || !bucket.referenceStorageId) continue;
      const imageUrl = await ctx.storage.getUrl(bucket.referenceStorageId);
      if (!imageUrl) continue;
      const lookProducts = bucket.products
        .map((doc) => priceById.get(doc._id))
        .filter((row): row is ProductView => Boolean(row))
        .map((row) => ({
          id: row.id,
          name: row.name,
          slug: row.slug,
          imageUrl: row.imageUrl,
          priceInr: row.priceInr,
        }));
      if (lookProducts.length < 2) continue;
      looks.push({
        uploadId,
        imageUrl,
        vendorName: vendor.name,
        vendorSlug: vendor.slug,
        vendorLogoUrl: logoUrl,
        totalInr: lookProducts.reduce((sum, row) => sum + row.priceInr, 0),
        createdAt: bucket.createdAt,
        products: lookProducts,
      });
      if (looks.length >= MARKETPLACE_LOOK_LIMIT) {
        return looks.sort((a, b) => b.createdAt - a.createdAt);
      }
    }
  }

  return looks.sort((a, b) => b.createdAt - a.createdAt);
}
