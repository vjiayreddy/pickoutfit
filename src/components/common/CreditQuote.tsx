"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { formatCredits } from "@/lib/format";
import { cn } from "@/lib/cn";

type QuoteRequest =
  | { kind: "extract"; items: number }
  | { kind: "render"; quality: "standard" | "hq"; count: number; outfits?: number };

export function useCreditQuote(request: QuoteRequest | null) {
  return useQuery(
    api.credits.quote,
    request ? { request } : "skip",
  );
}

export function CreditQuote({
  quote,
  label,
  className,
}: {
  quote: ReturnType<typeof useCreditQuote>;
  label: string;
  className?: string;
}) {
  if (quote === undefined) {
    return <p className={cn("text-sm text-mute", className)}>Checking credits…</p>;
  }
  if (!quote.canAfford) {
    const reason =
      quote.reason === "daily_cap"
        ? "You've hit today's credit cap."
        : quote.reason === "feature_locked"
          ? "This feature needs a higher plan."
          : `Need ${formatCredits(quote.shortfall)} more.`;
    return (
      <p className={cn("text-sm text-sale", className)}>
        {formatCredits(quote.credits)} for {label}. {reason}
      </p>
    );
  }
  return (
    <p className={cn("text-sm text-mute", className)}>
      {formatCredits(quote.credits)} for {label} · {formatCredits(quote.available)} available
    </p>
  );
}
