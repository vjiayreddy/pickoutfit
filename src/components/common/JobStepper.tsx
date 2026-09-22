"use client";

import type { FunctionReturnType } from "convex/server";
import { AlertCircle, Check, Clock3, Loader2, Minus } from "lucide-react";
import {
  isTerminalJobStatus,
  stepIndex,
  stepPrefix,
} from "@convex/shared/jobs";
import type { api } from "@convex/_generated/api";
import { cn } from "@/lib/cn";

type Job = NonNullable<FunctionReturnType<typeof api.jobs.get>>;
type Step = Job["steps"][number];

type ProgressPhase = {
  key: string;
  label: string;
  status: Step["status"] | "partial";
};

const PHASE_LABELS: Record<string, string> = {
  upload: "Upload",
  detect: "Scan",
  review: "Review",
  reserve: "Prepare",
  extract: "Cut out",
  render: "Create",
  finalize: "Finish",
};

function jobProgress(job: Pick<Job, "steps" | "status" | "error">) {
  const terminal = isTerminalJobStatus(job.status);
  const groups = new Map<string, Step[]>();
  for (const step of job.steps) {
    const key = stepIndex(step.key) !== null ? stepPrefix(step.key) : step.key;
    groups.set(key, [...(groups.get(key) ?? []), step]);
  }
  const phases: ProgressPhase[] = [...groups].map(([key, steps]) => {
    const done = steps.filter((s) => s.status === "done").length;
    const failed = steps.filter((s) => s.status === "failed").length;
    const skipped = steps.filter((s) => s.status === "skipped").length;
    const unfinished = steps.length - done - failed - skipped;
    let status: ProgressPhase["status"];
    if (unfinished > 0 && !terminal) {
      status = steps.some((s) => s.status === "running") ? "running" : "pending";
    } else if (failed > 0) {
      status = failed === steps.length ? "failed" : "partial";
    } else if (done > 0) {
      status = "done";
    } else if (skipped === steps.length) {
      status = "skipped";
    } else {
      status = "pending";
    }
    return { key, label: PHASE_LABELS[key] ?? key, status };
  });

  const running = job.steps.find((s) => s.status === "running");
  const title =
    job.status === "failed"
      ? "Failed"
      : job.status === "done"
        ? "Done"
        : job.status === "queued"
          ? "Queued"
          : (running?.label ?? "Working…");

  return { phases, title, terminal };
}

export function JobStepper({
  job,
  className,
}: {
  job: Pick<Job, "steps" | "status" | "progress" | "error">;
  className?: string;
}) {
  const view = jobProgress(job);
  const error =
    view.terminal && job.status !== "done" ? job.error : undefined;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 text-xs" role="status">
        <span
          className={cn(
            "font-medium",
            job.status === "failed" && "text-sale",
          )}
        >
          {view.title}
        </span>
        <span className="tabular-nums text-mute">{Math.round(job.progress)}%</span>
      </div>
      <ol className="grid grid-cols-3 gap-x-2 gap-y-3" aria-label="Progress stages">
        {view.phases.map((phase) => (
          <li
            key={phase.key}
            className="min-w-0"
            aria-current={phase.status === "running" ? "step" : undefined}
          >
            <div
              className={cn(
                "mb-2 h-0.5 bg-hairline",
                phase.status === "done" && "bg-ink",
                phase.status === "running" && "animate-pulse bg-ink",
                phase.status === "failed" && "bg-sale",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "flex items-center gap-1.5 text-[10px]",
                phase.status === "pending" && "text-mute",
              )}
            >
              <PhaseIcon status={phase.status} />
              <span className="truncate">{phase.label}</span>
            </span>
          </li>
        ))}
      </ol>
      {error ? (
        <p className="text-xs leading-relaxed break-words text-sale">{error}</p>
      ) : null}
      {!view.terminal ? (
        <p className="text-[11px] leading-relaxed text-mute">
          You can keep browsing. Updates appear here automatically.
        </p>
      ) : null}
    </div>
  );
}

function PhaseIcon({ status }: { status: ProgressPhase["status"] }) {
  const base = "size-3 shrink-0";
  if (status === "running")
    return <Loader2 className={cn(base, "animate-spin")} aria-label="In progress" />;
  if (status === "done")
    return <Check className={base} aria-label="Complete" />;
  if (status === "failed" || status === "partial")
    return <AlertCircle className={cn(base, "text-sale")} aria-label="Failed" />;
  if (status === "skipped")
    return <Minus className={cn(base, "text-mute")} aria-label="Skipped" />;
  return <Clock3 className={cn(base, "text-mute")} aria-label="Waiting" />;
}
