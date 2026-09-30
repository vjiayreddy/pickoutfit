"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { Package, Plus, ScanLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { ProductStatus } from "@convex/shared/products";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

const FILTERS: { value: ProductStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "archived", label: "Archived" },
];

export function VendorProductList() {
  const [filter, setFilter] = useState<ProductStatus | "all">("all");
  const counts = useQuery(api.vendorProducts.counts, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.vendorProducts.list,
    { status: filter === "all" ? undefined : filter },
    { initialNumItems: 24 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const count = item.value === "all" ? null : counts?.[item.value];
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                  active ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                )}
              >
                {item.label}
                {count !== null && count !== undefined ? (
                  <span className={cn("ml-1.5", active ? "text-canvas/70" : "text-mute")}>{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button href={routes.vendorImport} variant="secondary" size="sm">
            <ScanLine />
            Import
          </Button>
          <Button href={routes.vendorNewProduct} size="sm">
            <Plus />
            Add product
          </Button>
        </div>
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="aspect-[4/5] animate-pulse bg-soft-cloud" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState
          icon={Package}
          title={filter === "all" ? "No products yet" : `Nothing ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`}
          description="Add a product by hand or import a look photo and we'll cut out every piece."
          action={<Button href={routes.vendorNewProduct}>Add product</Button>}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((product) => (
            <li key={product.id}>
              <Link href={routes.vendorProduct(product.id)} className="block space-y-2">
                <div className="relative aspect-square bg-soft-cloud">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                  <span
                    className={cn(
                      "absolute top-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-medium",
                      product.status === "active" && "bg-canvas text-success",
                      product.status === "draft" && "bg-canvas text-mute",
                      product.status === "archived" && "bg-canvas text-mute line-through",
                    )}
                  >
                    {product.status === "active" ? "Live" : product.status === "draft" ? "Draft" : "Archived"}
                  </span>
                  {product.totalStock === 0 && product.status === "active" ? (
                    <span className="absolute right-2 bottom-2 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-sale">
                      Sold out
                    </span>
                  ) : null}
                </div>
                <div className="space-y-0.5">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="truncate text-xs text-mute">
                    {product.sku ?? "No SKU"} · {product.variants.length} variant{product.variants.length === 1 ? "" : "s"} ·{" "}
                    {product.totalStock} in stock
                  </p>
                  <p className="text-sm">{formatInr(product.priceInr)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {status === "CanLoadMore" ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => loadMore(24)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}
