"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { PlanId } from "@convex/shared/credits";
import { AvatarStep } from "@/components/onboarding/AvatarStep";
import { GroomingStep, type GroomingDraft } from "@/components/onboarding/GroomingStep";
import {
  PreferencesStep,
  type GroomingInterest,
  type OnboardingPrefs,
} from "@/components/onboarding/PreferencesStep";
import { cn } from "@/lib/cn";

const PHOTO = {
  title: "Your fitting photo.",
  description: "Start with a full-length photo. This is who your outfits will be rendered on.",
};
const STYLE = {
  title: "Set your style.",
  description: "Choose your wardrobe and fit. Tell us if hair or a beard should be part of it.",
};
const GROOMING = {
  title: "Hair and beard.",
  description: "A few answers so the presets and product links start in the right place.",
};

export function OnboardingFlow() {
  const me = useQuery(api.users.me);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [prefsDraft, setPrefsDraft] = useState<OnboardingPrefs | null>(null);
  const [interests, setInterests] = useState<GroomingInterest[]>([]);
  const [groomingDraft, setGroomingDraft] = useState<GroomingDraft>({
    tier: "mid",
    monthlyInr: "",
  });

  if (me === undefined || me === null) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse bg-soft-cloud" />
        <div className="h-64 animate-pulse bg-soft-cloud" />
      </div>
    );
  }

  const showGrooming = interests.length > 0;
  const steps = showGrooming ? [PHOTO, STYLE, GROOMING] : [PHOTO, STYLE];
  const current = steps[step] ?? STYLE;
  const plan = me.balance.plan as PlanId;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col space-y-6">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          Step {step + 1} of {steps.length}
        </p>
        <h1 className="font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl">
          {current.title}
        </h1>
        <p className="max-w-xl text-sm text-mute sm:text-base">{current.description}</p>
        <div className="flex gap-2 pt-2" aria-hidden>
          {steps.map((entry, index) => (
            <span
              key={entry.title}
              className={cn("h-1 flex-1", index <= step ? "bg-ink" : "bg-hairline")}
            />
          ))}
        </div>
        <ol className="sr-only">
          {steps.map((entry, index) => (
            <li key={entry.title} aria-current={index === step ? "step" : undefined}>
              {entry.title}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 ? (
        <AvatarStep plan={plan} onContinue={() => setStep(1)} />
      ) : step === 1 ? (
        <PreferencesStep
          prefs={prefsDraft ?? me.prefs}
          interests={interests}
          onInterests={setInterests}
          onBack={(draft) => {
            setPrefsDraft(draft);
            setStep(0);
          }}
          onContinue={(draft) => {
            setPrefsDraft(draft);
            setStep(2);
          }}
        />
      ) : (
        <GroomingStep
          interests={interests}
          initial={groomingDraft}
          onBack={(draft) => {
            setGroomingDraft(draft);
            setStep(1);
          }}
        />
      )}
    </div>
  );
}
