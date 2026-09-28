import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const OWNER_COOKIE = "owner_session";
export const OWNER_SESSION_SECONDS = 60 * 60 * 24 * 7;

export function ownerClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not set.");
  return new ConvexHttpClient(url);
}

export async function readOwnerToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(OWNER_COOKIE)?.value ?? null;
}

export function ownerErrorMessage(error: unknown): string {
  if (error instanceof ConvexError) {
    const data = error.data;
    if (typeof data === "object" && data !== null && "message" in data) {
      const message = data.message;
      if (typeof message === "string" && message.length > 0) return message;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

export function isOwnerSignedOut(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return false;
  const data = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === "UNAUTHENTICATED"
  );
}

/** Loads owner data. Sends an expired session back to the owner sign-in screen. */
export async function withOwner<T>(
  run: (client: ConvexHttpClient, sessionToken: string) => Promise<T>,
): Promise<T> {
  const sessionToken = await readOwnerToken();
  if (!sessionToken) redirect("/owner/sign-in");
  try {
    return await run(ownerClient(), sessionToken);
  } catch (error) {
    if (isOwnerSignedOut(error)) redirect("/owner/sign-in");
    throw error;
  }
}
