"use client";

import { useMutation, useQuery } from "convex/react";
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

export function CheckoutForm() {
  const me = useQuery(api.users.me);
  const cart = useQuery(api.cart.current);
  const checkout = useMutation(api.orders.checkout);
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (me === undefined || cart === undefined) {
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
    const data = new FormData(event.currentTarget);
    const value = (name: string) => {
      const field = data.get(name);
      return typeof field === "string" ? field : "";
    };
    setPending(true);
    try {
      const result = await checkout({
        name: value("name"),
        email: value("email"),
        phone: value("phone"),
        address: value("address"),
        city: value("city"),
        pincode: value("pincode"),
      });
      if (result.droppedNames.length > 0) {
        toast.message(`Removed unavailable items: ${result.droppedNames.join(", ")}`);
      }
      router.push(`${routes.checkoutComplete}?order=${result.orderId}`);
    } catch (error) {
      toast.error(reportError(error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void place(event)} className="max-w-xl space-y-4">
      <div>
        <h1 className="font-display text-4xl uppercase">Checkout</h1>
        <p className="mt-2 text-sm text-mute">
          This places the order. Payment is not collected yet. Total {formatInr(cart.totalInr)}.
        </p>
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
      <Button type="submit" disabled={pending}>
        {pending ? "Placing order…" : "Place order"}
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
        Payment is not collected yet. You can track this order anytime from Orders.
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
