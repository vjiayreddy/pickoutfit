"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS, type ProductCategory } from "@convex/shared/products";
import { EmptyState } from "@/components/common/EmptyState";
import { AppHeaderTitle } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";
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

export function Storefront({ slug }: { slug: string }) {
  const router = useRouter();
  const data = useQuery(api.products.storefront, { slug });
  const add = useMutation(api.cart.add);
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [pendingId, setPendingId] = useState<Id<"products"> | null>(null);

  if (data === undefined) return <div className="h-64 animate-pulse bg-soft-cloud" />;
  if (data === null) {
    return <EmptyState icon={Store} title="This store isn't open" description="It may be new, paused, or the link is wrong." action={<Button href={routes.wardrobe}>Back to wardrobe</Button>} />;
  }

  const { vendor, products } = data;
  const categories = PRODUCT_CATEGORIES.filter((c) => products.some((p) => p.category === c));
  const shown = category === "all" ? products : products.filter((p) => p.category === category);
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

      {looks.length > 0 && category === "all" ? (
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

      {categories.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {(["all", ...categories] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={cn("h-10 rounded-full px-4 text-sm font-medium", category === item ? "bg-ink text-canvas" : "bg-canvas ring-1 ring-inset ring-hairline")}
            >
              {item === "all" ? "Everything" : PRODUCT_CATEGORY_LABELS[item]}
            </button>
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <EmptyState icon={Store} title="Nothing here yet" description="This store hasn't published any pieces." />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((product) => (
            <li key={product.id} className="space-y-2">
              <Link href={routes.storeProduct(vendor.slug, product.slug)} className="block space-y-2">
                <div className="relative aspect-square bg-soft-cloud">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  {product.totalStock === 0 ? <span className="absolute top-2 left-2 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-mute">Sold out</span> : null}
                </div>
                <p className="truncate text-sm font-medium">{product.name}</p>
                <p className="truncate text-xs text-mute">{product.subcategory}</p>
                <p className="text-sm">
                  {formatInr(product.priceInr)}
                  {product.compareAtPriceInr && product.compareAtPriceInr > product.priceInr ? (
                    <span className="ml-2 text-mute line-through">{formatInr(product.compareAtPriceInr)}</span>
                  ) : null}
                </p>
              </Link>
              <button
                type="button"
                disabled={pendingId === product.id || product.totalStock === 0}
                onClick={() => void addToBag(product)}
                className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-canvas disabled:opacity-50"
              >
                {pendingId === product.id ? "Adding…" : product.variants.filter((v) => v.active).length > 1 ? "Choose size" : "Add"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
