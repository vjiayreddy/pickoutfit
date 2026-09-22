import * as jose from "jose";
import { extractBearerToken, localDev, routeAuth, withAuthChallenges, type AuthFn } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { api, convex, optionalEnv, requiredEnv, type Id } from "../lib/convex";
import { withSessionOwnership } from "../lib/session-ownership";
import type { SessionPrincipal } from "../lib/session-auth";

const THREAD_HEADER = "x-wardrobe-thread-id";

let jwks: ReturnType<typeof jose.createRemoteJWKSet> | undefined;

function remoteJwks() {
  if (!jwks) {
    const siteUrl = requiredEnv("NEXT_PUBLIC_CONVEX_SITE_URL");
    jwks = jose.createRemoteJWKSet(new URL("/api/auth/convex/jwks", siteUrl));
  }
  return jwks;
}

/**
 * Route auth for the browser. The chat UI sends the signed-in user's Convex JWT (minted by
 * Better Auth) as a bearer; we verify it against the Convex JWKS and carry `sub` as authId.
 */
function betterAuthChannel(): AuthFn<Request> {
  return withAuthChallenges(
    async (request: Request) => {
      const token = extractBearerToken(request.headers.get("authorization"));
      if (!token) return null;

      const siteUrl = requiredEnv("NEXT_PUBLIC_CONVEX_SITE_URL");

      try {
        const { payload } = await jose.jwtVerify(token, remoteJwks(), {
          issuer: siteUrl,
          audience: "convex",
        });
        const authId = payload.sub;
        if (!authId) return null;
        return {
          attributes: {
            authId,
            threadId: request.headers.get(THREAD_HEADER) ?? "",
          },
          authenticator: "better-auth",
          issuer: String(payload.iss ?? siteUrl),
          principalId: authId,
          principalType: "user",
          subject: authId,
        };
      } catch {
        return null;
      }
    },
    [{ scheme: "Bearer" }],
  );
}

const devAuth = localDev();
const localUserAuth: AuthFn<Request> = async (request) => {
  if (request.headers.has("authorization")) return null;
  const authId = optionalEnv("AGENT_DEV_AUTH_ID");
  if (!authId) return null;
  const principal = await devAuth(request);
  return principal
    ? {
        ...principal,
        attributes: {
          ...principal.attributes,
          authId,
          threadId: request.headers.get(THREAD_HEADER) ?? "",
        },
      }
    : null;
};
const auth = [betterAuthChannel(), localUserAuth];

function callerArgs(caller: SessionPrincipal) {
  const authId =
    caller.authenticator === "better-auth"
      ? caller.principalId
      : caller.attributes.authId;
  if (typeof authId !== "string" || !authId) throw new Error("The stylist needs a signed-in user.");
  return { serviceKey: requiredEnv("AGENT_SERVICE_KEY"), authId };
}

export default withSessionOwnership(eveChannel({ auth }), {
  authenticate: (request) => routeAuth(request, auth),
  canAccessThread: (caller, threadId) =>
    convex().query(api.agent.assertThreadAccess, { ...callerArgs(caller), threadId }),
  canAccessSession: (caller, eveSessionId) =>
    convex().query(api.agent.assertSessionAccess, { ...callerArgs(caller), eveSessionId }),
  bindSession: (caller, threadId, eveSessionId) =>
    convex().mutation(api.agent.bindSession, {
      ...callerArgs(caller),
      threadId: threadId as Id<"threads">,
      eveSessionId,
    }),
});
