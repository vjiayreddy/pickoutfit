"use client";

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Id } from "@convex/_generated/dataModel";
import { ErrorAlert } from "@/components/common/ErrorAlert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi } from "@/lib/admin-api";
import { toClientError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatCredits } from "@/lib/format";

type Bucket = "plan" | "pack";

const BUCKETS = ["plan", "pack"] as const satisfies readonly Bucket[];
const BUCKET_LABELS: Record<Bucket, string> = {
  plan: "Plan credits",
  pack: "Non-expiring credits",
};

export function AdjustCreditsForm() {
  const adjustCredits = useMutation(adminApi.adjustCredits);
  const [userId, setUserId] = useState("");
  const [delta, setDelta] = useState("");
  const [bucket, setBucket] = useState<Bucket>("pack");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedDelta = Number.parseInt(delta, 10);
  const deltaValid = Number.isInteger(parsedDelta) && parsedDelta !== 0;
  const canSubmit = userId.trim().length > 0 && deltaValid && note.trim().length > 0 && !pending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      await adjustCredits({
        userId: userId.trim() as Id<"users">,
        delta: parsedDelta,
        bucket,
        note: note.trim(),
      });
      toast.success(`Adjusted by ${formatCredits(parsedDelta, { signed: true })}.`);
      setUserId("");
      setDelta("");
      setNote("");
    } catch (caught) {
      setError(toClientError(caught).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border border-hairline">
      <header className="space-y-1 border-b border-hairline px-4 py-4">
        <h2 className="text-base font-medium">Adjust credits</h2>
        <p className="text-sm text-mute">
          Support-only manual correction. Writes one admin ledger line; negative values take
          credits away.
        </p>
      </header>

      <div className="space-y-4 p-4">
        {error ? (
          <ErrorAlert
            title="The adjustment did not go through"
            message={error}
            onRetry={() => void handleSubmit()}
          />
        ) : null}

        <div className="space-y-2">
          <label htmlFor="adjust-user" className="text-sm font-medium">
            User id
          </label>
          <p className="text-sm text-mute">The Convex users document id, not the auth id.</p>
          <Input
            id="adjust-user"
            value={userId}
            placeholder="j57..."
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            onChange={(event) => setUserId(event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="adjust-delta" className="text-sm font-medium">
              Change
            </label>
            <p className="text-sm text-mute">Whole credits, e.g. 25 or -10.</p>
            <Input
              id="adjust-delta"
              value={delta}
              inputMode="numeric"
              placeholder="25"
              className="tabular-nums"
              aria-invalid={delta.length > 0 && !deltaValid}
              onChange={(event) => setDelta(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Bucket</span>
            <p className="text-sm text-mute">
              Non-expiring credits stay available; plan credits reset next cycle.
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Credit bucket">
              {BUCKETS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setBucket(option)}
                  className={cn(
                    "h-10 rounded-full px-4 text-sm font-medium transition",
                    bucket === option ? "bg-ink text-canvas" : "bg-soft-cloud text-ink",
                  )}
                >
                  {BUCKET_LABELS[option]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="adjust-note" className="text-sm font-medium">
            Note
          </label>
          <p className="text-sm text-mute">Shown to the user on their ledger. Required.</p>
          <Input
            id="adjust-note"
            value={note}
            placeholder="Goodwill credit for the failed batch on 14 Sep"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end border-t border-hairline px-4 py-4">
        <Button disabled={!canSubmit} onClick={() => void handleSubmit()}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Apply adjustment
        </Button>
      </div>
    </section>
  );
}
