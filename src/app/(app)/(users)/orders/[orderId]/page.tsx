import type { Id } from "@convex/_generated/dataModel";
import { OrderDetail } from "@/components/shop/OrderDetail";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <OrderDetail orderId={orderId as Id<"orders">} />;
}
