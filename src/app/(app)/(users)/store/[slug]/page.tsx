import { Suspense } from "react";
import { Storefront } from "@/components/shop/Storefront";

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-soft-cloud" />}>
      <Storefront slug={slug} />
    </Suspense>
  );
}
