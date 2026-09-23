"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  SLOT_CATEGORIES,
  SLOT_LABELS,
  SLOTS,
  type Slot,
} from "@convex/shared/wardrobe";
import { ItemImage } from "@/components/common/ItemImage";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/routes";

type Outfit = NonNullable<FunctionReturnType<typeof api.outfits.get>>;
type Item = FunctionReturnType<typeof api.items.list>[number];

export type DraftSlots = {
  outerwear?: Id<"items">;
  top?: Id<"items">;
  bottom?: Id<"items">;
  dress?: Id<"items">;
  shoes?: Id<"items">;
  accessories: Id<"items">[];
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

type OutfitFormProps = {
  initial: OutfitDraft;
} & (
  | { mode: "create" }
  | { mode: "edit"; outfitId: Id<"outfits">; onTryOn?: () => void }
);

export function OutfitForm(props: OutfitFormProps) {
  const { initial } = props;
  const router = useRouter();
  const wardrobe = useQuery(api.items.list, {});
  const create = useMutation(api.outfits.create);
  const update = useMutation(api.outfits.update);

  const [slots, setSlots] = useState<DraftSlots>(() => cloneSlots(initial.slots));
  const [occasion, setOccasion] = useState(initial.occasion);
  const [name, setName] = useState(initial.name);
  const [nameTouched, setNameTouched] = useState(initial.name.length > 0);
  const [useDress, setUseDress] = useState(Boolean(initial.slots.dress));
  const [pickerSlot, setPickerSlot] = useState<Slot | null>(null);
  const [pending, setPending] = useState(false);
  const [today] = useState(() => formatDate(Date.now()));

  const itemsById = useMemo(
    () => new Map((wardrobe ?? []).map((item) => [item._id, item])),
    [wardrobe],
  );
  const itemCount = countItems(slots);
  const suggestedName = useMemo(
    () => suggestName(slots, itemsById, today),
    [slots, itemsById, today],
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
  }

  function toggleAccessory(itemId: Id<"items">) {
    setSlots((current) => ({
      ...current,
      accessories: current.accessories.includes(itemId)
        ? current.accessories.filter((id) => id !== itemId)
        : [...current.accessories, itemId],
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

  function switchLayer(next: "separates" | "dress") {
    setUseDress(next === "dress");
    setSlots((current) =>
      next === "dress"
        ? { ...current, top: undefined, bottom: undefined }
        : { ...current, dress: undefined },
    );
  }

  async function handleSave() {
    if (itemCount === 0 || pending) return;
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
          const selected =
            slot === "accessories"
              ? slots.accessories
                  .map((id) => itemsById.get(id))
                  .filter(Boolean)
              : slots[slot]
                ? [itemsById.get(slots[slot]!)]
                : [];
          return (
            <button
              key={slot}
              type="button"
              onClick={() => setPickerSlot(slot)}
              className="flex min-h-28 w-40 shrink-0 flex-col gap-2 border border-hairline p-3 text-left hover:bg-soft-cloud lg:w-auto lg:shrink"
            >
              <span className="text-[11px] font-medium tracking-wide text-mute uppercase">
                {SLOT_LABELS[slot]}
              </span>
              {selected.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selected.map(
                    (item) =>
                      item && (
                        <div key={item._id} className="flex items-center gap-2">
                          <ItemImage
                            src={item.url}
                            alt={item.name}
                            className="size-14 p-1"
                          />
                          <span className="max-w-[8rem] truncate text-xs">
                            {item.name}
                          </span>
                        </div>
                      ),
                  )}
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
          disabled={itemCount === 0 || pending}
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
        {props.mode === "edit" && props.onTryOn ? (
          <button
            type="button"
            onClick={props.onTryOn}
            className="inline-flex h-12 items-center rounded-full bg-soft-cloud px-8 text-base font-medium text-ink"
          >
            Try on
          </button>
        ) : null}
      </div>

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
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {wardrobe === undefined ? (
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
  today: string,
): string {
  const first =
    slots.dress ??
    slots.top ??
    slots.bottom ??
    slots.outerwear ??
    slots.shoes ??
    slots.accessories[0];
  const item = first ? itemsById.get(first) : undefined;
  return item ? `${item.name}` : `Outfit · ${today}`;
}
