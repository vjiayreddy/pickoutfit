"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type Balance = FunctionReturnType<typeof api.credits.balance>;

export function useBalance(): { balance: Balance | undefined; isLow: boolean } {
  const { isAuthenticated } = useConvexAuth();
  const balance = useQuery(api.credits.balance, isAuthenticated ? {} : "skip");
  return { balance, isLow: balance?.lowBalance ?? false };
}
