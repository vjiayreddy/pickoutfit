"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, ShoppingBag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { GarmentLine } from "@convex/shared/validators";
import { SLOT_LABELS, SLOTS, type Slot } from "@convex/shared/wardrobe";
import { ItemImage } from "@/components/common/ItemImage";
import { AppHeaderTitle } from "@/components/layout/app-header";
import { RenderSheet } from "@/components/renders/RenderSheet";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

type Piece = {
  lineId: Id<"trialRoomItems">;
  productId: Id<"products">;
  slot: Slot;
  name: string;
  imageUrl: string | null;
  vendorName: string;
  vendorSlug: string;
  slug: string;
  priceInr: number;
  canTryOn: boolean;
};

export function TrialRoom() {
  const data = useQuery(api.trialRoom.current);
  const remove = useMutation(api.trialRoom.remove);
  const setSlot = useMutation(api.trialRoom.setSlot);
  const clear = useMutation(api.trialRoom.clear);
  const addToCart = useMutation(api.cart.add);

  const [tryOnOpen, setTryOnOpen] = useState(false);
  const [moveLineId, setMoveLineId] = useState<Id<"trialRoomItems"> | null>(
    null,
  );
  const [selectedForBuy, setSelectedForBuy] = useState<Set<Id<"products">>>(
    () => new Set(),
  );
  const [pendingCart, setPendingCart] = useState(false);
  const [pendingClear, setPendingClear] = useState(false);

  const pieces = data?.pieces ?? [];
  const useDress = pieces.some((p) => p.slot === "dress");
  const visibleSlots = SLOTS.filter((slot) =>
    useDress ? slot !== "top" && slot !== "bottom" : slot !== "dress",
  );

  const bySlot = useMemo(() => {
    const map = new Map<Slot, Piece[]>();
    for (const slot of SLOTS) map.set(slot, []);
    for (const piece of pieces) {
      map.get(piece.slot)?.push(piece);
    }
    return map;
  }, [pieces]);

  const tryOnPieces = pieces.filter((p) => p.canTryOn);
  const garmentLines: GarmentLine[] = tryOnPieces.map((p) => ({
    slot: p.slot,
    source: "product" as const,
    productId: p.productId,
  }));

  const buySelected = pieces.filter((p) => selectedForBuy.has(p.productId));
  const buyTotal = buySelected.reduce((sum, p) => sum + p.priceInr, 0);

  function toggleBuy(productId: Id<"products">) {
    setSelectedForBuy((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function selectAllForBuy() {
    setSelectedForBuy(new Set(pieces.map((p) => p.productId)));
  }

  async function handleRemove(lineId: Id<"trialRoomItems">) {
    try {
      await remove({ lineId });
    } catch (error) {
      toast.error(reportError(error).message);
    }
  }

  async function handleSetSlot(lineId: Id<"trialRoomItems">, slot: Slot) {
    try {
      await setSlot({ lineId, slot });
      setMoveLineId(null);
    } catch (error) {
      toast.error(reportError(error).message);
    }
  }

  async function handleClear() {
    if (pendingClear || pieces.length === 0) return;
    setPendingClear(true);
    try {
      await clear({});
      setSelectedForBuy(new Set());
      toast.success("Trial room cleared.");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingClear(false);
    }
  }

  async function addSelectedToBag() {
    if (buySelected.length === 0 || pendingCart) return;
    setPendingCart(true);
    let added = 0;
    try {
      for (const piece of buySelected) {
        await addToCart({ productId: piece.productId, addedFrom: "store" });
        added += 1;
      }
      toast.success(
        added === 1 ? "Added to bag" : `Added ${added} pieces to bag`,
      );
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingCart(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <AppHeaderTitle title="Trial room" />
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          Shop
        </p>
        <h1 className="font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl">
          Trial room.
        </h1>
        <p className="max-w-md text-sm text-mute sm:text-base">
          Browse stores and add pieces here. Arrange slots like an outfit, try
          the look on you, then buy what you want.
        </p>
      </header>

      {data === undefined ? (
        <div className="h-48 animate-pulse bg-soft-cloud" />
      ) : pieces.length === 0 ? (
        <div className="space-y-4 border border-dashed border-hairline px-6 py-16 text-center">
          <p className="text-base font-medium">Trial room is empty</p>
          <p className="text-sm text-mute">
            Open a store product and tap Add to trial room.
          </p>
          <Link
            href={routes.shop}
            className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas"
          >
            Browse shop
          </Link>
        </div>
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
            {visibleSlots.map((slot) => {
              const selected = bySlot.get(slot) ?? [];
              return (
                <div
                  key={slot}
                  className="flex min-h-28 w-44 shrink-0 flex-col gap-2 border border-hairline p-3 lg:w-auto lg:shrink"
                >
                  <span className="text-[11px] font-medium tracking-wide text-mute uppercase">
                    {SLOT_LABELS[slot]}
                  </span>
                  {selected.length > 0 ? (
                    <ul className="space-y-2">
                      {selected.map((piece) => (
                        <li
                          key={piece.lineId}
                          className="flex items-center gap-2"
                        >
                          <ItemImage
                            src={piece.imageUrl}
                            alt={piece.name}
                            className="size-14 p-1"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {piece.name}
                            </p>
                            <p className="truncate text-[10px] text-mute">
                              {formatInr(piece.priceInr)}
                            </p>
                            <div className="mt-1 flex gap-2">
                              <button
                                type="button"
                                className="text-[10px] font-medium underline"
                                onClick={() => setMoveLineId(piece.lineId)}
                              >
                                Move
                              </button>
                              <button
                                type="button"
                                className="text-[10px] font-medium text-mute underline"
                                onClick={() => void handleRemove(piece.lineId)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-sm text-mute">Empty</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={garmentLines.length === 0}
              onClick={() => setTryOnOpen(true)}
              className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
            >
              Try on
            </button>
            <Link
              href={routes.shop}
              className="inline-flex h-12 items-center rounded-full bg-soft-cloud px-8 text-base font-medium text-ink"
            >
              Keep browsing
            </Link>
            <button
              type="button"
              disabled={pendingClear}
              onClick={() => void handleClear()}
              className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-mute"
            >
              {pendingClear ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Clear
            </button>
          </div>

          <section className="space-y-4 border-t border-hairline pt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium tracking-tight">Buy pieces</h2>
                <p className="text-sm text-mute">
                  Select the full look or only what you want in your bag.
                </p>
              </div>
              <button
                type="button"
                onClick={selectAllForBuy}
                className="text-sm font-medium underline underline-offset-4"
              >
                Select all
              </button>
            </div>
            <ul className="space-y-3">
              {pieces.map((piece) => {
                const checked = selectedForBuy.has(piece.productId);
                return (
                  <li key={piece.lineId}>
                    <button
                      type="button"
                      onClick={() => toggleBuy(piece.productId)}
                      className="flex w-full items-center gap-3 border border-hairline p-3 text-left hover:bg-soft-cloud"
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border",
                          checked
                            ? "border-ink bg-ink text-canvas"
                            : "border-hairline bg-canvas",
                        )}
                      >
                        {checked ? <Check className="size-3" /> : null}
                      </span>
                      <ItemImage
                        src={piece.imageUrl}
                        alt={piece.name}
                        className="size-14 p-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {piece.name}
                        </span>
                        <span className="block truncate text-xs text-mute">
                          {SLOT_LABELS[piece.slot]} · {piece.vendorName}
                        </span>
                      </span>
                      <span className="text-sm font-medium tabular-nums">
                        {formatInr(piece.priceInr)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={buySelected.length === 0 || pendingCart}
                onClick={() => void addSelectedToBag()}
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
              >
                {pendingCart ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShoppingBag className="size-4" />
                )}
                {buySelected.length === pieces.length
                  ? "Add look to bag"
                  : `Add ${buySelected.length} to bag`}
              </button>
              {buySelected.length > 0 ? (
                <span className="text-sm text-mute">{formatInr(buyTotal)}</span>
              ) : null}
              <Link
                href={routes.cart}
                className="text-sm font-medium underline underline-offset-4"
              >
                View bag
              </Link>
            </div>
          </section>
        </>
      )}

      {moveLineId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
          <div className="w-full max-w-sm bg-canvas p-6 pb-[env(safe-area-inset-bottom)] sm:pb-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-medium">Move to slot</h2>
              <button
                type="button"
                aria-label="Close"
                className="flex size-10 items-center justify-center rounded-full hover:bg-soft-cloud"
                onClick={() => setMoveLineId(null)}
              >
                <X className="size-4" />
              </button>
            </div>
            <ul className="space-y-2">
              {SLOTS.map((slot) => (
                <li key={slot}>
                  <button
                    type="button"
                    className="h-11 w-full rounded-full bg-soft-cloud text-sm font-medium text-ink"
                    onClick={() => void handleSetSlot(moveLineId, slot)}
                  >
                    {SLOT_LABELS[slot]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {tryOnOpen && garmentLines.length > 0 ? (
        <RenderSheet
          garmentLines={garmentLines}
          lookKind="shop"
          open
          onOpenChange={setTryOnOpen}
        />
      ) : null}
    </div>
  );
}
