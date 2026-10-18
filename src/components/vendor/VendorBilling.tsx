"use client";

import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { VendorPlanId } from "@convex/shared/vendors";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/client-errors";
import { formatDate, formatInr } from "@/lib/format";

const STATUS_LABEL = {
  trial: "Trial",
  active: "Active",
  past_due: "Payment overdue",
  cancelled: "Cancelled",
} as const;

export function VendorBilling() {
  const data = useQuery(api.vendorBilling.status, {});
  const subscribe = useAction(api.vendorBilling.subscribe);
  const [pendingPlan, setPendingPlan] = useState<VendorPlanId | null>(null);

  if (data === undefined) {
    return <div className="h-48 animate-pulse bg-soft-cloud" />;
  }

  async function choose(plan: VendorPlanId) {
    if (pendingPlan) return;
    setPendingPlan(plan);
    try {
      const result = await subscribe({ plan });
      if (result.shortUrl) {
        window.open(result.shortUrl, "_blank", "noopener,noreferrer");
        toast.success("Complete payment in the Razorpay tab if prompted.");
      } else {
        toast.success(plan === "starter" ? "Moved to Starter." : "Plan updated.");
      }
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingPlan(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight">Billing</h1>
        <p className="text-sm text-mute">
          Platform plan for listing quota and commission. Product sales are settled separately under
          Payouts.
        </p>
      </div>

      <div className="border border-hairline p-4 text-sm">
        <p className="font-medium">
          Current: {data.planName} · {STATUS_LABEL[data.planStatus]}
        </p>
        <p className="mt-1 text-mute">{data.planBlurb}</p>
        <p className="mt-1 text-mute">
          {(data.commissionBps / 100).toFixed(1)}% commission
          {data.planPeriodEnd ? ` · renews ${formatDate(data.planPeriodEnd)}` : ""}
        </p>
      </div>

      {!data.configured ? (
        <p className="text-sm text-sale">
          Razorpay is not configured on this environment. Ask an admin to set the keys.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {data.plans.map((plan) => {
          const current = plan.id === data.plan;
          return (
            <div key={plan.id} className="flex flex-col gap-3 border border-hairline p-4">
              <div>
                <p className="font-medium">{plan.name}</p>
                <p className="mt-1 text-2xl font-medium tabular-nums tracking-tight">
                  {plan.priceInr === 0 ? "Free" : formatInr(plan.priceInr)}
                  {plan.priceInr > 0 ? (
                    <span className="text-sm font-normal text-mute"> / mo</span>
                  ) : null}
                </p>
                <p className="mt-2 text-sm text-mute">{plan.blurb}</p>
              </div>
              <Button
                type="button"
                variant={current ? "secondary" : "default"}
                disabled={current || !data.configured || pendingPlan !== null}
                onClick={() => void choose(plan.id)}
              >
                {current
                  ? "Current plan"
                  : pendingPlan === plan.id
                    ? "Updating…"
                    : plan.priceInr === 0
                      ? "Switch to Starter"
                      : "Subscribe"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
