import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { assertVendorWritable, requireVendor } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  lineStatusOf,
  recomputeOrderStatus,
  toOrderItemView,
  vendorOrderItems,
} from "./model/orders";
import { adjustStock } from "./model/products";
import {
  vOrderLineStatus,
  vReturnView,
  vShipmentView,
  vVendorOrderDetail,
  vVendorOrderListItem,
  type OrderLineStatus,
} from "./shared/products";

type Ctx = QueryCtx | MutationCtx;

const LIST_CAP = 500;

async function openReturnCount(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  orderItemIds: Id<"orderItems">[],
) {
  let count = 0;
  for (const orderItemId of orderItemIds) {
    const rows = await ctx.db
      .query("returns")
      .withIndex("by_orderItemId", (q) => q.eq("orderItemId", orderItemId))
      .take(20);
    count += rows.filter((row) => row.vendorId === vendorId && row.status === "requested").length;
  }
  return count;
}

async function toListItem(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  order: Doc<"orders">,
  items: Doc<"orderItems">[],
) {
  const counts = { placed: 0, shipped: 0, cancelled: 0, returned: 0 };
  for (const item of items) {
    counts[lineStatusOf(item)] += 1;
  }
  return {
    orderId: order._id,
    createdAt: order.createdAt,
    buyerName: order.name,
    city: order.city,
    orderStatus: order.status,
    itemCount: items.length,
    totalInr: items.reduce((sum, item) => sum + item.priceInr * item.quantity, 0),
    placedCount: counts.placed,
    shippedCount: counts.shipped,
    cancelledCount: counts.cancelled,
    returnedCount: counts.returned,
    openReturnCount: await openReturnCount(
      ctx,
      vendorId,
      items.map((item) => item._id),
    ),
  };
}

function toShipmentView(row: Doc<"shipments">) {
  return {
    id: row._id,
    orderId: row.orderId,
    orderItemIds: row.orderItemIds,
    carrier: row.carrier ?? null,
    trackingNumber: row.trackingNumber ?? null,
    status: row.status,
    shippedAt: row.shippedAt ?? null,
    createdAt: row.createdAt,
  };
}

function toReturnView(row: Doc<"returns">) {
  return {
    id: row._id,
    orderId: row.orderId,
    orderItemId: row.orderItemId,
    quantity: row.quantity,
    reason: row.reason,
    status: row.status,
    restocked: row.restocked,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt ?? null,
  };
}

async function requireVendorOrderItem(
  ctx: MutationCtx,
  vendor: Doc<"vendors">,
  orderItemId: Id<"orderItems">,
) {
  const item = await ctx.db.get(orderItemId);
  if (!item || item.vendorId !== vendor._id) {
    throw appError("NOT_FOUND", "That order line doesn't exist.");
  }
  return item;
}

/**
 * List this vendor's orders. Pagination walks `orderItems` and collapses to one row per
 * order so a multi-line order does not flood the desk.
 */
export const list = query({
  args: {
    lineStatus: v.optional(vOrderLineStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vVendorOrderListItem),
  handler: async (ctx, { lineStatus, paginationOpts }) => {
    const { vendor } = await requireVendor(ctx);
    const result = lineStatus
      ? await ctx.db
          .query("orderItems")
          .withIndex("by_vendorId_and_lineStatus_and_createdAt", (q) =>
            q.eq("vendorId", vendor._id).eq("lineStatus", lineStatus),
          )
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("orderItems")
          .withIndex("by_vendorId_and_createdAt", (q) => q.eq("vendorId", vendor._id))
          .order("desc")
          .paginate(paginationOpts);

    const seen = new Set<Id<"orders">>();
    const page = [];
    for (const item of result.page) {
      if (!item.vendorId || seen.has(item.orderId)) continue;
      seen.add(item.orderId);
      const order = await ctx.db.get(item.orderId);
      if (!order) continue;
      const items = await vendorOrderItems(ctx, order._id, vendor._id);
      const filtered = lineStatus
        ? items.filter((row) => lineStatusOf(row) === lineStatus)
        : items;
      if (filtered.length === 0) continue;
      page.push(await toListItem(ctx, vendor._id, order, items));
    }
    return { ...result, page };
  },
});

export const counts = query({
  args: {},
  returns: v.object({
    placed: v.number(),
    shipped: v.number(),
    cancelled: v.number(),
    returned: v.number(),
    openReturns: v.number(),
    capped: v.boolean(),
  }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const out = {
      placed: 0,
      shipped: 0,
      cancelled: 0,
      returned: 0,
      openReturns: 0,
      capped: false,
    };
    for (const status of ["placed", "shipped", "cancelled", "returned"] as const) {
      const rows = await ctx.db
        .query("orderItems")
        .withIndex("by_vendorId_and_lineStatus_and_createdAt", (q) =>
          q.eq("vendorId", vendor._id).eq("lineStatus", status),
        )
        .take(LIST_CAP);
      out[status] = rows.length;
      if (rows.length === LIST_CAP) out.capped = true;
    }
    const openReturns = await ctx.db
      .query("returns")
      .withIndex("by_vendorId_and_status_and_createdAt", (q) =>
        q.eq("vendorId", vendor._id).eq("status", "requested"),
      )
      .take(LIST_CAP);
    out.openReturns = openReturns.length;
    if (openReturns.length === LIST_CAP) out.capped = true;
    return out;
  },
});

export const get = query({
  args: { orderId: v.id("orders") },
  returns: vVendorOrderDetail,
  handler: async (ctx, { orderId }) => {
    const { vendor } = await requireVendor(ctx);
    const order = await ctx.db.get(orderId);
    if (!order) throw appError("NOT_FOUND", "That order doesn't exist.");
    const items = await vendorOrderItems(ctx, orderId, vendor._id);
    if (items.length === 0) throw appError("NOT_FOUND", "That order doesn't exist.");

    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .take(50);
    const returns = [];
    for (const item of items) {
      const rows = await ctx.db
        .query("returns")
        .withIndex("by_orderItemId", (q) => q.eq("orderItemId", item._id))
        .take(20);
      for (const row of rows) {
        if (row.vendorId === vendor._id) returns.push(row);
      }
    }
    returns.sort((a, b) => b.createdAt - a.createdAt);

    return {
      orderId: order._id,
      createdAt: order.createdAt,
      orderStatus: order.status,
      buyer: {
        name: order.name,
        email: order.email,
        phone: order.phone,
        address: order.address,
        city: order.city,
        pincode: order.pincode,
      },
      totalInr: items.reduce((sum, item) => sum + item.priceInr * item.quantity, 0),
      items: items.map(toOrderItemView),
      shipments: shipments
        .filter((row) => row.vendorId === vendor._id)
        .map(toShipmentView),
      returns: returns.map(toReturnView),
    };
  },
});

export const cancelLines = mutation({
  args: { orderItemIds: v.array(v.id("orderItems")) },
  returns: v.null(),
  handler: async (ctx, { orderItemIds }) => {
    const { user, vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    if (orderItemIds.length === 0) {
      throw appError("INVALID_INPUT", "Pick at least one line to cancel.");
    }

    let orderId: Id<"orders"> | null = null;
    for (const orderItemId of orderItemIds) {
      const item = await requireVendorOrderItem(ctx, vendor, orderItemId);
      if (lineStatusOf(item) !== "placed") {
        throw appError("CONFLICT", `"${item.name}" can only be cancelled while still placed.`);
      }
      if (!item.variantId) {
        throw appError("CONFLICT", `"${item.name}" has no variant to restock.`);
      }
      orderId = item.orderId;
      await ctx.db.patch(item._id, { lineStatus: "cancelled" });
      await adjustStock(ctx, vendor, item.variantId, item.quantity, "order_cancel", {
        orderItemId: item._id,
        actorUserId: user._id,
      });
    }
    if (orderId) await recomputeOrderStatus(ctx, orderId);
    return null;
  },
});

export const shipLines = mutation({
  args: {
    orderItemIds: v.array(v.id("orderItems")),
    carrier: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
  },
  returns: v.id("shipments"),
  handler: async (ctx, { orderItemIds, carrier, trackingNumber }) => {
    const { vendor } = await requireVendor(ctx);
    assertVendorWritable(vendor);
    if (orderItemIds.length === 0) {
      throw appError("INVALID_INPUT", "Pick at least one line to ship.");
    }

    const carrierClean = carrier?.trim().slice(0, 80) || undefined;
    const trackingClean = trackingNumber?.trim().slice(0, 80) || undefined;
    const now = Date.now();
    let orderId: Id<"orders"> | null = null;
    const shippedIds: Id<"orderItems">[] = [];

    for (const orderItemId of orderItemIds) {
      const item = await requireVendorOrderItem(ctx, vendor, orderItemId);
      if (lineStatusOf(item) !== "placed") {
        throw appError("CONFLICT", `"${item.name}" can only be shipped while still placed.`);
      }
      if (orderId && item.orderId !== orderId) {
        throw appError("INVALID_INPUT", "Ship lines from a single order at a time.");
      }
      orderId = item.orderId;
      await ctx.db.patch(item._id, { lineStatus: "shipped" });
      shippedIds.push(item._id);
    }

    if (!orderId) throw appError("INVALID_INPUT", "Pick at least one line to ship.");

    const shipmentId = await ctx.db.insert("shipments", {
      orderId,
      vendorId: vendor._id,
      orderItemIds: shippedIds,
      ...(carrierClean ? { carrier: carrierClean } : {}),
      ...(trackingClean ? { trackingNumber: trackingClean } : {}),
      status: "shipped",
      shippedAt: now,
      createdAt: now,
    });
    await recomputeOrderStatus(ctx, orderId);
    return shipmentId;
  },
});

export const markDelivered = mutation({
  args: { shipmentId: v.id("shipments") },
  returns: v.null(),
  handler: async (ctx, { shipmentId }) => {
    const { vendor } = await requireVendor(ctx);
    assertVendorWritable(vendor);
    const shipment = await ctx.db.get(shipmentId);
    if (!shipment || shipment.vendorId !== vendor._id) {
      throw appError("NOT_FOUND", "That shipment doesn't exist.");
    }
    if (shipment.status === "delivered") return null;
    if (shipment.status !== "shipped") {
      throw appError("CONFLICT", "Only shipped packages can be marked delivered.");
    }
    await ctx.db.patch(shipment._id, { status: "delivered" });
    return null;
  },
});

export const createReturn = mutation({
  args: {
    orderItemId: v.id("orderItems"),
    quantity: v.number(),
    reason: v.string(),
  },
  returns: v.id("returns"),
  handler: async (ctx, { orderItemId, quantity, reason }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const item = await requireVendorOrderItem(ctx, vendor, orderItemId);
    if (lineStatusOf(item) !== "shipped") {
      throw appError("CONFLICT", "Returns can only be opened on shipped lines.");
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity) {
      throw appError("INVALID_INPUT", `Return quantity must be between 1 and ${item.quantity}.`);
    }
    const cleanReason = reason.trim().slice(0, 200);
    if (cleanReason.length < 1) {
      throw appError("INVALID_INPUT", "Add a short reason for the return.");
    }

    const existing = await ctx.db
      .query("returns")
      .withIndex("by_orderItemId", (q) => q.eq("orderItemId", orderItemId))
      .take(20);
    const openQty = existing
      .filter((row) => row.status === "requested" || row.status === "accepted")
      .reduce((sum, row) => sum + row.quantity, 0);
    if (openQty + quantity > item.quantity) {
      throw appError("CONFLICT", "That would return more units than were shipped.");
    }

    return ctx.db.insert("returns", {
      orderId: item.orderId,
      orderItemId: item._id,
      vendorId: vendor._id,
      quantity,
      reason: cleanReason,
      status: "requested",
      restocked: false,
      createdAt: Date.now(),
    });
  },
});

export const resolveReturn = mutation({
  args: {
    returnId: v.id("returns"),
    status: v.union(v.literal("accepted"), v.literal("rejected")),
  },
  returns: v.null(),
  handler: async (ctx, { returnId, status }) => {
    const { user, vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const row = await ctx.db.get(returnId);
    if (!row || row.vendorId !== vendor._id) {
      throw appError("NOT_FOUND", "That return doesn't exist.");
    }
    if (row.status !== "requested") {
      throw appError("CONFLICT", "That return was already resolved.");
    }

    const item = await requireVendorOrderItem(ctx, vendor, row.orderItemId);
    const now = Date.now();

    if (status === "rejected") {
      await ctx.db.patch(row._id, { status: "rejected", resolvedAt: now });
      return null;
    }

    if (!item.variantId) {
      throw appError("CONFLICT", `"${item.name}" has no variant to restock.`);
    }
    if (lineStatusOf(item) !== "shipped" && lineStatusOf(item) !== "returned") {
      throw appError("CONFLICT", "Only shipped lines can be accepted as returns.");
    }

    await adjustStock(ctx, vendor, item.variantId, row.quantity, "return", {
      orderItemId: item._id,
      actorUserId: user._id,
    });

    const siblings = await ctx.db
      .query("returns")
      .withIndex("by_orderItemId", (q) => q.eq("orderItemId", item._id))
      .take(20);
    const totalAccepted =
      siblings
        .filter((sibling) => sibling.status === "accepted")
        .reduce((sum, sibling) => sum + sibling.quantity, 0) + row.quantity;
    const nextLine: OrderLineStatus =
      totalAccepted >= item.quantity ? "returned" : "shipped";
    await ctx.db.patch(item._id, { lineStatus: nextLine });
    await ctx.db.patch(row._id, {
      status: "accepted",
      restocked: true,
      resolvedAt: now,
    });
    await recomputeOrderStatus(ctx, item.orderId);
    return null;
  },
});

/** Convenience for tests / desk badges — unused open returns filtered by status. */
export const listOpenReturns = query({
  args: {},
  returns: v.array(vReturnView),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const rows = await ctx.db
      .query("returns")
      .withIndex("by_vendorId_and_status_and_createdAt", (q) =>
        q.eq("vendorId", vendor._id).eq("status", "requested"),
      )
      .order("desc")
      .take(100);
    return rows.map(toReturnView);
  },
});

export const listShipments = query({
  args: { orderId: v.optional(v.id("orders")) },
  returns: v.array(vShipmentView),
  handler: async (ctx, { orderId }) => {
    const { vendor } = await requireVendor(ctx);
    if (orderId) {
      const rows = await ctx.db
        .query("shipments")
        .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
        .take(50);
      return rows.filter((row) => row.vendorId === vendor._id).map(toShipmentView);
    }
    const rows = await ctx.db
      .query("shipments")
      .withIndex("by_vendorId_and_createdAt", (q) => q.eq("vendorId", vendor._id))
      .order("desc")
      .take(100);
    return rows.map(toShipmentView);
  },
});
