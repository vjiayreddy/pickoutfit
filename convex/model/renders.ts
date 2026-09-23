import { start } from "@convex-dev/workflow";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertOwner } from "../lib/auth";
import { appError } from "../lib/errors";
import {
  CREDIT_COSTS,
  LIMITS,
  renderCreditCost,
  usageToUsd,
  type RenderQuality,
  type TokenUsage,
} from "../shared/credits";
import {
  groomingCaption,
  normalizeGroomCustom,
  validateGroomingSelection,
  type GroomingSelection,
} from "../shared/grooming";
import { GROOM_STEPS, RENDER_STEPS } from "../shared/jobs";
import type { RenderView } from "../views";
import { resolveAvatar } from "./avatars";
import { hasCurrentFeature, reserve, shortfallError } from "./credits";
import { ensureFreshBilling } from "./subscriptions";
import {
  assertAffordable,
  assertBelowJobLimit,
  assertJobFinished,
  createJob,
  setStep,
  setWorkflowId,
  type StepInput,
} from "./jobs";
import { requireOutfit, validateSlots } from "./outfits";
import { bumpDailyStats } from "./stats";

type Ctx = QueryCtx | MutationCtx;

export async function toRenderView(
  ctx: Ctx,
  render: Doc<"renders">,
  outfitName?: string,
): Promise<RenderView> {
  const name =
    outfitName ?? (await ctx.db.get(render.outfitId))?.name ?? "Outfit";
  const kind = render.kind ?? "try_on";
  return {
    _id: render._id,
    outfitId: render.outfitId,
    outfitName: name,
    avatarId: render.avatarId,
    jobId: render.jobId,
    status: render.status,
    quality: render.quality,
    kind,
    parentRenderId: render.parentRenderId,
    grooming: render.grooming,
    groomingLabel:
      kind === "groom" && render.grooming
        ? groomingCaption(render.grooming)
        : undefined,
    url: render.storageId
      ? await ctx.storage.getUrl(render.storageId)
      : null,
    creditsCharged: render.creditsCharged,
    shareToken: render.shareToken,
    error: render.error,
    createdAt: render.createdAt,
    completedAt: render.completedAt,
  };
}

export async function markRenderDone(
  ctx: MutationCtx,
  renderId: Id<"renders">,
  result: { storageId: Id<"_storage">; usage?: TokenUsage },
): Promise<void> {
  const costUsd = result.usage ? usageToUsd(result.usage) : 0;
  await ctx.db.patch(renderId, {
    storageId: result.storageId,
    usage: result.usage,
    costUsd: result.usage ? costUsd : undefined,
    status: "done",
    completedAt: Date.now(),
  });
  await bumpDailyStats(ctx, { rendersDone: 1, cogsUsd: costUsd });
}

/** Keeps the exact prompt we sent, for admin COGS forensics. */
export async function setRenderPrompt(
  ctx: MutationCtx,
  renderId: Id<"renders">,
  prompt: string,
): Promise<void> {
  await ctx.db.patch(renderId, { prompt });
}

export async function markRenderFailed(
  ctx: MutationCtx,
  renderId: Id<"renders">,
  error: string,
): Promise<void> {
  await ctx.db.patch(renderId, {
    status: "failed",
    error,
    completedAt: Date.now(),
  });
}

export async function listByJob(
  ctx: Ctx,
  jobId: Id<"jobs">,
): Promise<Doc<"renders">[]> {
  return ctx.db
    .query("renders")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .take(LIMITS.maxOutfitsPerRenderRequest * LIMITS.maxRendersPerRequest);
}

export async function requireRender(
  ctx: Ctx,
  user: Doc<"users">,
  renderId: Id<"renders">,
): Promise<Doc<"renders">> {
  return assertOwner(await ctx.db.get(renderId), user, "render");
}

/** Newest first. Bounded: the outfit detail panel only ever shows the most recent images. */
export async function listByOutfit(
  ctx: Ctx,
  outfitId: Id<"outfits">,
  limit = 100,
): Promise<Doc<"renders">[]> {
  return ctx.db
    .query("renders")
    .withIndex("by_outfit", (q) => q.eq("outfitId", outfitId))
    .order("desc")
    .take(limit);
}

export async function findByShareToken(
  ctx: Ctx,
  token: string,
): Promise<Doc<"renders"> | null> {
  if (!token) return null;
  return ctx.db
    .query("renders")
    .withIndex("by_shareToken", (q) => q.eq("shareToken", token))
    .unique();
}

/** Deletes the render and its image file. */
export async function removeRender(
  ctx: MutationCtx,
  render: Doc<"renders">,
): Promise<void> {
  await assertJobFinished(ctx, render.jobId);
  if (render.storageId) await ctx.storage.delete(render.storageId);
  await ctx.db.delete(render._id);
}

export type StartRenderInput = {
  outfitIds: Id<"outfits">[];
  avatarId?: Id<"avatars">;
  count: number;
  quality: RenderQuality;
  threadId?: Id<"threads">;
};

/**
 * Validate → reserve → create pending `renders` rows → start the render workflow.
 * Shared by renders.start, renders.regenerate, and (later) agent.startRenders.
 */
export async function startRenderJob(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: StartRenderInput,
): Promise<{ jobId: Id<"jobs">; renderIds: Id<"renders">[] }> {
  const billed = await ensureFreshBilling(ctx, user);
  const count = Math.trunc(input.count);
  if (
    !Number.isFinite(count) ||
    count < 1 ||
    count > LIMITS.maxRendersPerRequest
  ) {
    throw appError(
      "INVALID_INPUT",
      `Choose between 1 and ${LIMITS.maxRendersPerRequest} images.`,
      { max: LIMITS.maxRendersPerRequest },
    );
  }
  const outfitIds = [...new Set(input.outfitIds)];
  if (outfitIds.length === 0) {
    throw appError("INVALID_INPUT", "Pick an outfit to render.");
  }
  if (outfitIds.length > LIMITS.maxOutfitsPerRenderRequest) {
    throw appError(
      "INVALID_INPUT",
      `You can render up to ${LIMITS.maxOutfitsPerRenderRequest} outfits at once.`,
      { max: LIMITS.maxOutfitsPerRenderRequest },
    );
  }
  if (input.quality === "hq" && !hasCurrentFeature(billed, "hq_renders")) {
    throw appError(
      "FEATURE_LOCKED",
      "HQ renders are part of the Plus plan.",
      { feature: "hq_renders" },
    );
  }

  for (const outfitId of outfitIds) {
    const outfit = await requireOutfit(ctx, billed, outfitId);
    await validateSlots(ctx, billed, outfit.slots);
  }
  const avatar = await resolveAvatar(ctx, billed, input.avatarId);

  const images = count * outfitIds.length;
  const needed = renderCreditCost(input.quality, count, outfitIds.length);
  await assertBelowJobLimit(ctx, billed._id);
  assertAffordable(billed, needed);

  const steps: StepInput[] = [
    { key: RENDER_STEPS.reserve },
    ...Array.from({ length: images }, (_, index) => ({
      key: `${RENDER_STEPS.render}:${index}`,
    })),
    { key: RENDER_STEPS.finalize },
  ];
  const jobId = await createJob(ctx, billed, {
    type: "render",
    steps,
    outfitIds,
  });

  const result = await reserve(ctx, billed, needed, jobId);
  if (result.granted < needed) throw shortfallError(result, needed);
  await setStep(ctx, jobId, RENDER_STEPS.reserve, {
    status: "done",
    meta: { credits: needed },
  });

  const now = Date.now();
  const renderIds: Id<"renders">[] = [];
  for (const outfitId of outfitIds) {
    for (let index = 0; index < count; index += 1) {
      renderIds.push(
        await ctx.db.insert("renders", {
          userId: user._id,
          outfitId,
          avatarId: avatar._id,
          jobId,
          quality: input.quality,
          kind: "try_on",
          status: "pending",
          prompt: "",
          creditsCharged: CREDIT_COSTS.render[input.quality],
          createdAt: now,
        }),
      );
    }
  }

  const workflowId = await start(
    ctx,
    internal.workflows.render.renderOutfits,
    { jobId, renderIds },
    {
      onComplete: internal.workflows.render.onRenderComplete,
      context: { jobId },
    },
  );
  await setWorkflowId(ctx, jobId, workflowId);

  if (input.threadId) {
    await attachJobToProposals(ctx, user, input.threadId, outfitIds, jobId);
  }
  return { jobId, renderIds };
}

export type StartGroomInput = {
  parentRenderId: Id<"renders">;
  hair: GroomingSelection["hair"];
  beard: GroomingSelection["beard"];
  custom?: string;
};

/**
 * Second-pass hair/beard edit on a finished try-on. Creates a new `renders` variant;
 * the parent look stays. Masculine presentation only.
 */
export async function startGroomJob(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: StartGroomInput,
): Promise<{ jobId: Id<"jobs">; renderId: Id<"renders"> }> {
  const billed = await ensureFreshBilling(ctx, user);
  if (billed.prefs.presentation !== "masculine") {
    throw appError(
      "INVALID_INPUT",
      "Hair & beard styling is available for men's presentation.",
    );
  }

  const custom = normalizeGroomCustom(input.custom);
  const selection: GroomingSelection = {
    hair: input.hair,
    beard: input.beard,
    ...(custom ? { custom } : {}),
  };
  const invalid = validateGroomingSelection(selection);
  if (invalid) throw appError("INVALID_INPUT", invalid);

  const parent = await requireRender(ctx, billed, input.parentRenderId);
  if (parent.status !== "done" || !parent.storageId) {
    throw appError(
      "INVALID_INPUT",
      "Wait for the try-on to finish before styling hair & beard.",
    );
  }
  await assertJobFinished(ctx, parent.jobId, "retry");

  if (parent.quality === "hq" && !hasCurrentFeature(billed, "hq_renders")) {
    throw appError("FEATURE_LOCKED", "HQ renders are part of the Plus plan.", {
      feature: "hq_renders",
    });
  }

  const needed = renderCreditCost(parent.quality, 1, 1);
  await assertBelowJobLimit(ctx, billed._id);
  assertAffordable(billed, needed);

  const stepKey = `${GROOM_STEPS.groom}:0`;
  const steps: StepInput[] = [
    { key: GROOM_STEPS.reserve },
    { key: stepKey },
    { key: GROOM_STEPS.finalize },
  ];
  const jobId = await createJob(ctx, billed, {
    type: "groom",
    steps,
    outfitIds: [parent.outfitId],
  });

  const result = await reserve(ctx, billed, needed, jobId);
  if (result.granted < needed) throw shortfallError(result, needed);
  await setStep(ctx, jobId, GROOM_STEPS.reserve, {
    status: "done",
    meta: { credits: needed },
  });

  const renderId = await ctx.db.insert("renders", {
    userId: billed._id,
    outfitId: parent.outfitId,
    avatarId: parent.avatarId,
    jobId,
    quality: parent.quality,
    kind: "groom",
    parentRenderId: parent._id,
    sourceStorageId: parent.storageId,
    grooming: selection,
    status: "pending",
    prompt: "",
    creditsCharged: CREDIT_COSTS.render[parent.quality],
    createdAt: Date.now(),
  });

  await setStep(ctx, jobId, stepKey, {
    status: "pending",
    meta: { renderId },
  });

  const workflowId = await start(
    ctx,
    internal.workflows.groom.groomLook,
    { jobId, renderId },
    {
      onComplete: internal.workflows.render.onRenderComplete,
      context: { jobId },
    },
  );
  await setWorkflowId(ctx, jobId, workflowId);
  return { jobId, renderId };
}

/** Keeps the stylist thread in sync: one proposal row per outfit, carrying the render job. */
async function attachJobToProposals(
  ctx: MutationCtx,
  user: Doc<"users">,
  threadId: Id<"threads">,
  outfitIds: Id<"outfits">[],
  jobId: Id<"jobs">,
): Promise<void> {
  const existing = await ctx.db
    .query("proposals")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .take(LIMITS.maxOutfitsPerRenderRequest * 4);
  for (const outfitId of outfitIds) {
    const proposal = existing.find((row) => row.outfitId === outfitId);
    if (proposal) {
      await ctx.db.patch(proposal._id, { jobId });
    } else {
      await ctx.db.insert("proposals", {
        threadId,
        userId: user._id,
        outfitId,
        jobId,
        createdAt: Date.now(),
      });
    }
  }
}
