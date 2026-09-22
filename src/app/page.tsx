"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

export default function HomePage() {
  const router = useRouter();
  const session = authClient.useSession();

  useEffect(() => {
    if (session.isPending) return;
    if (session.data?.session) {
      router.replace("/wardrobe");
    }
  }, [session.isPending, session.data?.session, router]);

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-ink text-canvas">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 70% 40%, #39393b 0%, transparent 55%), linear-gradient(160deg, #111 0%, #1a1a1a 45%, #0a0a0a 100%)",
        }}
      />
      <header className="relative z-10 flex h-14 items-center justify-between px-4 sm:px-8">
        <span className="font-display text-xl font-medium uppercase tracking-tight">
          WardrobeAI
        </span>
        <Link
          href="/sign-in"
          className="rounded-full bg-canvas px-5 py-2 text-sm font-medium text-ink transition active:scale-95 active:opacity-50"
        >
          Sign in
        </Link>
      </header>
      <main className="relative z-10 flex flex-1 flex-col justify-end px-4 pb-16 pt-24 sm:px-8 sm:pb-24">
        <h1 className="max-w-3xl font-display text-6xl font-medium uppercase leading-[0.9] tracking-tight sm:text-8xl">
          Digitize.
          <br />
          Style.
          <br />
          Try on.
        </h1>
        <p className="mt-6 max-w-md text-base text-white/70 sm:text-lg">
          Photograph your clothes, build outfits, and see yourself wearing them —
          metered in credits so every render stays sharp.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/sign-up"
            className="inline-flex h-12 items-center rounded-full bg-canvas px-8 text-base font-medium text-ink transition active:scale-95 active:opacity-50"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex h-12 items-center rounded-full border border-white/30 px-8 text-base font-medium text-canvas transition active:scale-95 active:opacity-50"
          >
            Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
