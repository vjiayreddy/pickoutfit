import { v } from "convex/values";

export const MAX_CATEGORY_DEPTH = 8;
/** Soft cap per store so one vendor cannot blow the table. */
export const MAX_CATEGORIES_PER_VENDOR = 500;

export const vCategoryDoc = v.object({
  _id: v.id("categories"),
  _creationTime: v.number(),
  vendorId: v.optional(v.id("vendors")),
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

const TOPWEAR_MEN: SeedCategoryNode = {
  name: "Topwear",
  slug: "topwear",
  children: [
    {
      name: "Shirts",
      slug: "shirts",
      children: [
        { name: "Formal", slug: "formal" },
        { name: "Casual", slug: "casual" },
        { name: "Printed", slug: "printed" },
      ],
    },
    { name: "T-Shirts", slug: "t-shirts" },
    { name: "Polos", slug: "polos" },
    { name: "Hoodies & Sweatshirts", slug: "hoodies-sweatshirts" },
    { name: "Sweaters & Knits", slug: "sweaters-knits" },
  ],
};

const BOTTOMWEAR_MEN: SeedCategoryNode = {
  name: "Bottomwear",
  slug: "bottomwear",
  children: [
    { name: "Jeans", slug: "jeans" },
    { name: "Trousers", slug: "trousers" },
    { name: "Shorts", slug: "shorts" },
  ],
};

const OUTERWEAR: SeedCategoryNode = {
  name: "Outerwear",
  slug: "outerwear",
  children: [
    { name: "Jackets", slug: "jackets" },
    { name: "Coats", slug: "coats" },
    { name: "Blazers", slug: "blazers" },
  ],
};

const ACCESSORIES_MEN: SeedCategoryNode = {
  name: "Accessories",
  slug: "accessories",
  children: [
    { name: "Footwear", slug: "shoes" },
    { name: "Eyewear", slug: "eyewear" },
    { name: "Belts", slug: "belts" },
    { name: "Watches", slug: "watches" },
  ],
};

const TOPWEAR_WOMEN: SeedCategoryNode = {
  name: "Topwear",
  slug: "topwear",
  children: [
    { name: "Tops & Blouses", slug: "tops-blouses" },
    { name: "T-Shirts", slug: "t-shirts" },
    { name: "Shirts", slug: "shirts" },
    { name: "Tunics", slug: "tunics" },
    { name: "Hoodies & Sweatshirts", slug: "hoodies-sweatshirts" },
    { name: "Sweaters & Cardigans", slug: "sweaters-cardigans" },
  ],
};

const BOTTOMWEAR_WOMEN: SeedCategoryNode = {
  name: "Bottomwear",
  slug: "bottomwear",
  children: [
    { name: "Jeans", slug: "jeans" },
    { name: "Trousers", slug: "trousers" },
    { name: "Skirts", slug: "skirts" },
    { name: "Shorts", slug: "shorts" },
  ],
};

const ACCESSORIES_WOMEN: SeedCategoryNode = {
  name: "Accessories",
  slug: "accessories",
  children: [
    { name: "Footwear", slug: "shoes" },
    { name: "Eyewear", slug: "eyewear" },
    { name: "Bags", slug: "bags" },
    { name: "Jewelry", slug: "jewelry" },
  ],
};

const TOPWEAR_KIDS: SeedCategoryNode = {
  name: "Topwear",
  slug: "topwear",
  children: [
    { name: "T-Shirts", slug: "t-shirts" },
    { name: "Shirts", slug: "shirts" },
    { name: "Hoodies & Sweatshirts", slug: "hoodies-sweatshirts" },
  ],
};

const BOTTOMWEAR_KIDS: SeedCategoryNode = {
  name: "Bottomwear",
  slug: "bottomwear",
  children: [
    { name: "Jeans", slug: "jeans" },
    { name: "Shorts", slug: "shorts" },
    { name: "Trousers", slug: "trousers" },
  ],
};

/** Default per-store catalog: Men / Women / Kids with wear-type branches. */
export const SEED_CATEGORY_TREE: SeedCategoryNode[] = [
  {
    name: "Men",
    slug: "men",
    children: [TOPWEAR_MEN, BOTTOMWEAR_MEN, OUTERWEAR, ACCESSORIES_MEN],
  },
  {
    name: "Women",
    slug: "women",
    children: [
      TOPWEAR_WOMEN,
      BOTTOMWEAR_WOMEN,
      OUTERWEAR,
      { name: "Dresses", slug: "dresses" },
      ACCESSORIES_WOMEN,
    ],
  },
  {
    name: "Kids",
    slug: "kids",
    children: [
      TOPWEAR_KIDS,
      BOTTOMWEAR_KIDS,
      {
        name: "Outerwear",
        slug: "outerwear",
        children: [{ name: "Jackets", slug: "jackets" }],
      },
      {
        name: "Accessories",
        slug: "accessories",
        children: [{ name: "Footwear", slug: "shoes" }],
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
  if (parts.includes("accessories") || parts.includes("bags") || parts.includes("jewelry")) {
    return "accessories";
  }
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
