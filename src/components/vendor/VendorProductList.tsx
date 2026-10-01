"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { LayoutGrid, List, Package, Plus, ScanLine, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import {
  PRODUCT_CATEGORY_LABELS,
  productTypeLabel,
  type ProductStatus,
} from "@convex/shared/products";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

type Filter = ProductStatus | "all";
type ViewMode = "grid" | "list";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "archived", label: "Archived" },
];

function statusLabel(status: ProductStatus): string {
  if (status === "active") return "Live";
  if (status === "draft") return "Draft";
  return "Archived";
}

function statusClass(status: ProductStatus): string {
  if (status === "active") return "bg-canvas text-success";
  if (status === "draft") return "bg-canvas text-mute";
  return "bg-canvas text-mute line-through";
}

function productSubtitle(product: {
  brand: string | null;
  productType: string | null;
  subcategory: string;
  category: keyof typeof PRODUCT_CATEGORY_LABELS;
}): string {
  if (product.brand) return product.brand;
  if (product.productType) return productTypeLabel(product.productType);
  if (product.subcategory) return product.subcategory;
  return PRODUCT_CATEGORY_LABELS[product.category];
}

export function VendorProductList() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const counts = useQuery(api.vendorProducts.counts, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.vendorProducts.list,
    { status: filter === "all" ? undefined : filter },
    { initialNumItems: 24 },
  );

  const totalCount = counts
    ? counts.active + counts.draft + counts.archived
    : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return results;
    return results.filter((product) => {
      const haystack = [
        product.name,
        product.sku ?? "",
        product.brand ?? "",
        product.subcategory,
        product.productType ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [results, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-20 shrink-0 bg-canvas">
        <div className="flex h-14 items-center justify-between gap-3 border-b border-hairline px-4">
          <h2 className="text-xl font-medium tracking-tight text-ink">Products</h2>
          <div className="flex items-center gap-2">
            <Button href={routes.vendorImport} variant="secondary" size="sm">
              <ScanLine />
              <span className="hidden sm:inline">Import</span>
            </Button>
            <Button href={routes.vendorNewProduct} size="sm">
              <Plus />
              Add product
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="flex gap-2 overflow-x-auto">
            {FILTERS.map((item) => {
              const count =
                item.value === "all"
                  ? totalCount
                  : counts?.[item.value as ProductStatus];
              const active = filter === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                    active
                      ? "bg-ink text-canvas"
                      : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                  )}
                >
                  {item.label}
                  {count !== null && count !== undefined ? (
                    <span className={cn("ml-1.5 tabular-nums", active ? "text-canvas/70" : "text-mute")}>
                      {count}
                      {item.value !== "all" && counts?.capped && count >= 500 ? "+" : ""}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div
            className="flex shrink-0 rounded-full bg-soft-cloud p-1"
            role="group"
            aria-label="View mode"
          >
            <button
              type="button"
              aria-pressed={view === "grid"}
              aria-label="Grid view"
              onClick={() => setView("grid")}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition active:scale-95 active:opacity-50",
                view === "grid" ? "bg-ink text-canvas" : "text-mute",
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              aria-label="List view"
              onClick={() => setView("list")}
              className={cn(
                "flex size-8 items-center justify-center rounded-full transition active:scale-95 active:opacity-50",
                view === "list" ? "bg-ink text-canvas" : "text-mute",
              )}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-hairline px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, SKU, or brand…"
              className="h-11 w-full rounded-none pl-10 text-sm"
              aria-label="Search products"
            />
          </div>
        </div>
      </div>

      {status === "LoadingFirstPage" ? (
        view === "grid" ? (
          <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="bg-canvas p-3">
                <div className="aspect-square animate-pulse bg-soft-cloud" />
                <div className="mt-3 h-4 w-2/3 animate-pulse bg-soft-cloud" />
                <div className="mt-2 h-3 w-1/2 animate-pulse bg-soft-cloud" />
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-hairline">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex gap-3 px-4 py-3">
                <div className="size-16 shrink-0 animate-pulse bg-soft-cloud" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-1/3 animate-pulse bg-soft-cloud" />
                  <div className="h-3 w-1/2 animate-pulse bg-soft-cloud" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : results.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <EmptyState
            icon={Package}
            title={
              filter === "all"
                ? "No products yet"
                : `No ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()} products`
            }
            description="Add a product by hand, or import a look photo and we’ll cut out every piece."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button href={routes.vendorNewProduct}>Add product</Button>
                <Button href={routes.vendorImport} variant="secondary">
                  Import
                </Button>
              </div>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <EmptyState
            icon={Search}
            title="No matches"
            description="Try another name, SKU, or brand — or clear the search."
            action={
              <Button variant="secondary" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        </div>
      ) : view === "grid" ? (
        <ul className="grid min-h-0 flex-1 grid-cols-2 content-start gap-px overflow-y-auto bg-hairline sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => {
            const soldOut = product.totalStock === 0 && product.status === "active";
            return (
              <li key={product.id} className="bg-canvas">
                <Link
                  href={routes.vendorProduct(product.id)}
                  className="block p-3 transition hover:bg-soft-cloud/60 active:opacity-80"
                >
                  <div className="relative aspect-square bg-soft-cloud">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-mute">
                        <Package className="size-6" aria-hidden />
                      </div>
                    )}
                    <span
                      className={cn(
                        "absolute top-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-medium",
                        statusClass(product.status),
                      )}
                    >
                      {statusLabel(product.status)}
                    </span>
                    {soldOut ? (
                      <span className="absolute right-2 bottom-2 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-sale">
                        Sold out
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-1">
                    <p className="truncate text-sm font-medium capitalize text-ink">
                      {product.name}
                    </p>
                    <p className="truncate text-xs text-mute capitalize">
                      {productSubtitle(product)}
                    </p>
                    <div className="flex items-baseline justify-between gap-2 pt-0.5">
                      <p className="text-sm font-medium tabular-nums">
                        {formatInr(product.priceInr)}
                        {product.compareAtPriceInr && product.compareAtPriceInr > product.priceInr ? (
                          <span className="ml-1.5 text-xs font-normal text-mute line-through">
                            {formatInr(product.compareAtPriceInr)}
                          </span>
                        ) : null}
                      </p>
                      <p
                        className={cn(
                          "text-xs tabular-nums",
                          product.totalStock === 0 ? "text-sale" : "text-mute",
                        )}
                      >
                        {product.totalStock} stock
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="sticky top-0 z-10 border-b border-hairline bg-canvas">
              <tr className="text-left text-xs text-mute">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="px-2 py-3 font-medium">SKU</th>
                <th className="px-2 py-3 font-medium">Variants</th>
                <th className="px-2 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filtered.map((product) => {
                const soldOut = product.totalStock === 0 && product.status === "active";
                return (
                  <tr key={product.id} className="hover:bg-soft-cloud/50">
                    <td className="px-4 py-3">
                      <Link
                        href={routes.vendorProduct(product.id)}
                        className="flex min-w-0 items-center gap-3"
                      >
                        <div className="size-12 shrink-0 overflow-hidden bg-soft-cloud">
                          {product.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-mute">
                              <Package className="size-4" aria-hidden />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium capitalize text-ink">{product.name}</p>
                          <p className="truncate text-xs text-mute capitalize">
                            {productSubtitle(product)}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-2 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                          product.status === "active" && "bg-soft-cloud text-success",
                          product.status === "draft" && "bg-soft-cloud text-mute",
                          product.status === "archived" &&
                            "bg-canvas text-mute ring-1 ring-inset ring-hairline line-through",
                        )}
                      >
                        {statusLabel(product.status)}
                      </span>
                    </td>
                    <td className="px-2 py-3 font-mono text-xs text-mute">
                      {product.sku ?? "—"}
                    </td>
                    <td className="px-2 py-3 tabular-nums text-mute">
                      {product.variants.length}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-3 tabular-nums",
                        soldOut || product.totalStock === 0 ? "text-sale" : "text-ink",
                      )}
                    >
                      {soldOut ? "Sold out" : product.totalStock}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatInr(product.priceInr)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {status === "CanLoadMore" ? (
        <div className="shrink-0 border-t border-hairline px-4 py-3">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={() => loadMore(24)}>
            Load more products
          </Button>
        </div>
      ) : null}
    </div>
  );
}
