import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireUser } from "./lib/auth";
import { optionalEnv } from "./lib/env";
import { appError } from "./lib/errors";
import {
  createRefund,
  createRazorpayOrder,
  isRazorpayConfigured,
  publicKeyId,
  verifyPaymentSignature,
} from "./lib/razorpay";
import {
  expireOpenCheckoutIntents,
  fulfillCheckoutIntent,
  fulfillCheckoutIntentByRazorpayOrder,
  insertCheckoutIntent,
  placeOrder,
  prepareCheckout,
  toBuyerOrderDetail,
  listOrdersForUser,
} from "./model/orders";
import { vBuyerOrderDetail, vBuyerOrderListItem } from "./shared/products";

/**
 * Direct paid place-order for tests / ALLOW_DEV_SMOKE. Production UI uses
 * createCheckoutIntent + confirmCheckout with Razorpay Checkout.js.
 */
export const checkout = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    pincode: v.string(),
  },
  returns: v.object({
    orderId: v.id("orders"),
    droppedNames: v.array(v.string()),
  }),
  handler: async (ctx, input) => {
    const user = await requireUser(ctx);
    const allowSmoke = optionalEnv("ALLOW_DEV_SMOKE") === "1";
    if (isRazorpayConfigured() && !allowSmoke) {
      throw appError(
        "INVALID_INPUT",
        "Use Pay with Razorpay at checkout. Direct place-order is disabled when payments are configured.",
      );
    }
    return placeOrder(ctx, user, input);
  },
});

export const listMine = query({
  args: {},
  returns: v.array(vBuyerOrderListItem),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listOrdersForUser(ctx, user._id);
  },
});

export const getMine = query({
  args: { orderId: v.id("orders") },
  returns: vBuyerOrderDetail,
  handler: async (ctx, { orderId }) => {
    const user = await requireUser(ctx);
    const order = await ctx.db.get(orderId);
    if (!order || order.userId !== user._id) {
      throw appError("NOT_FOUND", "That order doesn't exist.");
    }
    return toBuyerOrderDetail(ctx, order);
  },
});

export const paymentsConfigured = query({
  args: {},
  returns: v.boolean(),
  handler: async () => isRazorpayConfigured(),
});

const vCheckoutLine = v.array(
  v.object({
    productId: v.id("products"),
    vendorId: v.id("vendors"),
    variantId: v.id("productVariants"),
    name: v.string(),
    sku: v.string(),
    size: v.optional(v.string()),
    colour: v.optional(v.string()),
    quantity: v.number(),
    priceInr: v.number(),
    commissionBps: v.number(),
  }),
);

const vCheckoutIntentResult = v.object({
  intentId: v.id("checkoutIntents"),
  razorpayOrderId: v.string(),
  amountInr: v.number(),
  keyId: v.string(),
  name: v.string(),
  email: v.string(),
  phone: v.string(),
});

const vConfirmCheckoutResult = v.object({
  orderId: v.id("orders"),
  droppedNames: v.array(v.string()),
});

/** Prepare cart snapshot + Razorpay order for Checkout.js. */
export const createCheckoutIntent = action({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    pincode: v.string(),
  },
  returns: vCheckoutIntentResult,
  handler: async (ctx, input): Promise<Infer<typeof vCheckoutIntentResult>> => {
    if (!isRazorpayConfigured()) {
      throw appError(
        "INVALID_INPUT",
        "Payments are not configured yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the Convex deployment.",
      );
    }
    const prepared: {
      userId: string;
      amountInr: number;
      receipt: string;
      lines: Infer<typeof vCheckoutLine>;
      droppedNames: string[];
    } = await ctx.runMutation(internal.orders.prepareCheckoutIntent, input);
    const rzOrder = await createRazorpayOrder({
      amountInr: prepared.amountInr,
      receipt: prepared.receipt,
      notes: { intentUserId: prepared.userId },
    });
    const intentId: Id<"checkoutIntents"> = await ctx.runMutation(
      internal.orders.saveCheckoutIntent,
      {
        ...input,
        razorpayOrderId: rzOrder.id,
        amountInr: prepared.amountInr,
        lines: prepared.lines,
        droppedNames: prepared.droppedNames,
      },
    );
    return {
      intentId,
      razorpayOrderId: rzOrder.id,
      amountInr: prepared.amountInr,
      keyId: publicKeyId(),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim(),
    };
  },
});

export const confirmCheckout = action({
  args: {
    intentId: v.id("checkoutIntents"),
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
  },
  returns: vConfirmCheckoutResult,
  handler: async (ctx, args): Promise<Infer<typeof vConfirmCheckoutResult>> => {
    const ok = await verifyPaymentSignature({
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId,
      razorpaySignature: args.razorpaySignature,
    });
    if (!ok) {
      throw appError("INVALID_INPUT", "Payment signature could not be verified.");
    }
    return await ctx.runMutation(internal.orders.fulfillPaidIntent, {
      intentId: args.intentId,
      razorpayPaymentId: args.razorpayPaymentId,
      razorpayOrderId: args.razorpayOrderId,
    });
  },
});

export const prepareCheckoutIntent = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    pincode: v.string(),
  },
  returns: v.object({
    userId: v.string(),
    amountInr: v.number(),
    receipt: v.string(),
    lines: vCheckoutLine,
    droppedNames: v.array(v.string()),
  }),
  handler: async (ctx, input) => {
    const user = await requireUser(ctx);
    const prepared = await prepareCheckout(ctx, user, input);
    return {
      userId: user._id,
      amountInr: prepared.amountInr,
      receipt: `ci_${user._id.slice(-8)}_${Date.now().toString(36)}`,
      lines: prepared.lines,
      droppedNames: prepared.droppedNames,
    };
  },
});

export const saveCheckoutIntent = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    pincode: v.string(),
    razorpayOrderId: v.string(),
    amountInr: v.number(),
    lines: vCheckoutLine,
    droppedNames: v.array(v.string()),
  },
  returns: v.id("checkoutIntents"),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return insertCheckoutIntent(ctx, user, {
      buyer: {
        name: args.name,
        email: args.email,
        phone: args.phone,
        address: args.address,
        city: args.city,
        pincode: args.pincode,
      },
      amountInr: args.amountInr,
      lines: args.lines,
      droppedNames: args.droppedNames,
      razorpayOrderId: args.razorpayOrderId,
    });
  },
});

export const fulfillPaidIntent = internalMutation({
  args: {
    intentId: v.id("checkoutIntents"),
    razorpayPaymentId: v.string(),
    razorpayOrderId: v.string(),
  },
  returns: vConfirmCheckoutResult,
  handler: async (ctx, { intentId, razorpayPaymentId, razorpayOrderId }) => {
    const intent = await ctx.db.get(intentId);
    if (!intent) throw appError("NOT_FOUND", "That checkout session expired.");
    if (intent.razorpayOrderId !== razorpayOrderId) {
      throw appError("INVALID_INPUT", "Payment does not match this checkout.");
    }
    const user = await requireUser(ctx);
    if (intent.userId !== user._id) {
      throw appError("FORBIDDEN", "That checkout belongs to another account.");
    }
    return fulfillCheckoutIntent(ctx, intentId, razorpayPaymentId);
  },
});

export const fulfillFromWebhook = internalMutation({
  args: {
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
  },
  returns: v.union(
    v.object({
      orderId: v.id("orders"),
      droppedNames: v.array(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, { razorpayOrderId, razorpayPaymentId }) => {
    return fulfillCheckoutIntentByRazorpayOrder(ctx, razorpayOrderId, razorpayPaymentId);
  },
});

export const expireIntents = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => expireOpenCheckoutIntents(ctx),
});

export const markOrderRefunded = internalMutation({
  args: {
    orderId: v.id("orders"),
  },
  returns: v.null(),
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order) return null;
    await ctx.db.patch(order._id, { paymentStatus: "refunded" });
    return null;
  },
});

export const getOrderForRefund = internalQuery({
  args: { orderId: v.id("orders") },
  returns: v.union(
    v.object({
      orderId: v.id("orders"),
      razorpayPaymentId: v.string(),
      paymentStatus: v.string(),
      totalInr: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { orderId }) => {
    const order = await ctx.db.get(orderId);
    if (!order?.razorpayPaymentId) return null;
    return {
      orderId: order._id,
      razorpayPaymentId: order.razorpayPaymentId,
      paymentStatus: order.paymentStatus ?? "paid",
      totalInr: order.totalInr,
    };
  },
});

/** Full refund of a paid Razorpay order (admin / system). */
export const refundOrder = action({
  args: {
    orderId: v.id("orders"),
    amountInr: v.optional(v.number()),
  },
  returns: v.object({
    refundId: v.string(),
  }),
  handler: async (ctx, { orderId, amountInr }) => {
    if (!isRazorpayConfigured()) {
      throw appError("INVALID_INPUT", "Payments are not configured.");
    }
    const order = await ctx.runQuery(internal.orders.getOrderForRefund, { orderId });
    if (!order) {
      throw appError("NOT_FOUND", "That order has no Razorpay payment to refund.");
    }
    if (order.paymentStatus === "refunded") {
      throw appError("CONFLICT", "That order was already refunded.");
    }
    const refund = await createRefund({
      paymentId: order.razorpayPaymentId,
      ...(amountInr !== undefined ? { amountInr } : {}),
      notes: { orderId },
    });
    await ctx.runMutation(internal.orders.markOrderRefunded, { orderId });
    return { refundId: refund.id };
  },
});
