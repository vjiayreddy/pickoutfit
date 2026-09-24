"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { shopSimilarVisible } from "@convex/shared/shop";
import { Skeleton } from "@/components/ui/skeleton";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";

export function ShoppingSettings() {
  const me = useQuery(api.users.me);
  const setShopSimilar = useMutation(api.users.setShopSimilar);
  const [pending, setPending] = useState(false);

  if (me === undefined) {
    return (
      <section className="space-y-4 border-t border-hairline py-8" aria-busy="true" aria-label="Loading shopping">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-12 w-48 rounded-full" />
      </section>
    );
  }
  if (!me) return null;

  const enabled = shopSimilarVisible(me.prefs);

  async function choose(next: boolean) {
    if (next === enabled || pending) return;
    setPending(true);
    try {
      await setShopSimilar({ enabled: next });
      toast.success(next ? "Shop similar is visible." : "Shop similar is hidden.");
    } catch (error) {
      toast.error(reportError(error, "Could not update Shop similar.").message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      id="shopping"
      className="grid scroll-mt-40 gap-6 border-t border-hairline py-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10"
    >
      <header className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.16em] text-mute uppercase">04 / Shopping</p>
        <h2 className="text-xl font-medium tracking-tight">Shop similar</h2>
        <p className="text-sm leading-relaxed text-mute">
          Show or hide the button on wardrobe items and outfits.
        </p>
      </header>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Shop similar visibility">
          <button
            type="button"
            disabled={pending}
            aria-pressed={enabled}
            onClick={() => void choose(true)}
            className={cn(
              "inline-flex h-12 items-center rounded-full px-6 text-sm font-medium disabled:opacity-50",
              enabled ? "bg-ink text-canvas" : "border border-hairline text-ink",
            )}
          >
            Show
          </button>
          <button
            type="button"
            disabled={pending}
            aria-pressed={!enabled}
            onClick={() => void choose(false)}
            className={cn(
              "inline-flex h-12 items-center rounded-full px-6 text-sm font-medium disabled:opacity-50",
              enabled ? "border border-hairline text-ink" : "bg-ink text-canvas",
            )}
          >
            Hide
          </button>
        </div>
        <p className="text-sm text-mute">
          {enabled
            ? "Shop similar appears on a finished piece and on each garment in an outfit."
            : "Shop similar is hidden. Your saved lookups stay until you show it again."}
        </p>
      </div>
    </section>
  );
}
