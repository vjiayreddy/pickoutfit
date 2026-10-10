import { cn } from "@/lib/cn";

export function OrderStatusPill({ status }: { status: string }) {
  const label =
    status === "fulfilled" ? "Fulfilled" : status === "cancelled" ? "Cancelled" : "Placed";
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium",
        status === "fulfilled" && "bg-soft-cloud text-success",
        status === "cancelled" && "bg-soft-cloud text-mute",
        status === "placed" && "bg-ink text-canvas",
      )}
    >
      {label}
    </span>
  );
}

export function LineStatusBadge({ status }: { status: string | null }) {
  const label = status ?? "placed";
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium capitalize",
        label === "placed" && "bg-ink text-canvas",
        label === "shipped" && "bg-soft-cloud text-success",
        label === "cancelled" && "bg-soft-cloud text-mute",
        label === "returned" && "bg-soft-cloud text-mute",
      )}
    >
      {label}
    </span>
  );
}
