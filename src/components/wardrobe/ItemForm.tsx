"use client";

import { useMutation } from "convex/react";
import { Loader2, Save } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FITS,
  FORMALITY,
  FORMALITY_LABELS,
  SEASONS,
  type Category,
  type Fit,
  type Formality,
  type Season,
} from "@convex/shared/wardrobe";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";

type Item = FunctionReturnType<typeof api.items.get> extends infer R
  ? R extends { item: infer I }
    ? I
    : never
  : never;

type Draft = {
  name: string;
  category: Category;
  subcategory: string;
  primary: string;
  secondary: string;
  pattern: string;
  material: string;
  season: Season[];
  formality: Formality;
  fit: Fit | "";
  brand: string;
  notes: string;
};

function draftOf(item: Item): Draft {
  return {
    name: item.name,
    category: item.category,
    subcategory: item.subcategory,
    primary: item.colours.primary,
    secondary: item.colours.secondary.join(", "),
    pattern: item.pattern,
    material: item.material,
    season: [...item.season],
    formality: item.formality,
    fit: item.fit ?? "",
    brand: item.brand ?? "",
    notes: item.notes ?? "",
  };
}

export function ItemForm({ item }: { item: Item }) {
  const update = useMutation(api.items.update);
  const [draft, setDraft] = useState(() => draftOf(item));
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      const secondary = draft.secondary
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await update({
        itemId: item._id,
        patch: {
          name: draft.name.trim(),
          category: draft.category,
          subcategory: draft.subcategory.trim(),
          colours: {
            primary: draft.primary.trim(),
            secondary,
            hex: item.colours.hex,
          },
          pattern: draft.pattern.trim(),
          material: draft.material.trim(),
          season: draft.season,
          formality: draft.formality,
          ...(draft.fit ? { fit: draft.fit } : {}),
          brand: draft.brand.trim() || undefined,
          notes: draft.notes.trim() || undefined,
        },
      });
      toast.success("Saved.");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  function toggleSeason(season: Season) {
    setDraft((d) => ({
      ...d,
      season: d.season.includes(season)
        ? d.season.filter((s) => s !== season)
        : [...d.season, season],
    }));
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 className="text-sm font-medium">Edit attributes</h2>
      <Field label="Name">
        <input
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          className={inputClass}
          required
        />
      </Field>
      <Field label="Category">
        <select
          value={draft.category}
          onChange={(e) =>
            setDraft((d) => ({ ...d, category: e.target.value as Category }))
          }
          className={inputClass}
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Subcategory">
        <input
          value={draft.subcategory}
          onChange={(e) =>
            setDraft((d) => ({ ...d, subcategory: e.target.value }))
          }
          className={inputClass}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Primary colour">
          <input
            value={draft.primary}
            onChange={(e) =>
              setDraft((d) => ({ ...d, primary: e.target.value }))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Secondary colours">
          <input
            value={draft.secondary}
            onChange={(e) =>
              setDraft((d) => ({ ...d, secondary: e.target.value }))
            }
            placeholder="comma separated"
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Pattern">
          <input
            value={draft.pattern}
            onChange={(e) =>
              setDraft((d) => ({ ...d, pattern: e.target.value }))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Material">
          <input
            value={draft.material}
            onChange={(e) =>
              setDraft((d) => ({ ...d, material: e.target.value }))
            }
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Season">
        <div className="flex flex-wrap gap-2">
          {SEASONS.map((season) => (
            <button
              key={season}
              type="button"
              onClick={() => toggleSeason(season)}
              className={cn(
                "h-9 rounded-full px-3 text-sm capitalize",
                draft.season.includes(season)
                  ? "bg-ink text-canvas"
                  : "bg-soft-cloud text-ink",
              )}
            >
              {season}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Formality">
        <div className="flex flex-wrap gap-2">
          {FORMALITY.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, formality: value }))}
              className={cn(
                "h-9 rounded-full px-3 text-sm",
                draft.formality === value
                  ? "bg-ink text-canvas"
                  : "bg-soft-cloud text-ink",
              )}
            >
              {FORMALITY_LABELS[value]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Fit">
        <div className="flex flex-wrap gap-2">
          {FITS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setDraft((d) => ({ ...d, fit: value }))}
              className={cn(
                "h-9 rounded-full px-3 text-sm capitalize",
                draft.fit === value
                  ? "bg-ink text-canvas"
                  : "bg-soft-cloud text-ink",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Brand">
        <input
          value={draft.brand}
          onChange={(e) => setDraft((d) => ({ ...d, brand: e.target.value }))}
          className={inputClass}
        />
      </Field>
      <Field label="Notes">
        <textarea
          value={draft.notes}
          onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
          rows={3}
          className={cn(inputClass, "h-auto rounded-[18px] py-3")}
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        Save changes
      </button>
    </form>
  );
}

const inputClass =
  "h-12 w-full rounded-[24px] border border-hairline bg-soft-cloud px-4 text-base outline-none focus:border-ink focus:bg-canvas";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
