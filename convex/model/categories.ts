import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  categorySlug,
  joinCategoryPath,
  MAX_CATEGORIES,
  MAX_CATEGORY_DEPTH,
  SEED_CATEGORY_TREE,
  type SeedCategoryNode,
} from "../shared/categories";

type Ctx = QueryCtx | MutationCtx;

export type CategoryTreeNode = {
  _id: Id<"categories">;
  name: string;
  slug: string;
  parentId: Id<"categories"> | null;
  path: string;
  sortOrder: number;
  isActive: boolean;
  children: CategoryTreeNode[];
};

async function listAllCategories(ctx: Ctx): Promise<Doc<"categories">[]> {
  return ctx.db.query("categories").withIndex("by_path").take(MAX_CATEGORIES);
}

export async function listChildren(
  ctx: Ctx,
  parentId: Id<"categories"> | undefined,
  opts: { activeOnly?: boolean } = {},
): Promise<Doc<"categories">[]> {
  const rows = parentId
    ? await ctx.db
        .query("categories")
        .withIndex("by_parentId", (q) => q.eq("parentId", parentId))
        .take(MAX_CATEGORIES)
    : (await listAllCategories(ctx)).filter((row) => row.parentId === undefined);
  const filtered = opts.activeOnly ? rows.filter((row) => row.isActive) : rows;
  return filtered.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export type CategoryListRow = Doc<"categories"> & {
  parentName: string | null;
  childCount: number;
  depth: number;
  imageUrl: string | null;
};

/** Flat list ordered by path for management tables. */
export async function listCategories(
  ctx: Ctx,
  opts: { activeOnly?: boolean } = {},
): Promise<CategoryListRow[]> {
  const rows = await listAllCategories(ctx);
  const filtered = opts.activeOnly ? rows.filter((row) => row.isActive) : rows;
  const byId = new Map(filtered.map((row) => [row._id, row]));
  const childCounts = new Map<Id<"categories">, number>();
  for (const row of filtered) {
    if (!row.parentId) continue;
    childCounts.set(row.parentId, (childCounts.get(row.parentId) ?? 0) + 1);
  }
  const sorted = filtered
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path) || a.sortOrder - b.sortOrder);
  return Promise.all(
    sorted.map(async (row) => ({
      ...row,
      parentName: row.parentId ? (byId.get(row.parentId)?.name ?? null) : null,
      childCount: childCounts.get(row._id) ?? 0,
      depth: row.path.split("/").length - 1,
      imageUrl: row.imageStorageId ? await ctx.storage.getUrl(row.imageStorageId) : null,
    })),
  );
}

export async function getTree(
  ctx: Ctx,
  opts: { activeOnly?: boolean } = {},
): Promise<CategoryTreeNode[]> {
  const rows = await listAllCategories(ctx);
  const filtered = opts.activeOnly ? rows.filter((row) => row.isActive) : rows;
  const byParent = new Map<string | undefined, Doc<"categories">[]>();
  for (const row of filtered) {
    const key = row.parentId;
    const list = byParent.get(key) ?? [];
    list.push(row);
    byParent.set(key, list);
  }
  const build = (parentId: Id<"categories"> | undefined): CategoryTreeNode[] => {
    const children = (byParent.get(parentId) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    return children.map((row) => ({
      _id: row._id,
      name: row.name,
      slug: row.slug,
      parentId: row.parentId ?? null,
      path: row.path,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      children: build(row._id),
    }));
  };
  return build(undefined);
}

async function assertUniqueSlug(
  ctx: Ctx,
  parentId: Id<"categories"> | undefined,
  slug: string,
  excludeId?: Id<"categories">,
): Promise<void> {
  const siblings = parentId
    ? await ctx.db
        .query("categories")
        .withIndex("by_parentId_and_slug", (q) => q.eq("parentId", parentId).eq("slug", slug))
        .take(2)
    : (await listChildren(ctx, undefined)).filter((row) => row.slug === slug);
  if (siblings.some((row) => row._id !== excludeId)) {
    throw appError("CONFLICT", "A category with that slug already exists under this parent.");
  }
}

async function depthOf(ctx: Ctx, categoryId: Id<"categories"> | undefined): Promise<number> {
  let depth = 0;
  let current = categoryId;
  while (current) {
    depth += 1;
    if (depth > MAX_CATEGORY_DEPTH) {
      throw appError("INVALID_INPUT", `Categories can be at most ${MAX_CATEGORY_DEPTH} levels deep.`);
    }
    const row = await ctx.db.get(current);
    if (!row) throw appError("NOT_FOUND", "Parent category not found.");
    current = row.parentId;
  }
  return depth;
}

async function collectDescendantIds(
  ctx: Ctx,
  rootId: Id<"categories">,
): Promise<Id<"categories">[]> {
  const out: Id<"categories">[] = [];
  const queue: Id<"categories">[] = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const children = await listChildren(ctx, id);
    for (const child of children) {
      out.push(child._id);
      queue.push(child._id);
    }
  }
  return out;
}

export async function createCategory(
  ctx: MutationCtx,
  args: {
    name: string;
    slug?: string;
    parentId?: Id<"categories">;
    imageStorageId?: Id<"_storage">;
    sortOrder?: number;
    isActive?: boolean;
  },
): Promise<Id<"categories">> {
  const name = args.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw appError("INVALID_INPUT", "Category name must be 1–80 characters.");
  }
  const slug = categorySlug(args.slug?.trim() || name);
  if (!slug) throw appError("INVALID_INPUT", "Category slug is required.");

  let parentPath: string | undefined;
  if (args.parentId) {
    const parent = await ctx.db.get(args.parentId);
    if (!parent) throw appError("NOT_FOUND", "Parent category not found.");
    parentPath = parent.path;
    const depth = await depthOf(ctx, args.parentId);
    if (depth >= MAX_CATEGORY_DEPTH) {
      throw appError("INVALID_INPUT", `Categories can be at most ${MAX_CATEGORY_DEPTH} levels deep.`);
    }
  }

  await assertUniqueSlug(ctx, args.parentId, slug);

  const existing = await listAllCategories(ctx);
  if (existing.length >= MAX_CATEGORIES) {
    throw appError("RATE_LIMITED", `At most ${MAX_CATEGORIES} categories are allowed.`);
  }

  const siblings = await listChildren(ctx, args.parentId);
  const sortOrder = args.sortOrder ?? siblings.length;
  const now = Date.now();
  const path = joinCategoryPath(parentPath, slug);
  const id = await ctx.db.insert("categories", {
    name,
    slug,
    ...(args.parentId ? { parentId: args.parentId } : {}),
    path,
    ...(args.imageStorageId ? { imageStorageId: args.imageStorageId } : {}),
    sortOrder,
    isActive: args.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  });

  // Indexes are not unique constraints — reject a racing duplicate path.
  const samePath = await ctx.db
    .query("categories")
    .withIndex("by_path", (q) => q.eq("path", path))
    .take(2);
  if (samePath.length > 1) {
    await ctx.db.delete(id);
    throw appError("CONFLICT", "A category with that path already exists.");
  }

  return id;
}

export async function updateCategory(
  ctx: MutationCtx,
  args: {
    categoryId: Id<"categories">;
    name?: string;
    slug?: string;
    parentId?: Id<"categories"> | null;
    /** Pass `null` to clear. Omit to leave unchanged. */
    imageStorageId?: Id<"_storage"> | null;
    sortOrder?: number;
    isActive?: boolean;
  },
): Promise<void> {
  const row = await ctx.db.get(args.categoryId);
  if (!row) throw appError("NOT_FOUND", "Category not found.");

  const name = args.name !== undefined ? args.name.trim() : row.name;
  if (name.length < 1 || name.length > 80) {
    throw appError("INVALID_INPUT", "Category name must be 1–80 characters.");
  }

  const nextParentId =
    args.parentId === undefined ? row.parentId : args.parentId === null ? undefined : args.parentId;
  if (nextParentId === args.categoryId) {
    throw appError("INVALID_INPUT", "A category cannot be its own parent.");
  }

  const slug = categorySlug(args.slug?.trim() || (args.name !== undefined ? name : row.slug));
  if (!slug) throw appError("INVALID_INPUT", "Category slug is required.");

  let parentPath: string | undefined;
  if (nextParentId) {
    const parent = await ctx.db.get(nextParentId);
    if (!parent) throw appError("NOT_FOUND", "Parent category not found.");
    if (parent.path === row.path || parent.path.startsWith(`${row.path}/`)) {
      throw appError("INVALID_INPUT", "Cannot move a category under its own descendant.");
    }
    parentPath = parent.path;
    const parentDepth = await depthOf(ctx, nextParentId);
    const subtreeDepth = await subtreeDepthFrom(ctx, args.categoryId);
    if (parentDepth + subtreeDepth > MAX_CATEGORY_DEPTH) {
      throw appError(
        "INVALID_INPUT",
        `Categories can be at most ${MAX_CATEGORY_DEPTH} levels deep.`,
      );
    }
  }

  if (slug !== row.slug || nextParentId !== row.parentId) {
    await assertUniqueSlug(ctx, nextParentId, slug, args.categoryId);
  }

  const nextPath = joinCategoryPath(parentPath, slug);
  const now = Date.now();
  const nextImageId =
    args.imageStorageId === undefined
      ? row.imageStorageId
      : args.imageStorageId === null
        ? undefined
        : args.imageStorageId;
  if (
    args.imageStorageId !== undefined &&
    row.imageStorageId &&
    row.imageStorageId !== nextImageId
  ) {
    await ctx.storage.delete(row.imageStorageId);
  }

  await ctx.db.patch(args.categoryId, {
    name,
    slug,
    parentId: nextParentId,
    path: nextPath,
    imageStorageId: nextImageId,
    ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
    ...(args.isActive !== undefined ? { isActive: args.isActive } : {}),
    updatedAt: now,
  });

  if (nextPath !== row.path) {
    const descendantIds = await collectDescendantIds(ctx, args.categoryId);
    for (const id of descendantIds) {
      const child = await ctx.db.get(id);
      if (!child) continue;
      const suffix = child.path.slice(row.path.length);
      await ctx.db.patch(id, { path: `${nextPath}${suffix}`, updatedAt: now });
    }
  }
}

async function subtreeDepthFrom(ctx: Ctx, rootId: Id<"categories">): Promise<number> {
  let max = 1;
  const walk = async (id: Id<"categories">, depth: number) => {
    max = Math.max(max, depth);
    const children = await listChildren(ctx, id);
    for (const child of children) await walk(child._id, depth + 1);
  };
  await walk(rootId, 1);
  return max;
}

export async function removeCategory(
  ctx: MutationCtx,
  categoryId: Id<"categories">,
): Promise<void> {
  const row = await ctx.db.get(categoryId);
  if (!row) throw appError("NOT_FOUND", "Category not found.");

  const children = await listChildren(ctx, categoryId);
  if (children.length > 0) {
    throw appError("CONFLICT", "Remove or reassign child categories first.");
  }

  const products = await ctx.db
    .query("products")
    .withIndex("by_categoryId", (q) => q.eq("categoryId", categoryId))
    .take(1);
  if (products.length > 0) {
    throw appError("CONFLICT", "Reassign products in this category before removing it.");
  }

  if (row.imageStorageId) await ctx.storage.delete(row.imageStorageId);
  await ctx.db.delete(categoryId);
}

async function insertSeedNode(
  ctx: MutationCtx,
  node: SeedCategoryNode,
  parentId: Id<"categories"> | undefined,
  parentPath: string | undefined,
  sortOrder: number,
): Promise<number> {
  const existing = parentId
    ? await ctx.db
        .query("categories")
        .withIndex("by_parentId_and_slug", (q) =>
          q.eq("parentId", parentId).eq("slug", node.slug),
        )
        .unique()
    : (await listChildren(ctx, undefined)).find((row) => row.slug === node.slug);

  let id: Id<"categories">;
  let path: string;
  if (existing) {
    id = existing._id;
    path = existing.path;
  } else {
    const now = Date.now();
    path = joinCategoryPath(parentPath, node.slug);
    id = await ctx.db.insert("categories", {
      name: node.name,
      slug: node.slug,
      ...(parentId ? { parentId } : {}),
      path,
      sortOrder,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  let created = existing ? 0 : 1;
  for (const [index, child] of (node.children ?? []).entries()) {
    created += await insertSeedNode(ctx, child, id, path, index);
  }
  return created;
}

/** Idempotent seed of the default Clothes → Men tree. Returns how many new rows were inserted. */
export async function seedCategories(ctx: MutationCtx): Promise<{ created: number }> {
  let created = 0;
  for (const [index, node] of SEED_CATEGORY_TREE.entries()) {
    created += await insertSeedNode(ctx, node, undefined, undefined, index);
  }
  return { created };
}
