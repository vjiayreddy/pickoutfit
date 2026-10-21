import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { requireVendor } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  createLinkedAccount,
  isRazorpayConfigured,
  payoutStatusFromLinkedAccount,
} from "./lib/razorpay";
import { listSettlementsForVendor } from "./model/settlements";
import { vSettlementStatus } from "./shared/payments";
import { vPayoutStatus } from "./shared/vendors";

const vSettlementView = v.object({
  id: v.id("vendorSettlements"),
  shipmentId: v.id("shipments"),
  orderId: v.id("orders"),
  grossInr: v.number(),
  commissionInr: v.number(),
  netInr: v.number(),
  status: vSettlementStatus,
  availableAt: v.number(),
  razorpayTransferId: v.union(v.string(), v.null()),
  failureReason: v.union(v.string(), v.null()),
  note: v.union(v.string(), v.null()),
  createdAt: v.number(),
  paidAt: v.union(v.number(), v.null()),
});

export const get = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    payoutStatus: vPayoutStatus,
    payoutAccountId: v.union(v.string(), v.null()),
    holdDays: v.number(),
    commissionBps: v.number(),
    settlements: v.array(vSettlementView),
    pendingInr: v.number(),
    paidInr: v.number(),
  }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const settlements = await listSettlementsForVendor(ctx, vendor._id, 50);
    let pendingInr = 0;
    let paidInr = 0;
    for (const row of settlements) {
      if (row.status === "pending" || row.status === "transferring") {
        pendingInr += row.netInr;
      } else if (row.status === "paid") {
        paidInr += row.netInr;
      }
    }
    const masked = vendor.payoutAccountId
      ? `${vendor.payoutAccountId.slice(0, 6)}…${vendor.payoutAccountId.slice(-4)}`
      : null;
    return {
      configured: isRazorpayConfigured(),
      payoutStatus: vendor.payoutStatus,
      payoutAccountId: masked,
      holdDays: vendor.holdDays,
      commissionBps: vendor.commissionBps,
      settlements,
      pendingInr,
      paidInr,
    };
  },
});

export const onboardingProfile = internalQuery({
  args: {},
  returns: v.object({
    vendorId: v.id("vendors"),
    name: v.string(),
    supportEmail: v.string(),
    supportPhone: v.union(v.string(), v.null()),
    legalName: v.union(v.string(), v.null()),
    pan: v.union(v.string(), v.null()),
    gstin: v.union(v.string(), v.null()),
    payoutStatus: vPayoutStatus,
  }),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    return {
      vendorId: vendor._id,
      name: vendor.name,
      supportEmail: vendor.supportEmail,
      supportPhone: vendor.supportPhone ?? null,
      legalName: vendor.legalName ?? null,
      pan: vendor.pan ?? null,
      gstin: vendor.gstin ?? null,
      payoutStatus: vendor.payoutStatus,
    };
  },
});

export const setPayoutAccount = internalMutation({
  args: {
    vendorId: v.id("vendors"),
    payoutAccountId: v.string(),
    payoutStatus: vPayoutStatus,
  },
  returns: v.null(),
  handler: async (ctx, { vendorId, payoutAccountId, payoutStatus }) => {
    await ctx.db.patch(vendorId, {
      payoutAccountId,
      payoutStatus,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setPayoutStatusByAccount = internalMutation({
  args: {
    payoutAccountId: v.string(),
    payoutStatus: vPayoutStatus,
  },
  returns: v.null(),
  handler: async (ctx, { payoutAccountId, payoutStatus }) => {
    const match = await ctx.db
      .query("vendors")
      .withIndex("by_payoutAccountId", (q) => q.eq("payoutAccountId", payoutAccountId))
      .unique();
    if (!match) return null;
    await ctx.db.patch(match._id, { payoutStatus, updatedAt: Date.now() });
    return null;
  },
});

export const startOnboarding = action({
  args: {
    accountNumber: v.string(),
    ifsc: v.string(),
    beneficiaryName: v.string(),
  },
  returns: v.object({
    payoutStatus: vPayoutStatus,
    payoutAccountId: v.string(),
  }),
  handler: async (ctx, args) => {
    if (!isRazorpayConfigured()) {
      throw appError(
        "INVALID_INPUT",
        "Payouts are not configured yet. Set Razorpay keys on the Convex deployment.",
      );
    }
    const profile = await ctx.runQuery(internal.vendorPayouts.onboardingProfile, {});
    if (profile.payoutStatus === "activated") {
      throw appError("CONFLICT", "Payouts are already linked for this store.");
    }
    const accountNumber = args.accountNumber.replace(/\s+/g, "");
    const ifsc = args.ifsc.trim().toUpperCase();
    const beneficiaryName = args.beneficiaryName.trim();
    if (!/^\d{9,18}$/.test(accountNumber)) {
      throw appError("INVALID_INPUT", "Enter a valid bank account number.");
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      throw appError("INVALID_INPUT", "Enter a valid IFSC code.");
    }
    if (beneficiaryName.length < 4 || beneficiaryName.length > 80) {
      throw appError("INVALID_INPUT", "Beneficiary name must be 4–80 characters.");
    }
    if (!profile.pan) {
      throw appError(
        "INVALID_INPUT",
        "Add PAN on Settings → store profile before linking a payout account.",
      );
    }

    const account = await createLinkedAccount({
      email: profile.supportEmail,
      phone: profile.supportPhone ?? "9999999999",
      legalBusinessName: profile.legalName ?? profile.name,
      contactName: beneficiaryName,
      accountNumber,
      ifsc,
      beneficiaryName,
      referenceId: `vendor_${profile.vendorId}`,
      pan: profile.pan,
      ...(profile.gstin ? { gstin: profile.gstin } : {}),
    });

    const payoutStatus = payoutStatusFromLinkedAccount(account);
    await ctx.runMutation(internal.vendorPayouts.setPayoutAccount, {
      vendorId: profile.vendorId,
      payoutAccountId: account.id,
      payoutStatus,
    });

    return { payoutAccountId: account.id, payoutStatus };
  },
});
