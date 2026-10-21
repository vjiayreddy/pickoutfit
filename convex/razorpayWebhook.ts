import { v } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, internalMutation } from "./_generated/server";
import { optionalEnv } from "./lib/env";
import { verifyWebhookSignature } from "./lib/razorpay";
import { fulfillCheckoutIntentByRazorpayOrder } from "./model/orders";
import { VENDOR_PLANS, isVendorPlanId, type VendorPlanId } from "./shared/vendors";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const httpHandler = httpAction(async (ctx, request) => {
  if (!optionalEnv("RAZORPAY_WEBHOOK_SECRET")) {
    return new Response("Webhook not configured", { status: 503 });
  }
  const rawBody = await request.text();
  const signature = request.headers.get("X-Razorpay-Signature") ?? "";
  const ok = await verifyWebhookSignature(rawBody, signature);
  if (!ok) return new Response("Invalid signature", { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const root = asRecord(payload);
  const event = asString(root?.event);
  const payloadObj = asRecord(root?.payload);
  if (!event || !payloadObj) return new Response("ok", { status: 200 });

  await ctx.runMutation(internal.razorpayWebhook.dispatch, {
    event,
    payloadJson: rawBody,
  });

  return new Response("ok", { status: 200 });
});

export const dispatch = internalMutation({
  args: {
    event: v.string(),
    payloadJson: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { event, payloadJson }) => {
    const root = asRecord(JSON.parse(payloadJson));
    const payload = asRecord(root?.payload);
    if (!payload) return null;

    if (event === "payment.captured") {
      const paymentEntity = asRecord(asRecord(payload.payment)?.entity);
      const orderId = asString(paymentEntity?.order_id);
      const paymentId = asString(paymentEntity?.id);
      if (orderId && paymentId) {
        await fulfillCheckoutIntentByRazorpayOrder(ctx, orderId, paymentId);
      }
      return null;
    }

    if (
      event === "account.activated" ||
      event === "account.instantly_activated" ||
      event === "account.activated_kyc_pending" ||
      event === "account.rejected" ||
      event === "account.needs_clarification"
    ) {
      const accountEntity = asRecord(asRecord(payload.account)?.entity);
      const accountId = asString(accountEntity?.id);
      if (accountId) {
        const status =
          event === "account.activated" || event === "account.instantly_activated"
            ? ("activated" as const)
            : event === "account.rejected"
              ? ("rejected" as const)
              : ("pending" as const);
        const match = await ctx.db
          .query("vendors")
          .withIndex("by_payoutAccountId", (q) => q.eq("payoutAccountId", accountId))
          .unique();
        if (match) {
          await ctx.db.patch(match._id, { payoutStatus: status, updatedAt: Date.now() });
        }
      }
      return null;
    }

    if (event === "transfer.processed" || event === "transfer.failed") {
      const transferEntity = asRecord(asRecord(payload.transfer)?.entity);
      const transferId = asString(transferEntity?.id);
      if (transferId) {
        const row = await ctx.db
          .query("vendorSettlements")
          .withIndex("by_razorpayTransferId", (q) => q.eq("razorpayTransferId", transferId))
          .unique();
        if (row) {
          if (event === "transfer.processed") {
            await ctx.db.patch(row._id, { status: "paid", paidAt: Date.now() });
          } else {
            const err = asRecord(transferEntity?.error);
            await ctx.db.patch(row._id, {
              status: "failed",
              failureReason: (asString(err?.description) ?? "Transfer failed.").slice(0, 200),
            });
          }
        }
      }
      return null;
    }

    if (
      event === "subscription.charged" ||
      event === "subscription.activated" ||
      event === "subscription.pending" ||
      event === "subscription.halted" ||
      event === "subscription.cancelled" ||
      event === "subscription.completed"
    ) {
      const subEntity = asRecord(asRecord(payload.subscription)?.entity);
      const subscriptionId = asString(subEntity?.id);
      if (!subscriptionId) return null;
      const notes = asRecord(subEntity?.notes);
      const planNote = asString(notes?.plan);
      const plan: VendorPlanId | undefined =
        planNote && isVendorPlanId(planNote) ? planNote : undefined;
      const currentEnd = asNumber(subEntity?.current_end);

      let planStatus: "active" | "past_due" | "cancelled" = "active";
      if (event === "subscription.halted" || event === "subscription.pending") {
        planStatus = "past_due";
      } else if (event === "subscription.cancelled" || event === "subscription.completed") {
        planStatus = "cancelled";
      }

      const vendor = await ctx.db
        .query("vendors")
        .withIndex("by_razorpaySubscriptionId", (q) =>
          q.eq("razorpaySubscriptionId", subscriptionId),
        )
        .unique();
      if (vendor) {
        const nextPlan = plan ?? vendor.plan;
        await ctx.db.patch(vendor._id, {
          plan: nextPlan,
          planStatus,
          commissionBps: VENDOR_PLANS[nextPlan].commissionBps,
          ...(currentEnd !== null ? { planPeriodEnd: currentEnd * 1000 } : {}),
          updatedAt: Date.now(),
        });
      }
      return null;
    }

    return null;
  },
});
