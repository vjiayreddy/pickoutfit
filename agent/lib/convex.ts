import { ConvexHttpClient } from "convex/browser";
import type { SessionContext } from "eve/tools";
import { samePrincipal } from "./session-auth";

export { api } from "../../convex/_generated/api";
export type { Id } from "../../convex/_generated/dataModel";

/**
 * One HTTP client for the deployment the Next app talks to. Every call goes through
 * `convex/agent.ts`, whose functions take `{ serviceKey, authId }` and are scoped to that
 * user by `requireServiceUser` — the agent never gets an unscoped handle on the database.
 */
let client: ConvexHttpClient | undefined;

export function convex(): ConvexHttpClient {
  if (!client) client = new ConvexHttpClient(requiredEnv("NEXT_PUBLIC_CONVEX_URL"));
  return client;
}

export type ServiceArgs = { serviceKey: string; authId: string };

/**
 * The caller of the current turn, re-derived from the verified channel principal.
 * Approval is a gate, not authorization: executors call this rather than trusting tool input.
 */
export function serviceArgs(ctx: SessionContext): ServiceArgs {
  return { serviceKey: requiredEnv("AGENT_SERVICE_KEY"), authId: authId(ctx) };
}

/**
 * The Better Auth user id the current turn acts for. Only two authenticators may ever produce one:
 * `better-auth` (a verified Convex JWT bearer) and `local-dev` (the synthetic `eve dev` principal).
 */
export function authId(ctx: SessionContext): string {
  const current = ctx.session.auth.current;
  if (!current) throw new Error("This tool needs a signed-in user; the session has no caller.");
  if (!samePrincipal(current, ctx.session.auth.initiator)) {
    throw new Error("Only the owner of this conversation can use its tools.");
  }

  if (current.authenticator === "better-auth") {
    return current.principalId;
  }

  if (current.authenticator === "local-dev") {
    const override = process.env.AGENT_DEV_AUTH_ID;
    if (override && override.length > 0) return override;
    throw new Error(
      "Local development has no Better Auth user. Set AGENT_DEV_AUTH_ID to a real users.authId in .env.local.",
    );
  }

  throw new Error(
    `The stylist only serves Better Auth callers; this session was authenticated by "${current.authenticator}".`,
  );
}

export function requiredEnv(name: string): string {
  const value = optionalEnv(name);
  if (value === undefined) throw new Error(`Missing ${name}. Set it in .env.local.`);
  return value;
}

/** First non-empty value among `names`, or `undefined`. For settings that are allowed to be absent. */
export function optionalEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value !== undefined && value.length > 0) return value;
  }
  return undefined;
}

/** `convex/lib/errors.ts` throws ConvexError with `{ code, message }`; unwrap it for the model. */
export function convexErrorMessage(error: unknown): { code: string; message: string } {
  const data = (error as { data?: unknown } | null)?.data;
  if (data && typeof data === "object" && "code" in data && "message" in data) {
    const { code, message } = data as { code: unknown; message: unknown };
    if (typeof code === "string" && typeof message === "string") return { code, message };
  }
  if (error instanceof Error) return { code: "UNKNOWN", message: error.message };
  return { code: "UNKNOWN", message: "Something went wrong talking to WardrobeAI." };
}
