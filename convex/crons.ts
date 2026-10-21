import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** Close time-boxed offers whose endsAt has passed (backup for scheduled expireOne). */
crons.interval("expire due discounts", { hours: 1 }, internal.discountsExpire.expireDue, {});

/** Drop unpaid Razorpay checkout intents past their TTL. */
crons.interval("expire checkout intents", { minutes: 15 }, internal.orders.expireIntents, {});

/** Transfer due vendor settlements after delivery hold. */
crons.interval(
  "process vendor settlements",
  { hours: 24 },
  internal.vendorSettlements.processDue,
  {},
);

/** Retry settlements claimed for transfer but never given a Razorpay id. */
crons.interval(
  "reclaim stuck vendor settlements",
  { hours: 1 },
  internal.vendorSettlements.reclaimStuck,
  {},
);

/** Cancel past_due vendor plans after grace days. */
crons.interval("expire past due vendor plans", { hours: 24 }, internal.vendorBilling.expirePastDue, {});

export default crons;
