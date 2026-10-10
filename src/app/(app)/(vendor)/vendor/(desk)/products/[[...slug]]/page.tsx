import { Suspense } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { ProductEditor } from "@/components/vendor/ProductEditor";
import { VendorProductList } from "@/components/vendor/VendorProductList";
import { isConvexDocumentId } from "@/lib/product-filters";

export default async function VendorProductsCatchAllPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const segments = slug ?? [];

  if (segments.length === 1 && isConvexDocumentId(segments[0]!)) {
    return <ProductEditor productId={segments[0] as Id<"products">} />;
  }

  const categoryPath = segments.join("/");
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-soft-cloud" />}>
      <VendorProductList categoryPath={categoryPath} />
    </Suspense>
  );
}
