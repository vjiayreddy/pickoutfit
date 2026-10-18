import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { createTransfer, isRazorpayConfigured } from "./lib/razorpay";
import {
  listDueSettlements,
  markSettlementFailed,
  markSettlementPaid,
  markSettlementTransferring,
  settlementByTransferId,
} from "./model/settlements";

export const processDue = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (!isRazorpayConfigured()) return 0;
    const due = await ctx.runMutation(internal.vendorSettlements.claimDue, {});
    let processed = 0;
    for (const row of due) {
      try {
        const transfer = await createTransfer({
          account: row.payoutAccountId,
          amountInr: row.netInr,
          notes: {
            settlementId: row.settlementId,
            orderId: row.orderId,
            shipmentId: row.shipmentId,
          },
        });
        await ctx.runMutation(internal.vendorSettlements.markTransferring, {
          settlementId: row.settlementId,
          transferId: transfer.id,
        });
        if (transfer.status === "processed" || transfer.status === "paid") {
          await ctx.runMutation(internal.vendorSettlements.markPaid, {
            settlementId: row.settlementId,
            transferId: transfer.id,
          });
        }
        processed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Transfer failed.";
        await ctx.runMutation(internal.vendorSettlements.markFailed, {
          settlementId: row.settlementId,
          reason: message,
        });
      }
    }
    return processed;
  },
});

export const claimDue = internalMutation({
  args: {},
  returns: v.array(
    v.object({
      settlementId: v.id("vendorSettlements"),
      payoutAccountId: v.string(),
      netInr: v.number(),
      orderId: v.string(),
      shipmentId: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const due = await listDueSettlements(ctx, Date.now(), 20);
    const out: Array<{
      settlementId: (typeof due)[number]["_id"];
      payoutAccountId: string;
      netInr: number;
      orderId: string;
      shipmentId: string;
    }> = [];
    for (const row of due) {
      const vendor = await ctx.db.get(row.vendorId);
      if (!vendor?.payoutAccountId || vendor.payoutStatus !== "activated") {
        await markSettlementFailed(ctx, row._id, "Vendor payout account not activated.");
        continue;
      }
      out.push({
        settlementId: row._id,
        payoutAccountId: vendor.payoutAccountId,
        netInr: row.netInr,
        orderId: row.orderId,
        shipmentId: row.shipmentId,
      });
    }
    return out;
  },
});

export const markTransferring = internalMutation({
  args: {
    settlementId: v.id("vendorSettlements"),
    transferId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { settlementId, transferId }) => {
    await markSettlementTransferring(ctx, settlementId, transferId);
    return null;
  },
});

export const markPaid = internalMutation({
  args: {
    settlementId: v.id("vendorSettlements"),
    transferId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { settlementId, transferId }) => {
    await markSettlementPaid(ctx, settlementId, transferId);
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    settlementId: v.id("vendorSettlements"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { settlementId, reason }) => {
    await markSettlementFailed(ctx, settlementId, reason);
    return null;
  },
});

export const reconcileTransfer = internalMutation({
  args: {
    transferId: v.string(),
    status: v.union(v.literal("paid"), v.literal("failed")),
    failureReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { transferId, status, failureReason }) => {
    const row = await settlementByTransferId(ctx, transferId);
    if (!row) return null;
    if (status === "paid") {
      await markSettlementPaid(ctx, row._id, transferId);
    } else {
      await markSettlementFailed(ctx, row._id, failureReason ?? "Transfer failed.");
    }
    return null;
  },
});
