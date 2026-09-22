import type { Id } from "@convex/_generated/dataModel";

/** Every internal link goes through here so a route rename is one change. */
export const routes = {
  home: "/",
  signIn: "/sign-in",
  signUp: "/sign-up",
  onboarding: "/onboarding",
  add: "/add",
  wardrobe: "/wardrobe",
  item: (itemId: Id<"items"> | string) => `/wardrobe/${itemId}`,
  outfits: "/outfits",
  newOutfit: "/outfits/new",
  outfit: (outfitId: Id<"outfits"> | string) => `/outfits/${outfitId}`,
  lookbook: "/lookbook",
  share: (token: string) => `/share/${token}`,
} as const;
