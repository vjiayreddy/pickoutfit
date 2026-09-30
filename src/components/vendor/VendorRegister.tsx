"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { PageHeader } from "@/components/common/PageHeader";
import { EMPTY_PROFILE, profileArgs, VendorProfileForm } from "@/components/vendor/VendorProfileForm";
import { reportError } from "@/lib/client-errors";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

export function VendorRegister() {
  const router = useRouter();
  const register = useMutation(api.vendors.register);
  const plans = useQuery(api.vendors.plans, {});

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10">
      <PageHeader
        eyebrow="Sell on WardrobeAI"
        title="Open your store"
        description="Your pieces get scanned, tagged and shown next to what shoppers already own. Start on the free plan; the team approves new stores within a day."
      />

      {plans ? (
        <ul className="grid gap-3 sm:grid-cols-3">
          {plans.map((plan) => (
            <li key={plan.id} className="space-y-2 border border-hairline p-4">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">{plan.name}</p>
                <p className="text-sm">{plan.priceInr === 0 ? "Free" : `${formatInr(plan.priceInr)}/mo`}</p>
              </div>
              <p className="text-xs text-mute">{plan.blurb}</p>
              <dl className="space-y-1 text-xs text-mute">
                <div className="flex justify-between">
                  <dt>Scans / month</dt>
                  <dd className="text-ink">{plan.extractionQuota}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Commission</dt>
                  <dd className="text-ink">{(plan.commissionBps / 100).toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Products</dt>
                  <dd className="text-ink">{plan.maxProducts.toLocaleString("en-IN")}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      ) : null}

      <VendorProfileForm
        initial={EMPTY_PROFILE}
        submitLabel="Open store"
        onSubmit={async (values) => {
          try {
            await register(profileArgs(values));
            toast.success("Store created. We'll review it shortly.");
            router.replace(routes.vendor);
          } catch (error) {
            throw new Error(reportError(error).message);
          }
        }}
      />
    </div>
  );
}
