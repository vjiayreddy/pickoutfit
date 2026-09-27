import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { listProfiles as listProfileDocs, replaceGroomingProfiles } from "./model/profiles";
import {
  vBeardGoal,
  vBeardNow,
  vBudget,
  vHairGoal,
  vHairLength,
  vHairTexture,
  vStyleOrigin,
  vStyleRefServiceId,
  vStyleRefStatus,
} from "./shared/validators";
import { vServiceProfileView } from "./views";

const STYLE_REF_LIMIT = 24;

export const listProfiles = query({
  args: {},
  returns: v.array(vServiceProfileView),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await listProfileDocs(ctx, user._id);
    return rows.map((row) => ({
      serviceId: row.serviceId,
      budget: row.budget,
      ...(row.hairLength ? { hairLength: row.hairLength } : {}),
      ...(row.texture ? { texture: row.texture } : {}),
      ...(row.hairGoal ? { hairGoal: row.hairGoal } : {}),
      ...(row.beardNow ? { beardNow: row.beardNow } : {}),
      ...(row.beardGoal ? { beardGoal: row.beardGoal } : {}),
      updatedAt: row.updatedAt,
    }));
  },
});

const vProfileInput = v.object({
  serviceId: v.union(v.literal("hairstyle"), v.literal("beard")),
  budget: vBudget,
  hairLength: v.optional(vHairLength),
  texture: v.optional(vHairTexture),
  hairGoal: v.optional(vHairGoal),
  beardNow: v.optional(vBeardNow),
  beardGoal: v.optional(vBeardGoal),
});

/** Writes one profile per selected grooming service and drops the ones left out. */
export const saveProfiles = mutation({
  args: { profiles: v.array(vProfileInput) },
  returns: v.null(),
  handler: async (ctx, { profiles }) => {
    const user = await requireUser(ctx);
    await replaceGroomingProfiles(ctx, user, profiles);
    return null;
  },
});

export const listStyleRefs = query({
  args: { serviceId: vStyleRefServiceId },
  returns: v.array(
    v.object({
      _id: v.id("styleRefs"),
      serviceId: vStyleRefServiceId,
      label: v.string(),
      origin: vStyleOrigin,
      status: vStyleRefStatus,
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { serviceId }) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("styleRefs")
      .withIndex("by_user_service", (q) =>
        q.eq("userId", user._id).eq("serviceId", serviceId),
      )
      .order("desc")
      .take(STYLE_REF_LIMIT);
    return rows.map((row) => ({
      _id: row._id,
      serviceId: row.serviceId,
      label: row.label,
      origin: row.origin,
      status: row.status,
      createdAt: row.createdAt,
    }));
  },
});
