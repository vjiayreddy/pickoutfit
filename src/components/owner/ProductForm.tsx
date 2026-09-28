"use client";

import { useActionState } from "react";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@convex/shared/products";
import { PRESENTATIONS } from "@convex/shared/wardrobe";
import type { OwnerFormState } from "@/app/owner/actions";
import { Button } from "@/components/ui/button";

type ProductFields = {
  id?: string;
  name: string;
  category: string;
  presentation: string;
  priceInr: number;
  active: boolean;
  imageUrl: string | null;
};

export function ProductForm({
  action,
  product,
}: {
  action: (prev: OwnerFormState, formData: FormData) => Promise<OwnerFormState>;
  product?: ProductFields;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="max-w-xl space-y-4">
      {product?.id ? <input type="hidden" name="productId" value={product.id} /> : null}
      <label className="block space-y-1 text-sm font-medium">
        Name
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={product?.name ?? ""}
          className="h-12 w-full rounded-full bg-soft-cloud px-4 text-sm font-normal outline-none focus:bg-canvas focus:ring-2 focus:ring-ink"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium">
          Category
          <select
            name="category"
            defaultValue={product?.category ?? "clothes"}
            className="h-12 w-full rounded-full bg-soft-cloud px-4 text-sm font-normal outline-none focus:bg-canvas focus:ring-2 focus:ring-ink"
          >
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {PRODUCT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          For
          <select
            name="presentation"
            defaultValue={product?.presentation ?? "neutral"}
            className="h-12 w-full rounded-full bg-soft-cloud px-4 text-sm font-normal outline-none focus:bg-canvas focus:ring-2 focus:ring-ink"
          >
            {PRESENTATIONS.map((presentation) => (
              <option key={presentation} value={presentation}>
                {presentation}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm font-medium">
        Price (INR)
        <input
          name="priceInr"
          type="number"
          required
          min={0}
          step={1}
          defaultValue={product?.priceInr ?? 0}
          className="h-12 w-full rounded-full bg-soft-cloud px-4 text-sm font-normal outline-none focus:bg-canvas focus:ring-2 focus:ring-ink"
        />
      </label>
      <label className="block space-y-1 text-sm font-medium">
        Photo
        <input name="image" type="file" accept="image/jpeg,image/png,image/webp" className="text-sm font-normal" />
      </label>
      {product?.imageUrl ? (
        <div className="aspect-square w-40 bg-soft-cloud">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="active" value="1" defaultChecked={product?.active ?? true} />
        Visible in the shop
      </label>
      {state?.error ? <p className="text-sm text-sale">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save product"}
      </Button>
    </form>
  );
}
