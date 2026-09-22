/**
 * Typed access to `api.admin.*` while `convex/admin.ts` lands in parallel.
 * Runtime refs are the generated `api` object; types match Fitcheck's admin surface.
 */
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { JobStatus, JobType } from "@convex/shared/jobs";
import type { FunctionReference } from "convex/server";

export type AdminWindow = 1 | 7 | 30;

export type AdminOverview = {
  days: AdminWindow;
  users: number;
  newUsers: number;
  creditsSold: number;
  creditsGranted: number;
  creditsSpent: number;
  creditsRefunded: number;
  revenueUsd: number;
  cogsUsd: number;
  /** Fraction, not percent: 0.45 = 45%. */
  grossMargin: number;
  rendersDone: number;
  itemsExtracted: number;
  jobsFailed: number;
  jobsRunning: number;
  todayCreditsReserved: number;
  dailySpendCapUsd: number | null;
};

export type AdminJobRow = {
  job: {
    _id: Id<"jobs">;
    type: JobType;
    status: JobStatus;
    reservation: { plan: number; pack: number };
    refunds: { plan: number; pack: number };
    error?: string;
    createdAt: number;
  };
  userEmail?: string;
  userName?: string;
};

export type AdminSpenderRow = {
  userId: Id<"users">;
  email?: string;
  name?: string;
  plan: string;
  creditsSpent: number;
  cogsUsd: number;
};

type AdminModule = {
  overview: FunctionReference<"query", "public", { days: AdminWindow }, AdminOverview>;
  recentJobs: FunctionReference<
    "query",
    "public",
    { status?: "failed" | "partial" | "running"; limit?: number },
    AdminJobRow[]
  >;
  topSpenders: FunctionReference<
    "query",
    "public",
    { days: AdminWindow; limit?: number },
    { rows: AdminSpenderRow[]; truncated: boolean }
  >;
  retryJob: FunctionReference<"mutation", "public", { jobId: Id<"jobs"> }, Id<"jobs">>;
  refundJob: FunctionReference<
    "mutation",
    "public",
    { jobId: Id<"jobs">; amount?: number; note: string },
    { refunded: number }
  >;
  adjustCredits: FunctionReference<
    "mutation",
    "public",
    {
      userId: Id<"users">;
      delta: number;
      bucket: "plan" | "pack";
      note: string;
    },
    null
  >;
};

export const adminApi = (api as unknown as { admin: AdminModule }).admin;
