"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { PlanId } from "@convex/shared/credits";
import { AvatarStep } from "@/components/onboarding/AvatarStep";
import { PreferencesStep } from "@/components/onboarding/PreferencesStep";
import { cn } from "@/lib/cn";

const STEPS = [
  {
    title: "Your fitting photo.",
    description:
      "Start with a full-length photo. This is who your outfits will be rendered on.",
  },
  {
    title: "Set your style.",
    description:
      "Choose your wardrobe and fit. We’ll tailor your examples and styling to you.",
  },
] as const;

export function OnboardingFlow() {
  const me = useQuery(api.users.me);
  const [step, setStep] = useState<0 | 1>(0);
  const [prefsDraft, setPrefsDraft] = useState<
    NonNullable<typeof me>["prefs"] | null
  >(null);

  if (me === undefined || me === null) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 animate-pulse bg-soft-cloud" />
        <div className="h-64 animate-pulse bg-soft-cloud" />
      </div>
    );
  }

  const current = STEPS[step];
  const plan = me.balance.plan as PlanId;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col space-y-6">
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-mute sm:text-sm">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="font-display text-3xl font-medium uppercase leading-[0.9] tracking-tight sm:text-5xl">
          {current.title}
        </h1>
        <p className="max-w-xl text-sm text-mute sm:text-base">{current.description}</p>
        <div className="flex gap-2 pt-2" aria-hidden>
          {STEPS.map((entry, index) => (
            <span
              key={entry.title}
              className={cn("h-1 flex-1", index <= step ? "bg-ink" : "bg-hairline")}
            />
          ))}
        </div>
        <ol className="sr-only">
          {STEPS.map((entry, index) => (
            <li key={entry.title} aria-current={index === step ? "step" : undefined}>
              {entry.title}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 ? (
        <AvatarStep plan={plan} onContinue={() => setStep(1)} />
      ) : (
        <PreferencesStep
          prefs={prefsDraft ?? me.prefs}
          onBack={(draft) => {
            setPrefsDraft(draft);
            setStep(0);
          }}
        />
      )}
    </div>
  );
}
