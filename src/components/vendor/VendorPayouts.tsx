"use client";

import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportError } from "@/lib/client-errors";
import { formatDate, formatInr } from "@/lib/format";

const STATUS_LABEL = {
  none: "Not linked",
  pending: "Pending activation",
  activated: "Active",
  rejected: "Rejected",
} as const;

export function VendorPayouts() {
  const data = useQuery(api.vendorPayouts.get, {});
  const startOnboarding = useAction(api.vendorPayouts.startOnboarding);
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [pending, setPending] = useState(false);

  if (data === undefined) {
    return <div className="h-48 animate-pulse bg-soft-cloud" />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await startOnboarding({ accountNumber, ifsc, beneficiaryName });
      toast.success("Payout account submitted. Activation can take a short while.");
      setAccountNumber("");
      setIfsc("");
      setBeneficiaryName("");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-medium tracking-tight">Payouts</h1>
        <p className="text-sm text-mute">
          Link a bank account for Route settlements. Funds move {data.holdDays} days after
          delivery, minus {(data.commissionBps / 100).toFixed(1)}% commission.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Status" value={STATUS_LABEL[data.payoutStatus]} />
        <Stat label="Pending" value={formatInr(data.pendingInr)} />
        <Stat label="Paid out" value={formatInr(data.paidInr)} />
      </div>

      {data.payoutAccountId ? (
        <p className="text-sm text-mute">Linked account {data.payoutAccountId}</p>
      ) : null}

      {!data.configured ? (
        <p className="text-sm text-sale">
          Razorpay is not configured on this environment. Ask an admin to set the keys.
        </p>
      ) : null}

      {data.payoutStatus !== "activated" ? (
        <form onSubmit={(event) => void submit(event)} className="max-w-lg space-y-3 border border-hairline p-4">
          <p className="text-sm font-medium">Link bank account</p>
          <p className="text-xs text-mute">
            Add PAN on Settings first. Platform Razorpay account needs{" "}
            <span className="font-medium text-foreground">Route</span> enabled (Linked Accounts +
            Transfers) — contact Razorpay support if submit fails with that message.
          </p>
          <label className="block space-y-1 text-sm">
            Beneficiary name
            <Input
              required
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              placeholder="As on bank account"
            />
          </label>
          <label className="block space-y-1 text-sm">
            Account number
            <Input
              required
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              inputMode="numeric"
            />
          </label>
          <label className="block space-y-1 text-sm">
            IFSC
            <Input
              required
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              placeholder="HDFC0001234"
            />
          </label>
          <Button type="submit" disabled={pending || !data.configured}>
            {pending ? "Submitting…" : "Submit for activation"}
          </Button>
        </form>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Settlements</h2>
        {data.settlements.length === 0 ? (
          <p className="text-sm text-mute">No settlements yet. They appear after you mark orders delivered.</p>
        ) : (
          <ul className="divide-y divide-hairline border border-hairline">
            {data.settlements.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{formatInr(row.netInr)} net</p>
                  <p className="text-mute">
                    Gross {formatInr(row.grossInr)} · Commission {formatInr(row.commissionInr)} ·{" "}
                    {row.status}
                  </p>
                </div>
                <p className="text-mute">
                  {row.status === "paid" && row.paidAt
                    ? `Paid ${formatDate(row.paidAt)}`
                    : `Available ${formatDate(row.availableAt)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hairline p-4">
      <p className="text-xs text-mute">{label}</p>
      <p className="mt-1 text-xl font-medium tabular-nums tracking-tight">{value}</p>
    </div>
  );
}
