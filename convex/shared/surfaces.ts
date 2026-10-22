import type { Presentation } from "./wardrobe";

/**
 * Platform product surfaces shown in user (and later vendor) chrome.
 * Distinct from SERVICE_IDS (grooming profiles) — shop/stylist are surfaces only.
 */
export const PLATFORM_SURFACE_IDS = [
  "wardrobe",
  "shop",
  "stylist",
  "hairstyle",
  "beard",
  "hair_color",
  "eyewear",
  "makeup",
  "skincare",
] as const;
export type PlatformSurfaceId = (typeof PLATFORM_SURFACE_IDS)[number];

export const SURFACE_VISIBILITIES = ["hidden", "coming_soon", "live"] as const;
export type SurfaceVisibility = (typeof SURFACE_VISIBILITIES)[number];

export const SURFACE_AUDIENCES = ["user", "vendor", "both"] as const;
export type SurfaceAudience = (typeof SURFACE_AUDIENCES)[number];

export type PlatformSurfaceDef = {
  label: string;
  blurb: string;
  /** URL path segment under /services when applicable; null for top-level routes. */
  routeSlug: string | null;
  route: string;
  /** Presentation filter for user-facing studios; empty = any. */
  presentation: readonly Presentation[];
  audience: SurfaceAudience;
  /** Code default when no DB override exists. */
  defaultVisibility: SurfaceVisibility;
  /** Cannot be turned off via admin (product would brick). */
  lockedLive?: boolean;
  /** Nav order among user surfaces (lower first). */
  navOrder: number;
  /** Show in primary sidebar / mobile tabs when live. */
  showInPrimaryNav: boolean;
  /** Show on /services hub when live or coming_soon. */
  showInServicesHub: boolean;
};

export const PLATFORM_SURFACES: Record<PlatformSurfaceId, PlatformSurfaceDef> = {
  wardrobe: {
    label: "Wardrobe",
    blurb: "Photograph your clothes, build outfits, and try them on.",
    routeSlug: null,
    route: "/wardrobe",
    presentation: ["masculine", "feminine", "neutral"],
    audience: "both",
    defaultVisibility: "live",
    lockedLive: true,
    navOrder: 10,
    showInPrimaryNav: true,
    showInServicesHub: false,
  },
  shop: {
    label: "Shop",
    blurb: "Marketplace and trial room for pieces from stores.",
    routeSlug: null,
    route: "/shop",
    presentation: ["masculine", "feminine", "neutral"],
    audience: "both",
    defaultVisibility: "live",
    navOrder: 20,
    showInPrimaryNav: true,
    showInServicesHub: false,
  },
  stylist: {
    label: "Stylist",
    blurb: "Chat with your AI stylist about outfits and looks.",
    routeSlug: null,
    route: "/stylist",
    presentation: ["masculine", "feminine", "neutral"],
    audience: "user",
    defaultVisibility: "live",
    navOrder: 90,
    showInPrimaryNav: true,
    showInServicesHub: false,
  },
  hairstyle: {
    label: "Beard/Hair Style",
    blurb: "Try a cut or a beard on your fitting photo.",
    routeSlug: "hairstyle",
    route: "/services/hairstyle",
    presentation: ["masculine", "feminine", "neutral"],
    audience: "user",
    defaultVisibility: "hidden",
    navOrder: 40,
    showInPrimaryNav: true,
    showInServicesHub: true,
  },
  beard: {
    label: "Beard",
    blurb: "Try a beard on your fitting photo.",
    routeSlug: "beard",
    route: "/services/beard",
    presentation: ["masculine"],
    audience: "user",
    defaultVisibility: "hidden",
    navOrder: 41,
    // Folded under hairstyle nav when live; not a separate primary tab.
    showInPrimaryNav: false,
    showInServicesHub: false,
  },
  hair_color: {
    label: "Hair Color",
    blurb: "Preview a colour on your fitting photo.",
    routeSlug: "hair-color",
    route: "/services/hair-color",
    presentation: ["masculine", "feminine", "neutral"],
    audience: "user",
    defaultVisibility: "hidden",
    navOrder: 30,
    showInPrimaryNav: true,
    showInServicesHub: true,
  },
  eyewear: {
    label: "Eyewear",
    blurb: "Try frames on your fitting photo.",
    routeSlug: "eyewear",
    route: "/services/eyewear",
    presentation: ["masculine", "feminine", "neutral"],
    audience: "user",
    defaultVisibility: "hidden",
    navOrder: 50,
    showInPrimaryNav: true,
    showInServicesHub: true,
  },
  makeup: {
    label: "Makeup",
    blurb: "Try a makeup look on your fitting photo.",
    routeSlug: "makeup",
    route: "/services/makeup",
    presentation: ["masculine", "feminine", "neutral"],
    audience: "user",
    defaultVisibility: "hidden",
    navOrder: 60,
    showInPrimaryNav: true,
    showInServicesHub: true,
  },
  skincare: {
    label: "SkinCare",
    blurb: "A routine matched to your skin and budget. Advice and products, no photo edit.",
    routeSlug: "skincare",
    route: "/services/skincare",
    presentation: ["masculine", "feminine", "neutral"],
    audience: "user",
    defaultVisibility: "hidden",
    navOrder: 70,
    showInPrimaryNav: true,
    showInServicesHub: true,
  },
};

export function isPlatformSurfaceId(value: string): value is PlatformSurfaceId {
  return (PLATFORM_SURFACE_IDS as readonly string[]).includes(value);
}

/** Map /services/[slug] (or known aliases) → surface id. */
export function surfaceIdFromRouteSlug(slug: string): PlatformSurfaceId | null {
  const normalized = slug.trim().toLowerCase();
  for (const id of PLATFORM_SURFACE_IDS) {
    const def = PLATFORM_SURFACES[id];
    if (def.routeSlug === normalized) return id;
  }
  if (normalized === "hair_color") return "hair_color";
  return isPlatformSurfaceId(normalized) ? normalized : null;
}

export function surfaceServesAudience(
  audience: SurfaceAudience,
  target: "user" | "vendor",
): boolean {
  return audience === "both" || audience === target;
}

export function surfaceAllowsPresentation(
  surfaceId: PlatformSurfaceId,
  presentation: Presentation,
): boolean {
  return PLATFORM_SURFACES[surfaceId].presentation.includes(presentation);
}
