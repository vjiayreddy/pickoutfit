import { vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { completeJob, getJob, setStep } from "../model/jobs";
import { extractStepKey } from "../model/vendorIngest";
import { refundQuota } from "../model/vendors";
import { INGEST_STEPS, isTerminalJobStatus, type JobStatus } from "../shared/jobs";
import { workflow } from "./manager";

/**
 * Store import: after the free scan, chosen candidates are draft products.
 * For 2+ pieces we use one catalogue-grid board + local crops (grid-demo path).
 * Failures fall back to a single-piece extract, then settle + refund quota.
 */

const MAX_PARALLEL_EXTRACTIONS = 4;

type SettledStatus = Extract<JobStatus, "done" | "partial" | "failed" | "cancelled">;

export const extractProducts = workflow
  .define({
    args: { jobId: v.id("jobs"), productIds: v.array(v.id("products")) },
    returns: v.object({ extracted: v.number(), failed: v.number() }),
  })
  .handler(async (step, args): Promise<{ extracted: number; failed: number }> => {
    const cropped = new Set<Id<"products">>();

    if (args.productIds.length >= 2) {
      try {
        const board = await step.runAction(
          internal.ai.vendorCutout.cutVendorSelection,
          { jobId: args.jobId, productIds: args.productIds },
          { retry: false },
        );
        for (const productId of board.cropped) cropped.add(productId);
      } catch {
        // Per-piece extract below still runs for everything.
      }
    }

    const remaining = args.productIds.filter((productId) => !cropped.has(productId));
    let extracted = cropped.size;
    let failed = 0;

    for (let start = 0; start < remaining.length; start += MAX_PARALLEL_EXTRACTIONS) {
      const chunk = remaining.slice(start, start + MAX_PARALLEL_EXTRACTIONS);
      const results = await Promise.allSettled(
        chunk.map((productId) => {
          const index = args.productIds.indexOf(productId);
          return step.runAction(
            internal.ai.openai.extractProductCutout,
            {
              productId,
              jobId: args.jobId,
              stepKey: extractStepKey(index < 0 ? start : index),
            },
            { retry: true },
          );
        }),
      );
      for (const result of results) {
        if (result.status === "fulfilled") extracted += 1;
        else failed += 1;
      }
    }

    // Pieces that already failed on the board and never made remaining? remaining covers them.
    // If board marked failed then extract also failed, counted in failed.
    // If board succeeded for all, remaining empty.
    return { extracted, failed };
  });

/** Settles the import job and refunds quota for every draft that has no cutout. */
export const onExtractComplete = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object({ jobId: v.id("jobs") }) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await getJob(ctx, args.context.jobId);
    if (isTerminalJobStatus(job.status)) return null;

    const extractSteps = () =>
      job.steps.filter((step) => step.key.startsWith(`${INGEST_STEPS.extract}:`));

    // Anything still `running` at this point crashed or was cancelled mid-flight.
    for (const step of extractSteps()) {
      if (step.status === "done" || step.status === "failed") continue;
      await setStep(ctx, job._id, step.key, { status: "failed", error: "Import stopped before this piece." });
    }

    // Re-read after patches — `job.steps` on the in-memory doc is stale after setStep.
    const settled = await getJob(ctx, args.context.jobId);
    const steps = settled.steps.filter((step) => step.key.startsWith(`${INGEST_STEPS.extract}:`));
    const doneCount = steps.filter((step) => step.status === "done").length;
    const finalFailed = steps.length - doneCount;
    const stepError = steps.find((step) => step.status === "failed")?.error;

    if (finalFailed > 0 && settled.vendorId) await refundQuota(ctx, settled.vendorId, finalFailed);

    let status: SettledStatus;
    let error: string | undefined;
    if (args.result.kind === "canceled") {
      status = "cancelled";
      error = "Cancelled before every piece was cut out.";
    } else if (args.result.kind === "failed") {
      status = "failed";
      error = args.result.error;
    } else if (steps.length > 0 && doneCount === 0) {
      status = "failed";
      error = stepError ?? "Nothing could be cut out of this photo.";
    } else if (finalFailed > 0) {
      status = "partial";
      error = stepError;
    } else {
      status = "done";
    }

    if (settled.uploadId) {
      const upload = await ctx.db.get(settled.uploadId);
      if (upload?.jobId === settled._id) {
        await ctx.db.patch(settled.uploadId, { status: uploadStatus(status, doneCount) });
      }
    }
    await setStep(ctx, settled._id, INGEST_STEPS.finalize, {
      status: "done",
      meta: { extracted: doneCount, failed: finalFailed, refunded: finalFailed },
    });
    await completeJob(ctx, settled._id, { status, error });
    return null;
  },
});

function uploadStatus(status: SettledStatus, extracted: number): Doc<"uploads">["status"] {
  if (status === "done") return "done";
  if (status === "partial") return "partial";
  return extracted > 0 ? "partial" : "failed";
}
