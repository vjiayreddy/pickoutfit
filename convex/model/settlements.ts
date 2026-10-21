import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { commissionInr } from "../shared/payments";
import { lineStatusOf } from "./orders";

type Ctx = QueryCtx | MutationCtx;

export function toSettlementView(row: Doc<"vendorSettlements">) {
  return {
    id: row._id,
    shipmentId: row.shipmentId,
    orderId: row.orderId,
    grossInr: row.grossInr,
    commissionInr: row.commissionInr,
    netInr: row.netInr,
    status: row.status,
    availableAt: row.availableAt,
    razorpayTransferId: row.razorpayTransferId ?? null,
    failureReason: row.failureReason ?? null,
    note: row.note ?? null,
    createdAt: row.createdAt,
    paidAt: row.paidAt ?? null,
  };
}

export async function listSettlementsForVendor(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  limit = 50,
) {
  const rows = await ctx.db
    .query("vendorSettlements")
    .withIndex("by_vendorId_and_createdAt", (q) => q.eq("vendorId", vendorId))
    .order("desc")
    .take(limit);
  return rows.map(toSettlementView);
}

/** Create a pending settlement when a shipment is marked delivered. Idempotent. */
export async function ensureSettlementForShipment(
  ctx: MutationCtx,
  vendor: Doc<"vendors">,
  shipment: Doc<"shipments">,
) {
  const existing = await ctx.db
    .query("vendorSettlements")
    .withIndex("by_shipmentId", (q) => q.eq("shipmentId", shipment._id))
    .unique();
  if (existing) return existing._id;

  if (vendor.payoutStatus !== "activated" || !vendor.payoutAccountId) {
    return null;
  }

  const deliveredAt = shipment.deliveredAt ?? Date.now();
  let grossInr = 0;
  let commissionTotal = 0;
  const itemIds: Id<"orderItems">[] = [];

  for (const orderItemId of shipment.orderItemIds) {
    const item = await ctx.db.get(orderItemId);
    if (!item || item.vendorId !== vendor._id) continue;
    const status = lineStatusOf(item);
    if (status === "cancelled" || status === "returned") continue;

    const returns = await ctx.db
      .query("returns")
      .withIndex("by_orderItemId", (q) => q.eq("orderItemId", orderItemId))
      .take(20);
    const acceptedQty = returns
      .filter((row) => row.status === "accepted")
      .reduce((sum, row) => sum + row.quantity, 0);
    const billableQty = Math.max(0, item.quantity - acceptedQty);
    if (billableQty <= 0) continue;

    const lineGross = item.priceInr * billableQty;
    const bps = item.commissionBps ?? vendor.commissionBps;
    grossInr += lineGross;
    commissionTotal += commissionInr(lineGross, bps);
    itemIds.push(item._id);
  }

  if (itemIds.length === 0 || grossInr <= 0) return null;

  const netInr = Math.max(0, grossInr - commissionTotal);
  if (netInr < 1) return null;

  const settlementId = await ctx.db.insert("vendorSettlements", {
    vendorId: vendor._id,
    shipmentId: shipment._id,
    orderId: shipment.orderId,
    orderItemIds: itemIds,
    grossInr,
    commissionInr: commissionTotal,
    netInr,
    status: "pending",
    availableAt: deliveredAt + vendor.holdDays * 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
  });

  for (const orderItemId of itemIds) {
    await ctx.db.patch(orderItemId, { settlementId });
  }
  return settlementId;
}

/** Hold or shrink a pending settlement when a return is accepted. */
export async function adjustSettlementForReturn(
  ctx: MutationCtx,
  item: Doc<"orderItems">,
  returnedQty: number,
) {
  if (!item.settlementId) return;
  const settlement = await ctx.db.get(item.settlementId);
  if (!settlement) return;

  if (settlement.status === "paid") {
    await ctx.db.patch(settlement._id, {
      note: [
        settlement.note,
        `Clawback needed: ${returnedQty}× ${item.name} returned after payout.`,
      ]
        .filter(Boolean)
        .join(" "),
      status: settlement.status,
    });
    return;
  }

  if (settlement.status !== "pending" && settlement.status !== "failed") return;

  const bps = item.commissionBps ?? 0;
  const reduceGross = item.priceInr * returnedQty;
  const reduceCommission = commissionInr(reduceGross, bps);
  const nextGross = Math.max(0, settlement.grossInr - reduceGross);
  const nextCommission = Math.max(0, settlement.commissionInr - reduceCommission);
  const netInr = Math.max(0, nextGross - nextCommission);

  if (netInr < 1) {
    await ctx.db.patch(settlement._id, {
      grossInr: nextGross,
      commissionInr: nextCommission,
      netInr: 0,
      status: "held",
      note: "Held after returns reduced payout below ₹1.",
    });
    return;
  }

  await ctx.db.patch(settlement._id, {
    grossInr: nextGross,
    commissionInr: nextCommission,
    netInr,
  });
}

export async function listDueSettlements(ctx: MutationCtx, now: number, limit = 20) {
  return ctx.db
    .query("vendorSettlements")
    .withIndex("by_status_and_availableAt", (q) =>
      q.eq("status", "pending").lte("availableAt", now),
    )
    .take(limit);
}

/**
 * Re-open settlements stuck in `transferring` with no Razorpay transfer id
 * (claim succeeded, external call never recorded). Rows that already have a
 * transfer id are left for webhook reconcile.
 */
export async function reclaimStuckTransferring(ctx: MutationCtx, limit = 50) {
  const rows = await ctx.db
    .query("vendorSettlements")
    .withIndex("by_status_and_availableAt", (q) => q.eq("status", "transferring"))
    .take(limit);
  let reclaimed = 0;
  for (const row of rows) {
    if (row.razorpayTransferId) continue;
    await ctx.db.patch(row._id, { status: "pending", failureReason: undefined });
    reclaimed += 1;
  }
  return reclaimed;
}

export async function markSettlementTransferring(
  ctx: MutationCtx,
  settlementId: Id<"vendorSettlements">,
  transferId: string,
) {
  const row = await ctx.db.get(settlementId);
  if (!row) throw appError("NOT_FOUND", "Settlement not found.");
  // Already claimed in claimDue; attach the Razorpay id. Refuse if paid/held.
  if (row.status === "paid" || row.status === "held") {
    throw appError("CONFLICT", "Settlement is no longer transferable.");
  }
  await ctx.db.patch(settlementId, {
    status: "transferring",
    razorpayTransferId: transferId,
  });
}

export async function markSettlementPaid(
  ctx: MutationCtx,
  settlementId: Id<"vendorSettlements">,
  transferId?: string,
) {
  const row = await ctx.db.get(settlementId);
  if (!row) throw appError("NOT_FOUND", "Settlement not found.");
  await ctx.db.patch(settlementId, {
    status: "paid",
    ...(transferId ? { razorpayTransferId: transferId } : {}),
    paidAt: Date.now(),
  });
}

export async function markSettlementFailed(
  ctx: MutationCtx,
  settlementId: Id<"vendorSettlements">,
  reason: string,
) {
  await ctx.db.patch(settlementId, {
    status: "failed",
    failureReason: reason.slice(0, 200),
  });
}

export async function settlementByTransferId(ctx: Ctx, transferId: string) {
  return ctx.db
    .query("vendorSettlements")
    .withIndex("by_razorpayTransferId", (q) => q.eq("razorpayTransferId", transferId))
    .unique();
}
