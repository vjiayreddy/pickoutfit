"use client";

import { useMutation } from "convex/react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { FITS, type Fit, type Presentation } from "@convex/shared/wardrobe";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";

type Prefs = {
  presentation: Presentation;
  fit: Fit;
  avoidColours: string[];
  homeCity?: string;
};

export function PreferencesStep({
  prefs,
  onBack,
}: {
  prefs: Prefs;
  onBack: (draft: Prefs) => void;
}) {
  const router = useRouter();
  const updatePrefs = useMutation(api.users.updatePrefs);
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const cityId = useId();
  const coloursId = useId();

  const [presentation, setPresentation] = useState<"masculine" | "feminine" | null>(
    prefs.presentation === "neutral" ? null : prefs.presentation,
  );
  const [fit, setFit] = useState<Fit>(prefs.fit);
  const [avoidColours, setAvoidColours] = useState<string[]>(prefs.avoidColours);
  const [colourDraft, setColourDraft] = useState("");
  const [homeCity, setHomeCity] = useState(prefs.homeCity ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addColour() {
    const value = colourDraft.trim().toLowerCase();
    if (!value || avoidColours.includes(value)) {
      setColourDraft("");
      return;
    }
    setAvoidColours((c) => [...c, value]);
    setColourDraft("");
  }

  async function handleFinish() {
    if (!presentation) {
      setError("Choose Men’s wardrobe or Women’s wardrobe to finish setup.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const city = homeCity.trim();
      await updatePrefs({
        prefs: {
          presentation,
          fit,
          avoidColours,
          ...(city ? { homeCity: city } : {}),
        },
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
        <fieldset disabled={pending} className="space-y-3">
          <legend className="text-sm font-medium">Wardrobe</legend>
          <p className="text-sm text-mute">
            Required — shapes examples and styling for you.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "masculine", label: "Men’s wardrobe" },
                { value: "feminine", label: "Women’s wardrobe" },
              ] as const
            ).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPresentation(option.value)}
                className={cn(
                  "h-10 rounded-full px-5 text-sm font-medium transition",
                  presentation === option.value
                    ? "bg-ink text-canvas"
                    : "bg-soft-cloud text-ink",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={pending} className="space-y-3">
          <legend className="text-sm font-medium">Preferred fit</legend>
          <p className="text-sm text-mute">
            Default when there&apos;s a choice between similar pieces.
          </p>
          <div className="flex flex-wrap gap-2">
            {FITS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFit(value)}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-medium capitalize transition",
                  fit === value ? "bg-ink text-canvas" : "bg-soft-cloud text-ink",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor={coloursId} className="text-sm font-medium">
            Colours to avoid
          </label>
          <div className="flex flex-wrap gap-2">
            {avoidColours.map((colour) => (
              <button
                key={colour}
                type="button"
                disabled={pending}
                onClick={() =>
                  setAvoidColours((list) => list.filter((c) => c !== colour))
                }
                className="rounded-full bg-soft-cloud px-3 py-1 text-sm capitalize"
              >
                {colour} ×
              </button>
            ))}
          </div>
          <input
            id={coloursId}
            value={colourDraft}
            onChange={(e) => setColourDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addColour();
              }
            }}
            placeholder="e.g. neon green — press Enter"
            disabled={pending}
            className="h-12 w-full rounded-[24px] border border-hairline bg-soft-cloud px-4 text-base outline-none focus:border-ink focus:bg-canvas"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor={cityId} className="text-sm font-medium">
            Home city
          </label>
          <input
            id={cityId}
            value={homeCity}
            onChange={(e) => setHomeCity(e.target.value)}
            placeholder="London"
            autoComplete="address-level2"
            disabled={pending}
            className="h-12 w-full rounded-[24px] border border-hairline bg-soft-cloud px-4 text-base outline-none focus:border-ink focus:bg-canvas"
          />
          <p className="text-sm text-mute">Optional — for weather-aware styling later.</p>
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
          onClick={() =>
            onBack({
              presentation: presentation ?? "neutral",
              fit,
              avoidColours,
              homeCity: homeCity || undefined,
            })
          }
          disabled={pending}
        >
          <ArrowLeft className="size-4" />
          Back to photos
        </button>
        <button
          type="button"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas transition active:scale-95 active:opacity-50 disabled:opacity-50"
          onClick={handleFinish}
          disabled={pending || !presentation}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Finish setup
        </button>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-hairline bg-canvas p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        <button
          type="button"
          className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-mute"
          onClick={() =>
            onBack({
              presentation: presentation ?? "neutral",
              fit,
              avoidColours,
              homeCity: homeCity || undefined,
            })
          }
          disabled={pending}
        >
          <ArrowLeft className="size-4" />
          Back
        </button>
        <button
          type="button"
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
          onClick={handleFinish}
          disabled={pending || !presentation}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Finish setup
        </button>
      </div>
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}
