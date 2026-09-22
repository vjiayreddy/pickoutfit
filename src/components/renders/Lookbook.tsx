"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { routes } from "@/lib/routes";

const PAGE_SIZE = 24;
const ALL = "all";

export function Lookbook() {
  const summaries = useQuery(api.outfits.listSummaries);
  const [outfitId, setOutfitId] = useState<Id<"outfits"> | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.renders.listMine,
    outfitId ? { outfitId } : {},
    { initialNumItems: PAGE_SIZE },
  );
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-mute">
          Fitting room archive
        </p>
        <h1 className="mt-2 font-display text-4xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl">
          Lookbook
        </h1>
        <p className="mt-4 max-w-md text-base text-mute">
          Your wardrobe, on you. Keep the looks worth coming back to.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-y border-hairline py-3">
        <label className="text-sm font-medium">
          Outfit
          <select
            className="ml-3 h-10 rounded-[24px] border border-hairline bg-soft-cloud px-4 text-sm outline-none"
            value={outfitId ?? ALL}
            onChange={(e) => {
              const value = e.target.value;
              setOutfitId(value === ALL ? null : (value as Id<"outfits">));
            }}
          >
            <option value={ALL}>All outfits</option>
            {(summaries ?? []).map((outfit) => (
              <option key={outfit._id} value={outfit._id}>
                {outfit.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse bg-soft-cloud" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="space-y-4 border border-dashed border-hairline px-6 py-16 text-center">
          <p className="text-base font-medium">No try-ons yet.</p>
          <p className="text-sm text-mute">
            Open an outfit and choose Try on.
          </p>
          <Link
            href={routes.outfits}
            className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas"
          >
            Choose an outfit
          </Link>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((render) => (
              <li key={render._id}>
                <button
                  type="button"
                  className="w-full space-y-2 text-left"
                  disabled={!render.url}
                  onClick={() => render.url && setLightbox(render.url)}
                >
                  <div className="aspect-[3/4] bg-soft-cloud">
                    {render.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={render.url}
                        alt={render.outfitName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-mute capitalize">
                        {render.status}
                      </div>
                    )}
                  </div>
                  <p className="truncate text-sm font-medium">
                    {render.outfitName}
                  </p>
                  <p className="text-[11px] text-mute capitalize">
                    {render.quality}
                  </p>
                </button>
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

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-label="Try-on preview"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
