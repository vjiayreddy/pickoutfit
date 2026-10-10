import { Suspense } from "react";
import { api } from "@convex/_generated/api";
import { ProductDetail } from "@/components/shop/ProductDetail";
import { Storefront } from "@/components/shop/Storefront";
import { fetchAuthQuery } from "@/lib/auth-server";

/** Matches /store/[slug]/… (category path or product slug). Base store is page.tsx. */
export default async function StoreRestPage({
  params,
}: {
  params: Promise<{ slug: string; rest: string[] }>;
}) {
  const { slug, rest } = await params;

  if (rest.length === 1) {
    const productSlug = rest[0]!;
    const found = await fetchAuthQuery(api.products.bySlug, {
      vendorSlug: slug,
      productSlug,
    });
    if (found) {
      return <ProductDetail vendorSlug={slug} productSlug={productSlug} />;
    }
  }

  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-soft-cloud" />}>
      <Storefront slug={slug} categoryPath={rest.join("/")} />
    </Suspense>
  );
}
