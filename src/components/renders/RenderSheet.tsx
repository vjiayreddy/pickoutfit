"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  LIMITS,
  type RenderQuality,
} from "@convex/shared/credits";
import { CreditQuote, useCreditQuote } from "@/components/common/CreditQuote";
import { ItemImage } from "@/components/common/ItemImage";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { routes } from "@/lib/routes";

type RenderSheetProps = {
  outfitId: Id<"outfits">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted?: (jobId: Id<"jobs">) => void;
};

const COUNTS = Array.from(
  { length: LIMITS.maxRendersPerRequest },
  (_, index) => index + 1,
);

export function RenderSheet({
  outfitId,
  open,
  onOpenChange,
  onStarted,
}: RenderSheetProps) {
  const avatars = useQuery(api.avatars.list, open ? {} : "skip");
  const me = useQuery(api.users.me, open ? {} : "skip");
  const start = useMutation(api.renders.start);

  const hqUnlocked = Boolean(me?.balance.features.includes("hq_renders"));
  const [chosenAvatarId, setChosenAvatarId] = useState<Id<"avatars"> | null>(
    null,
  );
  const [count, setCount] = useState(1);
  const [quality, setQuality] = useState<RenderQuality>("standard");
  const [pending, setPending] = useState(false);

  const defaultAvatarId =
    (avatars?.find((a) => a.isDefault) ?? avatars?.[0])?._id ?? null;
  const avatarId = chosenAvatarId ?? defaultAvatarId;
  const effectiveQuality: RenderQuality = hqUnlocked ? quality : "standard";
  const quote = useCreditQuote(
    open
      ? { kind: "render", quality: effectiveQuality, count, outfits: 1 }
      : null,
  );

  if (!open) return null;

  async function handleStart() {
    if (!avatarId || pending) return;
    setPending(true);
    try {
      const result = await start({
        outfitIds: [outfitId],
        avatarId,
        count,
        quality: effectiveQuality,
      });
      toast.success(
        `Creating ${pluralize(count, "try-on")}. Watch progress in Activity.`,
      );
      onOpenChange(false);
      onStarted?.(result.jobId);
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  const noAvatars = avatars !== undefined && avatars.length === 0;
  const canStart =
    Boolean(avatarId) && !pending && !noAvatars && (quote?.canAfford ?? false);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col bg-canvas">
        <div className="flex items-start justify-between border-b border-hairline p-6">
          <div>
            <p className="text-[10px] font-medium tracking-[0.16em] text-mute uppercase">
              Fitting room
            </p>
            <h2 className="mt-1 font-display text-3xl uppercase tracking-tight">
              See it on you.
            </h2>
            <p className="mt-1 text-sm text-mute">
              Your outfit, fitted to your reference photo.
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
          {noAvatars ? (
            <div className="space-y-3 py-4 text-sm">
              <p className="font-medium">No photo of you yet</p>
              <p className="text-mute">
                Finish onboarding or add an avatar photo first.
              </p>
              <a href={routes.onboarding} className="underline">
                Go to setup
              </a>
            </div>
          ) : (
            <fieldset disabled={pending} className="space-y-3">
              <legend className="text-[10px] font-medium tracking-wide text-mute uppercase">
                Your reference
              </legend>
              <div className="flex flex-wrap gap-4">
                {avatars === undefined
                  ? Array.from({ length: 2 }, (_, i) => (
                      <div
                        key={i}
                        className="h-36 w-24 animate-pulse bg-soft-cloud"
                      />
                    ))
                  : avatars.map((avatar) => {
                      const selected = avatar._id === avatarId;
                      return (
                        <button
                          key={avatar._id}
                          type="button"
                          onClick={() => setChosenAvatarId(avatar._id)}
                          aria-pressed={selected}
                          className={cn(
                            "relative p-0.5",
                            selected ? "ring-2 ring-ink" : "ring-1 ring-transparent",
                          )}
                        >
                          <ItemImage
                            src={avatar.url}
                            alt={avatar.label}
                            className="h-36 w-24"
                            aspect="aspect-[2/3]"
                          />
                          {selected ? (
                            <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-ink text-canvas">
                              <Check className="size-3" />
                            </span>
                          ) : null}
                          <span className="mt-2 block max-w-24 truncate text-left text-xs">
                            {avatar.label}
                          </span>
                        </button>
                      );
                    })}
              </div>
            </fieldset>
          )}

          <fieldset disabled={pending} className="space-y-3">
            <legend className="text-[10px] font-medium tracking-wide text-mute uppercase">
              Number of images
            </legend>
            <div className="flex flex-wrap gap-2">
              {COUNTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCount(option)}
                  className={cn(
                    "h-11 min-w-12 rounded-full px-4 text-sm font-medium tabular-nums",
                    count === option
                      ? "bg-ink text-canvas"
                      : "border border-hairline bg-canvas text-ink",
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={pending} className="space-y-3">
            <legend className="text-[10px] font-medium tracking-wide text-mute uppercase">
              Quality
            </legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setQuality("standard")}
                className={cn(
                  "h-11 rounded-full px-5 text-sm font-medium",
                  effectiveQuality === "standard"
                    ? "bg-ink text-canvas"
                    : "border border-hairline",
                )}
              >
                Standard · 1 credit
              </button>
              <button
                type="button"
                disabled={!hqUnlocked}
                onClick={() => hqUnlocked && setQuality("hq")}
                className={cn(
                  "h-11 rounded-full px-5 text-sm font-medium disabled:opacity-40",
                  effectiveQuality === "hq"
                    ? "bg-ink text-canvas"
                    : "border border-hairline",
                )}
              >
                HQ · 3 credits{hqUnlocked ? "" : " (Plus)"}
              </button>
            </div>
            {!hqUnlocked ? (
              <p className="text-xs text-mute">
                HQ renders unlock on the Plus plan.{" "}
                <Link
                  href={routes.billing}
                  className="font-medium text-ink underline underline-offset-4"
                >
                  Upgrade in Billing
                </Link>
              </p>
            ) : null}
          </fieldset>

          <CreditQuote
            quote={quote}
            label={pluralize(count, "try-on image")}
          />
        </div>

        <div className="border-t border-hairline p-4">
          <button
            type="button"
            disabled={!canStart}
            onClick={() => void handleStart()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-base font-medium text-canvas disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Start try-on
          </button>
        </div>
      </div>
    </div>
  );
}
