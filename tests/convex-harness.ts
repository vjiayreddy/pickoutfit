import { convexTest, type TestConvex } from "convex-test";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

declare global {
  interface ImportMeta {
    /** Provided by Vite when vitest loads this file. */
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

/**
 * Shared harness for convex-test. Every module under `convex/` is bundled so `internal.*`
 * references resolve; components (auth, stripe, workflow) are not registered, so tests stay
 * on plain queries and mutations.
 */
export const modules = import.meta.glob("../convex/**/*.*s");

export type Harness = TestConvex<typeof schema>;

export function harness(): Harness {
  return convexTest(schema, modules);
}

export type SeededUser = { userId: Id<"users">; authId: string };

let counter = 0;

/** Inserts a stored, onboarded user and returns the ids needed to act as them. */
export async function seedUser(
  t: Harness,
  overrides: { role?: "user" | "vendor" | "admin"; onboarded?: boolean; email?: string } = {},
): Promise<SeededUser> {
  counter += 1;
  const authId = `auth_${counter}_${Math.random().toString(36).slice(2, 8)}`;
  const now = 1_790_000_000_000 + counter;
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      authId,
      email: overrides.email ?? `user${counter}@example.com`,
      name: `User ${counter}`,
      role: overrides.role ?? "user",
      plan: "free",
      features: [],
      planCredits: 25,
      packCredits: 0,
      dailySpend: { dayKey: "2026-09-29", credits: 0 },
      onboardedAt: overrides.onboarded === false ? undefined : now,
      prefs: { presentation: "neutral", fit: "regular", avoidColours: [] },
      createdAt: now,
    }),
  );
  return { userId, authId };
}

export function asUser(t: Harness, user: SeededUser) {
  return t.withIdentity({ subject: user.authId });
}

export const VENDOR_PROFILE = {
  name: "Loom & Thread",
  supportEmail: "hello@loom.example",
  address: { line1: "12 Weaver Lane", city: "Hyderabad", state: "Telangana", pincode: "500001", country: "IN" },
};

export const PRODUCT_INPUT = {
  category: "clothes" as const,
  presentation: "neutral" as const,
  name: "Linen Overshirt",
  subcategory: "overshirt",
  description: "A loose linen overshirt in oat.",
  colours: { primary: "oat", secondary: [], hex: ["#d8cbb4"] },
  priceInr: 2499,
  imageIds: [] as Id<"_storage">[],
  variants: [{ size: "M", stock: 5, active: true }],
};
