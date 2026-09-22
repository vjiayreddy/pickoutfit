"use client";

import { usePaginatedQuery } from "convex/react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { OutfitCollage } from "@/components/common/OutfitCollage";
import { routes } from "@/lib/routes";

const PAGE_SIZE = 20;

export function OutfitsList() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.outfits.list,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-mute">
            Outfit studio
          </p>
          <h1 className="mt-2 font-display text-4xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl">
            Your outfits.
          </h1>
          <p className="mt-4 max-w-md text-base text-mute">
            Combine pieces, then try them on your fitting photo.
          </p>
        </div>
        <Link
          href={routes.newOutfit}
          className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-6 text-base font-medium text-canvas transition active:scale-95 active:opacity-50"
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
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((outfit) => (
              <li key={outfit._id}>
                <Link
                  href={routes.outfit(outfit._id)}
                  className="block space-y-3 border border-hairline p-4 transition hover:bg-soft-cloud"
                >
                  {outfit.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={outfit.coverUrl}
                      alt=""
                      className="aspect-[4/5] w-full object-cover bg-soft-cloud"
                    />
                  ) : (
                    <div className="flex aspect-[4/5] items-center justify-center bg-soft-cloud p-4">
                      <OutfitCollage items={outfit.items} tile="size-14" max={6} />
                    </div>
                  )}
                  <div>
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
    </div>
  );
}
