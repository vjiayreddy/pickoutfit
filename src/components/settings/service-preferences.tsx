"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
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
  optionalServicesFor,
  type BeardGoal,
  type BeardNow,
  type BudgetTier,
  type HairGoal,
  type HairLength,
  type HairTexture,
} from "@convex/shared/services";
import type { Presentation } from "@convex/shared/wardrobe";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";

type Interest = "hairstyle" | "beard";

type Draft = {
  interests: Interest[];
  hairLength?: HairLength;
  texture?: HairTexture;
  hairGoal?: HairGoal;
  beardNow?: BeardNow;
  beardGoal?: BeardGoal;
  budgets: Record<Interest, { tier: BudgetTier; monthlyInr: string }>;
};

export function ServicePreferences() {
  const me = useQuery(api.users.me);
  const profiles = useQuery(api.services.listProfiles);
  if (me === undefined || profiles === undefined) return null;
  if (!me) return null;
  return (
    <ServiceFields
      key={me.prefs.presentation}
      presentation={me.prefs.presentation}
      initial={draftFromProfiles(profiles, me.prefs.presentation)}
    />
  );
}

function draftFromProfiles(
  profiles: ReadonlyArray<{
    serviceId: string;
    budget: { tier: BudgetTier; monthlyInr?: number };
    hairLength?: HairLength;
    texture?: HairTexture;
    hairGoal?: HairGoal;
    beardNow?: BeardNow;
    beardGoal?: BeardGoal;
  }>,
  presentation: Presentation,
): Draft {
  const available = new Set(optionalServicesFor(presentation).map((service) => service.id));
  const interests = profiles
    .map((row) => row.serviceId)
    .filter((id): id is Interest => (id === "hairstyle" || id === "beard") && available.has(id));
  const hair = profiles.find((row) => row.serviceId === "hairstyle");
  const beard = profiles.find((row) => row.serviceId === "beard");
  const budgetFor = (id: Interest) => {
    const row = profiles.find((profile) => profile.serviceId === id);
    return {
      tier: row?.budget.tier ?? "mid",
      monthlyInr: row?.budget.monthlyInr !== undefined ? String(row.budget.monthlyInr) : "",
    };
  };
  return {
    interests,
    hairLength: hair?.hairLength,
    texture: hair?.texture,
    hairGoal: hair?.hairGoal,
    beardNow: beard?.beardNow,
    beardGoal: beard?.beardGoal,
    budgets: { hairstyle: budgetFor("hairstyle"), beard: budgetFor("beard") },
  };
}

function ServiceFields({ presentation, initial }: { presentation: Presentation; initial: Draft }) {
  const saveProfiles = useMutation(api.services.saveProfiles);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const options = optionalServicesFor(presentation);

  function toggle(id: Interest) {
    setDraft({
      ...draft,
      interests: draft.interests.includes(id)
        ? draft.interests.filter((entry) => entry !== id)
        : [...draft.interests, id],
    });
  }

  async function handleSave() {
    const profiles = [];
    for (const serviceId of draft.interests) {
      const monthly = draft.budgets[serviceId].monthlyInr.trim();
      const monthlyInr = monthly.length > 0 ? Number(monthly) : undefined;
      if (monthlyInr !== undefined && (!Number.isFinite(monthlyInr) || monthlyInr < 0)) {
        toast.error("Enter a monthly budget in rupees, or leave it blank.");
        return;
      }
      profiles.push({
        serviceId,
        budget: {
          tier: draft.budgets[serviceId].tier,
          ...(monthlyInr !== undefined ? { monthlyInr: Math.round(monthlyInr) } : {}),
        },
        ...(serviceId === "hairstyle" && draft.hairLength ? { hairLength: draft.hairLength } : {}),
        ...(serviceId === "hairstyle" && draft.texture ? { texture: draft.texture } : {}),
        ...(serviceId === "hairstyle" && draft.hairGoal ? { hairGoal: draft.hairGoal } : {}),
        ...(serviceId === "beard" && draft.beardNow ? { beardNow: draft.beardNow } : {}),
        ...(serviceId === "beard" && draft.beardGoal ? { beardGoal: draft.beardGoal } : {}),
      });
    }
    setSaving(true);
    try {
      await saveProfiles({ profiles });
      toast.success("Services saved.");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 border-t border-hairline pt-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Services</h3>
        <p className="text-sm text-mute">
          Turn hairstyle or beard on here if you skipped them during setup.
        </p>
        <div className="flex flex-wrap gap-2">
          {options.map((service) => {
            const id = service.id as Interest;
            const on = draft.interests.includes(id);
            return (
              <button
                key={service.id}
                type="button"
                aria-pressed={on}
                disabled={saving}
                onClick={() => toggle(id)}
                className={cn(
                  "h-10 rounded-full px-4 text-sm font-medium",
                  on ? "bg-ink text-canvas" : "bg-soft-cloud text-ink",
                )}
              >
                {service.label}
              </button>
            );
          })}
        </div>
      </div>

      {draft.interests.includes("hairstyle") ? (
        <QuestionBlock title="Hairstyle">
          <Choice
            label="Hair now"
            value={draft.hairLength}
            options={HAIR_LENGTHS.map((value) => ({ value, label: HAIR_LENGTH_LABELS[value] }))}
            onChange={(hairLength) => setDraft({ ...draft, hairLength })}
            disabled={saving}
          />
          <Choice
            label="Texture"
            value={draft.texture}
            options={HAIR_TEXTURES.map((value) => ({ value, label: HAIR_TEXTURE_LABELS[value] }))}
            onChange={(texture) => setDraft({ ...draft, texture })}
            disabled={saving}
          />
          <Choice
            label="Direction"
            value={draft.hairGoal}
            options={HAIR_GOALS.map((value) => ({ value, label: HAIR_GOAL_LABELS[value] }))}
            onChange={(hairGoal) => setDraft({ ...draft, hairGoal })}
            disabled={saving}
          />
          <Spend
            budget={draft.budgets.hairstyle}
            disabled={saving}
            onChange={(budget) =>
              setDraft({ ...draft, budgets: { ...draft.budgets, hairstyle: budget } })
            }
          />
        </QuestionBlock>
      ) : null}

      {draft.interests.includes("beard") ? (
        <QuestionBlock title="Beard">
          <Choice
            label="Beard now"
            value={draft.beardNow}
            options={BEARD_NOW.map((value) => ({ value, label: BEARD_NOW_LABELS[value] }))}
            onChange={(beardNow) => setDraft({ ...draft, beardNow })}
            disabled={saving}
          />
          <Choice
            label="Direction"
            value={draft.beardGoal}
            options={BEARD_GOALS.map((value) => ({ value, label: BEARD_GOAL_LABELS[value] }))}
            onChange={(beardGoal) => setDraft({ ...draft, beardGoal })}
            disabled={saving}
          />
          <Spend
            budget={draft.budgets.beard}
            disabled={saving}
            onChange={(budget) =>
              setDraft({ ...draft, budgets: { ...draft.budgets, beard: budget } })
            }
          />
        </QuestionBlock>
      ) : null}

      <div className="flex justify-end">
        <Button disabled={saving} onClick={() => void handleSave()}>
          {saving ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Save services
        </Button>
      </div>
    </div>
  );
}

function QuestionBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value?: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 rounded-full px-4 text-sm font-medium",
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

function Spend({
  budget,
  onChange,
  disabled,
}: {
  budget: { tier: BudgetTier; monthlyInr: string };
  onChange: (budget: { tier: BudgetTier; monthlyInr: string }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <Choice
        label="Usual spend"
        value={budget.tier}
        options={BUDGET_TIERS.map((value) => ({ value, label: BUDGET_TIER_LABELS[value] }))}
        onChange={(tier) => onChange({ ...budget, tier })}
        disabled={disabled}
      />
      <label className="block space-y-2 text-sm font-medium">
        Rupees per month
        <Input
          inputMode="numeric"
          value={budget.monthlyInr}
          placeholder="Optional"
          disabled={disabled}
          onChange={(event) => onChange({ ...budget, monthlyInr: event.target.value })}
        />
      </label>
    </div>
  );
}
