import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { ORDER_SAMPLE_CAP, type OrderStatus } from "../shared/products";
import { cartLines } from "./products";

type Ctx = QueryCtx | MutationCtx;

const ORDER_STATUSES: OrderStatus[] = ["placed", "fulfilled", "cancelled"];

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

export async function toOrderView(ctx: Ctx, order: Doc<"orders">) {
  const items = await ctx.db
    .query("orderItems")
    .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
    .take(30);
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
    items: items.map((item) => ({
      id: item._id,
      productId: item.productId ?? null,
      name: item.name,
      quantity: item.quantity,
      priceInr: item.priceInr,
    })),
  };
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

  const kept: Doc<"cartItems">[] = [];
  const droppedNames: string[] = [];
  for (const line of lines) {
    const product = await ctx.db.get(line.productId);
    if (!product || !product.active) {
      droppedNames.push(line.name);
      await ctx.db.delete(line._id);
      continue;
    }
    kept.push(line);
  }
  if (kept.length === 0) {
    throw appError(
      "INVALID_INPUT",
      droppedNames.length > 0
        ? `These products are no longer available: ${droppedNames.join(", ")}.`
        : "Your bag is empty.",
    );
  }

  const totalInr = kept.reduce((sum, line) => sum + line.priceInr * line.quantity, 0);
  const orderId = await ctx.db.insert("orders", {
    userId: user._id,
    ...buyer,
    status: "placed",
    totalInr,
    createdAt: Date.now(),
  });
  for (const line of kept) {
    await ctx.db.insert("orderItems", {
      orderId,
      productId: line.productId,
      name: line.name,
      quantity: line.quantity,
      priceInr: line.priceInr,
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
