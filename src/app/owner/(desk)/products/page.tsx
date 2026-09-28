import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { PRODUCT_CATEGORY_LABELS } from "@convex/shared/products";
import { setProductActive } from "@/app/owner/actions";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/format";
import { withOwner } from "@/lib/owner-session";

export const metadata: Metadata = { title: "Owner products" };

export default async function OwnerProductsPage() {
  const products = await withOwner((client, sessionToken) =>
    client.query(api.owner.listProducts, { sessionToken }),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Visible products show on the matching service for shoppers."
        actions={
          <Button href="/owner/products/new" size="sm">
            Add product
          </Button>
        }
      />
      {products.length === 0 ? (
        <p className="bg-soft-cloud px-4 py-8 text-sm text-mute">No products yet.</p>
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {products.map((product) => (
            <li key={product.id} className="flex items-center gap-4 py-4">
              <div className="size-16 shrink-0 bg-soft-cloud">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{product.name}</p>
                <p className="text-sm text-mute">
                  {PRODUCT_CATEGORY_LABELS[product.category]} · {product.presentation} ·{" "}
                  {formatInr(product.priceInr)}
                  {product.active ? "" : " · Hidden"}
                </p>
              </div>
              <Link href={`/owner/products/${product.id}`} className="text-sm font-medium underline">
                Edit
              </Link>
              <form action={setProductActive}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="active" value={product.active ? "0" : "1"} />
                <button type="submit" className="h-10 rounded-full bg-soft-cloud px-4 text-sm font-medium">
                  {product.active ? "Hide" : "Show"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
