import { vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { completeJob, getJob, setStep } from "../model/jobs";
import { extractStepKey } from "../model/vendorIngest";
import { refundQuota } from "../model/vendors";
import { INGEST_STEPS, isTerminalJobStatus, type JobStatus } from "../shared/jobs";
import { workflow } from "./manager";

/**
 * Store import: after the free scan (shared `scanUpload`), the chosen candidates already exist as
 * draft products. This workflow cuts each one out of the look photo. Failures leave the draft with
 * its reference photo and hand the quota back.
 */

const MAX_PARALLEL_EXTRACTIONS = 4;

type SettledStatus = Extract<JobStatus, "done" | "partial" | "failed" | "cancelled">;

export const extractProducts = workflow
  .define({
    args: { jobId: v.id("jobs"), productIds: v.array(v.id("products")) },
    returns: v.object({ extracted: v.number(), failed: v.number() }),
  })
  .handler(async (step, args): Promise<{ extracted: number; failed: number }> => {
    let extracted = 0;
    let failed = 0;
    for (let start = 0; start < args.productIds.length; start += MAX_PARALLEL_EXTRACTIONS) {
      const chunk = args.productIds.slice(start, start + MAX_PARALLEL_EXTRACTIONS);
      const results = await Promise.allSettled(
        chunk.map((productId, offset) =>
          step.runAction(
            internal.ai.openai.extractProductCutout,
            { productId, jobId: args.jobId, stepKey: extractStepKey(start + offset) },
            { retry: true },
          ),
        ),
      );
      for (const result of results) {
        if (result.status === "fulfilled") extracted += 1;
        else failed += 1;
      }
    }
    return { extracted, failed };
  });

/** Settles the import job and refunds quota for every draft that has no cutout. */
export const onExtractComplete = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ jobId: v.id("jobs") }) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await getJob(ctx, args.context.jobId);
    if (isTerminalJobStatus(job.status)) return null;

    const steps = job.steps.filter((step) => step.key.startsWith(`${INGEST_STEPS.extract}:`));
    const extracted = steps.filter((step) => step.status === "done").length;
    const failed = steps.length - extracted;
    const stepError = steps.find((step) => step.status === "failed")?.error;

    // Anything still `running` at this point crashed or was cancelled mid-flight.
    for (const step of steps) {
      if (step.status === "done" || step.status === "failed") continue;
      await setStep(ctx, job._id, step.key, { status: "failed", error: "Import stopped before this piece." });
    }
    if (failed > 0 && job.vendorId) await refundQuota(ctx, job.vendorId, failed);

    let status: SettledStatus;
    let error: string | undefined;
    if (args.result.kind === "canceled") {
      status = "cancelled";
      error = "Cancelled before every piece was cut out.";
    } else if (args.result.kind === "failed") {
      status = "failed";
      error = args.result.error;
    } else if (steps.length > 0 && extracted === 0) {
      status = "failed";
      error = stepError ?? "Nothing could be cut out of this photo.";
    } else if (failed > 0) {
      status = "partial";
      error = stepError;
    } else {
      status = "done";
    }

    if (job.uploadId) {
      const upload = await ctx.db.get(job.uploadId);
      if (upload?.jobId === job._id) await ctx.db.patch(job.uploadId, { status: uploadStatus(status, extracted) });
    }
    await setStep(ctx, job._id, INGEST_STEPS.finalize, {
      status: "done",
      meta: { extracted, failed, refunded: failed },
    });
    await completeJob(ctx, job._id, { status, error });
    return null;
  },
});

function uploadStatus(status: SettledStatus, extracted: number): Doc<"uploads">["status"] {
  if (status === "done") return "done";
  if (status === "partial") return "partial";
  return extracted > 0 ? "partial" : "failed";
}
