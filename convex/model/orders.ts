import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  ORDER_SAMPLE_CAP,
  type OrderLineStatus,
  type OrderStatus,
  type ReturnStatus,
} from "../shared/products";
import { pricedUnitInr } from "./offers";
import {
  adjustStock,
  cartLines,
  resolveCartLine,
  type VendorCache,
} from "./products";

type Ctx = QueryCtx | MutationCtx;

const ORDER_STATUSES: OrderStatus[] = ["placed", "fulfilled", "cancelled"];
const BUYER_ORDER_LIST_CAP = 50;
const PREVIEW_NAMES = 3;

export type TimelineEvent = {
  kind: "placed" | "shipped" | "delivered" | "return_requested" | "return_resolved";
  at: number;
  label: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  shipmentId: Id<"shipments"> | null;
  returnStatus: ReturnStatus | null;
};

function timelineEvent(
  partial: Pick<TimelineEvent, "kind" | "at"> & Partial<Omit<TimelineEvent, "kind" | "at">>,
): TimelineEvent {
  return {
    kind: partial.kind,
    at: partial.at,
    label: partial.label ?? null,
    carrier: partial.carrier ?? null,
    trackingNumber: partial.trackingNumber ?? null,
    shipmentId: partial.shipmentId ?? null,
    returnStatus: partial.returnStatus ?? null,
  };
}

export type CheckoutInput = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
};

export function cleanCheckout(input: CheckoutInput): CheckoutInput {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const address = input.address.trim();
  const city = input.city.trim();
  const pincode = input.pincode.trim();
  if (name.length < 1 || name.length > 80) {
    throw appError("INVALID_INPUT", "Name must be 1–80 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
    throw appError("INVALID_INPUT", "Enter a valid email.");
  }
  if (!/^[0-9+\-\s]{8,20}$/.test(phone)) {
    throw appError("INVALID_INPUT", "Enter a phone number.");
  }
  if (address.length < 1 || address.length > 200) {
    throw appError("INVALID_INPUT", "Address must be 1–200 characters.");
  }
  if (city.length < 1 || city.length > 80) {
    throw appError("INVALID_INPUT", "City must be 1–80 characters.");
  }
  if (!/^[0-9]{6}$/.test(pincode)) {
    throw appError("INVALID_INPUT", "PIN code must be 6 digits.");
  }
  return { name, email, phone, address, city, pincode };
}

export function lineStatusOf(item: Doc<"orderItems">): OrderLineStatus {
  return item.lineStatus ?? "placed";
}

export async function orderItemsFor(ctx: Ctx, orderId: Id<"orders">) {
  return ctx.db
    .query("orderItems")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .take(30);
}

export async function vendorOrderItems(
  ctx: Ctx,
  orderId: Id<"orders">,
  vendorId: Id<"vendors">,
) {
  const items = await orderItemsFor(ctx, orderId);
  return items.filter((item) => item.vendorId === vendorId);
}

/**
 * Derives the order header from line statuses:
 * - all cancelled → cancelled
 * - every non-cancelled line is shipped or returned → fulfilled
 * - otherwise → placed
 */
export function deriveOrderStatus(items: Doc<"orderItems">[]): OrderStatus {
  if (items.length === 0) return "cancelled";
  const statuses = items.map(lineStatusOf);
  if (statuses.every((status) => status === "cancelled")) return "cancelled";
  const open = statuses.filter((status) => status !== "cancelled");
  if (open.every((status) => status === "shipped" || status === "returned")) {
    return "fulfilled";
  }
  return "placed";
}

export async function recomputeOrderStatus(ctx: MutationCtx, orderId: Id<"orders">) {
  const order = await ctx.db.get(orderId);
  if (!order) throw appError("NOT_FOUND", "That order doesn't exist.");
  const items = await orderItemsFor(ctx, orderId);
  const status = deriveOrderStatus(items);
  if (order.status !== status) {
    await ctx.db.patch(order._id, { status });
  }
  return status;
}

export function toOrderItemView(item: Doc<"orderItems">) {
  return {
    id: item._id,
    productId: item.productId ?? null,
    vendorId: item.vendorId ?? null,
    variantId: item.variantId ?? null,
    name: item.name,
    sku: item.sku ?? null,
    size: item.size ?? null,
    colour: item.colour ?? null,
    quantity: item.quantity,
    priceInr: item.priceInr,
    lineStatus: item.lineStatus ?? null,
  };
}

export async function toOrderView(ctx: Ctx, order: Doc<"orders">) {
  const items = await orderItemsFor(ctx, order._id);
  return {
    id: order._id,
    name: order.name,
    email: order.email,
    phone: order.phone,
    address: order.address,
    city: order.city,
    pincode: order.pincode,
    status: order.status,
    totalInr: order.totalInr,
    createdAt: order.createdAt,
    items: items.map(toOrderItemView),
  };
}

export function toShipmentView(row: Doc<"shipments">) {
  return {
    id: row._id,
    orderId: row.orderId,
    orderItemIds: row.orderItemIds,
    carrier: row.carrier ?? null,
    trackingNumber: row.trackingNumber ?? null,
    status: row.status,
    shippedAt: row.shippedAt ?? null,
    deliveredAt: row.deliveredAt ?? null,
    createdAt: row.createdAt,
  };
}

export function toReturnView(row: Doc<"returns">) {
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

export async function shipmentsForOrder(ctx: Ctx, orderId: Id<"orders">) {
  return ctx.db
    .query("shipments")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .take(50);
}

export async function returnsForOrder(ctx: Ctx, orderId: Id<"orders">) {
  return ctx.db
    .query("returns")
    .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
    .take(50);
}

export function buildOrderTimeline(
  order: Doc<"orders">,
  shipments: Doc<"shipments">[],
  returns: Doc<"returns">[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    timelineEvent({ kind: "placed", at: order.createdAt, label: "Order placed" }),
  ];
  for (const shipment of shipments) {
    const shippedAt = shipment.shippedAt ?? shipment.createdAt;
    events.push(
      timelineEvent({
        kind: "shipped",
        at: shippedAt,
        label: "Shipped",
        carrier: shipment.carrier ?? null,
        trackingNumber: shipment.trackingNumber ?? null,
        shipmentId: shipment._id,
      }),
    );
    if (shipment.status === "delivered") {
      events.push(
        timelineEvent({
          kind: "delivered",
          at: shipment.deliveredAt ?? shippedAt,
          label: "Delivered",
          carrier: shipment.carrier ?? null,
          trackingNumber: shipment.trackingNumber ?? null,
          shipmentId: shipment._id,
        }),
      );
    }
  }
  for (const row of returns) {
    events.push(
      timelineEvent({
        kind: "return_requested",
        at: row.createdAt,
        label: "Return requested",
        returnStatus: row.status,
      }),
    );
    if (row.resolvedAt !== undefined) {
      events.push(
        timelineEvent({
          kind: "return_resolved",
          at: row.resolvedAt,
          label: row.status === "accepted" ? "Return accepted" : "Return rejected",
          returnStatus: row.status,
        }),
      );
    }
  }
  events.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
  return events;
}

export async function toBuyerOrderDetail(ctx: Ctx, order: Doc<"orders">) {
  const [items, shipments, returns] = await Promise.all([
    orderItemsFor(ctx, order._id),
    shipmentsForOrder(ctx, order._id),
    returnsForOrder(ctx, order._id),
  ]);
  return {
    id: order._id,
    name: order.name,
    email: order.email,
    phone: order.phone,
    address: order.address,
    city: order.city,
    pincode: order.pincode,
    status: order.status,
    totalInr: order.totalInr,
    createdAt: order.createdAt,
    items: items.map(toOrderItemView),
    shipments: shipments.map(toShipmentView),
    returns: returns.map(toReturnView),
    timeline: buildOrderTimeline(order, shipments, returns),
  };
}

export async function listOrdersForUser(ctx: QueryCtx, userId: Id<"users">) {
  const orders = await ctx.db
    .query("orders")
    .withIndex("by_userId_and_createdAt", (q) => q.eq("userId", userId))
    .order("desc")
    .take(BUYER_ORDER_LIST_CAP);
  const rows = [];
  for (const order of orders) {
    const items = await orderItemsFor(ctx, order._id);
    rows.push({
      id: order._id,
      createdAt: order.createdAt,
      status: order.status,
      totalInr: order.totalInr,
      itemCount: items.length,
      itemPreview: items.slice(0, PREVIEW_NAMES).map((item) => item.name),
    });
  }
  return rows;
}

export async function placeOrder(ctx: MutationCtx, user: Doc<"users">, input: CheckoutInput) {
  const buyer = cleanCheckout(input);
  const cart = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!cart) throw appError("INVALID_INPUT", "Your bag is empty.");
  const lines = await cartLines(ctx, cart._id);
  if (lines.length === 0) throw appError("INVALID_INPUT", "Your bag is empty.");

  type Kept = {
    line: Doc<"cartItems">;
    product: Doc<"products">;
    vendor: Doc<"vendors">;
    variant: Doc<"productVariants">;
    priceInr: number;
  };
  const kept: Kept[] = [];
  const droppedNames: string[] = [];
  const cache: VendorCache = new Map();
  const now = Date.now();
  for (const line of lines) {
    const { available, product, vendor, variant } = await resolveCartLine(ctx, line, cache);
    if (!available || !product || !vendor || !variant) {
      droppedNames.push(line.name);
      await ctx.db.delete(line._id);
      continue;
    }
    const priceInr = await pricedUnitInr(ctx, product, variant, now);
    kept.push({ line, product, vendor, variant, priceInr });
  }
  if (kept.length === 0) {
    throw appError(
      "INVALID_INPUT",
      droppedNames.length > 0
        ? `These products are no longer available: ${droppedNames.join(", ")}.`
        : "Your bag is empty.",
    );
  }

  const totalInr = kept.reduce((sum, row) => sum + row.priceInr * row.line.quantity, 0);
  const orderId = await ctx.db.insert("orders", {
    userId: user._id,
    ...buyer,
    status: "placed",
    totalInr,
    createdAt: now,
  });

  for (const { line, vendor, variant, priceInr } of kept) {
    const orderItemId = await ctx.db.insert("orderItems", {
      orderId,
      productId: line.productId,
      vendorId: vendor._id,
      variantId: variant._id,
      name: line.name,
      sku: variant.sku,
      ...(variant.size ? { size: variant.size } : {}),
      ...(variant.colour ? { colour: variant.colour.name } : {}),
      quantity: line.quantity,
      priceInr,
      lineStatus: "placed",
      createdAt: now,
    });
    await adjustStock(ctx, vendor, variant._id, -line.quantity, "order_reserve", {
      orderItemId,
    });
    await ctx.db.delete(line._id);
  }
  await ctx.db.delete(cart._id);
  return { orderId, droppedNames };
}

export async function listOrders(ctx: QueryCtx) {
  const orders = await ctx.db.query("orders").withIndex("by_createdAt").order("desc").take(100);
  return Promise.all(orders.map((order) => toOrderView(ctx, order)));
}

export async function salesSummary(ctx: QueryCtx) {
  const counts = { placed: 0, fulfilled: 0, cancelled: 0 };
  let bookedInr = 0;
  let bookedCount = 0;
  let truncated = false;
  for (const status of ORDER_STATUSES) {
    const rows = await ctx.db
      .query("orders")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", status))
      .order("desc")
      .take(ORDER_SAMPLE_CAP);
    if (rows.length === ORDER_SAMPLE_CAP) truncated = true;
    counts[status] = rows.length;
    if (status !== "cancelled") {
      bookedCount += rows.length;
      bookedInr += rows.reduce((sum, row) => sum + row.totalInr, 0);
    }
  }
  return { counts, bookedInr, bookedCount, truncated, sampleCap: ORDER_SAMPLE_CAP };
}

export async function setOrderStatus(
  ctx: MutationCtx,
  orderId: Id<"orders">,
  status: OrderStatus,
) {
  const order = await ctx.db.get(orderId);
  if (!order) throw appError("NOT_FOUND", "That order doesn't exist.");
  await ctx.db.patch(order._id, { status });
}
