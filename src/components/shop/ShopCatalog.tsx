"use client";

import { useMutation, useQuery } from "convex/react";
import { Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  type ProductCategory,
} from "@convex/shared/products";
import { EmptyState } from "@/components/common/EmptyState";
import { AppHeaderTitle } from "@/components/layout/app-header";
import { ShopProductCard } from "@/components/shop/ShopProductCard";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

export function ShopCatalog() {
  const router = useRouter();
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const products = useQuery(api.products.listShop, {
    category: category === "all" ? undefined : category,
  });
  const add = useMutation(api.cart.add);
  const [pendingId, setPendingId] = useState<Id<"products"> | null>(null);

  async function addToBag(product: NonNullable<typeof products>[number]) {
    if (pendingId) return;
    if (product.variants.filter((variant) => variant.active).length > 1) {
      router.push(routes.storeProduct(product.vendorSlug, product.slug));
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
      <AppHeaderTitle title="Shop" />
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          From our vendors
        </p>
        <h1 className="font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl">
          Shop.
        </h1>
        <p className="max-w-md text-sm text-mute sm:text-base">
          Live pieces from every open store. Add to your bag or open a product for sizes.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(["all", ...PRODUCT_CATEGORIES] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={cn(
              "h-10 rounded-full px-4 text-sm font-medium",
              category === item
                ? "bg-ink text-canvas"
                : "bg-canvas ring-1 ring-inset ring-hairline",
            )}
          >
            {item === "all" ? "Everything" : PRODUCT_CATEGORY_LABELS[item]}
          </button>
        ))}
      </div>

      {products === undefined ? (
        <div className="h-64 animate-pulse bg-soft-cloud" />
      ) : products.length === 0 ? (
        <EmptyState
          icon={Store}
          title="Nothing to shop yet"
          description="Vendors haven't published live pieces for this filter."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => (
            <ShopProductCard
              key={product.id}
              product={product}
              pending={pendingId === product.id}
              showVendor
              onAdd={() => void addToBag(product)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
