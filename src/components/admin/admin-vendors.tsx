"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ShieldOff, Store } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { VENDOR_PLAN_IDS, VENDOR_PLANS, type VendorPlanId, type VendorStatus } from "@convex/shared/vendors";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNow } from "@/hooks/use-now";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/routes";
import { StatTile } from "./stat-tile";

const FILTERS: { value: VendorStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "closed", label: "Closed" },
];

export function AdminVendors() {
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  const now = useNow();
  const [filter, setFilter] = useState<VendorStatus | "all">("all");
  const counts = useQuery(api.adminVendors.counts, isAdmin ? {} : "skip");
  const { results, status, loadMore } = usePaginatedQuery(
    api.adminVendors.list,
    isAdmin ? { status: filter === "all" ? undefined : filter, now } : "skip",
    { initialNumItems: 25 },
  );
  const setStatus = useMutation(api.adminVendors.setStatus);
  const setCommission = useMutation(api.adminVendors.setCommission);
  const setPlan = useMutation(api.adminVendors.setPlan);

  if (me === undefined) return <div className="h-64 animate-pulse bg-soft-cloud" />;
  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <PageHeader title="Vendors" />
        <EmptyState icon={ShieldOff} title="Admins only" action={<Button href={routes.wardrobe}>Back</Button>} />
      </div>
    );
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(reportError(error).message);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        title="Vendors"
        description="Approve new stores, suspend bad actors, and tune commission per store."
        actions={<Button href={routes.admin} variant="secondary" size="sm">Overview</Button>}
      />
      <div className="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-4">
        <StatTile label="Pending" value={counts?.pending ?? "—"} />
        <StatTile label="Active" value={counts?.active ?? "—"} />
        <StatTile label="Suspended" value={counts?.suspended ?? "—"} />
        <StatTile label="Closed" value={counts?.closed ?? "—"} />
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button key={item.value} type="button" onClick={() => setFilter(item.value)} className={cn("h-10 rounded-full px-4 text-sm font-medium", filter === item.value ? "bg-ink text-canvas" : "bg-canvas ring-1 ring-inset ring-hairline")}>
            {item.label}
          </button>
        ))}
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="h-40 animate-pulse bg-soft-cloud" />
      ) : results.length === 0 ? (
        <EmptyState icon={Store} title="No stores here" />
      ) : (
        <ul className="divide-y divide-hairline border-y border-hairline">
          {results.map(({ vendor, ownerEmail, ownerName }) => (
            <li key={vendor._id} className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-full bg-soft-cloud">
                  {vendor.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={vendor.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="font-medium">
                    {vendor.name} <span className="font-mono text-xs text-mute">{vendor.code}</span>
                    <span className={cn("ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium", vendor.status === "active" ? "bg-soft-cloud text-success" : vendor.status === "pending" ? "bg-soft-cloud text-ink" : "bg-soft-cloud text-sale")}>
                      {vendor.status}
                    </span>
                  </p>
                  <p className="truncate text-mute">
                    {ownerName ?? "—"} · {ownerEmail ?? "no email"} · {vendor.supportEmail}
                  </p>
                  <p className="text-xs text-mute">
                    {vendor.legalName ? `${vendor.legalName} · ` : ""}
                    {vendor.gstin ? `GSTIN ${vendor.gstin} · ` : "No GSTIN · "}
                    {vendor.address.city}, {vendor.address.state} · joined {formatDate(vendor.createdAt)} · {VENDOR_PLANS[vendor.plan].name} ({vendor.planStatus}) · quota {vendor.quota.used}/{vendor.quota.limit}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                {vendor.status === "pending" || vendor.status === "suspended" ? (
                  <Button size="sm" onClick={() => void run(() => setStatus({ vendorId: vendor._id, status: "active" }), `${vendor.name} is live.`)}>
                    {vendor.status === "pending" ? "Approve" : "Reinstate"}
                  </Button>
                ) : null}
                {vendor.status === "active" ? (
                  <ConfirmDialog trigger={<Button variant="secondary" size="sm">Suspend</Button>} title={`Suspend ${vendor.name}?`} description="Products are hidden and the desk goes read-only until you reinstate it." confirmLabel="Suspend" destructive onConfirm={() => setStatus({ vendorId: vendor._id, status: "suspended" })} />
                ) : null}
                {vendor.status !== "closed" ? (
                  <ConfirmDialog trigger={<Button variant="ghost" size="sm">Close</Button>} title={`Close ${vendor.name}?`} description="Everything it sells is archived. This is meant to be final." confirmLabel="Close store" destructive onConfirm={() => setStatus({ vendorId: vendor._id, status: "closed" })} />
                ) : null}
                <CommissionEditor vendorId={vendor._id} value={vendor.commissionBps} onSave={(bps) => run(() => setCommission({ vendorId: vendor._id, commissionBps: bps }), "Commission updated.")} />
                <select
                  aria-label="Plan"
                  value={vendor.plan}
                  onChange={(e) => void run(() => setPlan({ vendorId: vendor._id, plan: e.target.value as VendorPlanId }), "Plan updated.")}
                  className="h-10 rounded-full bg-soft-cloud px-3 text-sm"
                >
                  {VENDOR_PLAN_IDS.map((plan) => (
                    <option key={plan} value={plan}>
                      {VENDOR_PLANS[plan].name}
                    </option>
                  ))}
                </select>
                {vendor.status === "active" ? (
                  <Button href={routes.store(vendor.slug)} variant="ghost" size="sm">
                    Storefront
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => loadMore(25)}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CommissionEditor({ vendorId, value, onSave }: { vendorId: Id<"vendors">; value: number; onSave: (bps: number) => Promise<void> }) {
  const [draft, setDraft] = useState(String(value / 100));
  const changed = Math.round(Number(draft) * 100) !== value;
  return (
    <form
      key={vendorId}
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(Math.round(Number(draft) * 100));
      }}
    >
      <Input aria-label="Commission percent" type="number" min={0} max={50} step={0.5} value={draft} onChange={(e) => setDraft(e.target.value)} className="h-10 w-20 px-3" />
      <span className="text-xs text-mute">%</span>
      {changed ? (
        <Button type="submit" size="sm" variant="secondary">
          Save
        </Button>
      ) : null}
    </form>
  );
}
