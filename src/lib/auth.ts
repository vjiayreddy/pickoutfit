import { betterAuth } from "better-auth";

/**
 * Better Auth server config.
 * Database adapter (Convex / Postgres / SQLite) will be wired in a later step.
 */
export const auth = betterAuth({
  appName: "WardrobeAI",
  emailAndPassword: {
    enabled: true,
  },
});
