"use client";

import { useQuery } from "convex/react";
import { Check, Circle, Package, Plus, ScanLine } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useVendor } from "@/components/vendor/VendorDesk";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/routes";

export function VendorOverview() {
  const me = useVendor();
  const counts = useQuery(api.vendorProducts.counts, {});
  const { vendor } = me;
  const quotaPct = vendor.quota.limit
    ? Math.min(100, Math.round((vendor.quota.used / vendor.quota.limit) * 100))
    : 0;

  const steps = [
    {
      done: vendor.status === "active",
      label: "Store approved by the WardrobeAI team",
    },
    {
      done: Boolean(counts && counts.active > 0),
      label: "First product published",
      action: (
        <Button href={routes.vendorProducts} variant="secondary" size="sm">
          Products
        </Button>
      ),
    },
    {
      done: vendor.payoutStatus === "activated",
      label: "Payout account linked",
      action: (
        <Button href={routes.vendorPayouts} variant="secondary" size="sm">
          Payouts
        </Button>
      ),
    },
    {
      done: Boolean(vendor.logoUrl),
      label: "Logo and banner added",
      action: (
        <Button href={routes.vendorSettings} variant="secondary" size="sm">
          Settings
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-medium tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            Store health, catalog progress, and next steps.
          </p>
        </div>
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Live products" value={counts ? String(counts.active) : "—"} />
        <StatCard label="Drafts" value={counts ? String(counts.draft) : "—"} />
        <Card className="rounded-none ring-border">
          <CardHeader className="pb-2">
            <CardDescription>Scans this month</CardDescription>
            <CardTitle className="text-2xl tabular-nums tracking-tight">
              {vendor.quota.used} / {vendor.quota.limit}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={quotaPct}>
              <ProgressLabel className="sr-only">Scan quota</ProgressLabel>
              <ProgressValue className="sr-only" />
            </Progress>
          </CardContent>
        </Card>
        <Card className="rounded-none ring-border">
          <CardHeader className="pb-2">
            <CardDescription>Plan</CardDescription>
            <CardTitle className="text-2xl tracking-tight">{me.planName}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {(vendor.commissionBps / 100).toFixed(1)}% commission ·{" "}
              {vendor.planPeriodEnd ? `renews ${formatDate(vendor.planPeriodEnd)}` : "trial"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-none ring-border">
        <CardHeader>
          <CardTitle>Getting set up</CardTitle>
          <CardDescription>Complete these to run a live storefront.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 px-0">
          {steps.map((step, index) => (
            <div key={step.label}>
              {index > 0 ? <Separator /> : null}
              <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
                <span
                  aria-hidden
                  className={
                    step.done
                      ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : "flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground"
                  }
                >
                  {step.done ? <Check className="size-3.5" /> : <Circle className="size-2 fill-current" />}
                </span>
                <span
                  className={
                    step.done
                      ? "flex-1 text-sm text-muted-foreground line-through"
                      : "flex-1 text-sm font-medium"
                  }
                >
                  {step.label}
                </span>
                {!step.done && step.action ? step.action : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {counts && counts.active === 0 && counts.draft === 0 ? (
        <Empty className="rounded-none border border-dashed border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Package />
            </EmptyMedia>
            <EmptyTitle>No products yet</EmptyTitle>
            <EmptyDescription>
              Add them one by one, or upload a look photo and we&apos;ll cut every garment out into
              its own draft.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              <Button href={routes.vendorNewProduct} size="sm">
                <Plus />
                Add product
              </Button>
              <Button href={routes.vendorImport} variant="secondary" size="sm">
                <ScanLine />
                Import
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-none ring-border">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums tracking-tight">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
