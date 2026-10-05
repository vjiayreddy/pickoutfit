"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  findCategoryAncestry,
  legacyProductCategoryFromPath,
  productTypeFromCategoryPath,
  type CategoryTreeNode,
} from "@convex/shared/categories";
import type { ProductCategory } from "@convex/shared/products";
import { cn } from "@/lib/cn";

type Tree = FunctionReturnType<typeof api.categories.tree>;

export type CategoryPick = {
  categoryId: Id<"categories">;
  path: string;
  name: string;
  slug: string;
  legacyCategory: ProductCategory;
  /** Auto-derived PRODUCT_TYPES value from the path (leaf→root). */
  productTypeHint: string | null;
};

type Props = {
  value: Id<"categories"> | null;
  onChange: (pick: CategoryPick | null) => void;
};

function asTree(nodes: Tree): CategoryTreeNode[] {
  return nodes as CategoryTreeNode[];
}

export function CategoryTreePicker({ value, onChange }: Props) {
  const tree = useQuery(api.categories.tree, { activeOnly: true });
  const ensureSeeded = useMutation(api.categories.ensureSeeded);
  const seeded = useRef(false);

  useEffect(() => {
    if (seeded.current) return;
    if (tree === undefined) return;
    if (tree.length > 0) {
      seeded.current = true;
      return;
    }
    seeded.current = true;
    void ensureSeeded({});
  }, [tree, ensureSeeded]);

  const nodes = useMemo(() => (tree ? asTree(tree) : []), [tree]);
  const ancestry = useMemo(
    () => (value && nodes.length ? findCategoryAncestry(nodes, value) : null),
    [nodes, value],
  );

  /** Selected id at each depth; length grows as the user drills down. */
  const selectedIds = useMemo(() => {
    if (ancestry) return ancestry.map((node) => node._id as Id<"categories">);
    return [] as Id<"categories">[];
  }, [ancestry]);

  const levels = useMemo(() => {
    const out: CategoryTreeNode[][] = [];
    let current: CategoryTreeNode[] = nodes;
    out.push(current);
    for (const id of selectedIds) {
      const match = current.find((node) => node._id === id);
      if (!match || match.children.length === 0) break;
      current = match.children;
      out.push(current);
    }
    return out;
  }, [nodes, selectedIds]);

  function pickAtLevel(node: CategoryTreeNode) {
    const legacy = legacyProductCategoryFromPath(node.path);
    onChange({
      categoryId: node._id as Id<"categories">,
      path: node.path,
      name: node.name,
      slug: node.slug,
      legacyCategory: legacy,
      productTypeHint: productTypeFromCategoryPath(node.path, legacy),
    });
  }

  if (tree === undefined) {
    return <div className="h-24 animate-pulse rounded-md bg-soft-cloud" />;
  }

  if (nodes.length === 0) {
    return <p className="text-sm text-mute">Loading categories…</p>;
  }

  const breadcrumb = ancestry?.map((node) => node.name).join(" / ");

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Category</legend>
      {breadcrumb ? <p className="text-xs text-mute">{breadcrumb}</p> : null}
      <div className="space-y-3">
        {levels.map((options, levelIndex) => {
          const selected = selectedIds[levelIndex];
          return (
            <div key={levelIndex} className="flex flex-wrap gap-2">
              {options.map((node) => {
                const on = node._id === selected;
                return (
                  <button
                    key={node._id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => pickAtLevel(node)}
                    className={cn(
                      "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition active:scale-95 active:opacity-50",
                      on ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
                    )}
                  >
                    {node.name}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      {value && ancestry && ancestry[ancestry.length - 1]?.children.length ? (
        <p className="text-xs text-mute">Pick a more specific type below, or keep this level.</p>
      ) : null}
    </fieldset>
  );
}
