"use client";

import { useActionState } from "react";
import { ORDER_STATUSES } from "@convex/shared/products";
import type { OwnerFormState } from "@/app/owner/actions";
import { setOrderStatus } from "@/app/owner/actions";
import { Button } from "@/components/ui/button";

export function OrderStatusForm({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const [state, action, pending] = useActionState(setOrderStatus, null as OwnerFormState);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="orderId" value={orderId} />
      <label className="space-y-1 text-sm font-medium">
        Status
        <select
          name="status"
          defaultValue={status}
          className="block h-12 rounded-full bg-soft-cloud px-4 text-sm font-normal"
        >
          {ORDER_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Update"}
      </Button>
      {state?.error ? <p className="text-sm text-sale">{state.error}</p> : null}
    </form>
  );
}
