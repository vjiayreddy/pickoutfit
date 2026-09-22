import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertOwner } from "../lib/auth";
import { appError } from "../lib/errors";
import {
  LIMITS,
  renderCreditCost,
  usageToUsd,
  type RenderQuality,
  type TokenUsage,
} from "../shared/credits";
import type { RenderView } from "../views";
import { resolveAvatar } from "./avatars";
import { hasCurrentFeature } from "./credits";
import { assertJobFinished } from "./jobs";
import { requireOutfit, validateSlots } from "./outfits";
import { bumpDailyStats } from "./stats";

type Ctx = QueryCtx | MutationCtx;

const PIPELINES_UNAVAILABLE =
  "AI pipelines are not enabled yet. Try-on renders land in Phase 3.";

export async function toRenderView(
  ctx: Ctx,
  render: Doc<"renders">,
  outfitName?: string,
): Promise<RenderView> {
  const name =
    outfitName ?? (await ctx.db.get(render.outfitId))?.name ?? "Outfit";
  return {
    _id: render._id,
    outfitId: render.outfitId,
    outfitName: name,
    avatarId: render.avatarId,
    jobId: render.jobId,
    status: render.status,
    quality: render.quality,
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
 * Validates outfits/avatar/plan limits. Workflow + credit reserve land in Phase 3.
 */
export async function startRenderJob(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: StartRenderInput,
): Promise<{ jobId: Id<"jobs">; renderIds: Id<"renders">[] }> {
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
  if (input.quality === "hq" && !hasCurrentFeature(user, "hq_renders")) {
    throw appError(
      "FEATURE_LOCKED",
      "HQ renders are part of the Plus plan.",
      { feature: "hq_renders" },
    );
  }

  for (const outfitId of outfitIds) {
    const outfit = await requireOutfit(ctx, user, outfitId);
    await validateSlots(ctx, user, outfit.slots);
  }
  await resolveAvatar(ctx, user, input.avatarId);

  // Keep the cost check surface available for clients quoting before Phase 3.
  void renderCreditCost(input.quality, count, outfitIds.length);

  throw appError("UPSTREAM_FAILED", PIPELINES_UNAVAILABLE);
}
