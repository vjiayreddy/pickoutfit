import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  CHECKOUT_INTENT_TTL_MS,
  type PaymentStatus,
} from "../shared/payments";
import {
  ORDER_SAMPLE_CAP,
  type OrderLineStatus,
  type OrderStatus,
  type ReturnStatus,
} from "../shared/products";
import {
  applyCouponsToCheckoutLines,
  clearCartCoupons,
  redeemCouponsOnOrder,
  type AppliedCouponSnapshot,
} from "./coupons";
import {
  isAutoOfferLive,
  loadLiveAutoOffers,
  pickOfferForProduct,
  pricedUnitInr,
} from "./offers";
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
    paymentStatus: order.paymentStatus ?? null,
    totalInr: order.totalInr,
    couponSavingsInr: order.couponSavingsInr ?? 0,
    coupons: (order.coupons ?? []).map((coupon) => ({
      discountId: coupon.discountId,
      vendorId: coupon.vendorId,
      name: coupon.name,
      code: coupon.code ?? null,
      amountInr: coupon.amountInr,
    })),
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
    paymentStatus: order.paymentStatus ?? null,
    totalInr: order.totalInr,
    couponSavingsInr: order.couponSavingsInr ?? 0,
    coupons: (order.coupons ?? []).map((coupon) => ({
      discountId: coupon.discountId,
      vendorId: coupon.vendorId,
      name: coupon.name,
      code: coupon.code ?? null,
      amountInr: coupon.amountInr,
    })),
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

export type CheckoutLineSnapshot = {
  productId: Id<"products">;
  vendorId: Id<"vendors">;
  variantId: Id<"productVariants">;
  name: string;
  sku: string;
  size?: string;
  colour?: string;
  quantity: number;
  priceInr: number;
  commissionBps: number;
};

export type PreparedCheckout = {
  buyer: CheckoutInput;
  amountInr: number;
  lines: CheckoutLineSnapshot[];
  droppedNames: string[];
  cartId: Id<"carts">;
  cartLineIds: Id<"cartItems">[];
  coupons: AppliedCouponSnapshot[];
  couponSavingsInr: number;
};

/** Validate cart + address and build a priced snapshot without reserving stock. */
export async function prepareCheckout(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: CheckoutInput,
): Promise<PreparedCheckout> {
  const buyer = cleanCheckout(input);
  const cart = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (!cart) throw appError("INVALID_INPUT", "Your bag is empty.");
  const lines = await cartLines(ctx, cart._id);
  if (lines.length === 0) throw appError("INVALID_INPUT", "Your bag is empty.");

  const kept: CheckoutLineSnapshot[] = [];
  const droppedNames: string[] = [];
  const cartLineIds: Id<"cartItems">[] = [];
  const cache: VendorCache = new Map();
  const now = Date.now();
  for (const line of lines) {
    cartLineIds.push(line._id);
    const { available, product, vendor, variant } = await resolveCartLine(ctx, line, cache);
    if (!available || !product || !vendor || !variant) {
      droppedNames.push(line.name);
      continue;
    }
    const priceInr = await pricedUnitInr(ctx, product, variant, now);
    kept.push({
      productId: product._id,
      vendorId: vendor._id,
      variantId: variant._id,
      name: line.name,
      sku: variant.sku,
      ...(variant.size ? { size: variant.size } : {}),
      ...(variant.colour ? { colour: variant.colour.name } : {}),
      quantity: line.quantity,
      priceInr,
      commissionBps: vendor.commissionBps,
    });
  }
  if (kept.length === 0) {
    throw appError(
      "INVALID_INPUT",
      droppedNames.length > 0
        ? `These products are no longer available: ${droppedNames.join(", ")}.`
        : "Your bag is empty.",
    );
  }

  const priced = await applyCouponsToCheckoutLines(ctx, user._id, cart._id, kept, now);
  const amountInr = priced.lines.reduce((sum, row) => sum + row.priceInr * row.quantity, 0);
  return {
    buyer,
    amountInr,
    lines: priced.lines as CheckoutLineSnapshot[],
    droppedNames,
    cartId: cart._id,
    cartLineIds,
    coupons: priced.coupons,
    couponSavingsInr: priced.couponSavingsInr,
  };
}

async function reserveCheckoutStock(
  ctx: MutationCtx,
  lines: CheckoutLineSnapshot[],
): Promise<void> {
  for (const line of lines) {
    const vendor = await ctx.db.get(line.vendorId);
    if (!vendor) throw appError("NOT_FOUND", "A store on this order no longer exists.");
    await adjustStock(ctx, vendor, line.variantId, -line.quantity, "order_reserve");
  }
}

async function releaseCheckoutStock(
  ctx: MutationCtx,
  lines: CheckoutLineSnapshot[],
): Promise<void> {
  for (const line of lines) {
    const vendor = await ctx.db.get(line.vendorId);
    if (!vendor) continue;
    const variant = await ctx.db.get(line.variantId);
    if (!variant || variant.vendorId !== vendor._id) continue;
    await adjustStock(ctx, vendor, line.variantId, line.quantity, "order_cancel");
  }
}

/** Bump usedCount once per auto offer that applied to any line on this order. */
async function recordAutoOfferUses(
  ctx: MutationCtx,
  lines: CheckoutLineSnapshot[],
  now: number,
): Promise<void> {
  const seen = new Set<Id<"discounts">>();
  for (const line of lines) {
    const product = await ctx.db.get(line.productId);
    if (!product?.vendorId) continue;
    const variant = await ctx.db.get(line.variantId);
    const baseList = variant?.priceInr ?? product.priceInr;
    const offers = await loadLiveAutoOffers(ctx, product.vendorId, now);
    const offer = await pickOfferForProduct(
      ctx,
      {
        _id: product._id,
        category: product.category,
        attributes: product.attributes,
      },
      offers,
      baseList,
    );
    if (!offer || seen.has(offer._id)) continue;
    seen.add(offer._id);
    const fresh = await ctx.db.get(offer._id);
    if (!fresh || !isAutoOfferLive(fresh, now)) continue;
    await ctx.db.patch(fresh._id, {
      usedCount: fresh.usedCount + 1,
      updatedAt: now,
    });
  }
}

export async function insertCheckoutIntent(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: {
    buyer: CheckoutInput;
    amountInr: number;
    lines: CheckoutLineSnapshot[];
    droppedNames: string[];
    razorpayOrderId: string;
    coupons?: AppliedCouponSnapshot[];
    couponSavingsInr?: number;
  },
) {
  // Hold stock before the shopper pays so capture cannot land on an empty shelf.
  // (Mutation rollback undoes the hold if insert fails.)
  await reserveCheckoutStock(ctx, args.lines);
  const now = Date.now();
  return ctx.db.insert("checkoutIntents", {
    userId: user._id,
    status: "open",
    razorpayOrderId: args.razorpayOrderId,
    amountInr: args.amountInr,
    ...args.buyer,
    lines: args.lines,
    ...(args.coupons && args.coupons.length > 0 ? { coupons: args.coupons } : {}),
    ...(args.couponSavingsInr ? { couponSavingsInr: args.couponSavingsInr } : {}),
    droppedNames: args.droppedNames,
    stockReserved: true,
    expiresAt: now + CHECKOUT_INTENT_TTL_MS,
    createdAt: now,
  });
}

async function writeOrderFromLines(
  ctx: MutationCtx,
  user: Doc<"users">,
  buyer: CheckoutInput,
  lines: CheckoutLineSnapshot[],
  payment: {
    paymentStatus: PaymentStatus;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    paidAt?: number;
  },
  coupons: AppliedCouponSnapshot[] = [],
  couponSavingsInr = 0,
  opts: { stockAlreadyReserved?: boolean } = {},
) {
  const now = Date.now();
  const totalInr = lines.reduce((sum, row) => sum + row.priceInr * row.quantity, 0);
  const orderId = await ctx.db.insert("orders", {
    userId: user._id,
    ...buyer,
    status: "placed",
    totalInr,
    ...(couponSavingsInr > 0 ? { couponSavingsInr } : {}),
    ...(coupons.length > 0 ? { coupons } : {}),
    paymentStatus: payment.paymentStatus,
    ...(payment.razorpayOrderId ? { razorpayOrderId: payment.razorpayOrderId } : {}),
    ...(payment.razorpayPaymentId ? { razorpayPaymentId: payment.razorpayPaymentId } : {}),
    ...(payment.paidAt !== undefined ? { paidAt: payment.paidAt } : {}),
    createdAt: now,
  });

  for (const line of lines) {
    const vendor = await ctx.db.get(line.vendorId);
    if (!vendor) throw appError("NOT_FOUND", "A store on this order no longer exists.");
    if (!opts.stockAlreadyReserved) {
      const variant = await ctx.db.get(line.variantId);
      if (!variant || variant.stock < line.quantity) {
        throw appError(
          "CONFLICT",
          `"${line.name}" is no longer available in the quantity you selected.`,
        );
      }
    }
    const orderItemId = await ctx.db.insert("orderItems", {
      orderId,
      productId: line.productId,
      vendorId: line.vendorId,
      variantId: line.variantId,
      name: line.name,
      sku: line.sku,
      ...(line.size ? { size: line.size } : {}),
      ...(line.colour ? { colour: line.colour } : {}),
      quantity: line.quantity,
      priceInr: line.priceInr,
      commissionBps: line.commissionBps,
      lineStatus: "placed",
      createdAt: now,
    });
    if (!opts.stockAlreadyReserved) {
      await adjustStock(ctx, vendor, line.variantId, -line.quantity, "order_reserve", {
        orderItemId,
      });
    }
  }
  await recordAutoOfferUses(ctx, lines, now);
  return orderId;
}

/** Fulfill a paid checkout intent: create order, reserve stock, clear cart. Idempotent. */
export async function fulfillCheckoutIntent(
  ctx: MutationCtx,
  intentId: Id<"checkoutIntents">,
  razorpayPaymentId: string,
) {
  const intent = await ctx.db.get(intentId);
  if (!intent) throw appError("NOT_FOUND", "That checkout session expired.");
  if (intent.status === "paid" && intent.orderId) {
    return { orderId: intent.orderId, droppedNames: intent.droppedNames };
  }
  if (intent.status !== "open") {
    throw appError("CONFLICT", "That checkout session is no longer open.");
  }
  if (Date.now() > intent.expiresAt) {
    await ctx.db.patch(intent._id, { status: "expired" });
    throw appError("CONFLICT", "That checkout session expired. Try again.");
  }

  const user = await ctx.db.get(intent.userId);
  if (!user) throw appError("UNAUTHENTICATED", "Sign in to continue.");

  const now = Date.now();
  const buyer: CheckoutInput = {
    name: intent.name,
    email: intent.email,
    phone: intent.phone,
    address: intent.address,
    city: intent.city,
    pincode: intent.pincode,
  };
  const coupons = intent.coupons ?? [];
  const couponSavingsInr = intent.couponSavingsInr ?? 0;
  // Legacy open intents (pre-hold) reserve now so capture cannot outrun stock.
  let stockAlreadyReserved = intent.stockReserved === true;
  if (!stockAlreadyReserved) {
    await reserveCheckoutStock(ctx, intent.lines);
    await ctx.db.patch(intent._id, { stockReserved: true });
    stockAlreadyReserved = true;
  }
  const orderId = await writeOrderFromLines(
    ctx,
    user,
    buyer,
    intent.lines,
    {
      paymentStatus: "paid",
      razorpayOrderId: intent.razorpayOrderId,
      razorpayPaymentId,
      paidAt: now,
    },
    coupons,
    couponSavingsInr,
    { stockAlreadyReserved },
  );

  if (coupons.length > 0) {
    await redeemCouponsOnOrder(ctx, { userId: user._id, orderId, coupons });
  }

  const cart = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (cart) {
    await clearCartCoupons(ctx, cart._id);
    const lines = await cartLines(ctx, cart._id);
    for (const line of lines) await ctx.db.delete(line._id);
    await ctx.db.delete(cart._id);
  }

  await ctx.db.patch(intent._id, {
    status: "paid",
    orderId,
    razorpayPaymentId,
    stockReserved: false,
  });
  return { orderId, droppedNames: intent.droppedNames };
}

export async function fulfillCheckoutIntentByRazorpayOrder(
  ctx: MutationCtx,
  razorpayOrderId: string,
  razorpayPaymentId: string,
) {
  const intent = await ctx.db
    .query("checkoutIntents")
    .withIndex("by_razorpayOrderId", (q) => q.eq("razorpayOrderId", razorpayOrderId))
    .unique();
  if (!intent) return null;
  return fulfillCheckoutIntent(ctx, intent._id, razorpayPaymentId);
}

/**
 * Direct paid checkout for tests / smoke. Production UI uses Razorpay intent + confirm.
 */
export async function placeOrder(ctx: MutationCtx, user: Doc<"users">, input: CheckoutInput) {
  const prepared = await prepareCheckout(ctx, user, input);
  const orderId = await writeOrderFromLines(
    ctx,
    user,
    prepared.buyer,
    prepared.lines,
    {
      paymentStatus: "paid",
      paidAt: Date.now(),
    },
    prepared.coupons,
    prepared.couponSavingsInr,
  );
  if (prepared.coupons.length > 0) {
    await redeemCouponsOnOrder(ctx, {
      userId: user._id,
      orderId,
      coupons: prepared.coupons,
    });
  }
  await clearCartCoupons(ctx, prepared.cartId);
  for (const lineId of prepared.cartLineIds) {
    const line = await ctx.db.get(lineId);
    if (line) await ctx.db.delete(line._id);
  }
  const cart = await ctx.db.get(prepared.cartId);
  if (cart) await ctx.db.delete(cart._id);
  return { orderId, droppedNames: prepared.droppedNames };
}

export async function expireOpenCheckoutIntents(ctx: MutationCtx) {
  const now = Date.now();
  const due = await ctx.db
    .query("checkoutIntents")
    .withIndex("by_status_and_expiresAt", (q) => q.eq("status", "open").lte("expiresAt", now))
    .take(50);
  for (const intent of due) {
    if (intent.stockReserved) {
      await releaseCheckoutStock(ctx, intent.lines);
    }
    await ctx.db.patch(intent._id, { status: "expired", stockReserved: false });
  }
  return due.length;
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
