"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Store } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  groupAttributeIdsByType,
  productMatchesFilters,
} from "@convex/shared/productFilters";
import { EmptyState } from "@/components/common/EmptyState";
import { AppHeaderTitle } from "@/components/layout/app-header";
import { ProductFilterLayout } from "@/components/shop/ProductFilters";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import { StoreOfferBanner } from "@/components/shop/StoreOfferBanner";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/client-errors";
import { formatInr } from "@/lib/format";
import {
  attributeIdsFromFacetParams,
  facetParamsFromAttributeIds,
  parseFacetSearchParams,
  storeCatalogHref,
} from "@/lib/product-filters";
import { routes } from "@/lib/routes";

type StorefrontProduct = NonNullable<FunctionReturnType<typeof api.products.storefront>>["products"][number];

type Look = { uploadId: Id<"uploads">; imageUrl: string; products: StorefrontProduct[] };

/** Products cut from the same look photo, shown together. Only looks with two or more live pieces. */
function groupLooks(products: StorefrontProduct[]): Look[] {
  const byUpload = new Map<Id<"uploads">, Look>();
  for (const product of products) {
    if (!product.sourceUploadId || !product.referenceImageUrl) continue;
    const look = byUpload.get(product.sourceUploadId) ?? {
      uploadId: product.sourceUploadId,
      imageUrl: product.referenceImageUrl,
      products: [],
    };
    look.products.push(product);
    byUpload.set(product.sourceUploadId, look);
  }
  return [...byUpload.values()].filter((look) => look.products.length > 1);
}

export function Storefront({
  slug,
  categoryPath = "",
}: {
  slug: string;
  categoryPath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const data = useQuery(api.products.storefront, { slug });
  const add = useMutation(api.cart.add);
  const [pendingId, setPendingId] = useState<Id<"products"> | null>(null);

  const facetParams = useMemo(
    () => parseFacetSearchParams(searchParams),
    [searchParams],
  );
  const facets = useQuery(
    api.variants.facets,
    data ? { vendorId: data.vendor._id } : "skip",
  );
  const attributeIds = useMemo(
    () => attributeIdsFromFacetParams(facets ?? [], facetParams),
    [facets, facetParams],
  );

  const typeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const type of facets ?? []) {
      for (const value of type.values) {
        map.set(value._id, type._id);
      }
    }
    return map;
  }, [facets]);
  const selectedByType = useMemo(
    () => groupAttributeIdsByType(attributeIds, typeById),
    [attributeIds, typeById],
  );
  const hasActiveFilters = Boolean(categoryPath) || attributeIds.length > 0;

  const shown = useMemo(() => {
    if (!data) return [];
    return data.products.filter((product) =>
      productMatchesFilters(
        {
          categoryPath: product.categoryPath,
          variants: product.variants.map((variant) => ({
            active: variant.active,
            attributeIds: variant.attributeIds,
          })),
        },
        { categoryPath: categoryPath || null, selectedByType },
      ),
    );
  }, [data, categoryPath, selectedByType]);

  function navigateFilters(next: {
    categoryPath?: string;
    attributeIds?: string[];
    clearFacets?: boolean;
  }) {
    if (!data) return;
    const nextCategory =
      next.categoryPath !== undefined ? next.categoryPath : categoryPath;
    const nextIds = next.clearFacets ? [] : (next.attributeIds ?? attributeIds);
    const nextFacets =
      nextIds.length > 0 && facets
        ? facetParamsFromAttributeIds(facets, nextIds)
        : {};
    router.push(
      storeCatalogHref(data.vendor.slug, {
        categoryPath: nextCategory,
        facets: nextFacets,
      }),
    );
  }

  if (data === undefined) return <div className="h-64 animate-pulse bg-soft-cloud" />;
  if (data === null) {
    return (
      <EmptyState
        icon={Store}
        title="This store isn't open"
        description="It may be new, paused, or the link is wrong."
        action={<Button href={routes.shop}>Back to shop</Button>}
      />
    );
  }

  const { vendor, products, liveOffer } = data;
  const looks = groupLooks(products);

  async function addToBag(product: (typeof products)[number]) {
    if (pendingId) return;
    if (product.variants.filter((v) => v.active).length > 1) {
      router.push(routes.storeProduct(vendor.slug, product.slug));
      return;
    }
    setPendingId(product.id);
    try {
      await add({ productId: product.id, addedFrom: "store" });
      toast.success("Added to bag");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <AppHeaderTitle title={vendor.name} />
      {liveOffer ? <StoreOfferBanner offer={liveOffer} /> : null}
      <header className="space-y-4">
        <div className="relative aspect-[3/1] bg-soft-cloud sm:aspect-[4/1]">
          {vendor.bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vendor.bannerUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="flex items-start gap-4">
          <div className="-mt-12 size-20 shrink-0 overflow-hidden rounded-full bg-soft-cloud ring-4 ring-canvas">
            {vendor.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vendor.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-medium tracking-tight">{vendor.name}</h1>
            {vendor.description ? <p className="max-w-xl text-sm text-mute">{vendor.description}</p> : null}
          </div>
        </div>
      </header>

      {looks.length > 0 && !hasActiveFilters ? (
        <section className="space-y-3" aria-label="Shop the look">
          <h2 className="text-lg font-medium tracking-tight">Shop the look</h2>
          <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            {looks.map((look) => (
              <li key={look.uploadId} className="w-64 shrink-0 snap-start space-y-2">
                <div className="relative aspect-[4/5] bg-soft-cloud">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={look.imageUrl} alt="" className="h-full w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex gap-1 p-2">
                    {look.products.slice(0, 4).map((product) => (
                      <Link
                        key={product.id}
                        href={routes.storeProduct(vendor.slug, product.slug)}
                        className="size-12 overflow-hidden bg-canvas"
                        title={product.name}
                      >
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-contain" />
                        ) : null}
                      </Link>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-mute">
                  {look.products.length} {look.products.length === 1 ? "piece" : "pieces"} ·{" "}
                  {formatInr(look.products.reduce((sum, product) => sum + product.priceInr, 0))} for the look
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ProductFilterLayout
        vendorId={vendor._id}
        categoryPath={categoryPath}
        attributeIds={attributeIds}
        onCategoryPathChange={(path) =>
          navigateFilters({ categoryPath: path, clearFacets: true })
        }
        onAttributeIdsChange={(ids) => navigateFilters({ attributeIds: ids })}
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={Store}
            title={hasActiveFilters ? "No products match these filters" : "Nothing here yet"}
            description={
              hasActiveFilters
                ? "Try clearing a filter or picking another category."
                : "This store hasn't published any pieces."
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-3">
            {shown.map((product) => (
              <ShopProductCard
                key={product.id}
                product={product}
                pending={pendingId === product.id}
                onAdd={() => void addToBag(product)}
              />
            ))}
          </ul>
        )}
      </ProductFilterLayout>
    </div>
  );
}
