import type { MutationCtx, QueryCtx } from "../_generated/server";
import { optionalEnv } from "./env";
import { appError } from "./errors";

type Ctx = QueryCtx | MutationCtx;

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const PBKDF2_ITERATIONS = 100_000;

/** Confirms the platform-owner session token. Expired rows are removed. */
export async function requireOwner(ctx: Ctx, sessionToken: string): Promise<void> {
  const tokenHash = await sha256Hex(sessionToken);
  const session = await ctx.db
    .query("ownerSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!session || session.expiresAt <= Date.now()) {
    throw appError("UNAUTHENTICATED", "Owner sign-in expired. Sign in again.");
  }
}

/** Checks env credentials and stores a new session. Returns the raw token once. */
export async function signInOwner(
  ctx: MutationCtx,
  email: string,
  password: string,
): Promise<string> {
  const expectedEmail = optionalEnv("OWNER_EMAIL");
  const hash = optionalEnv("OWNER_PASSWORD_HASH");
  if (!expectedEmail || !hash) {
    throw appError("FORBIDDEN", "Owner sign-in is not configured.");
  }
  const emailOk = timingEqualString(
    email.trim().toLowerCase(),
    expectedEmail.trim().toLowerCase(),
  );
  const passwordOk = await verifyPassword(password, hash);
  if (!emailOk || !passwordOk) {
    throw appError("UNAUTHENTICATED", "Those owner credentials are not valid.");
  }
  const token = randomToken();
  await ctx.db.insert("ownerSessions", {
    tokenHash: await sha256Hex(token),
    expiresAt: Date.now() + SESSION_MS,
  });
  return token;
}

export async function signOutOwner(ctx: MutationCtx, sessionToken: string): Promise<void> {
  const tokenHash = await sha256Hex(sessionToken);
  const session = await ctx.db
    .query("ownerSessions")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (session) await ctx.db.delete(session._id);
}

/**
 * `OWNER_PASSWORD_HASH` format: `pbkdf2$100000$<salt hex>$<sha256 hex>`.
 * Generate with Node `pbkdf2Sync(password, salt, 100000, 32, "sha256")`.
 */
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations !== PBKDF2_ITERATIONS) return false;
  const salt = hexToBytes(parts[2]);
  const expected = hexToBytes(parts[3]);
  if (!salt || !expected || expected.length === 0) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    key,
    expected.length * 8,
  );
  return timingEqual(new Uint8Array(bits), expected);
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i]! ^ right[i]!;
  return diff === 0;
}

function timingEqualString(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const len = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < len; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
