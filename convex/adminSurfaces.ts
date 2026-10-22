import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  ensureSurfaceOverridesSeeded,
  listOverrideDocs,
  resolveAllSurfaces,
} from "./model/surfaces";
import { PLATFORM_SURFACES } from "./shared/surfaces";
import {
  vPlatformSurfaceId,
  vSurfaceAudience,
  vSurfaceVisibility,
} from "./shared/validators";

const vAdminSurfaceRow = v.object({
  id: vPlatformSurfaceId,
  label: v.string(),
  blurb: v.string(),
  route: v.string(),
  visibility: vSurfaceVisibility,
  defaultVisibility: vSurfaceVisibility,
  overridden: v.boolean(),
  lockedLive: v.boolean(),
  audience: vSurfaceAudience,
  updatedAt: v.union(v.number(), v.null()),
});

/** All surfaces with effective visibility for the platform desk. */
export const list = query({
  args: {},
  returns: v.array(vAdminSurfaceRow),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const overrides = await listOverrideDocs(ctx);
    return resolveAllSurfaces(overrides).map((surface) => ({
      id: surface.id,
      label: surface.label,
      blurb: surface.blurb,
      route: surface.route,
      visibility: surface.visibility,
      defaultVisibility: surface.defaultVisibility,
      overridden: surface.overridden,
      lockedLive: surface.lockedLive,
      audience: surface.audience,
      updatedAt: surface.updatedAt,
    }));
  },
});

/** Seed missing override rows (idempotent). Call once from the desk if empty. */
export const ensureSeeded = mutation({
  args: {},
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const inserted = await ensureSurfaceOverridesSeeded(ctx);
    return { inserted };
  },
});

export const setVisibility = mutation({
  args: {
    surfaceId: vPlatformSurfaceId,
    visibility: vSurfaceVisibility,
  },
  returns: v.null(),
  handler: async (ctx, { surfaceId, visibility }) => {
    const admin = await requireAdmin(ctx);
    const def = PLATFORM_SURFACES[surfaceId];
    if (def.lockedLive && visibility !== "live") {
      throw appError(
        "INVALID_INPUT",
        `${def.label} must stay live — it is required for the product.`,
      );
    }

    const existing = await ctx.db
      .query("platformSurfaceOverrides")
      .withIndex("by_surfaceId", (q) => q.eq("surfaceId", surfaceId))
      .unique();
    const now = Date.now();
    if (existing) {
      if (existing.visibility === visibility) return null;
      await ctx.db.patch(existing._id, {
        visibility,
        updatedAt: now,
        updatedBy: admin._id,
      });
    } else {
      await ctx.db.insert("platformSurfaceOverrides", {
        surfaceId,
        visibility,
        updatedAt: now,
        updatedBy: admin._id,
      });
    }
    return null;
  },
});
