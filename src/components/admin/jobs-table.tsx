"use client";

import { useMutation, useQuery } from "convex/react";
import { ListChecks, Loader2, RefreshCw, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { JobStatus } from "@convex/shared/jobs";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { adminApi, type AdminJobRow } from "@/lib/admin-api";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatCredits, formatNumber, formatRelative, titleCase } from "@/lib/format";

type StatusFilter = "failed" | "partial" | "running";
const FILTERS = ["all", "running", "failed", "partial"] as const;
type FilterValue = (typeof FILTERS)[number];

const STATUS_CLASS: Record<JobStatus, string> = {
  queued: "border-hairline text-mute",
  running: "bg-ink text-canvas",
  done: "bg-soft-cloud text-ink",
  partial: "border-hairline text-ink",
  failed: "bg-sale/10 text-sale",
  cancelled: "border-hairline text-mute",
};

function reservedTotal(job: AdminJobRow["job"]): number {
  return job.reservation.plan + job.reservation.pack;
}

function refundedTotal(job: AdminJobRow["job"]): number {
  return job.refunds.plan + job.refunds.pack;
}

function RefundAction({ row }: { row: AdminJobRow }) {
  const refundJob = useMutation(adminApi.refundJob);
  const [note, setNote] = useState("");
  const refundable = reservedTotal(row.job) - refundedTotal(row.job);

  async function handleRefund() {
    const { refunded } = await refundJob({ jobId: row.job._id, note: note.trim() });
    setNote("");
    toast.success(`Refunded ${formatCredits(refunded)}.`);
  }

  if (refundable <= 0) return <span className="text-xs text-mute">Nothing left</span>;

  return (
    <ConfirmDialog
      destructive
      title="Refund this job?"
      description={`Returns up to ${formatCredits(refundable)} to the user, restoring non-expiring credits first.`}
      confirmLabel="Refund"
      confirmDisabled={note.trim().length === 0}
      onOpenChange={(open) => !open && setNote("")}
      onConfirm={handleRefund}
      trigger={
        <Button variant="outline" size="xs">
          <Undo2 aria-hidden />
          Refund
        </Button>
      }
    >
      <div className="space-y-2">
        <label htmlFor={`refund-note-${row.job._id}`} className="text-sm font-medium">
          Note
        </label>
        <p className="text-sm text-mute">Stored on the ledger line. Say why.</p>
        <Input
          id={`refund-note-${row.job._id}`}
          value={note}
          placeholder="Upstream image API returned 500s"
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

function RetryAction({ row }: { row: AdminJobRow }) {
  const retryJob = useMutation(adminApi.retryJob);
  const [pending, setPending] = useState(false);

  if (row.job.status !== "failed" && row.job.status !== "partial") return null;

  async function handleRetry() {
    setPending(true);
    try {
      await retryJob({ jobId: row.job._id });
      toast.success("Retry queued.", {
        description: "It spends the user's own credits, like any resume.",
      });
    } catch (error) {
      reportError(error, "Could not retry that job.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="xs" disabled={pending} onClick={() => void handleRetry()}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
      Retry
    </Button>
  );
}

export function JobsTable() {
  const [filter, setFilter] = useState<FilterValue>("all");
  const rows = useQuery(adminApi.recentJobs, {
    ...(filter === "all" ? {} : { status: filter as StatusFilter }),
    limit: 25,
  });

  return (
    <section className="border border-hairline">
      <header className="flex flex-col gap-3 border-b border-hairline px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Recent jobs</h2>
          <p className="text-sm text-mute">
            Newest first. Refunds go through the ledger, never the user document.
          </p>
        </div>
        <label className="sr-only" htmlFor="job-status-filter">
          Filter jobs by status
        </label>
        <select
          id="job-status-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as FilterValue)}
          className="h-10 rounded-full border border-hairline bg-soft-cloud px-4 text-sm font-medium outline-none focus:border-ink focus:bg-canvas"
        >
          {FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === "all" ? "All statuses" : titleCase(value)}
            </option>
          ))}
        </select>
      </header>

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {rows === undefined ? (
          <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading jobs">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-none" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={ListChecks}
              title={filter === "all" ? "No jobs yet" : `No ${filter} jobs`}
              description={
                filter === "all"
                  ? "Ingest and render jobs appear here as soon as someone starts one."
                  : "Nothing matches this filter right now."
              }
              action={
                filter === "all" ? null : (
                  <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                    Show all jobs
                  </Button>
                )
              }
              className="min-h-[200px] border-0"
            />
          </div>
        ) : (
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-mute">
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">User</th>
                <th className="px-4 py-3 text-right font-medium">Reserved</th>
                <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Refunded</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Created</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Error</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.job._id} className="border-b border-hairline last:border-0">
                  <td className="px-4 py-3 font-medium">{titleCase(row.job.type)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
                        STATUS_CLASS[row.job.status],
                      )}
                    >
                      {titleCase(row.job.status)}
                    </span>
                  </td>
                  <td className="hidden max-w-[20ch] truncate px-4 py-3 text-mute sm:table-cell">
                    {row.userName ?? row.userEmail ?? "Unknown"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatNumber(reservedTotal(row.job))}
                  </td>
                  <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
                    {formatNumber(refundedTotal(row.job))}
                  </td>
                  <td className="hidden px-4 py-3 text-mute md:table-cell">
                    {formatRelative(row.job.createdAt)}
                  </td>
                  <td
                    className="hidden max-w-[28ch] truncate px-4 py-3 text-sale lg:table-cell"
                    title={row.job.error}
                  >
                    {row.job.error ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <RetryAction row={row} />
                      <RefundAction row={row} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
