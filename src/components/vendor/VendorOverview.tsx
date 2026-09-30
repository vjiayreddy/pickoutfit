"use client";

import { useQuery } from "convex/react";
import { Package, Plus, ScanLine } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useVendor } from "@/components/vendor/VendorDesk";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/routes";

export function VendorOverview() {
  const me = useVendor();
  const counts = useQuery(api.vendorProducts.counts, {});
  const { vendor } = me;
  const quotaPct = vendor.quota.limit ? Math.min(100, Math.round((vendor.quota.used / vendor.quota.limit) * 100)) : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Button href={routes.vendorNewProduct}>
          <Plus />
          Add product
        </Button>
        <Button href={routes.vendorImport} variant="secondary">
          <ScanLine />
          Import from a look photo
        </Button>
      </div>

      <dl className="grid gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Live products" value={counts ? String(counts.active) : "—"} />
        <Stat label="Drafts" value={counts ? String(counts.draft) : "—"} />
        <Stat
          label="Scans this month"
          value={`${vendor.quota.used} / ${vendor.quota.limit}`}
          foot={
            <span className="block h-1 w-full bg-hairline-soft">
              <span className="block h-1 bg-ink" style={{ width: `${quotaPct}%` }} />
            </span>
          }
        />
        <Stat
          label="Plan"
          value={me.planName}
          foot={
            <span className="text-xs text-mute">
              {(vendor.commissionBps / 100).toFixed(1)}% commission ·{" "}
              {vendor.planPeriodEnd ? `renews ${formatDate(vendor.planPeriodEnd)}` : "trial"}
            </span>
          }
        />
      </dl>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Getting set up</h2>
        <ol className="divide-y divide-hairline border-y border-hairline">
          <Step done={vendor.status === "active"} label="Store approved by the WardrobeAI team" />
          <Step
            done={Boolean(counts && counts.active > 0)}
            label="First product published"
            action={<Button href={routes.vendorProducts} variant="secondary" size="sm">Products</Button>}
          />
          <Step
            done={vendor.payoutStatus === "activated"}
            label="Payout account linked"
            action={<Button href={routes.vendorPayouts} variant="secondary" size="sm">Payouts</Button>}
          />
          <Step
            done={Boolean(vendor.logoUrl)}
            label="Logo and banner added"
            action={<Button href={routes.vendorSettings} variant="secondary" size="sm">Settings</Button>}
          />
        </ol>
      </section>

      {counts && counts.active === 0 && counts.draft === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-dashed border-hairline px-6 py-10 text-center">
          <Package className="size-5" aria-hidden />
          <p className="text-sm font-medium">No products yet</p>
          <p className="max-w-sm text-sm text-mute">
            Add them one by one, or upload a look photo and we&apos;ll cut every garment out into its own draft.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, foot }: { label: string; value: string; foot?: React.ReactNode }) {
  return (
    <div className="space-y-2 bg-canvas p-4">
      <dt className="text-xs font-medium text-mute">{label}</dt>
      <dd className="text-2xl font-medium tracking-tight">{value}</dd>
      {foot}
    </div>
  );
}

function Step({ done, label, action }: { done: boolean; label: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span
        aria-hidden
        className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
          done ? "bg-ink text-canvas" : "ring-1 ring-inset ring-hairline"
        }`}
      >
        {done ? "✓" : ""}
      </span>
      <span className={`flex-1 text-sm ${done ? "text-mute line-through" : ""}`}>{label}</span>
      {!done && action ? action : null}
    </li>
  );
}
