"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OutfitCollage } from "@/components/common/OutfitCollage";
import { formatDate, pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

export function SharedRender({ token }: { token: string }) {
  const shared = useQuery(api.renders.getShared, { token });

  if (shared === undefined) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 py-10">
        <div className="h-8 w-40 animate-pulse bg-soft-cloud" />
        <div className="aspect-[3/4] animate-pulse bg-soft-cloud" />
      </main>
    );
  }

  if (shared === null) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-start justify-center gap-4 px-4 py-10">
        <h1 className="font-display text-4xl uppercase tracking-tight">
          Link unavailable
        </h1>
        <p className="text-mute">
          This share link is invalid or was revoked.
        </p>
        <Link
          href={routes.home}
          className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas"
        >
          WardrobeAI home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-1">
        <p className="text-xs font-medium tracking-wide text-mute uppercase">
          WardrobeAI
        </p>
        <h1 className="font-display text-3xl font-medium uppercase tracking-tight sm:text-4xl">
          {shared.outfitName}
        </h1>
        <p className="text-sm text-mute">{formatDate(shared.createdAt)}</p>
      </header>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shared.url}
        alt={shared.outfitName}
        className="w-full bg-soft-cloud"
      />

      {shared.items.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">
            In this look
            <span className="ml-2 text-xs font-normal text-mute tabular-nums">
              {pluralize(shared.items.length, "piece")}
            </span>
          </h2>
          <OutfitCollage items={shared.items} tile="size-14" max={8} className="flex-wrap" />
        </section>
      ) : null}

      <footer className="mt-auto border-t border-hairline pt-6 text-sm text-mute">
        Made with{" "}
        <Link
          href={routes.home}
          className="font-medium text-ink underline underline-offset-4"
        >
          WardrobeAI
        </Link>{" "}
        — photograph your clothes, build outfits, see yourself wearing them.
      </footer>
    </main>
  );
}
