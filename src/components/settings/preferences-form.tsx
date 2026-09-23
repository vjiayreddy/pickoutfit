"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { FITS, type Fit, type Presentation } from "@convex/shared/wardrobe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { titleCase } from "@/lib/format";

type Prefs = {
  presentation: Presentation;
  fit: Fit;
  avoidColours: string[];
  homeCity?: string;
};

const MAX_AVOID_COLOURS = 12;

function sameColours(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((colour, index) => colour === b[index]);
}

function isDirty(draft: Prefs, saved: Prefs): boolean {
  return (
    draft.presentation !== saved.presentation ||
    draft.fit !== saved.fit ||
    (draft.homeCity ?? "") !== (saved.homeCity ?? "") ||
    !sameColours(draft.avoidColours, saved.avoidColours)
  );
}

export function PreferencesForm() {
  const me = useQuery(api.users.me);
  if (me === undefined) return <PreferencesSkeleton />;
  if (!me) return null;
  return <PreferencesFields initial={me.prefs} />;
}

function PreferencesFields({ initial }: { initial: Prefs }) {
  const updatePrefs = useMutation(api.users.updatePrefs);
  const [saved, setSaved] = useState<Prefs>(initial);
  const [draft, setDraft] = useState<Prefs>(initial);
  const [colourInput, setColourInput] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = isDirty(draft, saved);

  // Preferences can change elsewhere. Adopt the server's values during render
  // only while the user has nothing unsaved here.
  if (!dirty && isDirty(initial, saved)) {
    setSaved(initial);
    setDraft(initial);
  }

  function addColour() {
    const colour = colourInput.trim().toLowerCase();
    if (!colour) return;
    if (draft.avoidColours.includes(colour)) {
      setColourInput("");
      return;
    }
    if (draft.avoidColours.length >= MAX_AVOID_COLOURS) {
      toast.error(`That is enough colours to avoid — ${MAX_AVOID_COLOURS} is the limit.`);
      return;
    }
    setDraft({ ...draft, avoidColours: [...draft.avoidColours, colour] });
    setColourInput("");
  }

  async function handleSave() {
    setSaving(true);
    const next: Prefs = {
      ...draft,
      homeCity: draft.homeCity?.trim() ? draft.homeCity.trim() : undefined,
    };
    try {
      await updatePrefs({ prefs: next });
      setSaved(next);
      setDraft(next);
      toast.success("Preferences saved.");
    } catch (error) {
      reportError(error, "Could not save your preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      id="preferences"
      className="grid scroll-mt-40 gap-6 border-t border-hairline py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10"
    >
      <header className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.16em] text-mute uppercase">
          02 / Personal style
        </p>
        <h2 className="text-xl font-medium tracking-tight">Your preferences</h2>
        <p className="text-sm leading-relaxed text-mute">
          The stylist and every render read these before suggesting anything.
        </p>
      </header>

      <div className="min-w-0 space-y-6">
        <div className="grid gap-7 sm:grid-cols-2">
          <fieldset disabled={saving} className="space-y-3">
            <legend className="text-sm font-medium">Wardrobe</legend>
            <p className="text-sm text-mute">Shapes examples and styling for you.</p>
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
                  onClick={() => setDraft({ ...draft, presentation: option.value })}
                  className={cn(
                    "h-10 rounded-full px-5 text-sm font-medium transition",
                    draft.presentation === option.value
                      ? "bg-ink text-canvas"
                      : "bg-soft-cloud text-ink",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={saving} className="space-y-3">
            <legend className="text-sm font-medium">Preferred fit</legend>
            <p className="text-sm text-mute">
              Used when an item could be worn more than one way.
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Preferred fit">
              {FITS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDraft({ ...draft, fit: option })}
                  className={cn(
                    "h-10 rounded-full px-4 text-sm font-medium capitalize transition",
                    draft.fit === option ? "bg-ink text-canvas" : "bg-soft-cloud text-ink",
                  )}
                >
                  {titleCase(option)}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="avoid-colour" className="text-sm font-medium">
              Colours to avoid
            </label>
            <p className="text-sm text-mute">Outfit suggestions will steer around these.</p>
            <div className="flex gap-2">
              <Input
                id="avoid-colour"
                value={colourInput}
                placeholder="mustard"
                autoComplete="off"
                disabled={saving}
                onChange={(event) => setColourInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addColour();
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={addColour}
                disabled={saving || !colourInput.trim()}
              >
                <Plus aria-hidden />
                Add
              </Button>
            </div>
            {draft.avoidColours.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {draft.avoidColours.map((colour) => (
                  <li key={colour}>
                    <button
                      type="button"
                      aria-label={`Stop avoiding ${colour}`}
                      disabled={saving}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          avoidColours: draft.avoidColours.filter((entry) => entry !== colour),
                        })
                      }
                      className="inline-flex h-8 max-w-full items-center gap-1 rounded-full bg-soft-cloud px-3 text-sm capitalize disabled:opacity-50"
                    >
                      <span className="min-w-0 truncate">{colour}</span>
                      <X className="size-3 shrink-0" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-mute">
                Nothing ruled out — every colour in your wardrobe is fair game.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="home-city" className="text-sm font-medium">
              Home city
            </label>
            <p className="text-sm text-mute">Optional location for your styling preferences.</p>
            <Input
              id="home-city"
              value={draft.homeCity ?? ""}
              placeholder="London"
              autoComplete="address-level2"
              disabled={saving}
              onChange={(event) => setDraft({ ...draft, homeCity: event.target.value })}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-hairline pt-4">
          <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
            Discard
          </Button>
          <Button disabled={!dirty || saving} onClick={() => void handleSave()}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Save changes
          </Button>
        </div>
      </div>
    </section>
  );
}

function PreferencesSkeleton() {
  return (
    <section
      className="space-y-6 border-t border-hairline py-8"
      aria-busy="true"
      aria-label="Loading preferences"
    >
      <header className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
      </header>
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-full max-w-sm rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
