import type { Presentation } from "./wardrobe";

/** Live and upcoming services. Wardrobe stays on `users.prefs`; the others use `serviceProfiles`. */
export const SERVICE_IDS = ["wardrobe", "hairstyle", "beard", "skincare"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

/**
 * Visual styles share `styleRefs` / `looks`. Hair colour, brows, nails, eyewear, and makeup
 * are ids on that table — not new tables — and ship with their own preview later.
 */
export const STYLE_REF_SERVICE_IDS = [
  "hairstyle",
  "beard",
  "hair_color",
  "brows",
  "nails",
  "eyewear",
  "makeup",
] as const;
export type StyleRefServiceId = (typeof STYLE_REF_SERVICE_IDS)[number];

export const BUDGET_TIERS = ["value", "mid", "premium"] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

export const HAIR_LENGTHS = ["buzz", "short", "medium", "long"] as const;
export type HairLength = (typeof HAIR_LENGTHS)[number];

export const HAIR_TEXTURES = ["straight", "wavy", "curly", "coily"] as const;
export type HairTexture = (typeof HAIR_TEXTURES)[number];

export const HAIR_GOALS = ["keep", "shorter", "longer"] as const;
export type HairGoal = (typeof HAIR_GOALS)[number];

export const BEARD_NOW = ["clean", "stubble", "short", "full"] as const;
export type BeardNow = (typeof BEARD_NOW)[number];

export const BEARD_GOALS = ["keep", "cleaner", "fuller"] as const;
export type BeardGoal = (typeof BEARD_GOALS)[number];

export const STYLE_ORIGINS = ["upload", "recommended", "option", "generated"] as const;
export type StyleOrigin = (typeof STYLE_ORIGINS)[number];

export const STYLE_REF_STATUSES = ["identifying", "ready", "failed"] as const;
export type StyleRefStatus = (typeof STYLE_REF_STATUSES)[number];

export const BUDGET_TIER_LABELS: Record<BudgetTier, string> = {
  value: "Value",
  mid: "Mid",
  premium: "Premium",
};

export const HAIR_LENGTH_LABELS: Record<HairLength, string> = {
  buzz: "Buzz or shaved",
  short: "Short",
  medium: "Medium",
  long: "Long",
};

export const HAIR_TEXTURE_LABELS: Record<HairTexture, string> = {
  straight: "Straight",
  wavy: "Wavy",
  curly: "Curly",
  coily: "Coily",
};

export const HAIR_GOAL_LABELS: Record<HairGoal, string> = {
  keep: "Keep this length",
  shorter: "Go shorter",
  longer: "Grow it out",
};

export const BEARD_NOW_LABELS: Record<BeardNow, string> = {
  clean: "Clean",
  stubble: "Stubble",
  short: "Short",
  full: "Full",
};

export const BEARD_GOAL_LABELS: Record<BeardGoal, string> = {
  keep: "Keep it",
  cleaner: "Clean it up",
  fuller: "Grow it fuller",
};

export type ServiceCapability = "consult" | "preview" | "shop";

export type ServiceDef = {
  label: string;
  blurb: string;
  audience: readonly Presentation[];
  capabilities: readonly ServiceCapability[];
  status: "live" | "coming_soon";
  route: string;
};

export const SERVICES: Record<ServiceId, ServiceDef> = {
  wardrobe: {
    label: "Wardrobe",
    blurb: "Photograph your clothes, build outfits, and try them on.",
    audience: ["masculine", "feminine", "neutral"],
    capabilities: ["preview", "shop"],
    status: "live",
    route: "/wardrobe",
  },
  hairstyle: {
    label: "Hairstyle",
    blurb: "Try a cut on your fitting photo.",
    audience: ["masculine", "feminine", "neutral"],
    capabilities: ["preview", "shop"],
    status: "live",
    route: "/services/hairstyle",
  },
  beard: {
    label: "Beard",
    blurb: "Try a beard on your fitting photo.",
    audience: ["masculine"],
    capabilities: ["preview", "shop"],
    status: "live",
    route: "/services/beard",
  },
  skincare: {
    label: "Skincare",
    blurb: "A routine matched to your skin and budget. Advice and products, no photo edit.",
    audience: ["masculine", "feminine", "neutral"],
    capabilities: ["consult", "shop"],
    status: "coming_soon",
    route: "/services/skincare",
  },
};

export type ServiceCard = ServiceDef & { id: ServiceId };

export function servicesFor(presentation: Presentation): ServiceCard[] {
  return SERVICE_IDS.filter((id) => SERVICES[id].audience.includes(presentation)).map((id) => ({
    id,
    ...SERVICES[id],
  }));
}

/** Extra help offered during onboarding. Wardrobe is already step 2. */
export function optionalServicesFor(presentation: Presentation): ServiceCard[] {
  return servicesFor(presentation).filter(
    (service) => service.id !== "wardrobe" && service.status === "live",
  );
}

export function isServiceId(value: string): value is ServiceId {
  return (SERVICE_IDS as readonly string[]).includes(value);
}

/** Audience and live status. Credits still gate each preview separately. */
export function isServiceAvailable(
  serviceId: ServiceId,
  user: { prefs: { presentation: Presentation } },
): boolean {
  const service = SERVICES[serviceId];
  return service.status === "live" && service.audience.includes(user.prefs.presentation);
}
