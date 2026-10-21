"use client";

import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reportError } from "@/lib/client-errors";
import { formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: unknown) => void) => void;
    };
  }
}

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Razorpay failed to load")), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpay = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Razorpay failed to load"));
    document.body.appendChild(script);
  });
}

export function CheckoutForm() {
  const me = useQuery(api.users.me);
  const cart = useQuery(api.cart.current);
  const paymentsConfigured = useQuery(api.orders.paymentsConfigured);
  const createIntent = useAction(api.orders.createCheckoutIntent);
  const confirmCheckout = useAction(api.orders.confirmCheckout);
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (me === undefined || cart === undefined || paymentsConfigured === undefined) {
    return <div className="h-48 animate-pulse bg-soft-cloud" />;
  }
  if (!me) return null;
  if (cart.lines.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="font-display text-4xl uppercase">Checkout</h1>
        <p className="text-sm text-mute">Your bag is empty.</p>
        <Link href={routes.cart} className="text-sm font-medium underline">
          Back to bag
        </Link>
      </div>
    );
  }

  async function place(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!paymentsConfigured) {
      toast.error(
        "Payments are not configured yet. Set Razorpay keys on the Convex deployment.",
      );
      return;
    }
    const data = new FormData(event.currentTarget);
    const value = (name: string) => {
      const field = data.get(name);
      return typeof field === "string" ? field : "";
    };
    const input = {
      name: value("name"),
      email: value("email"),
      phone: value("phone"),
      address: value("address"),
      city: value("city"),
      pincode: value("pincode"),
    };
    setPending(true);
    try {
      const intent = await createIntent(input);
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error("Razorpay Checkout is unavailable.");

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: intent.keyId,
          amount: Math.round(intent.amountInr * 100),
          currency: "INR",
          name: "WardrobeAI",
          description: "Order payment",
          order_id: intent.razorpayOrderId,
          prefill: {
            name: intent.name,
            email: intent.email,
            contact: intent.phone,
          },
          handler: async (response: unknown) => {
            try {
              const payment = response as {
                razorpay_order_id: string;
                razorpay_payment_id: string;
                razorpay_signature: string;
              };
              const result = await confirmCheckout({
                intentId: intent.intentId,
                razorpayOrderId: payment.razorpay_order_id,
                razorpayPaymentId: payment.razorpay_payment_id,
                razorpaySignature: payment.razorpay_signature,
              });
              if (result.droppedNames.length > 0) {
                toast.message(`Removed unavailable items: ${result.droppedNames.join(", ")}`);
              }
              router.push(`${routes.checkoutComplete}?order=${result.orderId}`);
              resolve();
            } catch (error) {
              reject(error);
            }
          },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled.")),
          },
        });
        rzp.open();
      });
    } catch (error) {
      const message = reportError(error).message;
      if (!/cancelled/i.test(message)) toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void place(event)} className="max-w-xl space-y-4">
      <div>
        <h1 className="font-display text-4xl uppercase">Checkout</h1>
        <p className="mt-2 text-sm text-mute">
          Pay securely with Razorpay. Total {formatInr(cart.totalInr)}
          {cart.couponSavingsInr > 0
            ? ` (saved ${formatInr(cart.couponSavingsInr)} with coupons)`
            : ""}
          .
        </p>
        {cart.coupons.filter((c) => c.valid).length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-mute">
            {cart.coupons
              .filter((c) => c.valid)
              .map((coupon) => (
                <li key={`${coupon.vendorId}-${coupon.discountId}`}>
                  {coupon.vendorName}: {coupon.code ?? coupon.name} (−
                  {formatInr(coupon.savingsInr)})
                </li>
              ))}
          </ul>
        ) : null}
        {!paymentsConfigured ? (
          <p className="mt-2 text-sm text-sale">
            Payments are not configured on this environment yet.
          </p>
        ) : null}
      </div>
      <Field label="Name" name="name" defaultValue={me.name ?? ""} required />
      <Field label="Email" name="email" type="email" defaultValue={me.email ?? ""} required />
      <Field label="Phone" name="phone" required />
      <label className="block space-y-1 text-sm font-medium">
        Address
        <textarea
          name="address"
          required
          maxLength={200}
          className="min-h-24 w-full rounded-[24px] bg-soft-cloud px-4 py-3 text-sm font-normal outline-none focus:bg-canvas focus:ring-2 focus:ring-ink"
        />
      </label>
      <Field label="City" name="city" required />
      <Field label="PIN code" name="pincode" inputMode="numeric" required />
      <Button type="submit" disabled={pending || !paymentsConfigured}>
        {pending ? "Opening payment…" : `Pay ${formatInr(cart.totalInr)}`}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  inputMode,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  inputMode?: "numeric";
}) {
  return (
    <label className="block space-y-1 text-sm font-medium">
      {label}
      <Input name={name} type={type} defaultValue={defaultValue} required={required} inputMode={inputMode} />
    </label>
  );
}

export function OrderConfirmation({ orderId }: { orderId: string }) {
  const order = useQuery(api.orders.getMine, { orderId: orderId as Id<"orders"> });
  if (order === undefined) return <div className="h-48 animate-pulse bg-soft-cloud" />;
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="font-display text-4xl uppercase">Order placed</h1>
      <p className="text-sm capitalize text-mute">Status: {order.status}</p>
      <p className="text-sm text-mute">
        {order.paymentStatus === "paid" || order.paymentStatus === null
          ? "Payment received."
          : `Payment: ${order.paymentStatus}`}
      </p>
      <p className="text-sm font-medium">Total {formatInr(order.totalInr)}</p>
      <ul className="space-y-1 text-sm">
        {order.items.map((item) => (
          <li key={item.id}>
            {item.quantity} × {item.name}
          </li>
        ))}
      </ul>
      <p className="text-sm text-mute">
        {order.name}, {order.address}, {order.city} {order.pincode}
      </p>
      <div className="flex flex-wrap gap-4">
        <Link href={routes.order(orderId)} className="text-sm font-medium underline">
          View order
        </Link>
        <Link href={routes.wardrobe} className="text-sm font-medium text-mute underline">
          Back to wardrobe
        </Link>
      </div>
    </div>
  );
}
