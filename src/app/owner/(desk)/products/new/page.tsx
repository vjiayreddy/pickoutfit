import type { Metadata } from "next";
import { createProduct } from "@/app/owner/actions";
import { ProductForm } from "@/components/owner/ProductForm";

export const metadata: Metadata = { title: "New product" };

export default function NewProductPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl uppercase">New product</h1>
      <ProductForm action={createProduct} />
    </div>
  );
}
