import { v } from "convex/values";

export const MAX_CATEGORY_DEPTH = 8;
export const MAX_CATEGORIES = 500;

export const vCategoryDoc = v.object({
  _id: v.id("categories"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  parentId: v.optional(v.id("categories")),
  path: v.string(),
  imageStorageId: v.optional(v.id("_storage")),
  sortOrder: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** Tree node; `children` is recursive so validated as any at the leaves. */
export const vCategoryTreeNode = v.object({
  _id: v.id("categories"),
  name: v.string(),
  slug: v.string(),
  parentId: v.union(v.id("categories"), v.null()),
  path: v.string(),
  sortOrder: v.number(),
  isActive: v.boolean(),
  children: v.array(v.any()),
});

export type SeedCategoryNode = {
  name: string;
  slug: string;
  children?: SeedCategoryNode[];
};

/** Default Clothes → Men hierarchy from the product plan. */
export const SEED_CATEGORY_TREE: SeedCategoryNode[] = [
  {
    name: "Clothes",
    slug: "clothes",
    children: [
      {
        name: "Men",
        slug: "men",
        children: [
          {
            name: "Accessories",
            slug: "accessories",
            children: [
              { name: "Shoes", slug: "shoes" },
              { name: "Eyewear", slug: "eyewear" },
              { name: "Perfumes", slug: "perfumes" },
            ],
          },
          {
            name: "Shirt",
            slug: "shirt",
            children: [
              { name: "Formal", slug: "formal" },
              { name: "Casual", slug: "casual" },
            ],
          },
        ],
      },
    ],
  },
];

export function categorySlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function joinCategoryPath(parentPath: string | undefined, slug: string): string {
  return parentPath ? `${parentPath}/${slug}` : slug;
}

export type CategoryTreeNode = {
  _id: string;
  name: string;
  slug: string;
  parentId: string | null;
  path: string;
  sortOrder: number;
  isActive: boolean;
  children: CategoryTreeNode[];
};

/** Map a nested path onto the legacy flat product category enum. */
export function legacyProductCategoryFromPath(
  path: string,
): "clothes" | "accessories" | "skincare" | "hair_color" | "eyewear" {
  const parts = path.split("/");
  if (parts.includes("skincare")) return "skincare";
  if (parts.includes("hair_color") || parts.includes("hair-color")) return "hair_color";
  if (parts.includes("eyewear")) return "eyewear";
  // Shoes use the clothes productType list even though they sit under Accessories in the tree.
  if (parts.includes("shoes")) return "clothes";
  if (parts.includes("accessories") || parts.includes("perfumes")) return "accessories";
  return "clothes";
}

/** Ancestor chain from root to the node with `id`, or null if missing. */
export function findCategoryAncestry(
  tree: CategoryTreeNode[],
  id: string,
): CategoryTreeNode[] | null {
  for (const node of tree) {
    if (node._id === id) return [node];
    const nested = findCategoryAncestry(node.children, id);
    if (nested) return [node, ...nested];
  }
  return null;
}
