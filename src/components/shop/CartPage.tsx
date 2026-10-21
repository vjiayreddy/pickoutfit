"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportError } from "@/lib/client-errors";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

export function CartPage() {
  const cart = useQuery(api.cart.current);
  const setQuantity = useMutation(api.cart.setQuantity);
  const applyCode = useMutation(api.coupons.applyCode);
  const clearForVendor = useMutation(api.coupons.clearForVendor);
  const [code, setCode] = useState("");
  const [pendingCode, setPendingCode] = useState(false);

  async function change(lineId: Id<"cartItems">, quantity: number) {
    try {
      await setQuantity({ lineId, quantity });
    } catch (error) {
      toast.error(reportError(error).message);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (pendingCode || !code.trim()) return;
    setPendingCode(true);
    try {
      await applyCode({ code: code.trim() });
      toast.success("Promo code applied.");
      setCode("");
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPendingCode(false);
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
              <p className="text-xs text-mute">{line.vendorName}</p>
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

      <section className="space-y-3 border-b border-hairline pb-6">
        <h2 className="text-sm font-medium">Coupons</h2>
        {cart.coupons.length > 0 ? (
          <ul className="space-y-2">
            {cart.coupons.map((coupon) => (
              <li
                key={`${coupon.vendorId}-${coupon.discountId}`}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {coupon.name}
                    {coupon.code ? (
                      <span className="ml-2 font-mono text-xs text-mute">{coupon.code}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-mute">
                    {coupon.vendorName}
                    {coupon.valid
                      ? ` · −${formatInr(coupon.savingsInr)}`
                      : coupon.message
                        ? ` · ${coupon.message}`
                        : null}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium underline"
                  onClick={() =>
                    void clearForVendor({ vendorId: coupon.vendorId })
                      .then(() => toast.success("Coupon removed."))
                      .catch((error) => toast.error(reportError(error).message))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mute">No coupons applied yet. Clip one on a product or enter a code.</p>
        )}
        <form onSubmit={submitCode} className="flex flex-wrap gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Promo code"
            maxLength={24}
            className="h-12 max-w-xs flex-1 rounded-full"
            aria-label="Promo code"
          />
          <Button type="submit" variant="secondary" disabled={pendingCode || !code.trim()}>
            Apply
          </Button>
        </form>
      </section>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-mute">
          <span>Subtotal</span>
          <span>{formatInr(cart.subtotalInr)}</span>
        </div>
        {cart.couponSavingsInr > 0 ? (
          <div className="flex items-center justify-between text-sm text-sale">
            <span>Coupon savings</span>
            <span>−{formatInr(cart.couponSavingsInr)}</span>
          </div>
        ) : null}
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
    </div>
  );
}
