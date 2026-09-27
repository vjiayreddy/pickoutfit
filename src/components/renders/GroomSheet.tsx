"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  hairStylesFor,
  validateGroomingSelection,
  type BeardStyle,
  type HairStyle,
} from "@convex/shared/grooming";
import type { Presentation } from "@convex/shared/wardrobe";
import { CreditQuote, useCreditQuote } from "@/components/common/CreditQuote";
import { GroomingPicker } from "@/components/renders/GroomingPicker";
import { reportError } from "@/lib/client-errors";

type GroomSheetProps = {
  renderId: Id<"renders">;
  quality: "standard" | "hq";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted?: (jobId: Id<"jobs">) => void;
};

export function GroomSheet({
  renderId,
  quality,
  open,
  onOpenChange,
  onStarted,
}: GroomSheetProps) {
  const me = useQuery(api.users.me, open ? {} : "skip");
  const groom = useMutation(api.renders.groom);

  const [hair, setHair] = useState<HairStyle>("fade");
  const [beard, setBeard] = useState<BeardStyle>("stubble");
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState(false);

  const quote = useCreditQuote(open ? { kind: "groom", quality } : null);

  if (!open) return null;

  const presentation: Presentation = me?.prefs.presentation ?? "neutral";
  const styles = hairStylesFor(presentation);
  const hairValue = styles.includes(hair) ? hair : (styles.find((style) => style !== "keep") ?? "keep");
  const beardValue: BeardStyle = presentation === "masculine" ? beard : "keep";
  const selectionError = validateGroomingSelection(
    { hair: hairValue, beard: beardValue, custom: custom.trim() || undefined },
    presentation,
  );
  const canStart = !pending && !selectionError && (quote?.canAfford ?? false) && me !== undefined;

  async function handleStart() {
    if (!canStart) return;
    setPending(true);
    try {
      const result = await groom({
        renderId,
        hair: hairValue,
        beard: beardValue,
        custom: custom.trim() || undefined,
      });
      toast.success("Styling your look. Watch progress in Activity.");
      onOpenChange(false);
      onStarted?.(result.jobId);
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
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col bg-canvas pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="flex items-start justify-between border-b border-hairline p-6">
          <div>
            <p className="text-[10px] font-medium tracking-[0.16em] text-mute uppercase">
              Grooming
            </p>
            <h2 className="mt-1 font-display text-3xl uppercase tracking-tight">
              Hair & beard.
            </h2>
            <p className="mt-1 text-sm text-mute">
              Restyle this look. Your original try-on stays.
            </p>
          </div>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-full hover:bg-soft-cloud"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-7 overflow-y-auto p-6">
          <GroomingPicker
            presentation={presentation}
            mode="both"
            hair={hairValue}
            beard={beardValue}
            custom={custom}
            onHair={setHair}
            onBeard={setBeard}
            onCustom={setCustom}
            disabled={pending}
          />
          {selectionError ? <p className="text-sm text-mute">{selectionError}</p> : null}
          <CreditQuote quote={quote} label="styled look" />
        </div>

        <div className="border-t border-hairline p-4">
          <button
            type="button"
            disabled={!canStart}
            onClick={() => void handleStart()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-medium text-canvas disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Style this look
          </button>
        </div>
      </div>
    </div>
  );
}
