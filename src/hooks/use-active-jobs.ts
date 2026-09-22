"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type JobView = NonNullable<FunctionReturnType<typeof api.jobs.get>>;

export function useJob(jobId: JobView["_id"] | null | undefined): JobView | null | undefined {
  return useQuery(api.jobs.get, jobId ? { jobId } : "skip");
}

export function useActiveJobs(): {
  jobs: FunctionReturnType<typeof api.jobs.listActive> | undefined;
  count: number;
} {
  const { isAuthenticated } = useConvexAuth();
  const jobs = useQuery(api.jobs.listActive, isAuthenticated ? {} : "skip");
  return { jobs, count: jobs?.length ?? 0 };
}
