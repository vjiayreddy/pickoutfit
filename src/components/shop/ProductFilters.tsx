"use client";

import { useQuery } from "convex/react";
import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { CategoryTreeNode } from "@convex/shared/categories";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/cn";

function findNodeByPath(nodes: CategoryTreeNode[], path: string): CategoryTreeNode | null {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  for (const node of nodes) {
    if (node.path === normalized) return node;
    const nested = findNodeByPath(node.children, normalized);
    if (nested) return nested;
  }
  return null;
}

function findCategoryIdByPath(nodes: CategoryTreeNode[], path: string): Id<"categories"> | undefined {
  const node = findNodeByPath(nodes, path);
  return node ? (node._id as Id<"categories">) : undefined;
}

/** Ancestors from root → selected (inclusive), for breadcrumb drill-down. */
function ancestryByPath(nodes: CategoryTreeNode[], path: string): CategoryTreeNode[] {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  if (!normalized) return [];
  for (const node of nodes) {
    if (node.path === normalized) return [node];
    if (normalized.startsWith(`${node.path}/`)) {
      return [node, ...ancestryByPath(node.children, normalized)];
    }
  }
  return [];
}

export type ProductFiltersProps = {
  vendorId: Id<"vendors">;
  categoryPath: string;
  attributeIds: string[];
  onCategoryPathChange: (path: string) => void;
  onAttributeIdsChange: (ids: string[]) => void;
  /** Hide the "Filters" heading (e.g. when a sheet already has a title). */
  hideTitle?: boolean;
};

export function ProductFilters({
  vendorId,
  categoryPath,
  attributeIds,
  onCategoryPathChange,
  onAttributeIdsChange,
  hideTitle = false,
}: ProductFiltersProps) {
  const treeQuery = useQuery(api.categories.tree, { vendorId, activeOnly: true });
  const tree = useMemo(
    () => (treeQuery ? (treeQuery as CategoryTreeNode[]) : []),
    [treeQuery],
  );
  const categoryId = categoryPath ? findCategoryIdByPath(tree, categoryPath) : undefined;
  const facets = useQuery(api.variants.facets, {
    vendorId,
    categoryId,
  });

  const ancestry = useMemo(
    () => (categoryPath ? ancestryByPath(tree, categoryPath) : []),
    [tree, categoryPath],
  );
  const selectedNode = ancestry[ancestry.length - 1] ?? null;
  const childOptions = selectedNode ? selectedNode.children : tree;

  const hasFilters = Boolean(categoryPath) || attributeIds.length > 0;
  const selectedAttrs = useMemo(() => new Set(attributeIds), [attributeIds]);

  function selectCategory(path: string) {
    onCategoryPathChange(path);
    if (attributeIds.length > 0) onAttributeIdsChange([]);
  }

  function toggleAttr(id: string) {
    if (selectedAttrs.has(id)) {
      onAttributeIdsChange(attributeIds.filter((item) => item !== id));
      return;
    }
    onAttributeIdsChange([...attributeIds, id]);
  }

  function clearAll() {
    onCategoryPathChange("");
    onAttributeIdsChange([]);
  }

  if (treeQuery === undefined) {
    return <div className="h-24 animate-pulse bg-soft-cloud" aria-hidden />;
  }

  const showCategories = tree.length > 0;
  const showFacets = (facets?.length ?? 0) > 0;
  if (!showCategories && !showFacets && !hasFilters) return null;

  return (
    <div className="space-y-0" aria-label="Product filters">
      {hideTitle && !hasFilters ? null : (
        <div className="flex items-center justify-between gap-2 border-b border-hairline pb-3">
          {hideTitle ? <span /> : <p className="text-sm font-medium text-ink">Filters</p>}
          {hasFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-mute underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>
      )}

      {showCategories ? (
        <section className="space-y-3 border-b border-hairline py-4">
          <p className="text-sm font-medium text-ink">Category</p>
          {ancestry.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1 text-xs text-mute">
              <button
                type="button"
                onClick={() => selectCategory("")}
                className="font-medium text-ink underline-offset-2 hover:underline"
              >
                All
              </button>
              {ancestry.map((node) => (
                <span key={node._id} className="inline-flex items-center gap-1">
                  <span aria-hidden>/</span>
                  <button
                    type="button"
                    onClick={() => selectCategory(node.path)}
                    className={cn(
                      "font-medium underline-offset-2 hover:underline",
                      node.path === categoryPath ? "text-ink" : "text-mute",
                    )}
                  >
                    {node.name}
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          <ul className="space-y-1">
            {!categoryPath ? (
              <li>
                <FilterRow active label="All" onClick={() => selectCategory("")} />
              </li>
            ) : null}
            {childOptions.map((node) => (
              <li key={node._id}>
                <FilterRow
                  active={categoryPath === node.path}
                  onClick={() => selectCategory(node.path)}
                  label={node.name}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {facets === undefined ? (
        <div className="h-24 animate-pulse bg-soft-cloud" aria-hidden />
      ) : showFacets ? (
        <ul>
          {facets.map((type) => (
            <li key={type._id} className="space-y-3 border-b border-hairline py-4 last:border-b-0">
              <p className="text-sm font-medium text-ink">{type.displayLabel || type.label}</p>
              <div className="flex flex-wrap gap-2">
                {type.values.map((value) => (
                  <FilterChip
                    key={value._id}
                    active={selectedAttrs.has(value._id)}
                    onClick={() => toggleAttr(value._id)}
                    label={value.label}
                    swatch={value.hex}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type ProductFilterLayoutProps = ProductFiltersProps & {
  children: ReactNode;
  /** Extra classes on the outer flex row. */
  className?: string;
  /** Padding for the mobile filter trigger row. */
  mobileBarClassName?: string;
};

/** Desktop left rail + mobile filter sheet wrapping the product grid. */
export function ProductFilterLayout({
  children,
  className,
  mobileBarClassName,
  ...filterProps
}: ProductFilterLayoutProps) {
  const [open, setOpen] = useState(false);
  const activeCount =
    (filterProps.categoryPath ? 1 : 0) + filterProps.attributeIds.length;

  return (
    <div className={cn("flex min-h-0 flex-1", className)}>
      <aside className="hidden w-56 shrink-0 border-r border-hairline md:block lg:w-60">
        <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto px-4 py-4 md:pl-4 md:pr-5">
          <ProductFilters {...filterProps} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:pl-6">
        <div className={cn("shrink-0 md:hidden", mobileBarClassName ?? "mb-4")}>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={<Button variant="secondary" size="sm" className="gap-2" />}
            >
              <SlidersHorizontal className="size-4" />
              Filters
              {activeCount > 0 ? (
                <span className="tabular-nums text-mute">({activeCount})</span>
              ) : null}
            </SheetTrigger>
            <SheetContent side="left" className="w-[85vw] max-w-sm gap-0 overflow-y-auto p-0">
              <SheetHeader className="border-b border-hairline">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6">
                <ProductFilters {...filterProps} hideTitle />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        {children}
      </div>
    </div>
  );
}

function FilterRow({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center px-0 py-2 text-left text-sm font-medium transition",
        active ? "text-ink underline underline-offset-4" : "text-mute hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  swatch,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  swatch?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs font-medium",
        active ? "bg-ink text-canvas" : "bg-canvas text-ink ring-1 ring-inset ring-hairline",
      )}
    >
      {swatch ? (
        <span
          className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-hairline"
          style={{ backgroundColor: swatch }}
          aria-hidden
        />
      ) : null}
      {label}
    </button>
  );
}
