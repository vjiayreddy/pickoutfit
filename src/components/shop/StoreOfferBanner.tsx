"use client";

import { useEffect, useState } from "react";

export type StoreOffer = {
  name: string;
  badge: string | null;
  kind: "percent" | "flat";
  value: number;
  endsAt: number | null;
  scopeLabel: string;
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}d ${pad(remHours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function offerHeadline(offer: StoreOffer): string {
  if (offer.badge?.trim()) return offer.badge.trim();
  if (offer.kind === "percent") return `${Math.round(offer.value)}% OFF`;
  return `₹${Math.round(offer.value)} OFF`;
}

/** Live offer strip with countdown; hides itself when the window ends. */
export function StoreOfferBanner({ offer }: { offer: StoreOffer }) {
  const [now, setNow] = useState(() => Date.now());
  const endsAt = offer.endsAt;

  useEffect(() => {
    if (endsAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (endsAt !== null && now >= endsAt) return null;

  const remaining = endsAt !== null ? endsAt - now : null;

  return (
    <div
      className="flex flex-col gap-2 bg-ink px-4 py-3 text-canvas sm:flex-row sm:items-center sm:justify-between"
      role="status"
      aria-live="polite"
    >
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium tracking-tight">{offerHeadline(offer)}</p>
        <p className="truncate text-xs text-canvas/70">
          {offer.name}
          {offer.scopeLabel ? ` · on ${offer.scopeLabel}` : ""}
        </p>
      </div>
      {remaining !== null ? (
        <div className="shrink-0 text-left sm:text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-canvas/70">Ends in</p>
          <p className="font-mono text-lg font-medium tabular-nums tracking-tight">
            {formatRemaining(remaining)}
          </p>
        </div>
      ) : (
        <p className="text-xs font-medium text-canvas/70">Limited time</p>
      )}
    </div>
  );
}
