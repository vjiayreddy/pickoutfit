"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { routes } from "@/lib/routes";

const STORE_USER_TIMEOUT_MS = 5000;

/**
 * Requires a Better Auth session for the vendor desk.
 * Does not force wardrobe onboarding — sellers can open a store without a fitting photo.
 */
export function VendorAuthGate({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const sessionKey = session.data?.session?.id ?? "signed-out";
  return <VendorSessionGate key={sessionKey}>{children}</VendorSessionGate>;
}

function VendorSessionGate({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const me = useQuery(api.users.me, session.data?.session ? {} : "skip");
  const router = useRouter();
  const isAuthenticated = Boolean(session.data?.session);
  const isLoading = session.isPending || (isAuthenticated && me === undefined);
  const missingUser = isAuthenticated && !isLoading && me === null;
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (session.isPending) return;
    if (!session.data?.session) {
      router.replace(routes.vendorSignIn);
    }
  }, [session.isPending, session.data?.session, router]);

  useEffect(() => {
    if (!missingUser) return;
    const timeout = setTimeout(() => setTimedOut(true), STORE_USER_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [missingUser]);

  if (!session.isPending && !session.data?.session) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-canvas text-mute">
        Redirecting to sign in…
      </main>
    );
  }

  if (missingUser && timedOut) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-12">
        <h1 className="font-display text-3xl tracking-tight text-ink uppercase">
          Account not ready
        </h1>
        <p className="mt-3 text-sm text-mute">
          You&apos;re signed in, but your WardrobeAI profile hasn&apos;t finished setting up.
          Refresh the page in a moment.
        </p>
        <Link
          href={routes.vendor}
          className="mt-6 inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas"
          onClick={() => window.location.reload()}
        >
          Refresh
        </Link>
      </main>
    );
  }

  if (isLoading || !me) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-12 sm:px-8">
        <p role="status" className="mb-6 text-sm text-mute">
          {missingUser ? "Setting up your account…" : "Loading your account…"}
        </p>
        <div className="space-y-4">
          <div className="h-10 w-48 animate-pulse bg-soft-cloud" />
          <div className="h-64 animate-pulse bg-soft-cloud" />
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
