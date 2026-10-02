import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";

/**
 * Deactivate a single offer when its endsAt has passed.
 * Scheduled from create/update; also safe to call from the hourly cron.
 */
export const expireOne = internalMutation({
  args: { discountId: v.id("discounts") },
  returns: v.null(),
  handler: async (ctx, { discountId }) => {
    await deactivateIfDue(ctx, discountId);
    return null;
  },
});

/** Hourly sweep for any active offers past endsAt. */
export const expireDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("discounts")
      .withIndex("by_active_and_endsAt", (q) => q.eq("active", true).lte("endsAt", now))
      .take(50);
    for (const row of due) {
      if (row.endsAt === undefined) continue;
      await ctx.db.patch(row._id, { active: false, updatedAt: now });
    }
    return null;
  },
});

export async function scheduleOfferExpiry(
  ctx: MutationCtx,
  discountId: Id<"discounts">,
  endsAt: number | undefined,
): Promise<void> {
  if (endsAt === undefined) return;
  const delay = endsAt - Date.now();
  if (delay <= 0) {
    await deactivateIfDue(ctx, discountId);
    return;
  }
  await ctx.scheduler.runAt(endsAt, internal.discountsExpire.expireOne, { discountId });
}

async function deactivateIfDue(ctx: MutationCtx, discountId: Id<"discounts">): Promise<void> {
  const discount = await ctx.db.get(discountId);
  if (!discount || !discount.active) return;
  if (discount.endsAt === undefined) return;
  if (Date.now() < discount.endsAt) return;
  await ctx.db.patch(discountId, { active: false, updatedAt: Date.now() });
}
