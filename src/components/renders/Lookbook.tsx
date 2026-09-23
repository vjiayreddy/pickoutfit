"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ChipRail, FilterChip } from "@/components/common/ChipRail";
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
  const swipeStart = useRef<number | null>(null);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          Fitting room archive
        </p>
        <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:mt-2 sm:text-5xl">
          Lookbook
        </h1>
        <p className="mt-2 max-w-md text-sm text-mute sm:mt-4 sm:text-base">
          Your wardrobe, on you. Keep the looks worth coming back to.
        </p>
      </div>

      <div className="lg:hidden">
        <ChipRail label="Filter by outfit">
          <FilterChip active={outfitId === null} onClick={() => setOutfitId(null)} label="All" />
          {(summaries ?? []).map((outfit) => (
            <FilterChip
              key={outfit._id}
              active={outfitId === outfit._id}
              onClick={() => setOutfitId(outfit._id)}
              label={outfit.name}
            />
          ))}
        </ChipRail>
      </div>
      <div className="hidden items-center gap-3 border-y border-hairline py-3 lg:flex">
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
                    {render.kind === "groom" && render.groomingLabel
                      ? `${render.groomingLabel} · `
                      : ""}
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
          className="fixed inset-0 z-50 flex flex-col bg-ink"
          role="dialog"
          aria-label="Try-on preview"
          onTouchStart={(event) => {
            swipeStart.current = event.changedTouches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = swipeStart.current;
            const end = event.changedTouches[0]?.clientX;
            swipeStart.current = null;
            if (start !== null && end !== undefined && Math.abs(end - start) > 48) {
              setLightbox(null);
            }
          }}
        >
          <button
            type="button"
            aria-label="Close preview"
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-10 flex size-11 items-center justify-center rounded-full bg-canvas text-ink"
            onClick={() => setLightbox(null)}
          >
            <X className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close preview"
            onClick={() => setLightbox(null)}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="relative z-10 m-auto max-h-full max-w-full object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
