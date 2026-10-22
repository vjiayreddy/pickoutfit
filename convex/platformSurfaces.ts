import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import {
  getEffectiveVisibility,
  listOverrideDocs,
  resolveAllSurfaces,
  surfacesForUserHub,
  surfacesForUserNav,
} from "./model/surfaces";
import {
  PLATFORM_SURFACES,
  surfaceIdFromRouteSlug,
  type PlatformSurfaceId,
} from "./shared/surfaces";
import { vPlatformSurfaceId, vSurfaceVisibility } from "./shared/validators";

const vUserSurfaceCard = v.object({
  id: vPlatformSurfaceId,
  label: v.string(),
  blurb: v.string(),
  route: v.string(),
  routeSlug: v.union(v.string(), v.null()),
  visibility: vSurfaceVisibility,
  showInPrimaryNav: v.boolean(),
  showInServicesHub: v.boolean(),
  navOrder: v.number(),
  /** Beard folds under hairstyle when both are considered for nav. */
  alsoRoutes: v.array(v.string()),
});

function toCard(
  surface: {
    id: PlatformSurfaceId;
    label: string;
    blurb: string;
    route: string;
    routeSlug: string | null;
    visibility: "hidden" | "coming_soon" | "live";
    showInPrimaryNav: boolean;
    showInServicesHub: boolean;
    navOrder: number;
  },
  alsoRoutes: string[] = [],
) {
  return {
    id: surface.id,
    label: surface.label,
    blurb: surface.blurb,
    route: surface.route,
    routeSlug: surface.routeSlug,
    visibility: surface.visibility,
    showInPrimaryNav: surface.showInPrimaryNav,
    showInServicesHub: surface.showInServicesHub,
    navOrder: surface.navOrder,
    alsoRoutes,
  };
}

/** Effective surfaces for the signed-in user's chrome (nav + hub). */
export const listForUser = query({
  args: {},
  returns: v.object({
    nav: v.array(vUserSurfaceCard),
    hub: v.array(vUserSurfaceCard),
    /** Full map for route guards / settings. Keys are PlatformSurfaceId strings. */
    byId: v.record(v.string(), vSurfaceVisibility),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const overrides = await listOverrideDocs(ctx);
    const all = resolveAllSurfaces(overrides);
    const presentation = user.prefs.presentation;

    const byId: Record<string, "hidden" | "coming_soon" | "live"> = {};
    for (const surface of all) {
      byId[surface.id] = surface.visibility;
    }

    const navSurfaces = surfacesForUserNav(all, presentation);
    const beardLive =
      byId.beard === "live" &&
      all.find((s) => s.id === "beard")?.presentation.includes(presentation);

    const nav = navSurfaces.map((surface) => {
      if (surface.id === "hairstyle" && beardLive) {
        return toCard(surface, ["/services/beard"]);
      }
      return toCard(surface);
    });

    // If hairstyle is off but beard is live + in audience, still expose beard as its own nav item.
    if (beardLive && byId.hairstyle !== "live") {
      const beard = all.find((s) => s.id === "beard");
      if (beard) {
        nav.push(
          toCard({
            ...beard,
            label: "Beard",
            showInPrimaryNav: true,
          }),
        );
        nav.sort((a, b) => a.navOrder - b.navOrder);
      }
    }

    const hub = surfacesForUserHub(all, presentation).map((surface) => toCard(surface));

    return { nav, hub, byId };
  },
});

/** Resolve one studio route slug for the signed-in user. */
export const resolveStudio = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: vPlatformSurfaceId,
      label: v.string(),
      blurb: v.string(),
      visibility: vSurfaceVisibility,
      available: v.boolean(),
    }),
  ),
  handler: async (ctx, { slug }) => {
    const user = await requireUser(ctx);
    const id = surfaceIdFromRouteSlug(slug);
    if (!id) return null;
    const visibility = await getEffectiveVisibility(ctx, id);
    const def = PLATFORM_SURFACES[id];
    const available =
      visibility === "live" &&
      def.presentation.includes(user.prefs.presentation) &&
      (def.audience === "user" || def.audience === "both");
    return {
      id,
      label: def.label,
      blurb: def.blurb,
      visibility,
      available,
    };
  },
});
