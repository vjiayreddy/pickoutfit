"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Category, ItemStatus } from "@convex/shared/wardrobe";

export type Item = FunctionReturnType<typeof api.items.list>[number];

export type WardrobeQuery = {
  query?: string;
  status?: ItemStatus;
  category?: Category;
};

/** Thin wardrobe list for stylist surfaces (no search debounce). */
export function useWardrobe({ status, category }: WardrobeQuery = {}): {
  items: Item[] | undefined;
} {
  const { isAuthenticated } = useConvexAuth();
  const items = useQuery(
    api.items.list,
    isAuthenticated ? { status, category } : "skip",
  );
  return { items };
}
