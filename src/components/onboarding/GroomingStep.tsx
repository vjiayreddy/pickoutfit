"use client";

import { useMutation } from "convex/react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import {
  BEARD_GOAL_LABELS,
  BEARD_GOALS,
  BEARD_NOW,
  BEARD_NOW_LABELS,
  BUDGET_TIERS,
  BUDGET_TIER_LABELS,
  HAIR_GOAL_LABELS,
  HAIR_GOALS,
  HAIR_LENGTH_LABELS,
  HAIR_LENGTHS,
  HAIR_TEXTURE_LABELS,
  HAIR_TEXTURES,
  type BeardGoal,
  type BeardNow,
  type BudgetTier,
  type HairGoal,
  type HairLength,
  type HairTexture,
} from "@convex/shared/services";
import type { GroomingInterest } from "@/components/onboarding/PreferencesStep";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

export type GroomingDraft = {
  hairLength?: HairLength;
  texture?: HairTexture;
  hairGoal?: HairGoal;
  beardNow?: BeardNow;
  beardGoal?: BeardGoal;
  tier: BudgetTier;
  monthlyInr: string;
};

export function GroomingStep({
  interests,
  initial,
  onBack,
}: {
  interests: GroomingInterest[];
  initial: GroomingDraft;
  onBack: (draft: GroomingDraft) => void;
}) {
  const router = useRouter();
  const saveProfiles = useMutation(api.services.saveProfiles);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const monthlyId = useId();
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wantsHair = interests.includes("hairstyle");
  const wantsBeard = interests.includes("beard");

  async function handleFinish() {
    setPending(true);
    setError(null);
    const monthly = draft.monthlyInr.trim();
    const monthlyInr = monthly.length > 0 ? Number(monthly) : undefined;
    if (monthlyInr !== undefined && (!Number.isFinite(monthlyInr) || monthlyInr < 0)) {
      setError("Enter a monthly budget in rupees, or leave it blank.");
      setPending(false);
      return;
    }
    const budget = {
      tier: draft.tier,
      ...(monthlyInr !== undefined ? { monthlyInr: Math.round(monthlyInr) } : {}),
    };
    try {
      await saveProfiles({
        profiles: interests.map((serviceId) => ({
          serviceId,
          budget,
          ...(serviceId === "hairstyle" && draft.hairLength ? { hairLength: draft.hairLength } : {}),
          ...(serviceId === "hairstyle" && draft.texture ? { texture: draft.texture } : {}),
          ...(serviceId === "hairstyle" && draft.hairGoal ? { hairGoal: draft.hairGoal } : {}),
          ...(serviceId === "beard" && draft.beardNow ? { beardNow: draft.beardNow } : {}),
          ...(serviceId === "beard" && draft.beardGoal ? { beardGoal: draft.beardGoal } : {}),
        })),
      });
      await completeOnboarding({});
      toast.success("You're all set. Let's fill that wardrobe.");
      router.replace(routes.wardrobe);
    } catch (caught) {
      setError(reportError(caught).message);
      setPending(false);
    }
  }

  return (
    <div className="space-y-7">
      <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
        {wantsHair ? (
          <>
            <ChipField
              legend="Hair now"
              disabled={pending}
              value={draft.hairLength}
              options={HAIR_LENGTHS.map((value) => ({ value, label: HAIR_LENGTH_LABELS[value] }))}
              onChange={(hairLength) => setDraft({ ...draft, hairLength })}
            />
            <ChipField
              legend="Texture"
              disabled={pending}
              value={draft.texture}
              options={HAIR_TEXTURES.map((value) => ({ value, label: HAIR_TEXTURE_LABELS[value] }))}
              onChange={(texture) => setDraft({ ...draft, texture })}
            />
            <ChipField
              legend="Direction"
              disabled={pending}
              value={draft.hairGoal}
              options={HAIR_GOALS.map((value) => ({ value, label: HAIR_GOAL_LABELS[value] }))}
              onChange={(hairGoal) => setDraft({ ...draft, hairGoal })}
            />
          </>
        ) : null}
        {wantsBeard ? (
          <>
            <ChipField
              legend="Beard now"
              disabled={pending}
              value={draft.beardNow}
              options={BEARD_NOW.map((value) => ({ value, label: BEARD_NOW_LABELS[value] }))}
              onChange={(beardNow) => setDraft({ ...draft, beardNow })}
            />
            <ChipField
              legend="Beard direction"
              disabled={pending}
              value={draft.beardGoal}
              options={BEARD_GOALS.map((value) => ({ value, label: BEARD_GOAL_LABELS[value] }))}
              onChange={(beardGoal) => setDraft({ ...draft, beardGoal })}
            />
          </>
        ) : null}
        <ChipField
          legend="Usual spend"
          disabled={pending}
          value={draft.tier}
          options={BUDGET_TIERS.map((value) => ({ value, label: BUDGET_TIER_LABELS[value] }))}
          onChange={(tier) => setDraft({ ...draft, tier })}
        />
        <div className="space-y-2">
          <label htmlFor={monthlyId} className="text-sm font-medium">
            Rupees per month
          </label>
          <input
            id={monthlyId}
            inputMode="numeric"
            value={draft.monthlyInr}
            onChange={(event) => setDraft({ ...draft, monthlyInr: event.target.value })}
            placeholder="Optional"
            disabled={pending}
            className="h-12 w-full rounded-[24px] border border-hairline bg-soft-cloud px-4 text-base outline-none focus:border-ink focus:bg-canvas"
          />
          <p className="text-sm text-mute">Stored on each service you turned on, not on your account.</p>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-sale" role="alert">
          {error}
        </p>
      ) : null}

      <div className="hidden flex-col-reverse gap-2 border-t border-hairline pt-5 lg:flex lg:flex-row lg:justify-between">
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-mute"
          onClick={() => onBack(draft)}
          disabled={pending}
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
          onClick={() => void handleFinish()}
          disabled={pending}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Finish setup
        </button>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-hairline bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-mute"
          onClick={() => onBack(draft)}
          disabled={pending}
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <button
          type="button"
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
          onClick={() => void handleFinish()}
          disabled={pending}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Finish setup
        </button>
      </div>
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}

function ChipField<T extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  options: readonly { value: T; label: string }[];
  value?: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 rounded-full px-4 text-sm font-medium transition",
              value === option.value ? "bg-ink text-canvas" : "bg-soft-cloud text-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
