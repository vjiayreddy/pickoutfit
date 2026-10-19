"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { OrderLineStatus } from "@convex/shared/products";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDate, formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

const FILTERS: { value: OrderLineStatus | "all" | "returns"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "placed", label: "Placed" },
  { value: "shipped", label: "Shipped" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
  { value: "returns", label: "Open returns" },
];

function lineStatusArg(filter: (typeof FILTERS)[number]["value"]): OrderLineStatus | undefined {
  if (filter === "all" || filter === "returns") return undefined;
  return filter;
}

export function VendorOrderList() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const counts = useQuery(api.vendorOrders.counts, {});
  const openReturns = useQuery(api.vendorOrders.listOpenReturns, filter === "returns" ? {} : "skip");
  const { results, status, loadMore } = usePaginatedQuery(
    api.vendorOrders.list,
    filter === "returns" ? "skip" : { lineStatus: lineStatusArg(filter) },
    { initialNumItems: 24 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mute">Ship placed lines, track packages, and restock accepted returns.</p>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => {
            const count =
              item.value === "all"
                ? null
                : item.value === "returns"
                  ? counts?.openReturns
                  : counts?.[item.value];
            const active = filter === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                  active ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                )}
              >
                {item.label}
                {count !== null && count !== undefined ? (
                  <span className={cn("ml-1.5", active ? "text-canvas/70" : "text-mute")}>{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {filter === "returns" ? (
        openReturns === undefined ? (
          <div className="h-40 animate-pulse bg-soft-cloud" />
        ) : openReturns.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No open returns"
            description="When a shopper sends something back, open a return from the order and accept it to restock."
          />
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {openReturns.map((row) => (
              <li key={row.id}>
                <Link
                  href={routes.vendorOrder(row.orderId)}
                  className="flex flex-wrap items-center justify-between gap-3 py-4 transition hover:bg-soft-cloud/60"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-medium">Return · qty {row.quantity}</p>
                    <p className="truncate text-xs text-mute">
                      {row.reason} · {formatDate(row.createdAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-soft-cloud px-3 py-1 text-xs font-medium">Requested</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : status === "LoadingFirstPage" ? (
        <div className="h-40 animate-pulse bg-soft-cloud" />
      ) : results.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={filter === "all" ? "No orders yet" : `Nothing ${FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}`}
          description="When shoppers buy your pieces, the orders show up here to ship."
        />
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {results.map((order) => (
            <li key={order.orderId}>
              <Link
                href={routes.vendorOrder(order.orderId)}
                className="flex flex-wrap items-center justify-between gap-3 py-4 transition hover:bg-soft-cloud/60"
              >
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-medium">
                    {order.buyerName}
                    <span className="text-mute"> · {order.city}</span>
                  </p>
                  <p className="truncate text-xs text-mute">
                    {formatDate(order.createdAt)} · {order.itemCount} item
                    {order.itemCount === 1 ? "" : "s"}
                    {order.placedCount > 0 ? ` · ${order.placedCount} to ship` : ""}
                    {order.openReturnCount > 0 ? ` · ${order.openReturnCount} return` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-medium">{formatInr(order.totalInr)}</p>
                  <StatusPill status={order.orderStatus} placed={order.placedCount} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {filter !== "returns" && status === "CanLoadMore" ? (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => loadMore(24)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status, placed }: { status: string; placed: number }) {
  const label =
    status === "fulfilled" ? "Fulfilled" : status === "cancelled" ? "Cancelled" : placed > 0 ? "Needs ship" : "Placed";
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium",
        status === "fulfilled" && "bg-soft-cloud text-success",
        status === "cancelled" && "bg-soft-cloud text-mute",
        status === "placed" && placed > 0 && "bg-ink text-canvas",
        status === "placed" && placed === 0 && "bg-soft-cloud text-mute",
      )}
    >
      {label}
    </span>
  );
}
