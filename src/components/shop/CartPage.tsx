"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";
import { reportError } from "@/lib/client-errors";
import { toast } from "sonner";

export function CartPage() {
  const cart = useQuery(api.cart.current);
  const setQuantity = useMutation(api.cart.setQuantity);

  async function change(lineId: Id<"cartItems">, quantity: number) {
    try {
      await setQuantity({ lineId, quantity });
    } catch (error) {
      toast.error(reportError(error).message);
    }
  }

  if (cart === undefined) return <div className="h-48 animate-pulse bg-soft-cloud" />;
  if (cart.lines.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-4xl uppercase">Bag</h1>
        <p className="text-sm text-mute">Your bag is empty.</p>
        <Link href={routes.services} className="text-sm font-medium underline">
          Browse services
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl uppercase">Bag</h1>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {cart.lines.map((line) => (
          <li key={line.id} className="flex gap-4 py-4">
            <div className="size-20 shrink-0 bg-soft-cloud">
              {line.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium">{line.name}</p>
              <p className="text-sm">{formatInr(line.priceInr)}</p>
              {line.available ? null : (
                <p className="text-sm text-sale">No longer available. It will be removed at checkout.</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="size-10 rounded-full bg-soft-cloud text-sm font-medium"
                  onClick={() => void change(line.id, line.quantity - 1)}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm">{line.quantity}</span>
                <button
                  type="button"
                  className="size-10 rounded-full bg-soft-cloud text-sm font-medium"
                  onClick={() => void change(line.id, line.quantity + 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
                <button
                  type="button"
                  className="ml-2 text-sm font-medium underline"
                  onClick={() => void change(line.id, 0)}
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between">
        <p className="text-base font-medium">Total {formatInr(cart.totalInr)}</p>
        <Link
          href={routes.checkout}
          className="inline-flex h-12 items-center rounded-full bg-ink px-8 text-sm font-medium text-canvas"
        >
          Checkout
        </Link>
      </div>
    </div>
  );
}
