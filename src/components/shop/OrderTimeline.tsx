import { formatDate } from "@/lib/format";

type TimelineEvent = {
  kind: "placed" | "shipped" | "delivered" | "return_requested" | "return_resolved";
  at: number;
  label: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  shipmentId: string | null;
  returnStatus: string | null;
};

const KIND_LABEL: Record<TimelineEvent["kind"], string> = {
  placed: "Order placed",
  shipped: "Shipped",
  delivered: "Delivered",
  return_requested: "Return requested",
  return_resolved: "Return resolved",
};

export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ol className="flex flex-col gap-4">
      {events.map((event, index) => {
        const title = event.label ?? KIND_LABEL[event.kind];
        const meta = [event.carrier, event.trackingNumber].filter(Boolean).join(" · ");
        return (
          <li key={`${event.kind}-${event.at}-${index}`} className="flex items-start gap-2">
            <span
              className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-ink"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug text-ink">{title}</p>
              <p className="text-xs font-medium text-mute">{formatDate(event.at)}</p>
              {meta ? <p className="mt-0.5 text-xs text-mute">{meta}</p> : null}
              {event.kind === "return_resolved" && event.returnStatus ? (
                <p className="mt-0.5 text-xs capitalize text-mute">{event.returnStatus}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
