"use client";

import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { CATEGORY_LABELS } from "@convex/shared/wardrobe";
import { CreditQuote, useCreditQuote } from "@/components/common/CreditQuote";
import { reportError, toClientError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";

type UploadView = FunctionReturnType<typeof api.uploads.listBatch>[number]["upload"];

export function ImportReview({ upload }: { upload: UploadView }) {
  const candidates = upload.candidates ?? [];
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [pending, setPending] = useState<"import" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirmSelection = useMutation(api.uploads.confirmSelection);
  const remove = useMutation(api.uploads.remove);
  const quote = useCreditQuote(
    selected.size ? { kind: "extract", items: selected.size } : null,
  );

  function toggle(index: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function importSelected() {
    if (pending || selected.size === 0) return;
    setPending("import");
    setError(null);
    try {
      await confirmSelection({
        uploadId: upload._id,
        indices: [...selected].sort((a, b) => a - b),
      });
      toast.success(`Selection confirmed for ${pluralize(selected.size, "piece")}.`);
    } catch (caught) {
      setError(reportError(caught, "Could not confirm these pieces.").message);
    } finally {
      setPending(null);
    }
  }

  async function discardPhoto() {
    if (pending) return;
    setPending("discard");
    setError(null);
    try {
      await remove({ uploadId: upload._id });
      toast.success("Photo discarded.");
    } catch (caught) {
      setError(toClientError(caught).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="space-y-4" aria-label={`Choose items from ${upload.fileName}`}>
      <div className="space-y-1">
        <h3 className="text-xl font-medium tracking-tight">Which pieces are yours?</h3>
        <p className="text-sm leading-relaxed text-mute">
          We found {pluralize(candidates.length, "piece")}. Choose pieces from the list.
        </p>
      </div>

      <fieldset
        disabled={pending !== null}
        className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
      >
        <div className="flex min-w-0 items-start justify-center bg-soft-cloud p-3">
          {upload.url ? (
            <div className="relative w-fit max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={upload.url}
                alt={`Original photo: ${upload.fileName}`}
                className="block max-h-[min(30dvh,14rem)] max-w-full lg:max-h-96"
              />
              {candidates.map((item, index) => {
                const [x0, y0, x1, y1] = item.bbox;
                if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0)
                  return null;
                return (
                  <div
                    key={index}
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute border-2 text-left transition-colors",
                      selected.has(index)
                        ? "border-canvas bg-ink/15"
                        : "border-canvas/60",
                    )}
                    style={{
                      left: `${x0 * 100}%`,
                      top: `${y0 * 100}%`,
                      width: `${(x1 - x0) * 100}%`,
                      height: `${(y1 - y0) * 100}%`,
                    }}
                  >
                    <span className="absolute top-0 left-0 bg-ink px-1 text-[10px] text-canvas">
                      {index + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-mute">Photo unavailable</p>
          )}
        </div>

        <ul className="space-y-2">
          {candidates.map((item, index) => (
            <li key={index}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 border border-hairline p-3 transition",
                  selected.has(index) && "border-ink bg-soft-cloud",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-ink"
                  checked={selected.has(index)}
                  onChange={() => toggle(index)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-mute">
                    {CATEGORY_LABELS[item.category]}
                    {item.colours.primary ? ` · ${item.colours.primary}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <CreditQuote quote={quote} label={pluralize(selected.size || 0, "cutout")} />

      {error ? (
        <p className="text-sm text-sale" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending !== null || selected.size === 0 || quote?.canAfford === false}
          onClick={() => void importSelected()}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-sm font-medium text-canvas disabled:opacity-50"
        >
          {pending === "import" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          Import selected
        </button>
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => {
            if (confirm("Discard this photo?")) void discardPhoto();
          }}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-soft-cloud px-6 text-sm font-medium text-ink disabled:opacity-50"
        >
          {pending === "discard" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
          Discard photo
        </button>
      </div>
    </section>
  );
}

/** Tiny helper so UploadTile can subscribe to items for one upload. */
export function useUploadItems(uploadId: UploadView["_id"]) {
  return useQuery(api.items.listByUpload, { uploadId });
}
