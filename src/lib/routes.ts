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
} as const;
