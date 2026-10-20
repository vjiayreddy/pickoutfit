"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, ShoppingBag, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SLOT_LABELS } from "@convex/shared/wardrobe";
import { ChipRail, FilterChip } from "@/components/common/ChipRail";
import { ItemImage } from "@/components/common/ItemImage";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";
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
  const [activeRenderId, setActiveRenderId] = useState<Id<"renders"> | null>(
    null,
  );
  const swipeStart = useRef<number | null>(null);

  const activeRender = results.find((r) => r._id === activeRenderId) ?? null;
  const isShopLook = Boolean(
    activeRender && !activeRender.outfitId && !activeRender.serviceId,
  );

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
          Wardrobe outfits and store trial-room looks, tried on you. Open a shop
          look to see prices and add pieces to your bag.
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
            Try on a wardrobe outfit, or build a look in the trial room from
            store pieces.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href={routes.outfits}
              className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas"
            >
              Wardrobe outfits
            </Link>
            <Link
              href={routes.trialRoom}
              className="inline-flex h-12 items-center rounded-full bg-soft-cloud px-8 text-base font-medium text-ink"
            >
              Open trial room
            </Link>
          </div>
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {results.map((render) => (
              <li key={render._id}>
                <button
                  type="button"
                  className="w-full space-y-2 text-left"
                  disabled={!render.url && render.status !== "done"}
                  onClick={() => setActiveRenderId(render._id)}
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
                    {render.outfitId
                      ? "Wardrobe · "
                      : render.serviceId
                        ? ""
                        : "Shop · "}
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

      {activeRender ? (
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
            if (
              start !== null &&
              end !== undefined &&
              Math.abs(end - start) > 48 &&
              !isShopLook
            ) {
              setActiveRenderId(null);
            }
          }}
        >
          <button
            type="button"
            aria-label="Close preview"
            className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-20 flex size-11 items-center justify-center rounded-full bg-canvas text-ink"
            onClick={() => setActiveRenderId(null)}
          >
            <X className="size-4" aria-hidden />
          </button>

          {isShopLook ? (
            <ShopLookDetail
              renderId={activeRender._id}
              imageUrl={activeRender.url}
              title={activeRender.outfitName}
              sourceLabel="Shop"
              onClose={() => setActiveRenderId(null)}
            />
          ) : (
            <>
              <button
                type="button"
                className="absolute inset-0"
                aria-label="Close preview"
                onClick={() => setActiveRenderId(null)}
              />
              {activeRender.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeRender.url}
                  alt=""
                  className="relative z-10 m-auto max-h-full max-w-full object-contain"
                  onClick={(event) => event.stopPropagation()}
                />
              ) : null}
              <p className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0 z-10 text-center text-sm text-canvas/80">
                Wardrobe look
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ShopLookDetail({
  renderId,
  imageUrl,
  title,
  sourceLabel,
  onClose,
}: {
  renderId: Id<"renders">;
  imageUrl: string | null;
  title: string;
  sourceLabel: string;
  onClose: () => void;
}) {
  const products = useQuery(api.renders.shopProducts, { renderId });
  const add = useMutation(api.cart.add);
  const [selected, setSelected] = useState<Set<Id<"products">>>(() => new Set());
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (products) {
      setSelected(new Set(products.map((p) => p.productId)));
    }
  }, [products]);

  const buySelected = (products ?? []).filter((p) => selected.has(p.productId));
  const buyTotal = buySelected.reduce((sum, p) => sum + p.priceInr, 0);

  function toggle(productId: Id<"products">) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  async function addSelectedToBag() {
    if (buySelected.length === 0 || pending) return;
    setPending(true);
    let added = 0;
    try {
      for (const product of buySelected) {
        await add({ productId: product.productId, addedFrom: "store" });
        added += 1;
      }
      toast.success(
        added === 1 ? "Added to bag" : `Added ${added} pieces to bag`,
      );
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col bg-canvas text-ink">
      <div className="shrink-0 border-b border-hairline px-4 py-4 pr-14">
        <p className="text-[10px] font-medium tracking-[0.16em] text-mute uppercase">
          {sourceLabel} look
        </p>
        <h2 className="mt-1 truncate text-lg font-medium tracking-tight">
          {title}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {imageUrl ? (
          <div className="aspect-[3/4] max-h-[45vh] bg-soft-cloud sm:max-h-[50vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          </div>
        ) : null}
        <div className="space-y-4 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">Pieces in this look</h3>
              <p className="text-sm text-mute">
                Select what to add to your bag.
              </p>
            </div>
            {products && products.length > 0 ? (
              <button
                type="button"
                className="text-sm font-medium underline underline-offset-4"
                onClick={() =>
                  setSelected(new Set(products.map((p) => p.productId)))
                }
              >
                Select all
              </button>
            ) : null}
          </div>
          {products === undefined ? (
            <div className="h-24 animate-pulse bg-soft-cloud" />
          ) : products.length === 0 ? (
            <p className="text-sm text-mute">
              These store pieces are no longer available.
            </p>
          ) : (
            <ul className="space-y-3">
              {products.map((product) => {
                const checked = selected.has(product.productId);
                return (
                  <li key={product.productId}>
                    <div className="flex items-center gap-3 border border-hairline p-3">
                      <button
                        type="button"
                        aria-label={checked ? "Deselect" : "Select"}
                        onClick={() => toggle(product.productId)}
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border",
                          checked
                            ? "border-ink bg-ink text-canvas"
                            : "border-hairline bg-canvas",
                        )}
                      >
                        {checked ? <Check className="size-3" /> : null}
                      </button>
                      <Link
                        href={routes.storeProduct(
                          product.vendorSlug,
                          product.slug,
                        )}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <ItemImage
                          src={product.imageUrl}
                          alt={product.name}
                          className="size-14 p-1"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {product.name}
                          </span>
                          <span className="block truncate text-xs text-mute">
                            {SLOT_LABELS[product.slot]} · {product.vendorName}
                          </span>
                        </span>
                        <span className="text-sm font-medium tabular-nums">
                          {formatInr(product.priceInr)}
                        </span>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      <div className="shrink-0 space-y-2 border-t border-hairline p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={buySelected.length === 0 || pending}
          onClick={() => void addSelectedToBag()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-medium text-canvas disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ShoppingBag className="size-4" />
          )}
          {buySelected.length === 0
            ? "Select pieces"
            : buySelected.length === (products?.length ?? 0)
              ? `Add look · ${formatInr(buyTotal)}`
              : `Add ${buySelected.length} · ${formatInr(buyTotal)}`}
        </button>
        <div className="flex justify-center gap-4 text-sm">
          <Link
            href={routes.cart}
            className="font-medium underline underline-offset-4"
          >
            View bag
          </Link>
          <button
            type="button"
            className="font-medium text-mute"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
