import { v } from "convex/values";
import { vColours, vPresentation } from "./validators";

export const PRODUCT_CATEGORIES = [
  "clothes",
  "accessories",
  "skincare",
  "hair_color",
  "eyewear",
] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const ORDER_STATUSES = ["placed", "fulfilled", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Draft rows are only visible to the vendor; archived rows keep order history intact. */
export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_SOURCES = ["manual", "extracted"] as const;
export type ProductSource = (typeof PRODUCT_SOURCES)[number];

export const PRODUCT_IMAGE_KINDS = ["studio", "cutout", "reference", "model"] as const;
export type ProductImageKind = (typeof PRODUCT_IMAGE_KINDS)[number];

export const INVENTORY_REASONS = [
  "manual",
  "order_reserve",
  "order_cancel",
  "return",
  "adjustment",
] as const;
export type InventoryReason = (typeof INVENTORY_REASONS)[number];

export const DISCOUNT_KINDS = ["percent", "flat"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

export const DISCOUNT_SCOPES = ["all", "category", "collection", "products"] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];

export const PRODUCT_SKU_PREFIX: Record<ProductCategory, string> = {
  clothes: "CL",
  accessories: "AC",
  skincare: "SK",
  hair_color: "HC",
  eyewear: "EW",
};

/** Category prefix plus a catalog-wide sequence, e.g. CL-0001. */
export function formatProductSku(category: ProductCategory, sequence: number): string {
  return `${PRODUCT_SKU_PREFIX[category]}-${String(sequence).padStart(4, "0")}`;
}

export const AGE_GROUPS = ["adult", "child", "all"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  adult: "Adult",
  child: "Child",
  all: "All ages",
};

export const OCCASIONS = ["casual", "work", "formal", "sport"] as const;
export type Occasion = (typeof OCCASIONS)[number];

export const OCCASION_LABELS: Record<Occasion, string> = {
  casual: "Casual",
  work: "Work",
  formal: "Formal",
  sport: "Sport",
};

const CLOTHES_TYPES = [
  "t-shirt",
  "shirt",
  "polo",
  "knit",
  "hoodie",
  "jacket",
  "coat",
  "suit",
  "blazer",
  "dress",
  "skirt",
  "trouser",
  "jeans",
  "shorts",
  "shoes",
  "other",
] as const;

const ACCESSORY_TYPES = ["bag", "belt", "hat", "jewelry", "scarf", "watch", "other"] as const;
const SKINCARE_TYPES = ["cleanser", "serum", "moisturiser", "sunscreen", "toner", "mask", "other"] as const;
const HAIR_COLOR_TYPES = ["dye", "bleach", "toner", "other"] as const;
const EYEWEAR_TYPES = ["glasses", "sunglasses", "other"] as const;

export const PRODUCT_TYPES: Record<ProductCategory, readonly string[]> = {
  clothes: CLOTHES_TYPES,
  accessories: ACCESSORY_TYPES,
  skincare: SKINCARE_TYPES,
  hair_color: HAIR_COLOR_TYPES,
  eyewear: EYEWEAR_TYPES,
};

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  "t-shirt": "T-shirt",
  shirt: "Shirt",
  polo: "Polo",
  knit: "Knit",
  hoodie: "Hoodie",
  jacket: "Jacket",
  coat: "Coat",
  suit: "Suit",
  blazer: "Blazer",
  dress: "Dress",
  skirt: "Skirt",
  trouser: "Trouser",
  jeans: "Jeans",
  shorts: "Shorts",
  shoes: "Shoes",
  bag: "Bag",
  belt: "Belt",
  hat: "Hat",
  jewelry: "Jewelry",
  scarf: "Scarf",
  watch: "Watch",
  cleanser: "Cleanser",
  serum: "Serum",
  moisturiser: "Moisturiser",
  sunscreen: "Sunscreen",
  toner: "Toner",
  mask: "Mask",
  dye: "Dye",
  bleach: "Bleach",
  glasses: "Glasses",
  sunglasses: "Sunglasses",
  other: "Other",
};

export function productTypesFor(category: ProductCategory): readonly string[] {
  return PRODUCT_TYPES[category];
}

export function isProductType(category: ProductCategory, value: string): boolean {
  return (PRODUCT_TYPES[category] as readonly string[]).includes(value);
}

export function productTypeLabel(value: string): string {
  return PRODUCT_TYPE_LABELS[value] ?? value;
}

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  clothes: "Clothes",
  accessories: "Accessories",
  skincare: "Skincare",
  hair_color: "Hair color",
  eyewear: "Eyewear",
};

/** Service route id → catalog category. Hair and makeup have no catalog yet. */
const SERVICE_PRODUCT_CATEGORY: Record<string, ProductCategory> = {
  wardrobe: "clothes",
  skincare: "skincare",
  "hair-color": "hair_color",
  eyewear: "eyewear",
};

export function categoryForService(serviceId: string): ProductCategory | null {
  return SERVICE_PRODUCT_CATEGORY[serviceId] ?? null;
}

export const vAgeGroup = v.union(
  v.literal("adult"),
  v.literal("child"),
  v.literal("all"),
);

export const vOccasion = v.union(
  v.literal("casual"),
  v.literal("work"),
  v.literal("formal"),
  v.literal("sport"),
);

export const vProductCategory = v.union(
  v.literal("clothes"),
  v.literal("accessories"),
  v.literal("skincare"),
  v.literal("hair_color"),
  v.literal("eyewear"),
);

export const vOrderStatus = v.union(
  v.literal("placed"),
  v.literal("fulfilled"),
  v.literal("cancelled"),
);

export const vProductStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("archived"),
);

export const vProductSource = v.union(v.literal("manual"), v.literal("extracted"));

export const vProductImageKind = v.union(
  v.literal("studio"),
  v.literal("cutout"),
  v.literal("reference"),
  v.literal("model"),
);

export const vInventoryReason = v.union(
  v.literal("manual"),
  v.literal("order_reserve"),
  v.literal("order_cancel"),
  v.literal("return"),
  v.literal("adjustment"),
);

export const vDiscountKind = v.union(v.literal("percent"), v.literal("flat"));
export const vDiscountScope = v.union(
  v.literal("all"),
  v.literal("category"),
  v.literal("collection"),
  v.literal("products"),
);

export const vVariantColour = v.object({ name: v.string(), hex: v.string() });

export const vVariantView = v.object({
  id: v.id("productVariants"),
  sku: v.string(),
  size: v.union(v.string(), v.null()),
  colour: v.union(vVariantColour, v.null()),
  priceInr: v.number(),
  compareAtPriceInr: v.union(v.number(), v.null()),
  stock: v.number(),
  active: v.boolean(),
  position: v.number(),
});

/** Editable variant fields. `id` present means update, absent means create. */
export const vVariantInput = v.object({
  id: v.optional(v.id("productVariants")),
  size: v.optional(v.string()),
  colour: v.optional(vVariantColour),
  priceInr: v.optional(v.number()),
  compareAtPriceInr: v.optional(v.number()),
  stock: v.number(),
  active: v.boolean(),
});

export const vProductImageView = v.object({
  id: v.id("productImages"),
  storageId: v.id("_storage"),
  kind: vProductImageKind,
  position: v.number(),
  url: v.union(v.string(), v.null()),
});

export const vProductView = v.object({
  id: v.id("products"),
  vendorId: v.id("vendors"),
  vendorName: v.string(),
  vendorSlug: v.string(),
  status: vProductStatus,
  source: vProductSource,
  slug: v.string(),
  category: vProductCategory,
  presentation: vPresentation,
  name: v.string(),
  sku: v.union(v.string(), v.null()),
  brand: v.union(v.string(), v.null()),
  subcategory: v.string(),
  productType: v.union(v.string(), v.null()),
  description: v.string(),
  colours: vColours,
  pattern: v.union(v.string(), v.null()),
  material: v.union(v.string(), v.null()),
  size: v.union(v.string(), v.null()),
  ageGroup: v.union(vAgeGroup, v.null()),
  occasion: v.union(vOccasion, v.null()),
  priceInr: v.number(),
  compareAtPriceInr: v.union(v.number(), v.null()),
  hasVariants: v.boolean(),
  totalStock: v.number(),
  /** `status === "active"`; kept so older UI keeps working. */
  active: v.boolean(),
  imageUrl: v.union(v.string(), v.null()),
  images: v.array(vProductImageView),
  variants: v.array(vVariantView),
  referenceImageUrl: v.union(v.string(), v.null()),
  sourceUploadId: v.union(v.id("uploads"), v.null()),
  sourceBbox: v.union(v.array(v.number()), v.null()),
  soldCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** How a catalog product relates to something already in the shopper's wardrobe. */
export const vWardrobeRelation = v.object({
  kind: v.union(v.literal("similar"), v.literal("pairs")),
  itemId: v.id("items"),
  itemName: v.string(),
  itemImageUrl: v.union(v.string(), v.null()),
});

/** Catalog rail row: product plus optional wardrobe relation for buy UX. */
export const vRailProductView = vProductView.extend({
  relation: v.union(v.null(), vWardrobeRelation),
});

export const vDiscountView = v.object({
  id: v.id("discounts"),
  name: v.string(),
  code: v.union(v.string(), v.null()),
  kind: vDiscountKind,
  value: v.number(),
  scope: vDiscountScope,
  categories: v.array(vProductCategory),
  collectionId: v.union(v.id("collections"), v.null()),
  productIds: v.array(v.id("products")),
  minOrderInr: v.union(v.number(), v.null()),
  maxUses: v.union(v.number(), v.null()),
  usedCount: v.number(),
  startsAt: v.number(),
  endsAt: v.union(v.number(), v.null()),
  active: v.boolean(),
  createdAt: v.number(),
});

export const vCollectionView = v.object({
  id: v.id("collections"),
  name: v.string(),
  slug: v.string(),
  description: v.union(v.string(), v.null()),
  coverStorageId: v.union(v.id("_storage"), v.null()),
  coverUrl: v.union(v.string(), v.null()),
  productIds: v.array(v.id("products")),
  active: v.boolean(),
  createdAt: v.number(),
});

/** Discount already resolved against a unit price. */
export function applyDiscount(
  priceInr: number,
  discount: { kind: DiscountKind; value: number } | null,
): number {
  if (!discount) return priceInr;
  if (discount.kind === "percent") {
    return Math.max(0, Math.round(priceInr - (priceInr * discount.value) / 100));
  }
  return Math.max(0, priceInr - Math.round(discount.value));
}

export const vCartLineView = v.object({
  id: v.id("cartItems"),
  productId: v.id("products"),
  variantId: v.union(v.id("productVariants"), v.null()),
  variantLabel: v.union(v.string(), v.null()),
  vendorId: v.id("vendors"),
  vendorName: v.string(),
  name: v.string(),
  quantity: v.number(),
  priceInr: v.number(),
  imageUrl: v.union(v.string(), v.null()),
  available: v.boolean(),
});

export const vCartView = v.object({
  lines: v.array(vCartLineView),
  itemCount: v.number(),
  totalInr: v.number(),
});

export const vOrderItemView = v.object({
  id: v.id("orderItems"),
  productId: v.union(v.id("products"), v.null()),
  name: v.string(),
  quantity: v.number(),
  priceInr: v.number(),
});

export const vOrderView = v.object({
  id: v.id("orders"),
  name: v.string(),
  email: v.string(),
  phone: v.string(),
  address: v.string(),
  city: v.string(),
  pincode: v.string(),
  status: vOrderStatus,
  totalInr: v.number(),
  createdAt: v.number(),
  items: v.array(vOrderItemView),
});

export const MAX_CART_QTY = 10;
export const MAX_CART_LINES = 30;
export const ORDER_SAMPLE_CAP = 200;
export const MAX_PRODUCT_IMAGES = 6;

export const vProductDraft = v.object({
  category: vProductCategory,
  presentation: vPresentation,
  name: v.string(),
  brand: v.union(v.string(), v.null()),
  subcategory: v.string(),
  productType: v.union(v.string(), v.null()),
  description: v.string(),
  colours: v.object({
    primary: v.string(),
    secondary: v.array(v.string()),
    hex: v.string(),
  }),
  size: v.union(v.string(), v.null()),
  ageGroup: v.union(vAgeGroup, v.null()),
  occasion: v.union(vOccasion, v.null()),
});
