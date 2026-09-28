import type { Metadata } from "next";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/common/PageHeader";
import { formatInr, formatRelative } from "@/lib/format";
import { withOwner } from "@/lib/owner-session";

export const metadata: Metadata = { title: "Owner orders" };

export default async function OwnerOrdersPage() {
  const orders = await withOwner((client, sessionToken) =>
    client.query(api.owner.listOrders, { sessionToken }),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Fulfillment"
        title="Orders"
        description="Each row is an order a shopper placed. Payment is not collected yet."
      />
      {orders.length === 0 ? (
        <p className="bg-soft-cloud px-4 py-8 text-sm text-mute">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {orders.map((order) => (
            <li key={order.id}>
              <Link href={`/owner/orders/${order.id}`} className="flex items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{order.name}</p>
                  <p className="text-sm text-mute capitalize">
                    {formatRelative(order.createdAt)} · {order.status}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">{formatInr(order.totalInr)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
