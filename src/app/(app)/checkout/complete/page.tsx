"use client";

import { use } from "react";
import { OrderConfirmation } from "@/components/shop/CheckoutForm";

export default function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = use(searchParams);
  if (!order) {
    return <p className="text-sm text-mute">That order does not exist.</p>;
  }
  return <OrderConfirmation orderId={order} />;
}
