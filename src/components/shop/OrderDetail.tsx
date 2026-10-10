"use client";

import { useQuery } from "convex/react";
import type { Id } from "@convex/_generated/dataModel";
import { ArrowLeft, Package } from "lucide-react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { EmptyState } from "@/components/common/EmptyState";
import { LineStatusBadge, OrderStatusPill } from "@/components/shop/OrderStatusPill";
import { OrderTimeline } from "@/components/shop/OrderTimeline";
import { Button } from "@/components/ui/button";
import { formatDate, formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

export function OrderDetail({ orderId }: { orderId: Id<"orders"> }) {
  const order = useQuery(api.orders.getMine, { orderId });

  if (order === undefined) {
    return <div className="h-64 animate-pulse bg-soft-cloud" />;
  }

  if (order === null) {
    return (
      <EmptyState
        icon={Package}
        title="Order not found"
        description="That order isn't in your account."
        action={<Button href={routes.orders}>Back to orders</Button>}
      />
    );
  }

  return (
    <div className="w-full max-w-3xl space-y-8">
      <div className="space-y-2">
        <Link
          href={routes.orders}
          className="inline-flex items-center gap-1 text-sm font-medium text-mute"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Orders
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h1 className="font-display text-4xl uppercase leading-none">Order</h1>
          <OrderStatusPill status={order.status} />
        </div>
        <p className="text-sm text-mute">{formatDate(order.createdAt)}</p>
        <p className="text-lg font-medium">{formatInr(order.totalInr)}</p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Ship to</h2>
        <p className="text-sm text-mute">
          {order.name}
          <br />
          {order.address}
          <br />
          {order.city} {order.pincode}
          <br />
          {order.phone}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Items</h2>
        <ul className="divide-y divide-hairline border-y border-hairline">
          {order.items.map((item) => {
            const meta = [item.size, item.colour].filter(Boolean).join(" · ");
            return (
              <li key={item.id} className="space-y-1 py-4">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <p className="text-sm font-medium">
                    {item.quantity} × {item.name}
                  </p>
                  <p className="text-sm font-medium tabular-nums text-mute">
                    {formatInr(item.priceInr * item.quantity)}
                  </p>
                </div>
                {meta ? <p className="text-xs text-mute">{meta}</p> : null}
                <LineStatusBadge status={item.lineStatus} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Tracking</h2>
        <OrderTimeline events={order.timeline} />
      </section>

      {order.returns.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Returns</h2>
          <ul className="divide-y divide-hairline border-y border-hairline">
            {order.returns.map((row) => (
              <li key={row.id} className="space-y-1 py-4">
                <p className="text-sm font-medium capitalize">{row.status}</p>
                <p className="text-xs text-mute">
                  Qty {row.quantity}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
