import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOnboarded, requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { hasCurrentFeature } from "./model/credits";
import { ensureFreshBilling } from "./model/subscriptions";
import { assertJobFinished } from "./model/jobs";
import { layeredItems, toItemSummary, toOutfitView } from "./model/outfits";
import {
  findByShareToken,
  listByOutfit as listRendersByOutfit,
  removeRender,
  requireRender,
  startGroomJob,
  startRenderJob,
  toRenderView,
} from "./model/renders";
import { vBeardStyle, vHairStyle, vRenderKind, vRenderQuality, vServiceId } from "./shared/validators";
import { vItemSummary, vOutfitView, vPaginated, vRenderView } from "./views";

/**
 * Validates → reserve → create pending renders → start workflow.
 */
export const start = mutation({
  args: {
    outfitIds: v.array(v.id("outfits")),
    avatarId: v.optional(v.id("avatars")),
    count: v.number(),
    quality: vRenderQuality,
  },
  returns: v.object({
    jobId: v.id("jobs"),
    renderIds: v.array(v.id("renders")),
  }),
  handler: async (ctx, args) => {
    const user = await requireOnboarded(ctx);
    return startRenderJob(ctx, user, args);
  },
});

export const listByOutfit = query({
  args: { outfitId: v.id("outfits") },
  returns: v.array(vRenderView),
  handler: async (ctx, { outfitId }) => {
    const user = await requireUser(ctx);
    const outfit = await ctx.db.get(outfitId);
    if (!outfit || outfit.userId !== user._id) return [];
    const renders = await listRendersByOutfit(ctx, outfit._id);
    return Promise.all(
      renders.map((render) => toRenderView(ctx, render, outfit.name)),
    );
  },
});

/** Lookbook: newest first, done and pending renders. */
export const listMine = query({
  args: {
    paginationOpts: paginationOptsValidator,
    outfitId: v.optional(v.id("outfits")),
  },
  returns: vPaginated(vRenderView),
  handler: async (ctx, { paginationOpts, outfitId }) => {
    const user = await requireUser(ctx);
    if (outfitId) {
      const outfit = await ctx.db.get(outfitId);
      if (!outfit || outfit.userId !== user._id) {
        return { page: [], isDone: true, continueCursor: "" };
      }
    }
    const result = outfitId
      ? await ctx.db
          .query("renders")
          .withIndex("by_outfit", (q) => q.eq("outfitId", outfitId))
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("renders")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .order("desc")
          .paginate(paginationOpts);
    return {
      page: await Promise.all(
        result.page.map((render) => toRenderView(ctx, render)),
      ),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const get = query({
  args: { renderId: v.id("renders") },
  returns: v.union(
    v.object({ render: vRenderView, outfit: v.union(vOutfitView, v.null()) }),
    v.null(),
  ),
  handler: async (ctx, { renderId }) => {
    const user = await requireUser(ctx);
    const render = await ctx.db.get(renderId);
    if (!render || render.userId !== user._id) return null;
    const outfit = render.outfitId ? await ctx.db.get(render.outfitId) : null;
    return {
      render: await toRenderView(ctx, render, outfit?.name),
      outfit: outfit ? await toOutfitView(ctx, outfit) : null,
    };
  },
});

/** Service pages: newest grooming previews, optionally for one service. */
export const listByKind = query({
  args: {
    paginationOpts: paginationOptsValidator,
    kind: vRenderKind,
    serviceId: v.optional(vServiceId),
  },
  returns: vPaginated(vRenderView),
  handler: async (ctx, { paginationOpts, kind, serviceId }) => {
    const user = await requireUser(ctx);
    const result = serviceId
      ? await ctx.db
          .query("renders")
          .withIndex("by_user_kind_service", (q) =>
            q.eq("userId", user._id).eq("kind", kind).eq("serviceId", serviceId),
          )
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("renders")
          .withIndex("by_user_kind", (q) => q.eq("userId", user._id).eq("kind", kind))
          .order("desc")
          .paginate(paginationOpts);
    return {
      page: await Promise.all(result.page.map((render) => toRenderView(ctx, render))),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** One more image of the same outfit/avatar/quality in a new job. */
export const regenerate = mutation({
  args: { renderId: v.id("renders") },
  returns: v.object({ jobId: v.id("jobs"), renderId: v.id("renders") }),
  handler: async (ctx, { renderId }) => {
    const user = await requireOnboarded(ctx);
    const render = await requireRender(ctx, user, renderId);
    await assertJobFinished(ctx, render.jobId, "retry");
    if ((render.kind ?? "try_on") === "groom") {
      if (!render.grooming) {
        throw appError("INVALID_INPUT", "That look has no style to redo.");
      }
      const result = await startGroomJob(ctx, user, {
        source: render.parentRenderId
          ? { type: "render", renderId: render.parentRenderId }
          : { type: "avatar", avatarId: render.avatarId },
        hair: render.grooming.hair,
        beard: render.grooming.beard,
        custom: render.grooming.custom,
        quality: render.quality,
        serviceId:
          render.serviceId === "hairstyle" || render.serviceId === "beard"
            ? render.serviceId
            : undefined,
      });
      return { jobId: result.jobId, renderId: result.renderId };
    }
    if (!render.outfitId) {
      throw appError("INVALID_INPUT", "That try-on has no outfit to redo.");
    }
    const result = await startRenderJob(ctx, user, {
      outfitIds: [render.outfitId],
      avatarId: render.avatarId,
      count: 1,
      quality: render.quality,
    });
    const created = result.renderIds[0];
    if (!created) {
      throw appError("UPSTREAM_FAILED", "Could not queue the render.");
    }
    return { jobId: result.jobId, renderId: created };
  },
});

/**
 * Second-pass hair & beard restyle on a finished look. Masculine presentation only.
 * Creates a new render variant; the parent try-on is kept.
 */
export const groom = mutation({
  args: {
    /** Kept so the post-try-on sheet can pass a render id directly. */
    renderId: v.optional(v.id("renders")),
    source: v.optional(
      v.union(
        v.object({ type: v.literal("render"), renderId: v.id("renders") }),
        v.object({
          type: v.literal("avatar"),
          avatarId: v.optional(v.id("avatars")),
        }),
      ),
    ),
    hair: vHairStyle,
    beard: vBeardStyle,
    custom: v.optional(v.string()),
    quality: v.optional(vRenderQuality),
    serviceId: v.optional(vServiceId),
  },
  returns: v.object({ jobId: v.id("jobs"), renderId: v.id("renders") }),
  handler: async (ctx, args) => {
    const user = await requireOnboarded(ctx);
    const source =
      args.source ??
      (args.renderId ? { type: "render" as const, renderId: args.renderId } : null);
    if (!source) {
      throw appError("INVALID_INPUT", "Choose a photo to style.");
    }
    return startGroomJob(ctx, user, {
      source,
      hair: args.hair,
      beard: args.beard,
      custom: args.custom,
      quality: args.quality,
      serviceId: args.serviceId,
    });
  },
});

/** Requires the `sharing` feature. Returns the token; idempotent. */
export const share = mutation({
  args: { renderId: v.id("renders") },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, { renderId }) => {
    const user = await ensureFreshBilling(ctx, await requireUser(ctx));
    if (!hasCurrentFeature(user, "sharing")) {
      throw appError("FEATURE_LOCKED", "Sharing is part of the Pro plan.", {
        feature: "sharing",
      });
    }
    const render = await requireRender(ctx, user, renderId);
    if (render.status !== "done" || !render.storageId) {
      throw appError(
        "INVALID_INPUT",
        "Wait for the render to finish before sharing it.",
      );
    }
    if (render.shareToken) return { token: render.shareToken };
    const token = crypto.randomUUID();
    await ctx.db.patch(render._id, { shareToken: token });
    return { token };
  },
});

export const unshare = mutation({
  args: { renderId: v.id("renders") },
  returns: v.null(),
  handler: async (ctx, { renderId }) => {
    const user = await requireUser(ctx);
    const render = await requireRender(ctx, user, renderId);
    if (render.shareToken) {
      await ctx.db.patch(render._id, { shareToken: undefined });
    }
    return null;
  },
});

/** Public. Null when the token is unknown or revoked. */
export const getShared = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      url: v.string(),
      outfitName: v.string(),
      items: v.array(vItemSummary),
      createdAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { token }) => {
    const render = await findByShareToken(ctx, token);
    if (!render || render.status !== "done" || !render.storageId) return null;
    const url = await ctx.storage.getUrl(render.storageId);
    if (!url) return null;
    const outfit = render.outfitId ? await ctx.db.get(render.outfitId) : null;
    const layered = outfit ? await layeredItems(ctx, outfit.slots) : [];
    const serviceLabel =
      render.serviceId === "hairstyle"
        ? "Hairstyle"
        : render.serviceId === "beard"
          ? "Beard"
          : "Look";
    return {
      url,
      outfitName: outfit?.name ?? serviceLabel,
      items: await Promise.all(
        layered.map(({ item }) => toItemSummary(ctx, item)),
      ),
      createdAt: render.createdAt,
    };
  },
});

export const remove = mutation({
  args: { renderId: v.id("renders") },
  returns: v.null(),
  handler: async (ctx, { renderId }) => {
    const user = await requireUser(ctx);
    const render = await requireRender(ctx, user, renderId);
    await removeRender(ctx, render);
    return null;
  },
});
