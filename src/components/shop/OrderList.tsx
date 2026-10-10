"use client";

import { useQuery } from "convex/react";
import { Package } from "lucide-react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { EmptyState } from "@/components/common/EmptyState";
import { OrderStatusPill } from "@/components/shop/OrderStatusPill";
import { Button } from "@/components/ui/button";
import { formatDate, formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

export function OrderList() {
  const orders = useQuery(api.orders.listMine);

  if (orders === undefined) {
    return <div className="h-64 animate-pulse bg-soft-cloud" />;
  }

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="No orders yet"
        description="When you check out, your orders show up here so you can track them."
        action={<Button href={routes.shop}>Browse shop</Button>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl uppercase">Orders</h1>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {orders.map((order) => {
          const preview = order.itemPreview.join(", ");
          const more =
            order.itemCount > order.itemPreview.length
              ? ` +${order.itemCount - order.itemPreview.length} more`
              : "";
          return (
            <li key={order.id}>
              <Link
                href={routes.order(order.id)}
                className="flex items-start justify-between gap-4 py-4 transition-opacity hover:opacity-70"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <OrderStatusPill status={order.status} />
                    <span className="text-xs font-medium text-mute">{formatDate(order.createdAt)}</span>
                  </div>
                  <p className="truncate text-sm font-medium text-ink">
                    {preview}
                    {more}
                  </p>
                  <p className="text-xs text-mute">
                    {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium tabular-nums">{formatInr(order.totalInr)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
