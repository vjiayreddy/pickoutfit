"use client";

import { useQuery } from "convex/react";
import {
  Activity,
  ArrowUpRight,
  Check,
  Clock3,
  Loader2,
  ScanLine,
  Shirt,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { activeStepLabel, isTerminalJobStatus } from "@convex/shared/jobs";
import { cn } from "@/lib/cn";
import { formatPercent, pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

export function ActivityPopover({ className }: { className?: string }) {
  const jobs = useQuery(api.jobs.listActive);
  const count = jobs?.length ?? 0;
  const [open, setOpen] = useState(false);

  useJobCompletionToasts();

  const photos = jobs?.filter((job) => job.type === "ingest").length ?? 0;
  const grooms = jobs?.filter((job) => job.type === "groom").length ?? 0;
  const renders = count - photos - grooms;
  const counts = [
    photos ? pluralize(photos, "photo") : "",
    renders ? pluralize(renders, "try-on") : "",
    grooms ? pluralize(grooms, "style") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const running = jobs?.some((job) =>
    job.steps.some((step) => step.status === "running"),
  );

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-10 items-center justify-center rounded-full bg-soft-cloud text-ink transition active:scale-95 active:opacity-50"
        aria-label={count ? `Activity: ${counts} in progress` : "Activity"}
        aria-expanded={open}
      >
        {running ? (
          <Loader2 className="size-4 animate-spin" />
        ) : count ? (
          <Clock3 className="size-4" />
        ) : (
          <Activity className="size-4" />
        )}
        {count ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] leading-4 font-semibold text-canvas tabular-nums">
            {count}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close activity"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-24px))] overflow-hidden border border-hairline bg-canvas shadow-none">
            <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
              <h2 className="text-[10px] font-medium tracking-[0.16em] text-mute uppercase">
                Activity
              </h2>
              <span className="text-[10px] text-mute tabular-nums">
                {count ? counts : "Idle"}
              </span>
            </div>
            {jobs === undefined ? (
              <div className="flex items-center gap-2 p-4 text-xs text-mute">
                <Loader2 className="size-3.5 animate-spin" /> Checking…
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex items-start gap-3 p-4">
                <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="space-y-1">
                  <p className="text-sm font-medium">All caught up.</p>
                  <p className="text-xs leading-relaxed text-mute">
                    Scans and try-ons show here while they run.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="max-h-[min(420px,60svh)] divide-y divide-hairline overflow-y-auto">
                {jobs.map((job) => {
                  const queued =
                    job.status === "queued" ||
                    !job.steps.some((step) => step.status === "running");
                  const label =
                    activeStepLabel(job.steps) ??
                    (job.type === "ingest"
                      ? "Scanning photo"
                      : job.type === "groom"
                        ? "Styling hair & beard"
                        : "Rendering");
                  return (
                    <li key={job._id}>
                      <Link
                        href={
                          job.type === "ingest"
                            ? routes.add
                            : job.outfitIds?.[0]
                              ? routes.outfit(job.outfitIds[0])
                              : routes.lookbook
                        }
                        onClick={() => setOpen(false)}
                        className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-soft-cloud"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center bg-soft-cloud">
                          {job.type === "ingest" ? (
                            <ScanLine className="size-4" />
                          ) : (
                            <Shirt className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex items-center gap-1.5 text-xs font-medium">
                            {queued ? (
                              <Clock3 className="size-3 text-mute" />
                            ) : (
                              <Loader2 className="size-3 animate-spin" />
                            )}
                            {label}
                          </span>
                          <span className="block text-[11px] text-mute tabular-nums">
                            {formatPercent(job.progress)} ·{" "}
                            {job.type === "ingest"
                              ? "Import"
                              : job.type === "groom"
                                ? "Style"
                                : "Try-on"}
                          </span>
                        </span>
                        <ArrowUpRight
                          className="mt-1 size-3.5 shrink-0 text-mute group-hover:text-ink"
                          aria-hidden
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Toast when a watched job finishes (polls recent jobs for terminal status). */
function useJobCompletionToasts() {
  const recent = useQuery(api.jobs.listRecent, { limit: 10 });
  const seen = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!recent) return;
    for (const job of recent) {
      const prev = seen.current.get(job._id);
      if (!prev) {
        seen.current.set(job._id, job.status);
        continue;
      }
      if (prev !== job.status && isTerminalJobStatus(job.status)) {
        if (job.status === "done") {
          toast.success(
            job.type === "ingest"
              ? "Import finished."
              : job.type === "groom"
                ? "Hair & beard styling finished."
                : "Try-on finished.",
          );
        } else if (job.status === "failed") {
          toast.error(job.error ?? "Job failed.");
        } else if (job.status === "partial") {
          toast.message("Job finished with some issues.");
        }
      }
      seen.current.set(job._id, job.status);
    }
  }, [recent]);
}
