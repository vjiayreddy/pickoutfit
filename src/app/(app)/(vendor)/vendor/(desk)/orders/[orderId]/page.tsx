import type { Id } from "@convex/_generated/dataModel";
import { VendorOrderDetail } from "@/components/vendor/VendorOrderDetail";

export default async function VendorOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <VendorOrderDetail orderId={orderId as Id<"orders">} />;
}
