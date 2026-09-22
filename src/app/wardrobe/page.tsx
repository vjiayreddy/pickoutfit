"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { authClient } from "@/lib/auth-client";

export default function WardrobePage() {
  const router = useRouter();
  const session = authClient.useSession();
  const me = useQuery(
    api.users.me,
    session.data?.session ? {} : "skip",
  );

  useEffect(() => {
    if (session.isPending) return;
    if (!session.data?.session) {
      router.replace("/sign-in");
    }
  }, [session.isPending, session.data?.session, router]);

  if (session.isPending || !session.data?.session) {
    return (
      <div className="flex min-h-full items-center justify-center bg-canvas text-mute">
        Loading…
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-12 sm:px-8">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-mute">
            Your wardrobe
          </p>
          <h1 className="mt-2 font-display text-5xl font-medium uppercase leading-[0.9] tracking-tight text-ink sm:text-6xl">
            {me?.name ?? "Welcome"}
          </h1>
          <p className="mt-4 max-w-md text-base text-mute">
            Phase 1 foundation is live. Upload and try-on come next.
          </p>
        </div>

        {me === undefined ? (
          <p className="text-mute">Loading account…</p>
        ) : me === null ? (
          <p className="text-mute">
            Setting up your account… refresh in a moment if this sticks.
          </p>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="bg-soft-cloud p-6">
              <dt className="text-sm font-medium text-mute">Plan</dt>
              <dd className="mt-2 text-2xl font-medium capitalize text-ink">
                {me.balance.plan}
              </dd>
            </div>
            <div className="bg-soft-cloud p-6">
              <dt className="text-sm font-medium text-mute">Credits</dt>
              <dd className="mt-2 text-2xl font-medium text-ink">
                {me.balance.total}
              </dd>
              <dd className="mt-1 text-sm text-mute">
                {me.balance.packCredits} pack · {me.balance.planCredits} plan
              </dd>
            </div>
            <div className="bg-soft-cloud p-6">
              <dt className="text-sm font-medium text-mute">Email</dt>
              <dd className="mt-2 break-all text-base font-medium text-ink">
                {me.email ?? "—"}
              </dd>
            </div>
          </dl>
        )}

        <Link
          href="/"
          className="inline-flex h-12 w-fit items-center rounded-full bg-soft-cloud px-8 text-base font-medium text-ink transition active:scale-95 active:opacity-50"
        >
          Back to home
        </Link>
      </div>
    </AppShell>
  );
}
