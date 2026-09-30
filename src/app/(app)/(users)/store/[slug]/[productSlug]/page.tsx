import { ProductDetail } from "@/components/shop/ProductDetail";

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;
  return <ProductDetail vendorSlug={slug} productSlug={productSlug} />;
}
