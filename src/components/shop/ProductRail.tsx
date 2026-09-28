"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ProductCategory } from "@convex/shared/products";
import { PRODUCT_CATEGORY_LABELS } from "@convex/shared/products";
import { reportError } from "@/lib/client-errors";
import { formatInr } from "@/lib/format";

export function ProductRail({ category }: { category: ProductCategory }) {
  const products = useQuery(api.products.listForCategory, { category });
  const add = useMutation(api.cart.add);
  const [pendingId, setPendingId] = useState<Id<"products"> | null>(null);

  if (products === undefined) {
    return <div className="h-48 animate-pulse bg-soft-cloud" />;
  }
  if (products.length === 0) return null;

  async function addProduct(productId: Id<"products">) {
    if (pendingId) return;
    setPendingId(productId);
    try {
      await add({ productId });
      toast.success("Added to bag");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">{PRODUCT_CATEGORY_LABELS[category]} to buy</h2>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <li key={product.id} className="space-y-2">
            <div className="aspect-square bg-soft-cloud">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <p className="text-sm font-medium">{product.name}</p>
            <p className="text-sm">{formatInr(product.priceInr)}</p>
            <button
              type="button"
              disabled={pendingId === product.id}
              onClick={() => void addProduct(product.id)}
              className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-canvas disabled:opacity-50"
            >
              {pendingId === product.id ? "Adding…" : "Add"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
