"use client";

import { Suspense } from "react";
import { BillingPage } from "@/components/billing/BillingPage";

export default function BillingRoute() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading billing…</p>}>
      <BillingPage />
    </Suspense>
  );
}
