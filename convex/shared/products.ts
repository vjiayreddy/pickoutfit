import { v } from "convex/values";
import { vPresentation } from "./validators";

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

export const vProductView = v.object({
  id: v.id("products"),
  category: vProductCategory,
  presentation: vPresentation,
  name: v.string(),
  priceInr: v.number(),
  active: v.boolean(),
  imageUrl: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const vCartLineView = v.object({
  id: v.id("cartItems"),
  productId: v.id("products"),
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
