"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ProductCategory } from "@convex/shared/products";
import { PRODUCT_CATEGORY_LABELS } from "@convex/shared/products";
import { reportError } from "@/lib/client-errors";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

export function ProductRail({ category }: { category: ProductCategory }) {
  const products = useQuery(api.products.listForCategory, { category });
  const add = useMutation(api.cart.add);
  const [pendingId, setPendingId] = useState<Id<"products"> | null>(null);

  if (products === undefined) {
    return <div className="h-48 animate-pulse bg-soft-cloud" />;
  }
  if (products.length === 0) return null;

  async function addProduct(
    productId: Id<"products">,
    sourceItemId?: Id<"items">,
  ) {
    if (pendingId) return;
    setPendingId(productId);
    try {
      await add({
        productId,
        addedFrom: "rail",
        ...(sourceItemId ? { sourceItemId } : {}),
      });
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
        {products.map((product) => {
          const relation = product.relation;
          const isSimilar = relation?.kind === "similar";
          const isPairs = relation?.kind === "pairs";

          return (
            <li key={product.id} className="space-y-2">
              <div className="relative aspect-square bg-soft-cloud">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : null}
                {isSimilar ? (
                  <span className="absolute top-2 left-2 rounded-full bg-canvas px-2 py-1 text-[11px] font-medium">
                    You own similar
                  </span>
                ) : null}
                {isPairs ? (
                  <span className="absolute top-2 left-2 rounded-full bg-canvas px-2 py-1 text-[11px] font-medium">
                    Completes a look
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-medium">{product.name}</p>
              <p className="text-sm">{formatInr(product.priceInr)}</p>
              {relation ? (
                <p className="text-[12px] text-mute">
                  {isSimilar ? "Similar to " : "Pairs with "}
                  <Link
                    href={routes.item(relation.itemId)}
                    className="font-medium text-ink underline decoration-hairline underline-offset-2"
                  >
                    {relation.itemName}
                  </Link>
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {isSimilar && relation ? (
                  <Link
                    href={routes.item(relation.itemId)}
                    className="inline-flex h-10 items-center rounded-full bg-soft-cloud px-4 text-sm font-medium"
                  >
                    Compare
                  </Link>
                ) : null}
                <button
                  type="button"
                  disabled={pendingId === product.id}
                  onClick={() =>
                    void addProduct(product.id, relation?.itemId)
                  }
                  className={
                    isSimilar
                      ? "h-10 rounded-full bg-soft-cloud px-4 text-sm font-medium disabled:opacity-50"
                      : "h-10 rounded-full bg-ink px-4 text-sm font-medium text-canvas disabled:opacity-50"
                  }
                >
                  {pendingId === product.id
                    ? "Adding…"
                    : isSimilar
                      ? "Add anyway"
                      : isPairs
                        ? "Complete look"
                        : "Add"}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
