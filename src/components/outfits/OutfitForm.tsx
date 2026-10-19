"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { GarmentLine } from "@convex/shared/validators";
import {
  SLOT_CATEGORIES,
  SLOT_LABELS,
  SLOTS,
  type Slot,
} from "@convex/shared/wardrobe";
import { ItemImage } from "@/components/common/ItemImage";
import { RenderSheet } from "@/components/renders/RenderSheet";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/routes";

type Outfit = NonNullable<FunctionReturnType<typeof api.outfits.get>>;
type Item = FunctionReturnType<typeof api.items.list>[number];
type CatalogProduct = FunctionReturnType<
  typeof api.products.listForTryOnSlot
>[number];

export type DraftSlots = {
  outerwear?: Id<"items">;
  top?: Id<"items">;
  bottom?: Id<"items">;
  dress?: Id<"items">;
  shoes?: Id<"items">;
  accessories: Id<"items">[];
};

type CatalogSlots = {
  outerwear?: Id<"products">;
  top?: Id<"products">;
  bottom?: Id<"products">;
  dress?: Id<"products">;
  shoes?: Id<"products">;
  accessories: Id<"products">[];
};

export type OutfitDraft = {
  name: string;
  occasion: string;
  slots: DraftSlots;
};

export const EMPTY_DRAFT: OutfitDraft = {
  name: "",
  occasion: "",
  slots: { accessories: [] },
};

export function draftFromOutfit(outfit: Outfit): OutfitDraft {
  return {
    name: outfit.name,
    occasion: outfit.occasion ?? "",
    slots: {
      outerwear: outfit.slots.outerwear,
      top: outfit.slots.top,
      bottom: outfit.slots.bottom,
      dress: outfit.slots.dress,
      shoes: outfit.slots.shoes,
      accessories: [...outfit.slots.accessories],
    },
  };
}

type SingleSlot = Exclude<Slot, "accessories">;
type PickerSource = "wardrobe" | "shop";

type OutfitFormProps = {
  initial: OutfitDraft;
} & (
  | { mode: "create" }
  | { mode: "edit"; outfitId: Id<"outfits">; onTryOn?: () => void }
);

const EMPTY_CATALOG: CatalogSlots = { accessories: [] };

export function OutfitForm(props: OutfitFormProps) {
  const { initial } = props;
  const router = useRouter();
  const wardrobe = useQuery(api.items.list, {});
  const create = useMutation(api.outfits.create);
  const update = useMutation(api.outfits.update);

  const [slots, setSlots] = useState<DraftSlots>(() => cloneSlots(initial.slots));
  const [catalogSlots, setCatalogSlots] = useState<CatalogSlots>(EMPTY_CATALOG);
  const [catalogMeta, setCatalogMeta] = useState<
    Map<Id<"products">, CatalogProduct>
  >(() => new Map());
  const [occasion, setOccasion] = useState(initial.occasion);
  const [name, setName] = useState(initial.name);
  const [nameTouched, setNameTouched] = useState(initial.name.length > 0);
  const [useDress, setUseDress] = useState(Boolean(initial.slots.dress));
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  const [pickerSource, setPickerSource] = useState<PickerSource>("wardrobe");
  const [pending, setPending] = useState(false);
  const [tryOnLines, setTryOnLines] = useState<GarmentLine[] | null>(null);
  const [today] = useState(() => formatDate(Date.now()));

  const shopProducts = useQuery(
    api.products.listForTryOnSlot,
    pickerSlot && pickerSource === "shop" ? { slot: pickerSlot } : "skip",
  );

  const itemsById = useMemo(
    () => new Map((wardrobe ?? []).map((item) => [item._id, item])),
    [wardrobe],
  );
  const itemCount = countItems(slots);
  const catalogCount = countCatalog(catalogSlots);
  const pieceCount = itemCount + catalogCount;
  const hasCatalog = catalogCount > 0;
  const suggestedName = useMemo(
    () =>
      suggestName(slots, itemsById, catalogSlots, catalogMeta, today),
    [slots, itemsById, catalogSlots, catalogMeta, today],
  );
  const effectiveName = nameTouched ? name : suggestedName;
  const visibleSlots = SLOTS.filter((slot) =>
    useDress ? slot !== "top" && slot !== "bottom" : slot !== "dress",
  );

  const pickerCategories = pickerSlot
    ? SLOT_CATEGORIES[pickerSlot]
    : undefined;
  const pickerItems = (wardrobe ?? []).filter(
    (item) =>
      pickerCategories &&
      (pickerCategories as readonly string[]).includes(item.category),
  );

  function setSlot(slot: SingleSlot, itemId: Id<"items"> | undefined) {
    setSlots((current) => ({ ...cloneSlots(current), [slot]: itemId }));
    if (itemId) {
      setCatalogSlots((current) => ({
        ...cloneCatalog(current),
        [slot]: undefined,
      }));
    }
  }

  function setCatalogSlot(
    slot: SingleSlot,
    product: CatalogProduct | undefined,
  ) {
    setCatalogSlots((current) => ({
      ...cloneCatalog(current),
      [slot]: product?.id,
    }));
    if (product) {
      setCatalogMeta((current) => new Map(current).set(product.id, product));
      setSlots((current) => ({ ...cloneSlots(current), [slot]: undefined }));
    }
  }

  function toggleAccessory(itemId: Id<"items">) {
    setSlots((current) => ({
      ...current,
      accessories: current.accessories.includes(itemId)
        ? current.accessories.filter((id) => id !== itemId)
        : [...current.accessories, itemId],
    }));
  }

  function toggleCatalogAccessory(product: CatalogProduct) {
    setCatalogMeta((current) => new Map(current).set(product.id, product));
    setCatalogSlots((current) => ({
      ...current,
      accessories: current.accessories.includes(product.id)
        ? current.accessories.filter((id) => id !== product.id)
        : [...current.accessories, product.id],
    }));
  }

  function handlePick(itemId: Id<"items">) {
    if (!pickerSlot) return;
    if (pickerSlot === "accessories") {
      toggleAccessory(itemId);
      return;
    }
    setSlot(pickerSlot, slots[pickerSlot] === itemId ? undefined : itemId);
    setPickerSlot(null);
  }

  function handleCatalogPick(product: CatalogProduct) {
    if (!pickerSlot) return;
    if (pickerSlot === "accessories") {
      toggleCatalogAccessory(product);
      return;
    }
    const current = catalogSlots[pickerSlot];
    setCatalogSlot(
      pickerSlot,
      current === product.id ? undefined : product,
    );
    setPickerSlot(null);
  }

  function switchLayer(next: "separates" | "dress") {
    setUseDress(next === "dress");
    setSlots((current) =>
      next === "dress"
        ? { ...current, top: undefined, bottom: undefined }
        : { ...current, dress: undefined },
    );
    setCatalogSlots((current) =>
      next === "dress"
        ? { ...current, top: undefined, bottom: undefined }
        : { ...current, dress: undefined },
    );
  }

  function buildGarmentLines(): GarmentLine[] {
    const lines: GarmentLine[] = [];
    const pushItem = (
      slot: Exclude<Slot, "accessories">,
      id: Id<"items"> | undefined,
    ) => {
      if (id) lines.push({ slot, source: "item", itemId: id });
    };
    const pushProduct = (
      slot: Exclude<Slot, "accessories">,
      id: Id<"products"> | undefined,
    ) => {
      if (id) lines.push({ slot, source: "product", productId: id });
    };
    pushItem("outerwear", slots.outerwear);
    pushProduct("outerwear", catalogSlots.outerwear);
    pushItem("top", slots.top);
    pushProduct("top", catalogSlots.top);
    pushItem("bottom", slots.bottom);
    pushProduct("bottom", catalogSlots.bottom);
    pushItem("dress", slots.dress);
    pushProduct("dress", catalogSlots.dress);
    pushItem("shoes", slots.shoes);
    pushProduct("shoes", catalogSlots.shoes);
    for (const itemId of slots.accessories) {
      lines.push({ slot: "accessories", source: "item", itemId });
    }
    for (const productId of catalogSlots.accessories) {
      lines.push({ slot: "accessories", source: "product", productId });
    }
    return lines;
  }

  function handleTryOnMixed() {
    const lines = buildGarmentLines();
    if (lines.length === 0) return;
    setTryOnLines(lines);
  }

  async function handleSave() {
    if (itemCount === 0 || pending) return;
    if (hasCatalog) {
      toast.error("Remove shop pieces before saving. Save only wardrobe outfits.");
      return;
    }
    setPending(true);
    const savedName = effectiveName.trim() || suggestedName;
    const savedOccasion = occasion.trim();
    const savedSlots = toSlotsArg(slots);
    try {
      if (props.mode === "create") {
        const newId = await create({
          name: savedName,
          slots: savedSlots,
          occasion: savedOccasion || undefined,
        });
        toast.success("Outfit saved.");
        router.replace(routes.outfit(newId));
        return;
      }
      await update({
        outfitId: props.outfitId,
        patch: {
          name: savedName,
          slots: savedSlots,
          occasion: savedOccasion || null,
        },
      });
      setName(savedName);
      setNameTouched(true);
      toast.success("Outfit updated.");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => switchLayer("separates")}
          className={cn(
            "h-10 rounded-full px-5 text-sm font-medium",
            !useDress ? "bg-ink text-canvas" : "bg-soft-cloud text-ink",
          )}
        >
          Top + bottom
        </button>
        <button
          type="button"
          onClick={() => switchLayer("dress")}
          className={cn(
            "h-10 rounded-full px-5 text-sm font-medium",
            useDress ? "bg-ink text-canvas" : "bg-soft-cloud text-ink",
          )}
        >
          Dress
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 lg:grid lg:grid-cols-3 lg:overflow-visible">
        {visibleSlots.map((slot) => {
          const wardrobeSelected =
            slot === "accessories"
              ? slots.accessories
                  .map((id) => itemsById.get(id))
                  .filter(Boolean)
              : slots[slot]
                ? [itemsById.get(slots[slot]!)]
                : [];
          const catalogSelected =
            slot === "accessories"
              ? catalogSlots.accessories
                  .map((id) => catalogMeta.get(id))
                  .filter(Boolean)
              : catalogSlots[slot]
                ? [catalogMeta.get(catalogSlots[slot]!)]
                : [];
          const selected = [...wardrobeSelected, ...catalogSelected];
          return (
            <button
              key={slot}
              type="button"
              onClick={() => {
                setPickerSource("wardrobe");
                setPickerSlot(slot);
              }}
              className="flex min-h-28 w-40 shrink-0 flex-col gap-2 border border-hairline p-3 text-left hover:bg-soft-cloud lg:w-auto lg:shrink"
            >
              <span className="text-[11px] font-medium tracking-wide text-mute uppercase">
                {SLOT_LABELS[slot]}
              </span>
              {selected.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selected.map((piece) => {
                    if (!piece) return null;
                    if ("_id" in piece) {
                      return (
                        <div key={piece._id} className="flex items-center gap-2">
                          <ItemImage
                            src={piece.url}
                            alt={piece.name}
                            className="size-14 p-1"
                          />
                          <span className="max-w-[8rem] truncate text-xs">
                            {piece.name}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div key={piece.id} className="flex items-center gap-2">
                        <ItemImage
                          src={piece.imageUrl}
                          alt={piece.name}
                          className="size-14 p-1"
                        />
                        <span className="max-w-[8rem] truncate text-xs">
                          {piece.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="text-sm text-mute">Tap to choose</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Name
          <input
            value={effectiveName}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
            className="h-12 rounded-[24px] border border-hairline bg-soft-cloud px-4 text-base outline-none focus:border-ink focus:bg-canvas"
            placeholder="Outfit name"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Occasion
          <input
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            className="h-12 rounded-[24px] border border-hairline bg-soft-cloud px-4 text-base outline-none focus:border-ink focus:bg-canvas"
            placeholder="Optional"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={itemCount === 0 || pending || hasCatalog}
          onClick={() => void handleSave()}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {props.mode === "create" ? "Save outfit" : "Save changes"}
        </button>
        {hasCatalog || (props.mode === "create" && pieceCount > 0) ? (
          <button
            type="button"
            disabled={pieceCount === 0}
            onClick={handleTryOnMixed}
            className="inline-flex h-12 items-center rounded-full bg-soft-cloud px-8 text-base font-medium text-ink disabled:opacity-50"
          >
            Try on
          </button>
        ) : props.mode === "edit" && props.onTryOn ? (
          <button
            type="button"
            onClick={props.onTryOn}
            className="inline-flex h-12 items-center rounded-full bg-soft-cloud px-8 text-base font-medium text-ink"
          >
            Try on
          </button>
        ) : null}
      </div>
      {hasCatalog ? (
        <p className="text-xs text-mute">
          Shop pieces can be tried on now. Remove them to save a wardrobe-only outfit.
        </p>
      ) : null}

      {pickerSlot ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
          <div className="flex max-h-[85dvh] w-full max-w-lg flex-col bg-canvas pb-[env(safe-area-inset-bottom)] sm:pb-0">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <h2 className="text-sm font-medium">
                Choose {SLOT_LABELS[pickerSlot].toLowerCase()}
              </h2>
              <button
                type="button"
                aria-label="Close"
                className="flex size-10 items-center justify-center rounded-full hover:bg-soft-cloud"
                onClick={() => setPickerSlot(null)}
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex gap-2 border-b border-hairline px-4 py-2">
              <button
                type="button"
                onClick={() => setPickerSource("wardrobe")}
                className={cn(
                  "h-9 rounded-full px-4 text-sm font-medium",
                  pickerSource === "wardrobe"
                    ? "bg-ink text-canvas"
                    : "bg-soft-cloud text-ink",
                )}
              >
                Wardrobe
              </button>
              <button
                type="button"
                onClick={() => setPickerSource("shop")}
                className={cn(
                  "h-9 rounded-full px-4 text-sm font-medium",
                  pickerSource === "shop"
                    ? "bg-ink text-canvas"
                    : "bg-soft-cloud text-ink",
                )}
              >
                Shop
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {pickerSource === "wardrobe" ? (
                wardrobe === undefined ? (
                  <p className="text-sm text-mute">Loading wardrobe…</p>
                ) : pickerItems.length === 0 ? (
                  <p className="text-sm text-mute">
                    No matching pieces.{" "}
                    <a href={routes.add} className="underline">
                      Add clothes
                    </a>
                  </p>
                ) : (
                  <ul className="grid grid-cols-3 gap-3">
                    {pickerItems.map((item) => {
                      const selected =
                        pickerSlot === "accessories"
                          ? slots.accessories.includes(item._id)
                          : slots[pickerSlot] === item._id;
                      return (
                        <li key={item._id}>
                          <button
                            type="button"
                            onClick={() => handlePick(item._id)}
                            className={cn(
                              "w-full space-y-1 text-left",
                              selected && "ring-2 ring-ink",
                            )}
                          >
                            <ItemImage
                              src={item.url}
                              alt={item.name}
                              className="p-2"
                            />
                            <span className="block truncate text-[11px]">
                              {item.name}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : shopProducts === undefined ? (
                <p className="text-sm text-mute">Loading shop…</p>
              ) : shopProducts.length === 0 ? (
                <p className="text-sm text-mute">
                  No try-on ready shop pieces for this slot yet.
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-3">
                  {shopProducts.map((product) => {
                    const selected =
                      pickerSlot === "accessories"
                        ? catalogSlots.accessories.includes(product.id)
                        : catalogSlots[pickerSlot] === product.id;
                    return (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => handleCatalogPick(product)}
                          className={cn(
                            "w-full space-y-1 text-left",
                            selected && "ring-2 ring-ink",
                          )}
                        >
                          <ItemImage
                            src={product.imageUrl}
                            alt={product.name}
                            className="p-2"
                          />
                          <span className="block truncate text-[11px]">
                            {product.name}
                          </span>
                          <span className="block truncate text-[10px] text-mute">
                            {product.vendorName}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {pickerSlot === "accessories" ? (
              <div className="border-t border-hairline p-4">
                <button
                  type="button"
                  className="h-11 w-full rounded-full bg-ink text-sm font-medium text-canvas"
                  onClick={() => setPickerSlot(null)}
                >
                  Done
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tryOnLines ? (
        <RenderSheet
          garmentLines={tryOnLines}
          open
          onOpenChange={(open) => {
            if (!open) setTryOnLines(null);
          }}
        />
      ) : null}
    </div>
  );
}

function cloneSlots(slots: DraftSlots): DraftSlots {
  return {
    outerwear: slots.outerwear,
    top: slots.top,
    bottom: slots.bottom,
    dress: slots.dress,
    shoes: slots.shoes,
    accessories: [...slots.accessories],
  };
}

function cloneCatalog(slots: CatalogSlots): CatalogSlots {
  return {
    outerwear: slots.outerwear,
    top: slots.top,
    bottom: slots.bottom,
    dress: slots.dress,
    shoes: slots.shoes,
    accessories: [...slots.accessories],
  };
}

function countItems(slots: DraftSlots): number {
  return (
    (slots.outerwear ? 1 : 0) +
    (slots.top ? 1 : 0) +
    (slots.bottom ? 1 : 0) +
    (slots.dress ? 1 : 0) +
    (slots.shoes ? 1 : 0) +
    slots.accessories.length
  );
}

function countCatalog(slots: CatalogSlots): number {
  return (
    (slots.outerwear ? 1 : 0) +
    (slots.top ? 1 : 0) +
    (slots.bottom ? 1 : 0) +
    (slots.dress ? 1 : 0) +
    (slots.shoes ? 1 : 0) +
    slots.accessories.length
  );
}

function toSlotsArg(slots: DraftSlots) {
  return {
    ...(slots.outerwear ? { outerwear: slots.outerwear } : {}),
    ...(slots.top ? { top: slots.top } : {}),
    ...(slots.bottom ? { bottom: slots.bottom } : {}),
    ...(slots.dress ? { dress: slots.dress } : {}),
    ...(slots.shoes ? { shoes: slots.shoes } : {}),
    accessories: slots.accessories,
  };
}

function suggestName(
  slots: DraftSlots,
  itemsById: Map<Id<"items">, Item>,
  catalogSlots: CatalogSlots,
  catalogMeta: Map<Id<"products">, CatalogProduct>,
  today: string,
): string {
  const firstItem =
    slots.dress ??
    slots.top ??
    slots.bottom ??
    slots.outerwear ??
    slots.shoes ??
    slots.accessories[0];
  const item = firstItem ? itemsById.get(firstItem) : undefined;
  if (item) return item.name;
  const firstProduct =
    catalogSlots.dress ??
    catalogSlots.top ??
    catalogSlots.bottom ??
    catalogSlots.outerwear ??
    catalogSlots.shoes ??
    catalogSlots.accessories[0];
  const product = firstProduct ? catalogMeta.get(firstProduct) : undefined;
  return product ? product.name : `Outfit · ${today}`;
}
