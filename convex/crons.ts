import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** Close time-boxed offers whose endsAt has passed (backup for scheduled expireOne). */
crons.interval("expire due discounts", { hours: 1 }, internal.discountsExpire.expireDue, {});

export default crons;
