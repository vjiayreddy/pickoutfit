"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  legacyProductCategoryFromPath,
  productTypeFromCategoryPath,
  type CategoryTreeNode,
} from "@convex/shared/categories";
import type { ProductCategory } from "@convex/shared/products";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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

type FlatCategory = {
  id: Id<"categories">;
  name: string;
  slug: string;
  path: string;
  /** Display breadcrumb, e.g. Men → Topwear → Shirts → Formal */
  label: string;
};

function asTree(nodes: Tree): CategoryTreeNode[] {
  return nodes as CategoryTreeNode[];
}

/** Depth-first flatten: every node is selectable, labeled with ancestor chain. */
function flattenCategories(nodes: CategoryTreeNode[], ancestors: string[] = []): FlatCategory[] {
  const out: FlatCategory[] = [];
  for (const node of nodes) {
    const chain = [...ancestors, node.name];
    out.push({
      id: node._id as Id<"categories">,
      name: node.name,
      slug: node.slug,
      path: node.path,
      label: chain.join(" → "),
    });
    if (node.children.length > 0) {
      out.push(...flattenCategories(node.children, chain));
    }
  }
  return out;
}

export function CategoryTreePicker({ value, onChange }: Props) {
  const tree = useQuery(api.categories.tree, { activeOnly: true });
  const ensureSeeded = useMutation(api.categories.ensureSeeded);
  const seeded = useRef(false);
  const [inputValue, setInputValue] = useState("");

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

  const flat = useMemo(() => (tree ? flattenCategories(asTree(tree)) : []), [tree]);

  const selected = useMemo(
    () => (value ? (flat.find((row) => row.id === value) ?? null) : null),
    [flat, value],
  );

  const options = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter(
      (row) =>
        row.label.toLowerCase().includes(q) ||
        row.path.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q),
    );
  }, [flat, inputValue]);

  function pick(row: FlatCategory) {
    const legacy = legacyProductCategoryFromPath(row.path);
    onChange({
      categoryId: row.id,
      path: row.path,
      name: row.name,
      slug: row.slug,
      legacyCategory: legacy,
      productTypeHint: productTypeFromCategoryPath(row.path, legacy),
    });
    setInputValue("");
  }

  if (tree === undefined) {
    return <div className="h-16 animate-pulse rounded-md bg-soft-cloud" />;
  }

  if (flat.length === 0) {
    return <p className="text-sm text-mute">Loading categories…</p>;
  }

  return (
    <Field>
      <FieldLabel>Category</FieldLabel>
      <Combobox
        items={options}
        value={selected}
        onValueChange={(next) => {
          if (!next) {
            onChange(null);
            setInputValue("");
            return;
          }
          pick(next);
        }}
        inputValue={selected && !inputValue ? selected.label : inputValue}
        onInputValueChange={(next) => {
          setInputValue(next);
          if (selected && next !== selected.label) {
            onChange(null);
          }
        }}
        itemToStringLabel={(item) => item.label}
        isItemEqualToValue={(a, b) => a.id === b.id}
        autoHighlight
      >
        <ComboboxInput
          className={cn(
            "h-10! w-full rounded-full! border-transparent! bg-muted shadow-none",
            "has-[[data-slot=input-group-control]:focus-visible]:border-foreground",
            "has-[[data-slot=input-group-control]:focus-visible]:bg-background",
            "has-[[data-slot=input-group-control]:focus-visible]:ring-2",
            "has-[[data-slot=input-group-control]:focus-visible]:ring-muted",
          )}
          placeholder="Search categories…"
          showClear={Boolean(selected || inputValue)}
        />
        <ComboboxContent className="rounded-none">
          <ComboboxEmpty>No categories match.</ComboboxEmpty>
          <ComboboxList>
            {(item: FlatCategory) => (
              <ComboboxItem key={item.id} value={item} className="rounded-none py-2">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{item.label}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {item.path}
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {selected ? (
        <FieldDescription>
          Path: <span className="font-medium text-foreground">{selected.path}</span>
        </FieldDescription>
      ) : (
        <FieldDescription>
          Pick one category. Path is saved as slug segments, e.g. men/topwear/shirts/casual.
        </FieldDescription>
      )}
    </Field>
  );
}
