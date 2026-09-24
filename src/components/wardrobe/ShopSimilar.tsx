"use client";

import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { ShopLookupView, ShopStore } from "@convex/shared/shop";
import { reportError } from "@/lib/client-errors";

const STORE_LABEL: Record<ShopStore, string> = {
  amazon: "Amazon",
  flipkart: "Flipkart",
  myntra: "Myntra",
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function ShopSimilar({ itemId }: { itemId: Id<"items"> }) {
  const lookup = useAction(api.shop.lookup);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ShopLookupView | null>(null);

  async function shop() {
    if (pending) return;
    setPending(true);
    try {
      setResult(await lookup({ itemId }));
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  if (!result) {
    return (
      <button
        type="button"
        onClick={() => void shop()}
        disabled={pending}
        className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-8 text-base font-medium text-canvas disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Shop similar
      </button>
    );
  }

  if (result.mode === "links") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-mute">Similar style. Prices are on the store.</p>
        <div className="flex flex-wrap gap-2">
          {result.links.map((link) => (
            <a
              key={link.store}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center rounded-full border border-hairline px-5 text-sm font-medium"
            >
              {STORE_LABEL[link.store]}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">Similar style.</p>
      <ul className="space-y-3">
        {result.offers.map((offer) => (
          <li key={offer.store} className="flex items-center gap-3">
            {offer.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={offer.imageUrl}
                alt=""
                className="size-16 bg-soft-cloud object-contain"
              />
            ) : (
              <div className="size-16 bg-soft-cloud" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-mute">{STORE_LABEL[offer.store]}</p>
              <p className="truncate text-sm font-medium">{offer.title}</p>
              {offer.priceInr !== undefined ? (
                <p className="text-sm">{inr.format(offer.priceInr)}</p>
              ) : null}
            </div>
            <a
              href={offer.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 shrink-0 items-center rounded-full bg-ink px-5 text-sm font-medium text-canvas"
            >
              Buy
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
