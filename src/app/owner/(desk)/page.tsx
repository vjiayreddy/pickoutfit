import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CircleCheck, CircleX, ClipboardList, ShoppingBag } from "lucide-react";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/common/PageHeader";
import { StatTile } from "@/components/admin/stat-tile";
import { formatInr, formatRelative } from "@/lib/format";
import { withOwner } from "@/lib/owner-session";

export const metadata: Metadata = { title: "Owner sales" };

const STATUS_CLASS = {
  placed: "bg-soft-cloud text-ink",
  fulfilled: "bg-ink text-canvas",
  cancelled: "text-mute",
} as const;

export default async function OwnerSalesPage() {
  const [sales, orders] = await Promise.all([
    withOwner((client, sessionToken) => client.query(api.owner.sales, { sessionToken })),
    withOwner((client, sessionToken) => client.query(api.owner.listOrders, { sessionToken })),
  ]);
  const recent = orders.slice(0, 6);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Platform"
        title="Sales"
        description="Booked means placed and fulfilled orders. Payment is not collected yet, so this is not cash received."
      />
      <section className="space-y-3">
        <h2 className="text-xs font-medium tracking-wide text-mute uppercase">Orders</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile label="Booked" value={formatInr(sales.bookedInr)} icon={Banknote} />
          <StatTile label="Booked orders" value={sales.bookedCount} icon={ShoppingBag} />
          <StatTile label="Placed" value={sales.counts.placed} icon={ClipboardList} />
          <StatTile
            label="Fulfilled"
            value={sales.counts.fulfilled}
            icon={CircleCheck}
            tone="positive"
          />
          <StatTile label="Cancelled" value={sales.counts.cancelled} icon={CircleX} tone="negative" />
        </div>
        {sales.truncated ? (
          <p className="text-xs text-mute">
            Counts use the latest {sales.sampleCap} orders in each status.
          </p>
        ) : null}
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-medium tracking-wide text-mute uppercase">Recent orders</h2>
          <Link href="/owner/orders" className="text-sm font-medium underline">
            All orders
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="bg-soft-cloud px-4 py-8 text-sm text-mute">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs font-medium tracking-wide text-mute uppercase">
                  <th className="py-3 pr-4 font-medium">Buyer</th>
                  <th className="py-3 pr-4 font-medium">When</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((order) => (
                  <tr key={order.id} className="border-b border-hairline">
                    <td className="py-3 pr-4">
                      <Link href={`/owner/orders/${order.id}`} className="font-medium underline">
                        {order.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-mute">{formatRelative(order.createdAt)}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-medium capitalize ${STATUS_CLASS[order.status]}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 text-right font-medium tabular-nums">
                      {formatInr(order.totalInr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
