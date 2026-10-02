import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  applyDiscount,
  attributeValue,
  type DiscountKind,
  type OfferKind,
  type ProductAttribute,
  type ProductCategory,
} from "../shared/products";

type Ctx = QueryCtx | MutationCtx;

/** Minimal product view shape so this module doesn't import model/products (cycle). */
type PricedView = {
  id: Id<"products">;
  category: ProductCategory;
  attributes: ProductAttribute[];
  priceInr: number;
  compareAtPriceInr: number | null;
  offer: AppliedOffer | null;
  variants: Array<{
    priceInr: number;
    compareAtPriceInr: number | null;
  }>;
};

/** Shopper-facing offer chip / banner payload. */
export type AppliedOffer = {
  id: Id<"discounts">;
  name: string;
  badge: string | null;
  kind: DiscountKind;
  value: number;
  offerKind: OfferKind;
  endsAt: number | null;
};

export type LiveOfferBanner = AppliedOffer & {
  startsAt: number;
  scopeLabel: string;
};

type MatchProduct = {
  _id: Id<"products">;
  category: ProductCategory;
  attributes?: ProductAttribute[] | null;
};

/** Auto offers only (no code). Code promos stay for checkout entry later. */
export function isAutoOfferLive(discount: Doc<"discounts">, now: number): boolean {
  if (!discount.active) return false;
  if (discount.code) return false;
  if (now < discount.startsAt) return false;
  if (discount.endsAt !== undefined && now >= discount.endsAt) return false;
  if (discount.maxUses !== undefined && discount.usedCount >= discount.maxUses) return false;
  return true;
}

export async function loadLiveAutoOffers(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  now: number = Date.now(),
): Promise<Doc<"discounts">[]> {
  const rows = await ctx.db
    .query("discounts")
    .withIndex("by_vendorId_and_active", (q) => q.eq("vendorId", vendorId).eq("active", true))
    .take(50);
  return rows
    .filter((row) => isAutoOfferLive(row, now))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

async function collectionProductSet(
  ctx: Ctx,
  collectionId: Id<"collections"> | undefined,
): Promise<Set<Id<"products">> | null> {
  if (!collectionId) return null;
  const collection = await ctx.db.get(collectionId);
  if (!collection || !collection.active) return null;
  return new Set(collection.productIds);
}

export async function productMatchesOffer(
  ctx: Ctx,
  product: MatchProduct,
  offer: Doc<"discounts">,
): Promise<boolean> {
  switch (offer.scope) {
    case "all":
      return true;
    case "category":
      return Boolean(offer.categories?.includes(product.category));
    case "products":
      return Boolean(offer.productIds?.includes(product._id));
    case "collection": {
      const set = await collectionProductSet(ctx, offer.collectionId);
      return Boolean(set?.has(product._id));
    }
    case "attribute": {
      const key = offer.attributeKey;
      if (!key || !offer.attributeValues?.length) return false;
      const value = attributeValue(product.attributes ?? undefined, key)?.toLowerCase();
      if (!value) return false;
      return offer.attributeValues.some((entry) => entry.trim().toLowerCase() === value);
    }
    default:
      return false;
  }
}

function saleBeats(a: Doc<"discounts">, b: Doc<"discounts">, listPrice: number): boolean {
  const aPrice = applyDiscount(listPrice, a);
  const bPrice = applyDiscount(listPrice, b);
  if (aPrice !== bPrice) return aPrice < bPrice;
  return (a.priority ?? 0) >= (b.priority ?? 0);
}

/** Best live auto offer for a product (lowest sale price, then priority). */
export async function pickOfferForProduct(
  ctx: Ctx,
  product: MatchProduct,
  offers: Doc<"discounts">[],
  listPrice: number,
): Promise<Doc<"discounts"> | null> {
  let best: Doc<"discounts"> | null = null;
  for (const offer of offers) {
    if (!(await productMatchesOffer(ctx, product, offer))) continue;
    if (!best || saleBeats(offer, best, listPrice)) best = offer;
  }
  return best;
}

export function toAppliedOffer(offer: Doc<"discounts">): AppliedOffer {
  return {
    id: offer._id,
    name: offer.name,
    badge: offer.badge ?? null,
    kind: offer.kind,
    value: offer.value,
    offerKind: offer.offerKind ?? "standard",
    endsAt: offer.endsAt ?? null,
  };
}

function scopeLabel(offer: Doc<"discounts">): string {
  if (offer.scope === "all") return "all products";
  if (offer.scope === "category" && offer.categories?.length) {
    return offer.categories.join(", ").replace(/_/g, " ");
  }
  if (offer.scope === "collection") return "a collection";
  if (offer.scope === "products") return "selected products";
  if (offer.scope === "attribute" && offer.attributeKey) {
    return `${offer.attributeKey}: ${(offer.attributeValues ?? []).join(", ")}`;
  }
  return "this store";
}

/** Banner candidate: highest-priority live offer (prefer ones with an end time). */
export function pickBannerOffer(offers: Doc<"discounts">[]): LiveOfferBanner | null {
  if (offers.length === 0) return null;
  const timed = offers.filter((offer) => offer.endsAt !== undefined);
  const pick = timed[0] ?? offers[0];
  if (!pick) return null;
  return {
    ...toAppliedOffer(pick),
    startsAt: pick.startsAt,
    scopeLabel: scopeLabel(pick),
  };
}

export function withOfferPricing<T extends PricedView>(view: T, offer: Doc<"discounts"> | null): T {
  if (!offer) return { ...view, offer: null };
  const listPrice = view.priceInr;
  const salePrice = applyDiscount(listPrice, offer);
  const compareAt =
    salePrice < listPrice
      ? Math.max(view.compareAtPriceInr ?? 0, listPrice)
      : view.compareAtPriceInr;
  return {
    ...view,
    priceInr: salePrice,
    compareAtPriceInr: compareAt && compareAt > salePrice ? compareAt : null,
    offer: toAppliedOffer(offer),
    variants: view.variants.map((variant) => {
      const variantList = variant.priceInr;
      const variantSale = applyDiscount(variantList, offer);
      const variantCompare =
        variantSale < variantList
          ? Math.max(variant.compareAtPriceInr ?? 0, variantList)
          : variant.compareAtPriceInr;
      return {
        ...variant,
        priceInr: variantSale,
        compareAtPriceInr: variantCompare && variantCompare > variantSale ? variantCompare : null,
      };
    }),
  };
}

/** Apply live auto offers to a list of product views for one vendor. */
export async function applyOffersToViews<T extends PricedView>(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  views: T[],
  now: number = Date.now(),
): Promise<{ products: T[]; banner: LiveOfferBanner | null }> {
  const offers = await loadLiveAutoOffers(ctx, vendorId, now);
  const banner = pickBannerOffer(offers);
  if (offers.length === 0) {
    return { products: views.map((view) => ({ ...view, offer: null })), banner: null };
  }
  const products: T[] = [];
  for (const view of views) {
    const match: MatchProduct = {
      _id: view.id,
      category: view.category,
      attributes: view.attributes,
    };
    const offer = await pickOfferForProduct(ctx, match, offers, view.priceInr);
    products.push(withOfferPricing(view, offer));
  }
  return { products, banner };
}

/** Unit price after the best live auto offer (for cart / checkout). */
export async function pricedUnitInr(
  ctx: Ctx,
  product: Doc<"products">,
  variant: Doc<"productVariants"> | null | undefined,
  now: number = Date.now(),
): Promise<number> {
  const list = variant?.priceInr ?? product.priceInr;
  if (!product.vendorId) return list;
  const offers = await loadLiveAutoOffers(ctx, product.vendorId, now);
  const offer = await pickOfferForProduct(
    ctx,
    {
      _id: product._id,
      category: product.category,
      attributes: product.attributes,
    },
    offers,
    list,
  );
  return applyDiscount(list, offer);
}
