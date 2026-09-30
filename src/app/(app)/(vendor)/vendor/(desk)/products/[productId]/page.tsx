import type { Id } from "@convex/_generated/dataModel";
import { ProductEditor } from "@/components/vendor/ProductEditor";

export default async function EditVendorProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <ProductEditor productId={productId as Id<"products">} />;
}
