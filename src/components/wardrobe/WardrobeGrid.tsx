"use client";

import { useQuery } from "convex/react";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
} from "@convex/shared/wardrobe";
import { ChipRail, FilterChip } from "@/components/common/ChipRail";
import { StickyAction } from "@/components/common/StickyAction";
import { ItemTile } from "@/components/wardrobe/ItemTile";
import { SeedDemoWardrobe } from "@/components/wardrobe/SeedDemoWardrobe";
import { pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

export function WardrobeGrid() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [showHidden, setShowHidden] = useState(false);

  const listArgs = {
    status: showHidden ? ("hidden" as const) : undefined,
    category: category === "all" ? undefined : category,
  };
  const listed = useQuery(api.items.list, listArgs);
  const searched = useQuery(
    api.items.search,
    query.trim().length > 0 ? { query: query.trim(), limit: 100 } : "skip",
  );

  const items = useMemo(() => {
    const source = query.trim().length > 0 ? searched : listed;
    if (!source) return undefined;
    let filtered = source;
    if (query.trim().length > 0) {
      if (category !== "all") {
        filtered = filtered.filter((item) => item.category === category);
      }
      if (!showHidden) {
        filtered = filtered.filter((item) => item.status !== "hidden");
      } else {
        filtered = filtered.filter((item) => item.status === "hidden");
      }
    }
    return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
  }, [category, listed, query, searched, showHidden]);

  const ingesting = useQuery(api.jobs.listActive)?.some(
    (job) => job.type === "ingest",
  );

  return (
    <div className="space-y-5 sm:space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
            The personal collection
          </p>
          <h1 className="mt-1 font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:mt-2 sm:text-5xl">
            Your wardrobe.
          </h1>
          <p className="mt-2 max-w-md text-sm text-mute sm:mt-4 sm:text-base">
            The pieces you love. The looks you haven&apos;t tried yet.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SeedDemoWardrobe />
          <Link
            href={routes.add}
            className="hidden h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-6 text-base font-medium text-canvas transition active:scale-95 active:opacity-50 lg:inline-flex"
          >
            <Plus className="size-4" />
            Add clothes
          </Link>
        </div>
      </div>

      {ingesting ? (
        <div className="flex flex-wrap items-center gap-2 border border-hairline bg-soft-cloud px-4 py-3 text-sm">
          <span>New clothes are being processed.</span>
          <Link href={routes.add} className="font-medium underline underline-offset-4">
            Watch progress
          </Link>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-mute" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, colour, material…"
            className="h-11 w-full rounded-[24px] bg-soft-cloud pr-4 pl-11 text-base outline-none focus:bg-canvas focus:ring-2 focus:ring-ink"
          />
        </div>
        <ChipRail label="Wardrobe filters">
          <FilterChip
            active={category === "all"}
            onClick={() => setCategory("all")}
            label="All"
          />
          {CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              active={category === cat}
              onClick={() => setCategory(cat)}
              label={CATEGORY_LABELS[cat]}
            />
          ))}
          <FilterChip
            active={showHidden}
            onClick={() => setShowHidden((v) => !v)}
            label="Hidden"
          />
        </ChipRail>
      </div>

      {items === undefined ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse bg-soft-cloud" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="space-y-4 border border-dashed border-hairline px-6 py-16 text-center">
          <p className="text-base font-medium">
            {query.trim() || category !== "all" || showHidden
              ? "No matching pieces."
              : "Your wardrobe is empty."}
          </p>
          <p className="text-sm text-mute">
            {showHidden
              ? "Nothing hidden right now."
              : query.trim() || category !== "all"
                ? "Try a different search or clear filters."
                : "Upload a photo, or seed a free demo wardrobe to explore."}
          </p>
          {!showHidden && !query.trim() && category === "all" ? (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <SeedDemoWardrobe variant="secondary" />
              <Link
                href={routes.add}
                className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas"
              >
                Add clothes
              </Link>
            </div>
          ) : !showHidden ? (
            <Link
              href={routes.add}
              className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas"
            >
              Add clothes
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <p className="text-xs font-medium text-mute tabular-nums">
            {pluralize(items.length, "item")}
          </p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-4">
            {items.map((item) => (
              <ItemTile key={item._id} item={item} />
            ))}
          </ul>
        </>
      )}
      <StickyAction href={routes.add}>
        <Plus className="size-4" />
        Add clothes
      </StickyAction>
    </div>
  );
}
