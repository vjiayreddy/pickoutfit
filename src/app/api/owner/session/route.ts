import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import {
  OWNER_COOKIE,
  OWNER_SESSION_SECONDS,
  ownerClient,
  ownerErrorMessage,
  readOwnerToken,
} from "@/lib/owner-session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Enter your email and password." }, { status: 400 });
  }
  const email = typeof body === "object" && body && "email" in body ? body.email : "";
  const password = typeof body === "object" && body && "password" in body ? body.password : "";
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ message: "Enter your email and password." }, { status: 400 });
  }
  try {
    const { token } = await ownerClient().mutation(api.owner.signIn, { email, password });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(OWNER_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: OWNER_SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    const status = error instanceof ConvexError ? 401 : 500;
    return NextResponse.json({ message: ownerErrorMessage(error) }, { status });
  }
}

export async function DELETE() {
  const token = await readOwnerToken();
  if (token) {
    try {
      await ownerClient().mutation(api.owner.signOut, { sessionToken: token });
    } catch {
      // The cookie is cleared either way.
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(OWNER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
