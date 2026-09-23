"use client";

import { usePaginatedQuery } from "convex/react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OutfitCollage } from "@/components/common/OutfitCollage";
import { StickyAction } from "@/components/common/StickyAction";
import { routes } from "@/lib/routes";

const PAGE_SIZE = 20;

export function OutfitsList() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.outfits.list,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
            Outfit studio
          </p>
          <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:mt-2 sm:text-5xl">
            Your outfits.
          </h1>
          <p className="mt-2 max-w-md text-sm text-mute sm:mt-4 sm:text-base">
            Combine pieces, then try them on your fitting photo.
          </p>
        </div>
        <Link
          href={routes.newOutfit}
          className="hidden h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-6 text-base font-medium text-canvas transition active:scale-95 active:opacity-50 lg:inline-flex"
        >
          <Plus className="size-4" />
          New outfit
        </Link>
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-48 animate-pulse bg-soft-cloud" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="space-y-4 border border-dashed border-hairline px-6 py-16 text-center">
          <p className="text-base font-medium">No outfits yet.</p>
          <p className="text-sm text-mute">
            Pick pieces from your wardrobe and save a look.
          </p>
          <Link
            href={routes.newOutfit}
            className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas"
          >
            Build an outfit
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((outfit) => (
              <li key={outfit._id}>
                <Link href={routes.outfit(outfit._id)} className="block">
                  {outfit.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={outfit.coverUrl}
                      alt=""
                      className="aspect-[4/5] w-full bg-soft-cloud object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/5] items-center justify-center bg-soft-cloud p-4">
                      <OutfitCollage items={outfit.items} tile="size-14" max={6} />
                    </div>
                  )}
                  <div className="pt-2">
                    <p className="text-sm font-medium">{outfit.name}</p>
                    {outfit.occasion ? (
                      <p className="text-xs text-mute">{outfit.occasion}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-mute tabular-nums">
                      {outfit.renderCount} try-on
                      {outfit.renderCount === 1 ? "" : "s"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {status === "CanLoadMore" || status === "LoadingMore" ? (
            <div className="flex justify-center">
              <button
                type="button"
                className="h-11 rounded-full border border-hairline px-8 text-sm font-medium disabled:opacity-50"
                disabled={status === "LoadingMore"}
                onClick={() => loadMore(PAGE_SIZE)}
              >
                {status === "LoadingMore" ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </>
      )}
      <StickyAction href={routes.newOutfit}>
        <Plus className="size-4" />
        New outfit
      </StickyAction>
    </div>
  );
}
