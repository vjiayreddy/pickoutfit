import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { LIMITS } from "../shared/credits";
import {
  isTerminalJobStatus,
  stepLabel,
  stepPrefix,
  type JobStatus,
  type JobType,
  type StepStatus,
} from "../shared/jobs";
import { getBalance, shortfallError } from "./credits";
import { bumpDailyStats } from "./stats";

type Ctx = QueryCtx | MutationCtx;
export type StepInput = {
  key: string;
  label?: string;
  meta?: Record<string, unknown>;
};
export type StepPatch = {
  status: StepStatus;
  error?: string;
  meta?: Record<string, unknown>;
  label?: string;
};

const ACTIVE_STATUSES: readonly JobStatus[] = ["queued", "running"];

const STEP_STATS_ALPHA = 0.2;
const STEP_STATS_MAX_SAMPLES = 200;
const STEP_ESTIMATE_LIMIT = 50;

export async function countRunning(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<number> {
  return (await activeJobs(ctx, userId)).length;
}

export async function countRunningUnits(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<number> {
  const jobs = await activeJobs(ctx, userId);
  const batches = new Set<string>();
  let units = 0;
  for (const job of jobs) {
    if (job.batchId) {
      if (batches.has(job.batchId)) continue;
      batches.add(job.batchId);
    }
    units += 1;
  }
  return units;
}

async function activeJobs(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"jobs">[]> {
  const lists = await Promise.all(
    ACTIVE_STATUSES.map((status) =>
      ctx.db
        .query("jobs")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", status),
        )
        .collect(),
    ),
  );
  return lists.flat();
}

export async function listActive(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<Doc<"jobs">[]> {
  const lists = await Promise.all(
    ACTIVE_STATUSES.map((status) =>
      ctx.db
        .query("jobs")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", userId).eq("status", status),
        )
        .order("desc")
        .collect(),
    ),
  );
  return lists.flat().sort((a, b) => b.createdAt - a.createdAt);
}

export async function createJob(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: {
    type: JobType;
    steps: StepInput[];
    uploadId?: Id<"uploads">;
    batchId?: string;
    outfitIds?: Id<"outfits">[];
  },
): Promise<Id<"jobs">> {
  const now = Date.now();
  return ctx.db.insert("jobs", {
    userId: user._id,
    type: input.type,
    status: "queued",
    steps: input.steps.map((step) => ({
      key: step.key,
      label: step.label ?? stepLabel(step.key, step.meta),
      status: "pending" as const,
      meta: step.meta,
    })),
    progress: 0,
    reservation: { plan: 0, pack: 0 },
    refunds: { plan: 0, pack: 0 },
    uploadId: input.uploadId,
    batchId: input.batchId,
    outfitIds: input.outfitIds,
    resultIds: [],
    createdAt: now,
    updatedAt: now,
  });
}

export async function assertBelowJobLimit(
  ctx: Ctx,
  userId: Id<"users">,
): Promise<void> {
  const running = await countRunningUnits(ctx, userId);
  if (running >= LIMITS.maxRunningJobsPerUser) {
    throw appError(
      "TOO_MANY_JOBS",
      `You already have ${running} jobs running. Wait for one to finish.`,
    );
  }
}

export function assertAffordable(user: Doc<"users">, needed: number): void {
  const { total, dailyRemaining } = getBalance(user);
  const available = Math.min(total, dailyRemaining);
  if (needed <= available) return;
  throw shortfallError(
    {
      granted: available,
      shortfall: needed - available,
      reservation: { plan: 0, pack: 0 },
      reason: total >= needed && dailyRemaining < needed ? "daily_cap" : "balance",
    },
    needed,
  );
}

export async function getJob(
  ctx: Ctx,
  jobId: Id<"jobs">,
): Promise<Doc<"jobs">> {
  const job = await ctx.db.get(jobId);
  if (!job) throw appError("NOT_FOUND", "Job not found.");
  return job;
}

export async function assertJobFinished(
  ctx: Ctx,
  jobId: Id<"jobs">,
  operation: "delete" | "retry" = "delete",
): Promise<void> {
  const job = await ctx.db.get(jobId);
  if (job && !isTerminalJobStatus(job.status)) {
    throw appError(
      "CONFLICT",
      operation === "retry"
        ? "Wait for these try-ons to finish before trying again."
        : "Wait for the try-ons to finish before deleting this.",
    );
  }
}

export async function setWorkflowId(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  workflowId: string,
): Promise<void> {
  await ctx.db.patch(jobId, {
    workflowId,
    status: "running",
    updatedAt: Date.now(),
  });
}

export async function addSteps(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  steps: StepInput[],
): Promise<void> {
  const job = await getJob(ctx, jobId);
  const existing = new Set(job.steps.map((step) => step.key));
  const additions = steps
    .filter((step) => !existing.has(step.key))
    .map((step) => ({
      key: step.key,
      label: step.label ?? stepLabel(step.key, step.meta),
      status: "pending" as const,
      meta: step.meta,
    }));
  const merged = [...job.steps, ...additions];
  await ctx.db.patch(jobId, {
    steps: merged,
    progress: computeProgress(merged),
    updatedAt: Date.now(),
  });
}

export async function setStep(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  key: string,
  patch: StepPatch,
): Promise<void> {
  const job = await getJob(ctx, jobId);
  const now = Date.now();
  let found = false;
  let durationMs: number | undefined;
  const steps = job.steps.map((step) => {
    if (step.key !== key) return step;
    found = true;
    if (patch.status === "done" && step.startedAt !== undefined) {
      durationMs = now - step.startedAt;
    }
    const meta = patch.meta ? { ...(step.meta ?? {}), ...patch.meta } : step.meta;
    return {
      ...step,
      status: patch.status,
      label: patch.label ?? stepLabel(key, meta) ?? step.label,
      error: patch.error,
      meta,
      startedAt: step.startedAt ?? (patch.status === "running" ? now : undefined),
      finishedAt:
        patch.status === "done" ||
        patch.status === "failed" ||
        patch.status === "skipped"
          ? now
          : undefined,
    };
  });
  if (!found) {
    steps.push({
      key,
      label: patch.label ?? stepLabel(key, patch.meta),
      status: patch.status,
      error: patch.error,
      meta: patch.meta,
      startedAt: now,
      finishedAt:
        patch.status === "pending" || patch.status === "running"
          ? undefined
          : now,
    });
  }
  const status: JobStatus = isTerminalJobStatus(job.status)
    ? job.status
    : "running";
  await ctx.db.patch(jobId, {
    steps,
    progress: computeProgress(steps),
    status,
    updatedAt: now,
  });
  if (durationMs !== undefined) await recordStepDuration(ctx, key, durationMs);
}

async function recordStepDuration(
  ctx: MutationCtx,
  key: string,
  durationMs: number,
): Promise<void> {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  const prefix = stepPrefix(key);
  const existing = await ctx.db
    .query("stepStats")
    .withIndex("by_key", (q) => q.eq("key", prefix))
    .unique();
  if (!existing) {
    await ctx.db.insert("stepStats", {
      key: prefix,
      count: 1,
      avgMs: Math.round(durationMs),
    });
    return;
  }
  const avgMs =
    existing.avgMs + STEP_STATS_ALPHA * (durationMs - existing.avgMs);
  await ctx.db.patch(existing._id, {
    count: Math.min(existing.count + 1, STEP_STATS_MAX_SAMPLES),
    avgMs: Math.round(avgMs),
  });
}

export async function readStepEstimates(
  ctx: Ctx,
): Promise<Record<string, number>> {
  const rows = await ctx.db.query("stepStats").take(STEP_ESTIMATE_LIMIT);
  const estimates: Record<string, number> = {};
  for (const row of rows) if (row.avgMs > 0) estimates[row.key] = row.avgMs;
  return estimates;
}

export async function appendResult(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  resultId: string,
): Promise<void> {
  const job = await getJob(ctx, jobId);
  if (job.resultIds.includes(resultId)) return;
  await ctx.db.patch(jobId, {
    resultIds: [...job.resultIds, resultId],
    updatedAt: Date.now(),
  });
}

export async function completeJob(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  outcome: {
    status: Extract<JobStatus, "done" | "partial" | "failed" | "cancelled">;
    error?: string;
  },
): Promise<Doc<"jobs">> {
  const job = await getJob(ctx, jobId);
  const now = Date.now();
  const steps = job.steps.map((step) =>
    step.status === "pending" || step.status === "running"
      ? {
          ...step,
          status:
            outcome.status === "failed"
              ? ("failed" as const)
              : ("skipped" as const),
          finishedAt: now,
        }
      : step,
  );
  await ctx.db.patch(jobId, {
    status: outcome.status,
    error: outcome.error,
    steps,
    progress: outcome.status === "done" ? 1 : computeProgress(steps),
    updatedAt: now,
    completedAt: now,
  });
  if (outcome.status === "failed") {
    await bumpDailyStats(ctx, { jobsFailed: 1 }, now);
  }
  return getJob(ctx, jobId);
}

export function computeProgress(steps: Doc<"jobs">["steps"]): number {
  if (steps.length === 0) return 0;
  const finished = steps.filter(
    (step) =>
      step.status === "done" ||
      step.status === "skipped" ||
      step.status === "failed",
  ).length;
  const running =
    steps.filter((step) => step.status === "running").length * 0.5;
  return Math.min(1, (finished + running) / steps.length);
}
