"use client";

import { useMutation, useQuery } from "convex/react";
import { ShoppingBag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ItemImage } from "@/components/common/ItemImage";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { reportError } from "@/lib/client-errors";
import { formatInr } from "@/lib/format";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";

type ShopLookView = FunctionReturnType<typeof api.threads.shopLooks>[number];

type ShopLookCardsProps = {
  threadId: Id<"threads">;
  shopLookIds: Id<"shopLooks">[];
  problems: { name: string; problems: string[] }[];
};

export function ShopLookCards({ threadId, shopLookIds, problems }: ShopLookCardsProps) {
  const looks = useQuery(api.threads.shopLooks, { threadId });

  if (shopLookIds.length === 0 && problems.length === 0) return null;

  if (looks === undefined && shopLookIds.length > 0) {
    return (
      <div className="grid gap-6 @min-[560px]:grid-cols-2">
        {shopLookIds.map((id) => (
          <Skeleton key={id} className="aspect-[4/5] rounded-none" />
        ))}
      </div>
    );
  }

  const wanted = new Set<string>(shopLookIds);
  const shown = (looks ?? []).filter((look) => wanted.has(look._id));

  return (
    <div className="space-y-3">
      {shown.length > 0 ? (
        <div className="grid gap-x-6 gap-y-8 @min-[560px]:grid-cols-2">
          {shown.map((look) => (
            <ShopLookCard key={look._id} look={look} />
          ))}
        </div>
      ) : null}

      {problems.map((problem, index) => (
        <p key={`${problem.name}-${index}`} className="text-xs text-mute">
          <span className="font-medium text-ink">{problem.name}</span> could not be saved:{" "}
          {problem.problems.join("; ")}
        </p>
      ))}
    </div>
  );
}

function ShopLookCard({ look }: { look: ShopLookView }) {
  const addLook = useMutation(api.cart.addLook);
  const [adding, setAdding] = useState(false);

  async function addToCart() {
    setAdding(true);
    try {
      const result = await addLook({ shopLookId: look._id });
      if (result.added === 0) {
        toast.error(
          result.skipped[0]?.reason
            ? `Could not add that look: ${result.skipped[0].reason}`
            : "Nothing from that look could be added.",
        );
        return;
      }
      const skippedNote =
        result.skipped.length > 0 ? ` (${result.skipped.length} skipped)` : "";
      toast.success(`Added ${result.added} ${result.added === 1 ? "piece" : "pieces"} to your bag${skippedNote}.`);
    } catch (error) {
      reportError(error, "Could not add that look to your bag.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="flex min-w-0 flex-col gap-4">
      <div
        className={`relative grid aspect-[5/4] gap-2 bg-soft-cloud/60 p-3 ${look.lines.length < 3 ? "grid-cols-2" : "grid-cols-3"}`}
      >
        {look.lines.slice(0, 6).map((line, index) => (
          <ItemImage
            key={`${line.productId}-${index}`}
            src={line.imageUrl}
            alt={line.name}
            aspect="aspect-auto"
            className={
              look.lines.length === 1
                ? "col-span-2 size-full rounded-none bg-transparent p-0"
                : index === 0 && look.lines.length > 2
                  ? "col-span-2 row-span-2 size-full rounded-none bg-transparent p-0"
                  : "size-full min-h-0 rounded-none bg-transparent p-0"
            }
          />
        ))}
        <span className="absolute right-3 bottom-3 bg-canvas/90 px-2 py-1 font-mono text-[9px] tracking-wide uppercase">
          {look.lines.length} pieces · {formatInr(look.totalInr)}
        </span>
      </div>
      <div className="space-y-1.5">
        {look.occasion ? (
          <p className="font-mono text-[10px] tracking-[0.12em] text-mute uppercase">{look.occasion}</p>
        ) : null}
        <h3 className="text-base font-medium tracking-tight text-ink">{look.name}</h3>
        <p className="text-sm text-mute">{look.reasoning}</p>
        <ul className="space-y-1 pt-1">
          {look.lines.map((line) => (
            <li key={`${line.slot}-${line.productId}`} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">
                {line.name}
                {line.vendorName ? <span className="text-mute"> · {line.vendorName}</span> : null}
              </span>
              <span className="shrink-0 font-medium text-ink">{formatInr(line.priceInr)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
          <p className="text-sm font-medium text-ink">Look total {formatInr(look.totalInr)}</p>
          <Button type="button" size="sm" disabled={adding} onClick={() => void addToCart()}>
            {adding ? <Spinner className="size-3.5" /> : <ShoppingBag className="size-3.5" aria-hidden />}
            Add look to cart
          </Button>
        </div>
      </div>
    </article>
  );
}
