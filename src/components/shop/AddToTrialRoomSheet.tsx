"use client";

import { useMutation } from "convex/react";
import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { SLOT_LABELS, SLOTS, type Slot } from "@convex/shared/wardrobe";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

type AddToTrialRoomSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: Id<"products">;
  /** Suggested slot from product try-on meta. */
  suggestedSlot: Slot | null;
  productName: string;
};

export function AddToTrialRoomSheet({
  open,
  onOpenChange,
  productId,
  suggestedSlot,
  productName,
}: AddToTrialRoomSheetProps) {
  const router = useRouter();
  const add = useMutation(api.trialRoom.add);
  const [slot, setSlot] = useState<Slot>(suggestedSlot ?? "top");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) setSlot(suggestedSlot ?? "top");
  }, [open, suggestedSlot]);

  if (!open) return null;

  async function handleAdd(thenOpen: boolean) {
    if (pending) return;
    setPending(true);
    try {
      await add({ productId, slot });
      toast.success(`Added ${productName} to trial room`);
      onOpenChange(false);
      if (thenOpen) router.push(routes.trialRoom);
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 w-full max-w-md bg-canvas pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="flex items-start justify-between border-b border-hairline p-5">
          <div>
            <p className="text-[10px] font-medium tracking-[0.16em] text-mute uppercase">
              Trial room
            </p>
            <h2 className="mt-1 text-lg font-medium tracking-tight">
              Which slot?
            </h2>
            <p className="mt-1 text-sm text-mute">
              Place this piece like you would in an outfit.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="flex size-10 items-center justify-center rounded-full hover:bg-soft-cloud"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-2 p-5">
          {SLOTS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSlot(option)}
              className={cn(
                "h-11 w-full rounded-full text-sm font-medium",
                slot === option
                  ? "bg-ink text-canvas"
                  : "bg-soft-cloud text-ink",
              )}
            >
              {SLOT_LABELS[option]}
              {suggestedSlot === option ? " · suggested" : ""}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-hairline p-4">
          <button
            type="button"
            disabled={pending}
            onClick={() => void handleAdd(false)}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-ink text-base font-medium text-canvas disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Add to trial room
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void handleAdd(true)}
            className="flex h-12 items-center justify-center rounded-full bg-soft-cloud text-base font-medium text-ink disabled:opacity-50"
          >
            Add & open trial room
          </button>
        </div>
      </div>
    </div>
  );
}
