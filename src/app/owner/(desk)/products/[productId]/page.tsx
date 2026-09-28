import type { Metadata } from "next";
import { ConvexError } from "convex/values";
import { notFound } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { updateProduct } from "@/app/owner/actions";
import { ProductForm } from "@/components/owner/ProductForm";
import { withOwner } from "@/lib/owner-session";

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  let product;
  try {
    product = await withOwner((client, sessionToken) =>
      client.query(api.owner.getProduct, {
        sessionToken,
        productId: productId as Id<"products">,
      }),
    );
  } catch (error) {
    if (error instanceof ConvexError) notFound();
    throw error;
  }
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl uppercase">Edit product</h1>
      <ProductForm
        action={updateProduct}
        product={{
          id: product.id,
          name: product.name,
          category: product.category,
          presentation: product.presentation,
          priceInr: product.priceInr,
          active: product.active,
          imageUrl: product.imageUrl,
        }}
      />
    </div>
  );
}
