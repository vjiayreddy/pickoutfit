"use client";

import { useMutation, useQuery } from "convex/react";
import type { Id } from "@convex/_generated/dataModel";
import { ArrowLeft, Package } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/vendor/VendorProfileForm";
import { reportError } from "@/lib/client-errors";
import { cn } from "@/lib/cn";
import { formatDate, formatInr } from "@/lib/format";
import { routes } from "@/lib/routes";

export function VendorOrderDetail({ orderId }: { orderId: Id<"orders"> }) {
  const detail = useQuery(api.vendorOrders.get, { orderId });
  const shipLines = useMutation(api.vendorOrders.shipLines);
  const cancelLines = useMutation(api.vendorOrders.cancelLines);
  const markDelivered = useMutation(api.vendorOrders.markDelivered);
  const createReturn = useMutation(api.vendorOrders.createReturn);
  const resolveReturn = useMutation(api.vendorOrders.resolveReturn);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shipOpen, setShipOpen] = useState(false);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [returnItemId, setReturnItemId] = useState<Id<"orderItems"> | null>(null);
  const [returnQty, setReturnQty] = useState("1");
  const [returnReason, setReturnReason] = useState("");

  const placedIds = useMemo(
    () => detail?.items.filter((item) => item.lineStatus === "placed").map((item) => item.id) ?? [],
    [detail],
  );

  if (detail === undefined) {
    return <div className="h-64 animate-pulse bg-soft-cloud" />;
  }

  if (!detail) {
    return (
      <EmptyState
        icon={Package}
        title="Order not found"
        description="This order isn't on your store."
        action={<Button href={routes.vendorOrders}>Back to orders</Button>}
      />
    );
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllPlaced() {
    setSelected(new Set(placedIds));
  }

  const selectedPlaced = [...selected].filter((id) =>
    placedIds.includes(id as Id<"orderItems">),
  ) as Id<"orderItems">[];

  async function onShip() {
    try {
      await shipLines({
        orderItemIds: selectedPlaced,
        carrier: carrier.trim() || undefined,
        trackingNumber: tracking.trim() || undefined,
      });
      toast.success("Shipment created");
      setShipOpen(false);
      setCarrier("");
      setTracking("");
      setSelected(new Set());
    } catch (error) {
      reportError(error);
    }
  }

  async function onCancel() {
    await cancelLines({ orderItemIds: selectedPlaced });
    toast.success("Lines cancelled and stock restored");
    setSelected(new Set());
  }

  async function onCreateReturn() {
    if (!returnItemId) return;
    try {
      await createReturn({
        orderItemId: returnItemId,
        quantity: Number(returnQty),
        reason: returnReason,
      });
      toast.success("Return opened");
      setReturnItemId(null);
      setReturnQty("1");
      setReturnReason("");
    } catch (error) {
      reportError(error);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href={routes.vendorOrders}
            className="inline-flex items-center gap-1 text-sm font-medium text-mute hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            Orders
          </Link>
          <h1 className="text-2xl font-medium tracking-tight">{detail.buyer.name}</h1>
          <p className="text-sm text-mute">
            {formatDate(detail.createdAt)} · {formatInr(detail.totalInr)} · {detail.orderStatus}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={placedIds.length === 0} onClick={selectAllPlaced}>
            Select to-ship
          </Button>
          <Button
            size="sm"
            disabled={selectedPlaced.length === 0}
            onClick={() => setShipOpen(true)}
          >
            Ship selected
          </Button>
          <ConfirmDialog
            title="Cancel selected lines?"
            description="Stock will be put back on those variants."
            confirmLabel="Cancel lines"
            destructive
            confirmDisabled={selectedPlaced.length === 0}
            onConfirm={onCancel}
            trigger={
              <Button variant="secondary" size="sm" disabled={selectedPlaced.length === 0}>
                Cancel selected
              </Button>
            }
          />
        </div>
      </div>

      <section className="space-y-3 border-t border-hairline pt-8">
        <h2 className="text-sm font-medium">Ship to</h2>
        <p className="text-sm">
          {detail.buyer.name}
          <br />
          {detail.buyer.address}
          <br />
          {detail.buyer.city} {detail.buyer.pincode}
          <br />
          <span className="text-mute">
            {detail.buyer.phone} · {detail.buyer.email}
          </span>
        </p>
      </section>

      <section className="space-y-3 border-t border-hairline pt-8">
        <h2 className="text-sm font-medium">Your lines</h2>
        <ul className="divide-y divide-hairline border-y border-hairline">
          {detail.items.map((item) => {
            const canSelect = item.lineStatus === "placed";
            const checked = selected.has(item.id);
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-4">
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-ink"
                    disabled={!canSelect}
                    checked={checked}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="min-w-0 space-y-0.5">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="block text-xs text-mute">
                      {[item.sku, item.size, item.colour].filter(Boolean).join(" · ") || "—"}
                      {" · "}
                      qty {item.quantity} · {formatInr(item.priceInr * item.quantity)}
                    </span>
                  </span>
                </label>
                <LineStatusBadge status={item.lineStatus} />
                {item.lineStatus === "shipped" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setReturnItemId(item.id);
                      setReturnQty(String(item.quantity));
                      setReturnReason("");
                    }}
                  >
                    Open return
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 border-t border-hairline pt-8">
        <h2 className="text-sm font-medium">Shipments</h2>
        {detail.shipments.length === 0 ? (
          <p className="text-sm text-mute">No shipments yet.</p>
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {detail.shipments.map((shipment) => (
              <li key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {shipment.carrier ?? "Shipment"}
                    {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}
                  </p>
                  <p className="text-xs text-mute">
                    {shipment.orderItemIds.length} line
                    {shipment.orderItemIds.length === 1 ? "" : "s"}
                    {shipment.shippedAt ? ` · ${formatDate(shipment.shippedAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-soft-cloud px-3 py-1 text-xs font-medium capitalize">
                    {shipment.status}
                  </span>
                  {shipment.status === "shipped" ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void markDelivered({ shipmentId: shipment.id })
                          .then(() => toast.success("Marked delivered"))
                          .catch(reportError)
                      }
                    >
                      Mark delivered
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 border-t border-hairline pt-8">
        <h2 className="text-sm font-medium">Returns</h2>
        {detail.returns.length === 0 ? (
          <p className="text-sm text-mute">No returns on this order.</p>
        ) : (
          <ul className="divide-y divide-hairline border-y border-hairline">
            {detail.returns.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    Qty {row.quantity} · {row.reason}
                  </p>
                  <p className="text-xs text-mute">{formatDate(row.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium capitalize",
                      row.status === "accepted" && "bg-soft-cloud text-success",
                      row.status === "rejected" && "bg-soft-cloud text-mute",
                      row.status === "requested" && "bg-ink text-canvas",
                    )}
                  >
                    {row.status}
                  </span>
                  {row.status === "requested" ? (
                    <>
                      <ConfirmDialog
                        title="Accept return and restock?"
                        description="Stock will increase by the returned quantity."
                        confirmLabel="Accept"
                        onConfirm={async () => {
                          await resolveReturn({ returnId: row.id, status: "accepted" });
                          toast.success("Return accepted");
                        }}
                        trigger={
                          <Button size="sm">Accept</Button>
                        }
                      />
                      <ConfirmDialog
                        title="Reject this return?"
                        description="No stock change."
                        confirmLabel="Reject"
                        destructive
                        onConfirm={async () => {
                          await resolveReturn({ returnId: row.id, status: "rejected" });
                          toast.success("Return rejected");
                        }}
                        trigger={
                          <Button variant="secondary" size="sm">
                            Reject
                          </Button>
                        }
                      />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={shipOpen} onOpenChange={setShipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ship {selectedPlaced.length} line{selectedPlaced.length === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Carrier">
              <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Delhivery, Bluedart…" />
            </Field>
            <Field label="Tracking number">
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShipOpen(false)}>
              Back
            </Button>
            <Button onClick={() => void onShip()}>Create shipment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnItemId !== null} onOpenChange={(open) => !open && setReturnItemId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open return</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Quantity">
              <Input
                type="number"
                min={1}
                value={returnQty}
                onChange={(e) => setReturnQty(e.target.value)}
              />
            </Field>
            <Field label="Reason">
              <Input
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Wrong size, damaged…"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReturnItemId(null)}>
              Back
            </Button>
            <Button onClick={() => void onCreateReturn()}>Open return</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LineStatusBadge({ status }: { status: string | null }) {
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
