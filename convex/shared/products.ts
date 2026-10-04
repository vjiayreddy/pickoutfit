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

export const ORDER_LINE_STATUSES = ["placed", "shipped", "cancelled", "returned"] as const;
export type OrderLineStatus = (typeof ORDER_LINE_STATUSES)[number];

export const SHIPMENT_STATUSES = ["pending", "shipped", "delivered"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const RETURN_STATUSES = ["requested", "accepted", "rejected"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

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

export const DISCOUNT_SCOPES = ["all", "category", "collection", "products", "attribute"] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];

/** Merchandising face for a discount (Diwali, clearance, flash, …). */
export const OFFER_KINDS = [
  "standard",
  "occasion",
  "clearance",
  "flash",
  "seasonal",
  "custom",
] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const INFO_SECTION_KINDS = ["rich_text", "key_value", "faq"] as const;
export type InfoSectionKind = (typeof INFO_SECTION_KINDS)[number];

/** Canonical keys for fashion/traits stored in `products.attributes`. */
export const ATTR = {
  color: "color",
  colorSecondary: "color_secondary",
  colorHex: "color_hex",
  pattern: "pattern",
  fabric: "fabric",
  fit: "fit",
  formality: "formality",
  season: "season",
  size: "size",
  productType: "product_type",
  subcategory: "subcategory",
  occasion: "occasion",
} as const;

export const ATTR_LABELS: Record<string, string> = {
  [ATTR.color]: "Color",
  [ATTR.colorSecondary]: "Other colors",
  [ATTR.colorHex]: "Color hex",
  [ATTR.pattern]: "Pattern",
  [ATTR.fabric]: "Fabric",
  [ATTR.fit]: "Fit",
  [ATTR.formality]: "Formality",
  [ATTR.season]: "Season",
  [ATTR.size]: "Size",
  [ATTR.productType]: "Type",
  [ATTR.subcategory]: "Style",
  [ATTR.occasion]: "Occasion",
};

export function attrLabel(key: string): string {
  return ATTR_LABELS[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  shoes: "Footwear",
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

export const vOrderLineStatus = v.union(
  v.literal("placed"),
  v.literal("shipped"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const vShipmentStatus = v.union(
  v.literal("pending"),
  v.literal("shipped"),
  v.literal("delivered"),
);

export const vReturnStatus = v.union(
  v.literal("requested"),
  v.literal("accepted"),
  v.literal("rejected"),
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
  v.literal("attribute"),
);

export const vOfferKind = v.union(
  v.literal("standard"),
  v.literal("occasion"),
  v.literal("clearance"),
  v.literal("flash"),
  v.literal("seasonal"),
  v.literal("custom"),
);

export const vInfoSectionKind = v.union(
  v.literal("rich_text"),
  v.literal("key_value"),
  v.literal("faq"),
);

export const vProductAttribute = v.object({
  key: v.string(),
  label: v.string(),
  value: v.string(),
});

export const vInfoSectionRow = v.object({
  label: v.string(),
  value: v.string(),
});

export const vProductInfoSection = v.object({
  id: v.string(),
  title: v.string(),
  kind: vInfoSectionKind,
  body: v.optional(v.string()),
  rows: v.optional(v.array(vInfoSectionRow)),
  position: v.number(),
});

export const vVariantColour = v.object({ name: v.string(), hex: v.string() });

export const vVariantOptionRef = v.object({
  id: v.id("variantOptions"),
  variantTypeId: v.id("variantTypes"),
  label: v.string(),
  value: v.string(),
});

export const vVariantView = v.object({
  id: v.id("productVariants"),
  sku: v.string(),
  optionIds: v.array(v.id("variantOptions")),
  options: v.array(vVariantOptionRef),
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
  /** Preferred: one option per product variant type (Payload-style). */
  optionIds: v.optional(v.array(v.id("variantOptions"))),
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
  variantId: v.union(v.id("productVariants"), v.null()),
  position: v.number(),
  url: v.union(v.string(), v.null()),
});

/** Live auto-offer currently applied to a product (display + sale price). */
export const vAppliedOffer = v.object({
  id: v.id("discounts"),
  name: v.string(),
  badge: v.union(v.string(), v.null()),
  kind: vDiscountKind,
  value: v.number(),
  offerKind: vOfferKind,
  endsAt: v.union(v.number(), v.null()),
});

/** Storefront banner for the best live auto offer. */
export const vLiveOfferBanner = v.object({
  id: v.id("discounts"),
  name: v.string(),
  badge: v.union(v.string(), v.null()),
  kind: vDiscountKind,
  value: v.number(),
  offerKind: vOfferKind,
  endsAt: v.union(v.number(), v.null()),
  startsAt: v.number(),
  scopeLabel: v.string(),
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
  /** Nested taxonomy node when set; legacy flat `category` remains. */
  categoryId: v.union(v.id("categories"), v.null()),
  presentation: vPresentation,
  name: v.string(),
  sku: v.union(v.string(), v.null()),
  brand: v.union(v.string(), v.null()),
  subcategory: v.string(),
  productType: v.union(v.string(), v.null()),
  description: v.string(),
  /** Dynamic short traits (color, fit, fabric, custom). */
  attributes: v.array(vProductAttribute),
  /** Dynamic PDP accordion blocks. */
  infoSections: v.array(vProductInfoSection),
  /** Derived from attributes / legacy columns for older UI. */
  colours: vColours,
  pattern: v.union(v.string(), v.null()),
  material: v.union(v.string(), v.null()),
  size: v.union(v.string(), v.null()),
  ageGroup: v.union(vAgeGroup, v.null()),
  occasion: v.union(vOccasion, v.null()),
  priceInr: v.number(),
  compareAtPriceInr: v.union(v.number(), v.null()),
  /** Present when a live auto offer reduced the price. */
  offer: v.union(vAppliedOffer, v.null()),
  hasVariants: v.boolean(),
  /** Enabled option dimensions (Payload `variantTypes` on the product). */
  variantTypeIds: v.array(v.id("variantTypes")),
  totalStock: v.number(),
  /** `status === "active"`; kept so older UI keeps working. */
  active: v.boolean(),
  /** When true, the stylist may recommend this product. */
  aiRecommend: v.boolean(),
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
  offerKind: vOfferKind,
  badge: v.union(v.string(), v.null()),
  priority: v.number(),
  categories: v.array(vProductCategory),
  collectionId: v.union(v.id("collections"), v.null()),
  productIds: v.array(v.id("products")),
  attributeKey: v.union(v.string(), v.null()),
  attributeValues: v.array(v.string()),
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
  vendorId: v.union(v.id("vendors"), v.null()),
  variantId: v.union(v.id("productVariants"), v.null()),
  name: v.string(),
  sku: v.union(v.string(), v.null()),
  size: v.union(v.string(), v.null()),
  colour: v.union(v.string(), v.null()),
  quantity: v.number(),
  priceInr: v.number(),
  lineStatus: v.union(vOrderLineStatus, v.null()),
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

export const vShipmentView = v.object({
  id: v.id("shipments"),
  orderId: v.id("orders"),
  orderItemIds: v.array(v.id("orderItems")),
  carrier: v.union(v.string(), v.null()),
  trackingNumber: v.union(v.string(), v.null()),
  status: vShipmentStatus,
  shippedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
});

export const vReturnView = v.object({
  id: v.id("returns"),
  orderId: v.id("orders"),
  orderItemId: v.id("orderItems"),
  quantity: v.number(),
  reason: v.string(),
  status: vReturnStatus,
  restocked: v.boolean(),
  createdAt: v.number(),
  resolvedAt: v.union(v.number(), v.null()),
});

/** One vendor's slice of an order for the desk list. */
export const vVendorOrderListItem = v.object({
  orderId: v.id("orders"),
  createdAt: v.number(),
  buyerName: v.string(),
  city: v.string(),
  orderStatus: vOrderStatus,
  itemCount: v.number(),
  totalInr: v.number(),
  placedCount: v.number(),
  shippedCount: v.number(),
  cancelledCount: v.number(),
  returnedCount: v.number(),
  openReturnCount: v.number(),
});

export const vVendorOrderDetail = v.object({
  orderId: v.id("orders"),
  createdAt: v.number(),
  orderStatus: vOrderStatus,
  buyer: v.object({
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    pincode: v.string(),
  }),
  totalInr: v.number(),
  items: v.array(vOrderItemView),
  shipments: v.array(vShipmentView),
  returns: v.array(vReturnView),
});

export const MAX_CART_QTY = 10;
export const MAX_CART_LINES = 30;
export const ORDER_SAMPLE_CAP = 200;
export const MAX_PRODUCT_IMAGES = 6;
export const MAX_PRODUCT_ATTRIBUTES = 40;
export const MAX_INFO_SECTIONS = 12;

export type ProductAttribute = { key: string; label: string; value: string };
export type ProductInfoSection = {
  id: string;
  title: string;
  kind: InfoSectionKind;
  body?: string;
  rows?: { label: string; value: string }[];
  position: number;
};

export function attributeValue(
  attributes: ProductAttribute[] | undefined,
  key: string,
): string | undefined {
  const hit = attributes?.find((row) => row.key === key);
  const value = hit?.value.trim();
  return value ? value : undefined;
}

export function upsertAttribute(
  attributes: ProductAttribute[],
  key: string,
  value: string | undefined,
  label = attrLabel(key),
): ProductAttribute[] {
  const next = attributes.filter((row) => row.key !== key);
  const clean = value?.trim() ?? "";
  if (!clean) return next;
  return [...next, { key, label, value: clean.slice(0, 120) }];
}

/** Build attributes from legacy typed columns (backfill + transitional writes). */
export function attributesFromLegacy(input: {
  colours?: { primary?: string; secondary?: string[]; hex?: string[] } | null;
  pattern?: string | null;
  material?: string | null;
  fit?: string | null;
  formality?: string | null;
  season?: string[] | null;
  size?: string | null;
  productType?: string | null;
  subcategory?: string | null;
  occasion?: string | null;
  attributes?: ProductAttribute[] | null;
}): ProductAttribute[] {
  let attrs = [...(input.attributes ?? [])];
  const set = (key: string, value: string | undefined) => {
    attrs = upsertAttribute(attrs, key, value);
  };
  set(ATTR.color, input.colours?.primary);
  set(ATTR.colorSecondary, input.colours?.secondary?.filter(Boolean).join(", "));
  set(ATTR.colorHex, input.colours?.hex?.[0]);
  set(ATTR.pattern, input.pattern ?? undefined);
  set(ATTR.fabric, input.material ?? undefined);
  set(ATTR.fit, input.fit ?? undefined);
  set(ATTR.formality, input.formality ?? undefined);
  set(ATTR.season, input.season?.length ? input.season.join(", ") : undefined);
  set(ATTR.size, input.size ?? undefined);
  set(ATTR.productType, input.productType ?? undefined);
  set(ATTR.subcategory, input.subcategory ?? undefined);
  set(ATTR.occasion, input.occasion ?? undefined);
  return attrs.slice(0, MAX_PRODUCT_ATTRIBUTES);
}

/** Derive legacy colour/pattern fields from attributes for matchers + older UI. */
export function legacyFromAttributes(attributes: ProductAttribute[] | undefined): {
  colours: { primary: string; secondary: string[]; hex: string[] };
  pattern?: string;
  material?: string;
  fit?: string;
  formality?: string;
  season?: string[];
  size?: string;
  productType?: string;
  subcategory?: string;
  occasion?: string;
} {
  const color = attributeValue(attributes, ATTR.color) ?? "";
  const secondary = (attributeValue(attributes, ATTR.colorSecondary) ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const hexRaw = attributeValue(attributes, ATTR.colorHex);
  const hex = hexRaw && /^#[0-9a-fA-F]{6}$/.test(hexRaw) ? [hexRaw.toLowerCase()] : [];
  const seasonRaw = attributeValue(attributes, ATTR.season);
  return {
    colours: { primary: color, secondary, hex },
    pattern: attributeValue(attributes, ATTR.pattern),
    material: attributeValue(attributes, ATTR.fabric),
    fit: attributeValue(attributes, ATTR.fit),
    formality: attributeValue(attributes, ATTR.formality),
    season: seasonRaw
      ? seasonRaw.split(",").map((part) => part.trim()).filter(Boolean)
      : undefined,
    size: attributeValue(attributes, ATTR.size),
    productType: attributeValue(attributes, ATTR.productType),
    subcategory: attributeValue(attributes, ATTR.subcategory),
    occasion: attributeValue(attributes, ATTR.occasion),
  };
}

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
