"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { authClient } from "@/lib/auth-client";

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const me = useQuery(api.users.me);

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="flex h-14 items-center justify-between border-b border-hairline px-4 sm:px-8">
        <Link
          href="/wardrobe"
          className="font-display text-xl font-medium uppercase tracking-tight"
        >
          WardrobeAI
        </Link>
        <div className="flex items-center gap-3">
          {me === undefined ? (
            <span className="text-sm text-mute">Loading…</span>
          ) : me ? (
            <>
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  me.balance.lowBalance
                    ? "bg-soft-cloud text-sale"
                    : "bg-soft-cloud text-ink"
                }`}
              >
                {me.balance.total} credits
              </span>
              <button
                type="button"
                onClick={signOut}
                className="h-10 rounded-full bg-soft-cloud px-4 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
              >
                Sign out
              </button>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="h-10 rounded-full bg-ink px-4 text-sm font-medium leading-10 text-canvas"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
