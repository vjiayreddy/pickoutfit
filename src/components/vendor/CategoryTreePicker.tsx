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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const LEVEL_LABELS = ["Department", "Category", "Type", "Style"] as const;

function asTree(nodes: Tree): CategoryTreeNode[] {
  return nodes as CategoryTreeNode[];
}

function levelLabel(index: number): string {
  return LEVEL_LABELS[index] ?? `Level ${index + 1}`;
}

function levelPlaceholder(index: number): string {
  return `Select ${levelLabel(index).toLowerCase()}`;
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
  const canGoDeeper = Boolean(value && ancestry && ancestry[ancestry.length - 1]?.children.length);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Category</p>
        {breadcrumb ? <p className="text-xs text-mute">{breadcrumb}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {levels.map((options, levelIndex) => {
          const selected = selectedIds[levelIndex] ?? null;
          const selectedName = options.find((item) => item._id === selected)?.name;
          return (
            <Field key={levelIndex}>
              <FieldLabel>{levelLabel(levelIndex)}</FieldLabel>
              <Select
                value={selected}
                onValueChange={(next) => {
                  if (!next) return;
                  const node = options.find((item) => item._id === next);
                  if (node) pickAtLevel(node);
                }}
              >
                <SelectTrigger className="h-10 w-full rounded-full border-transparent bg-muted px-4 shadow-none">
                  <SelectValue placeholder={levelPlaceholder(levelIndex)}>
                    {selectedName}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  {options.map((node) => (
                    <SelectItem key={node._id} value={node._id}>
                      {node.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          );
        })}
      </div>
      {canGoDeeper ? (
        <FieldDescription>Pick a more specific type below, or keep this level.</FieldDescription>
      ) : null}
    </div>
  );
}
