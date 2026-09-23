import { v } from "convex/values";
import { internal } from "../_generated/api";
import { GROOM_STEPS } from "../shared/jobs";
import { workflow } from "./manager";

/**
 * Single second-pass hair/beard edit. Credits reserved by renders.groom / startGroomJob.
 * Completion reuses onRenderComplete (refund unfinished images + settle job).
 */

export type GroomOutcome = { rendered: number; failed: number };

const vGroomOutcome = v.object({ rendered: v.number(), failed: v.number() });

export const groomLook = workflow
  .define({
    args: { jobId: v.id("jobs"), renderId: v.id("renders") },
    returns: vGroomOutcome,
  })
  .handler(async (step, args): Promise<GroomOutcome> => {
    const stepKey = `${GROOM_STEPS.groom}:0`;
    await step.runMutation(internal.ai.pipeline.markStep, {
      jobId: args.jobId,
      key: GROOM_STEPS.reserve,
      status: "done",
    });

    try {
      const result = await step.runAction(
        internal.ai.openai.groomImage,
        { renderId: args.renderId, jobId: args.jobId, stepKey },
        { retry: true },
      );
      return result === null
        ? { rendered: 1, failed: 0 }
        : { rendered: 0, failed: 1 };
    } catch {
      return { rendered: 0, failed: 1 };
    }
  });
