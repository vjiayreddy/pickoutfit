import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  PLATFORM_SURFACE_IDS,
  PLATFORM_SURFACES,
  surfaceAllowsPresentation,
  surfaceServesAudience,
  type PlatformSurfaceId,
  type SurfaceVisibility,
} from "../shared/surfaces";
import type { Presentation } from "../shared/wardrobe";

type Ctx = QueryCtx | MutationCtx;

export type EffectiveSurface = {
  id: PlatformSurfaceId;
  label: string;
  blurb: string;
  route: string;
  routeSlug: string | null;
  visibility: SurfaceVisibility;
  defaultVisibility: SurfaceVisibility;
  overridden: boolean;
  lockedLive: boolean;
  showInPrimaryNav: boolean;
  showInServicesHub: boolean;
  navOrder: number;
  audience: "user" | "vendor" | "both";
  presentation: readonly Presentation[];
  updatedAt: number | null;
  updatedBy: Id<"users"> | null;
};

/** Load all override rows (catalog is tiny — one take is fine). */
export async function listOverrideDocs(
  ctx: Ctx,
): Promise<Doc<"platformSurfaceOverrides">[]> {
  return ctx.db.query("platformSurfaceOverrides").withIndex("by_surfaceId").take(64);
}

export function visibilityFromOverrides(
  overrides: Doc<"platformSurfaceOverrides">[],
  surfaceId: PlatformSurfaceId,
): { visibility: SurfaceVisibility; overridden: boolean; doc: Doc<"platformSurfaceOverrides"> | null } {
  const doc = overrides.find((row) => row.surfaceId === surfaceId) ?? null;
  if (doc) {
    return { visibility: doc.visibility, overridden: true, doc };
  }
  return {
    visibility: PLATFORM_SURFACES[surfaceId].defaultVisibility,
    overridden: false,
    doc: null,
  };
}

export function resolveAllSurfaces(
  overrides: Doc<"platformSurfaceOverrides">[],
): EffectiveSurface[] {
  return PLATFORM_SURFACE_IDS.map((id) => {
    const def = PLATFORM_SURFACES[id];
    const { visibility, overridden, doc } = visibilityFromOverrides(overrides, id);
    return {
      id,
      label: def.label,
      blurb: def.blurb,
      route: def.route,
      routeSlug: def.routeSlug,
      visibility,
      defaultVisibility: def.defaultVisibility,
      overridden,
      lockedLive: Boolean(def.lockedLive),
      showInPrimaryNav: def.showInPrimaryNav,
      showInServicesHub: def.showInServicesHub,
      navOrder: def.navOrder,
      audience: def.audience,
      presentation: [...def.presentation],
      updatedAt: doc?.updatedAt ?? null,
      updatedBy: doc?.updatedBy ?? null,
    };
  }).sort((a, b) => a.navOrder - b.navOrder);
}

export async function getEffectiveVisibility(
  ctx: Ctx,
  surfaceId: PlatformSurfaceId,
): Promise<SurfaceVisibility> {
  const row = await ctx.db
    .query("platformSurfaceOverrides")
    .withIndex("by_surfaceId", (q) => q.eq("surfaceId", surfaceId))
    .unique();
  return row?.visibility ?? PLATFORM_SURFACES[surfaceId].defaultVisibility;
}

/**
 * Idempotent seed so admin UI and clients always have explicit rows to edit.
 * Does not overwrite existing overrides.
 */
export async function ensureSurfaceOverridesSeeded(ctx: MutationCtx): Promise<number> {
  const existing = await listOverrideDocs(ctx);
  const have = new Set(existing.map((row) => row.surfaceId));
  const now = Date.now();
  let inserted = 0;
  for (const id of PLATFORM_SURFACE_IDS) {
    if (have.has(id)) continue;
    await ctx.db.insert("platformSurfaceOverrides", {
      surfaceId: id,
      visibility: PLATFORM_SURFACES[id].defaultVisibility,
      updatedAt: now,
    });
    inserted += 1;
  }
  return inserted;
}

export function surfacesForUserNav(
  surfaces: EffectiveSurface[],
  presentation: Presentation,
): EffectiveSurface[] {
  return surfaces.filter(
    (surface) =>
      surfaceServesAudience(surface.audience, "user") &&
      surface.visibility === "live" &&
      surface.showInPrimaryNav &&
      surfaceAllowsPresentation(surface.id, presentation),
  );
}

export function surfacesForUserHub(
  surfaces: EffectiveSurface[],
  presentation: Presentation,
): EffectiveSurface[] {
  return surfaces.filter(
    (surface) =>
      surfaceServesAudience(surface.audience, "user") &&
      surface.visibility !== "hidden" &&
      surface.showInServicesHub &&
      surfaceAllowsPresentation(surface.id, presentation),
  );
}
