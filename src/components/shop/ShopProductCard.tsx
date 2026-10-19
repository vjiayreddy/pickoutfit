"use client";

import Link from "next/link";
import type { Id } from "@convex/_generated/dataModel";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

export type ShopCardProduct = {
  id: Id<"products">;
  slug: string;
  name: string;
  subcategory: string;
  vendorName: string;
  vendorSlug: string;
  priceInr: number;
  compareAtPriceInr: number | null;
  totalStock: number;
  imageUrl: string | null;
  variants: Array<{ active: boolean }>;
  offer?: { badge: string | null; kind: "percent" | "flat"; value: number } | null;
};

export function ShopProductCard({
  product,
  pending,
  showVendor = false,
  onAdd,
}: {
  product: ShopCardProduct;
  pending: boolean;
  showVendor?: boolean;
  onAdd: () => void;
}) {
  const multiVariant = product.variants.filter((variant) => variant.active).length > 1;

  return (
    <li className="space-y-2">
      <Link href={routes.storeProduct(product.vendorSlug, product.slug)} className="block space-y-2">
        <div className="relative aspect-square bg-soft-cloud">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : null}
          {product.totalStock === 0 ? (
            <span className="absolute top-2 left-2 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-mute">
              Sold out
            </span>
          ) : product.offer ? (
            <span className="absolute top-2 left-2 rounded-full bg-canvas px-2.5 py-1 text-[11px] font-medium text-sale">
              {product.offer.badge?.trim() ||
                (product.offer.kind === "percent"
                  ? `${Math.round(product.offer.value)}% off`
                  : `₹${Math.round(product.offer.value)} off`)}
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm font-medium">{product.name}</p>
        {showVendor ? (
          <p className="truncate text-xs text-mute">{product.vendorName}</p>
        ) : (
          <p className="truncate text-xs text-mute">{product.subcategory}</p>
        )}
        <p className="text-sm">
          <span className={product.offer ? "text-sale" : undefined}>{formatInr(product.priceInr)}</span>
          {product.compareAtPriceInr && product.compareAtPriceInr > product.priceInr ? (
            <span className="ml-2 text-mute line-through">{formatInr(product.compareAtPriceInr)}</span>
          ) : null}
        </p>
      </Link>
      {showVendor ? (
        <Link
          href={routes.store(product.vendorSlug)}
          className="block truncate text-xs font-medium text-ink underline decoration-hairline underline-offset-2"
        >
          Visit {product.vendorName}
        </Link>
      ) : null}
      <button
        type="button"
        disabled={pending || product.totalStock === 0}
        onClick={onAdd}
        className="h-10 rounded-full bg-ink px-4 text-sm font-medium text-canvas disabled:opacity-50"
      >
        {pending ? "Adding…" : multiVariant ? "Choose size" : "Add"}
      </button>
    </li>
  );
}
