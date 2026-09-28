import type { Metadata } from "next";
import { ConvexError } from "convex/values";
import { notFound } from "next/navigation";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { OrderStatusForm } from "@/components/owner/OrderStatusForm";
import { formatInr } from "@/lib/format";
import { withOwner } from "@/lib/owner-session";

export const metadata: Metadata = { title: "Order" };

export default async function OwnerOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  let order;
  try {
    order = await withOwner((client, sessionToken) =>
      client.query(api.owner.getOrder, {
        sessionToken,
        orderId: orderId as Id<"orders">,
      }),
    );
  } catch (error) {
    if (error instanceof ConvexError) notFound();
    throw error;
  }
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-4xl uppercase">Order</h1>
        <p className="mt-2 text-sm text-mute">{new Date(order.createdAt).toLocaleString("en-IN")}</p>
      </div>
      <OrderStatusForm orderId={order.id} status={order.status} />
      <div className="space-y-1 text-sm">
        <p className="font-medium">{order.name}</p>
        <p>{order.email}</p>
        <p>{order.phone}</p>
        <p>
          {order.address}, {order.city} {order.pincode}
        </p>
      </div>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-4 py-3 text-sm">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span>{formatInr(item.priceInr * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <p className="text-base font-medium">Total {formatInr(order.totalInr)}</p>
    </div>
  );
}
