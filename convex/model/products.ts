import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  attributesFromLegacy,
  ATTR,
  attributeValue,
  isProductType,
  legacyFromAttributes,
  MAX_ATTRIBUTE_SELECTIONS,
  MAX_ATTRIBUTES_PER_SELECTION,
  MAX_CART_LINES,
  MAX_CART_QTY,
  MAX_INFO_SECTIONS,
  MAX_OTHER_DETAILS,
  MAX_PRODUCT_ATTRIBUTES,
  MAX_PRODUCT_IMAGES,
  PRODUCT_SKU_PREFIX,
  productTypeLabel,
  type AgeGroup,
  type Occasion,
  type OtherDetail,
  type ProductAttribute,
  type ProductCategory,
  type ProductInfoSection,
  type ProductStatus,
  type vProductView,
  type vVariantInput,
  type vVariantView,
} from "../shared/products";
import { MAX_PRODUCT_VARIANTS, VENDOR_PLANS, slugify, vendorSellable } from "../shared/vendors";
import type { Fit, Formality, Presentation, Season } from "../shared/wardrobe";
import { syncProductEmbeddingSchedule } from "./productEmbeddings";
import { bumpSystemCounter } from "./stats";
import { pricedUnitInr } from "./offers";
import { resolveProductBrand } from "./brands";
import {
  attributeRefsFor,
  legacyFieldsFromAttributes,
  requireActiveVariantCategories,
  resolveAttributeIds,
} from "./variants";

type Ctx = QueryCtx | MutationCtx;

export type ProductColours = {
  primary: string;
  secondary: string[];
  hex: string[];
};

export type VariantInput = Infer<typeof vVariantInput>;
export type VariantView = Infer<typeof vVariantView>;
export type ProductView = Infer<typeof vProductView>;

export type ProductInput = {
  category: ProductCategory;
  /** Nested taxonomy leaf. Optional during migration from flat enums. */
  categoryId?: Id<"categories">;
  presentation: Presentation;
  name: string;
  /** Canonical brand row. When set, wins over free-text `brand`. */
  brandId?: Id<"brands">;
  /** Free-text brand; upserts a brand row when `brandId` is omitted. */
  brand?: string;
  description: string;
  /** @deprecated Prefer attributeSelections. */
  attributes?: ProductAttribute[];
  /** Catalog-backed multi-select traits. */
  attributeSelections?: Array<{
    attributeTypeId: Id<"attributeTypes">;
    attributeIds: Id<"attributes">[];
  }>;
  /** Dynamic PDP accordion sections. */
  infoSections?: ProductInfoSection[];
  /** Simple PDP key/values (care, COO…). */
  otherDetails?: OtherDetail[];
  /** @deprecated Prefer attributes; still accepted and merged into attributes. */
  subcategory?: string;
  productType?: string;
  colours?: ProductColours;
  pattern?: string;
  material?: string;
  season?: Season[];
  formality?: Formality;
  fit?: Fit;
  size?: string;
  ageGroup?: AgeGroup;
  occasion?: Occasion;
  priceInr: number;
  /** @deprecated Prefer discounts table. */
  compareAtPriceInr?: number;
  /** Variants (dimensions) enabled on this product. */
  variantCategoryIds?: Id<"variantCategories">[];
  /** Photos in display order. Existing rows are matched by storageId. */
  imageIds: Id<"_storage">[];
  /**
   * Sellable SKUs. Always at least one (simple products use a single default row for stock).
   * Empty input is normalized to one default variation.
   */
  variants: VariantInput[];
  /** When true, stylist may recommend this product once it is active. */
  aiRecommend?: boolean;
};

const MAX_PRICE_INR = 10_000_000;

function cleanPrice(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_PRICE_INR) {
    throw appError("INVALID_INPUT", `${label} must be a whole number of rupees.`);
  }
  return value;
}

export function normalHex(value: string): string | null {
  const hex = value.trim().toLowerCase();
  const withHash = hex.startsWith("#") ? hex : `#${hex}`;
  return /^#[0-9a-f]{6}$/.test(withHash) ? withHash : null;
}

function cleanAttributes(rows: ProductAttribute[] | undefined): ProductAttribute[] {
  if (!rows?.length) return [];
  const seen = new Set<string>();
  const out: ProductAttribute[] = [];
  for (const row of rows.slice(0, MAX_PRODUCT_ATTRIBUTES)) {
    const key = row.key.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40);
    const value = row.value.trim().slice(0, 120);
    const label = row.label.trim().slice(0, 60) || key;
    if (!key || !value || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label, value });
  }
  return out;
}

function cleanOtherDetails(rows: OtherDetail[] | undefined): OtherDetail[] {
  if (!rows?.length) return [];
  const seen = new Set<string>();
  const out: OtherDetail[] = [];
  for (const row of rows.slice(0, MAX_OTHER_DETAILS)) {
    const key = row.key.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40);
    const value = row.value.trim().slice(0, 500);
    if (!key || !value || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, value });
  }
  return out;
}

function cleanAttributeSelections(
  rows: ProductInput["attributeSelections"],
): Array<{ attributeTypeId: Id<"attributeTypes">; attributeIds: Id<"attributes">[] }> {
  if (!rows?.length) return [];
  const seenTypes = new Set<string>();
  const out: Array<{ attributeTypeId: Id<"attributeTypes">; attributeIds: Id<"attributes">[] }> = [];
  for (const row of rows.slice(0, MAX_ATTRIBUTE_SELECTIONS)) {
    const typeId = row.attributeTypeId;
    if (seenTypes.has(typeId)) continue;
    const attributeIds = [...new Set(row.attributeIds)].slice(0, MAX_ATTRIBUTES_PER_SELECTION);
    if (attributeIds.length === 0) continue;
    seenTypes.add(typeId);
    out.push({ attributeTypeId: typeId, attributeIds });
  }
  return out;
}

/** Simple products still need one SKU row so inventory/cart stay variant-based. */
function ensureDefaultVariation(variants: VariantInput[], basePrice: number): VariantInput[] {
  if (variants.length > 0) return variants;
  return [{ stock: 0, active: true, priceInr: basePrice }];
}

function cleanInfoSections(rows: ProductInfoSection[] | undefined): ProductInfoSection[] {
  if (!rows?.length) return [];
  return rows.slice(0, MAX_INFO_SECTIONS).map((row, index) => {
    const title = row.title.trim().slice(0, 80);
    if (!title) throw appError("INVALID_INPUT", "Each info section needs a title.");
    const id = (row.id.trim() || `sec_${Date.now().toString(36)}_${index}`).slice(0, 64);
    const body = row.body?.trim().slice(0, 4000) || undefined;
    const cleanedRows = row.rows
      ?.map((entry) => ({
        label: entry.label.trim().slice(0, 120),
        value: entry.value.trim().slice(0, 1000),
      }))
      .filter((entry) => entry.label && entry.value)
      .slice(0, 40);
    return {
      id,
      title,
      kind: row.kind,
      ...(body ? { body } : {}),
      ...(cleanedRows && cleanedRows.length > 0 ? { rows: cleanedRows } : {}),
      position: Number.isFinite(row.position) ? row.position : index,
    };
  });
}

export function cleanProductInput(input: ProductInput): ProductInput & {
  attributes: ProductAttribute[];
  attributeSelections: Array<{
    attributeTypeId: Id<"attributeTypes">;
    attributeIds: Id<"attributes">[];
  }>;
  infoSections: ProductInfoSection[];
  otherDetails: OtherDetail[];
  colours: ProductColours;
  subcategory: string;
} {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw appError("INVALID_INPUT", "Product name must be 1–80 characters.");
  }
  const brand = input.brand?.trim() ?? "";
  if (brand.length > 80) throw appError("INVALID_INPUT", "Brand must be 80 characters or fewer.");
  const description = input.description.trim();
  if (description.length > 400) {
    throw appError("INVALID_INPUT", "Description must be 400 characters or fewer.");
  }
  const priceInr = cleanPrice(input.priceInr, "Price");
  const compareAtPriceInr =
    input.compareAtPriceInr === undefined ? undefined : cleanPrice(input.compareAtPriceInr, "MRP");
  if (compareAtPriceInr !== undefined && compareAtPriceInr > 0 && compareAtPriceInr < priceInr) {
    throw appError("INVALID_INPUT", "MRP must be at least the selling price.");
  }
  const imageIds = [...new Set(input.imageIds)];
  if (imageIds.length > MAX_PRODUCT_IMAGES) {
    throw appError("INVALID_INPUT", `A product can have at most ${MAX_PRODUCT_IMAGES} photos.`);
  }
  const rawVariants = ensureDefaultVariation(input.variants, priceInr);
  if (rawVariants.length > MAX_PRODUCT_VARIANTS) {
    throw appError("INVALID_INPUT", `A product can have at most ${MAX_PRODUCT_VARIANTS} options.`);
  }
  const variants = rawVariants.map((variant) => cleanVariant(variant, priceInr));
  const attributeSelections = cleanAttributeSelections(input.attributeSelections);
  const otherDetails = cleanOtherDetails(input.otherDetails);

  const coloursIn = input.colours ?? EMPTY_COLOURS;
  const primary = coloursIn.primary.trim().slice(0, 40);
  const secondary = coloursIn.secondary
    .map((colour) => colour.trim())
    .filter((colour) => colour.length > 0)
    .slice(0, 6)
    .map((colour) => colour.slice(0, 40));
  const hex = coloursIn.hex.map(normalHex).filter((value): value is string => value !== null).slice(0, 6);
  const colours: ProductColours = { primary, secondary, hex };

  const productType = input.productType?.trim() ?? "";
  if (productType && !isProductType(input.category, productType)) {
    throw appError("INVALID_INPUT", "Choose a type from this category.");
  }
  const size = input.size?.trim() ?? "";
  if (size.length > 24) throw appError("INVALID_INPUT", "Size must be 24 characters or fewer.");
  const pattern = input.pattern?.trim().slice(0, 40) ?? "";
  const material = input.material?.trim().slice(0, 40) ?? "";
  const subcategory = (
    input.subcategory?.trim() ||
    (productType ? productTypeLabel(productType) : "") ||
    attributeValue(input.attributes, ATTR.subcategory) ||
    ""
  ).slice(0, 80);

  // Prefer explicit attributes; merge legacy typed fields so older clients keep working.
  const attributes = attributesFromLegacy({
    attributes: cleanAttributes(input.attributes),
    colours,
    pattern: pattern || undefined,
    material: material || undefined,
    fit: input.fit,
    formality: input.formality,
    season: input.season,
    size: size || undefined,
    productType: productType || undefined,
    subcategory: subcategory || undefined,
    occasion: input.occasion,
  });
  const derived = legacyFromAttributes(attributes);
  const infoSections = cleanInfoSections(input.infoSections);

  return {
    ...input,
    name,
    brand: brand.length > 0 ? brand : undefined,
    description,
    attributes,
    attributeSelections,
    infoSections,
    otherDetails,
    subcategory: derived.subcategory || subcategory || input.category,
    productType: derived.productType || productType || undefined,
    pattern: derived.pattern,
    material: derived.material,
    fit: (derived.fit as Fit | undefined) ?? input.fit,
    formality: (derived.formality as Formality | undefined) ?? input.formality,
    season: (derived.season as Season[] | undefined) ?? input.season,
    imageIds,
    variants,
    variantCategoryIds: input.variantCategoryIds,
    size: derived.size || size || undefined,
    priceInr,
    compareAtPriceInr: compareAtPriceInr && compareAtPriceInr > 0 ? compareAtPriceInr : undefined,
    colours: derived.colours.primary || colours.primary ? derived.colours : colours,
    ageGroup: input.ageGroup,
    occasion: (derived.occasion as Occasion | undefined) ?? input.occasion,
    aiRecommend: Boolean(input.aiRecommend),
  };
}

function cleanVariant(variant: VariantInput, basePrice: number): VariantInput {
  const size = variant.size?.trim() ?? "";
  if (size.length > 24) throw appError("INVALID_INPUT", "Size must be 24 characters or fewer.");
  if (!Number.isInteger(variant.stock) || variant.stock < 0 || variant.stock > 1_000_000) {
    throw appError("INVALID_INPUT", "Stock must be a whole number.");
  }
  const priceInr = variant.priceInr === undefined ? undefined : cleanPrice(variant.priceInr, "Option price");
  const compareAtPriceInr =
    variant.compareAtPriceInr === undefined ? undefined : cleanPrice(variant.compareAtPriceInr, "Option MRP");
  const effective = priceInr ?? basePrice;
  if (compareAtPriceInr !== undefined && compareAtPriceInr > 0 && compareAtPriceInr < effective) {
    throw appError("INVALID_INPUT", "Option MRP must be at least its selling price.");
  }
  let colour = variant.colour;
  if (colour) {
    const name = colour.name.trim().slice(0, 40);
    const hex = normalHex(colour.hex) ?? "";
    colour = name || hex ? { name, hex } : undefined;
  }
  const attributeIds = variant.attributeIds ? [...new Set(variant.attributeIds)] : undefined;
  return {
    ...(variant.id ? { id: variant.id } : {}),
    ...(attributeIds && attributeIds.length > 0 ? { attributeIds } : {}),
    ...(size ? { size } : {}),
    ...(colour ? { colour } : {}),
    ...(priceInr !== undefined ? { priceInr } : {}),
    ...(compareAtPriceInr ? { compareAtPriceInr } : {}),
    stock: variant.stock,
    active: variant.active,
  };
}

/** Legacy rows may still lack a status; the backfill sets it. */
export function productStatus(product: Doc<"products">): ProductStatus {
  return product.status ?? (product.active ? "active" : "draft");
}

export function isProductActive(product: Doc<"products">): boolean {
  return productStatus(product) === "active";
}

export function requireProductVendorId(product: Doc<"products">): Id<"vendors"> {
  if (!product.vendorId) {
    throw appError("CONFLICT", "This product has no vendor yet. Run the vendors backfill.");
  }
  return product.vendorId;
}

/** Photos in display order. Older rows stored only the cover. */
export function productImageIds(product: Doc<"products">): Id<"_storage">[] {
  if (product.imageIds !== undefined) return product.imageIds;
  return product.storageId ? [product.storageId] : [];
}

export async function loadImages(ctx: Ctx, productId: Id<"products">) {
  return ctx.db
    .query("productImages")
    .withIndex("by_productId_and_position", (q) => q.eq("productId", productId))
    .take(MAX_PRODUCT_IMAGES + 2);
}

export async function loadVariants(ctx: Ctx, productId: Id<"products">) {
  return ctx.db
    .query("productVariants")
    .withIndex("by_productId_and_position", (q) => q.eq("productId", productId))
    .take(MAX_PRODUCT_VARIANTS);
}

/** Cover storage id: first image row, else legacy fields. */
export async function coverStorageId(ctx: Ctx, product: Doc<"products">): Promise<Id<"_storage"> | undefined> {
  const images = await loadImages(ctx, product._id);
  if (images[0]) return images[0].storageId;
  return productImageIds(product)[0];
}

export async function coverUrl(ctx: Ctx, product: Doc<"products">): Promise<string | null> {
  const cover = await coverStorageId(ctx, product);
  return cover ? await ctx.storage.getUrl(cover) : null;
}

export function variantLabel(variant: { size?: string; colour?: { name: string } }): string | null {
  const parts = [variant.size, variant.colour?.name].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" / ") : null;
}

export function effectivePrice(product: Doc<"products">, variant?: Doc<"productVariants"> | null): number {
  return variant?.priceInr ?? product.priceInr;
}

const EMPTY_COLOURS: ProductColours = { primary: "", secondary: [], hex: [] };

/** Vendor lookups are cached per request because catalog pages repeat the same vendor. */
export type VendorCache = Map<Id<"vendors">, Doc<"vendors"> | null>;

export async function vendorFor(
  ctx: Ctx,
  vendorId: Id<"vendors"> | undefined,
  cache: VendorCache,
): Promise<Doc<"vendors"> | null> {
  if (!vendorId) return null;
  if (cache.has(vendorId)) return cache.get(vendorId) ?? null;
  const vendor = await ctx.db.get(vendorId);
  cache.set(vendorId, vendor);
  return vendor;
}

export async function toVariantView(
  ctx: Ctx,
  variant: Doc<"productVariants">,
  product: Doc<"products">,
): Promise<VariantView> {
  const attributeIds = variant.attributeIds ?? [];
  return {
    id: variant._id,
    sku: variant.sku,
    attributeIds,
    options: await attributeRefsFor(ctx, attributeIds, product.variantCategoryIds),
    size: variant.size ?? null,
    colour: variant.colour ?? null,
    priceInr: effectivePrice(product, variant),
    compareAtPriceInr: variant.compareAtPriceInr ?? product.compareAtPriceInr ?? null,
    stock: variant.stock,
    active: variant.active,
    position: variant.position,
  };
}

export async function toProductView(
  ctx: Ctx,
  product: Doc<"products">,
  cache: VendorCache = new Map(),
): Promise<ProductView> {
  const vendor = await vendorFor(ctx, product.vendorId, cache);
  const [imageRows, variantRows] = await Promise.all([loadImages(ctx, product._id), loadVariants(ctx, product._id)]);
  const legacy = imageRows.length === 0 ? productImageIds(product) : [];
  const images = await Promise.all([
    ...imageRows.map(async (row) => ({
      id: row._id,
      storageId: row.storageId,
      kind: row.kind,
      variantId: row.variantId ?? null,
      position: row.position,
      url: await ctx.storage.getUrl(row.storageId),
    })),
    ...legacy.map(async (storageId, position) => ({
      // Legacy rows have no image row yet; the id is a stable stand-in until the backfill runs.
      id: `${product._id}:${position}` as unknown as Id<"productImages">,
      storageId,
      kind: "studio" as const,
      variantId: null as Id<"productVariants"> | null,
      position,
      url: await ctx.storage.getUrl(storageId),
    })),
  ]);
  const variants = await Promise.all(variantRows.map((variant) => toVariantView(ctx, variant, product)));
  const status = productStatus(product);
  const attributes =
    product.attributes ??
    attributesFromLegacy({
      colours: product.colours,
      pattern: product.pattern,
      material: product.material,
      fit: product.fit,
      formality: product.formality,
      season: product.season,
      size: product.size,
      productType: product.productType,
      subcategory: product.subcategory,
      occasion: product.occasion,
    });
  const derived = legacyFromAttributes(attributes);
  return {
    id: product._id,
    vendorId: product.vendorId ?? ("" as Id<"vendors">),
    vendorName: vendor?.name ?? "",
    vendorSlug: vendor?.slug ?? "",
    status,
    source: product.source ?? "manual",
    slug: product.slug ?? "",
    category: product.category,
    categoryId: product.categoryId ?? null,
    categoryPath: product.categoryPath ?? null,
    presentation: product.presentation,
    name: product.name,
    sku: product.sku ?? null,
    brandId: product.brandId ?? null,
    brand: product.brand ?? null,
    subcategory: derived.subcategory || product.subcategory || "",
    productType: derived.productType || product.productType || null,
    description: product.description ?? "",
    attributes,
    attributeSelections: product.attributeSelections ?? [],
    infoSections: product.infoSections ?? [],
    otherDetails: product.otherDetails ?? [],
    colours: derived.colours.primary ? derived.colours : (product.colours ?? EMPTY_COLOURS),
    pattern: derived.pattern ?? product.pattern ?? null,
    material: derived.material ?? product.material ?? null,
    size: derived.size ?? product.size ?? null,
    ageGroup: product.ageGroup ?? null,
    occasion: (derived.occasion as Occasion | undefined) ?? product.occasion ?? null,
    priceInr: product.priceInr,
    compareAtPriceInr: product.compareAtPriceInr ?? null,
    offer: null,
    hasVariants: product.hasVariants ?? false,
    variantCategoryIds: product.variantCategoryIds ?? [],
    totalStock: variants.filter((variant) => variant.active).reduce((sum, variant) => sum + variant.stock, 0),
    active: status === "active",
    aiRecommend: Boolean(product.aiRecommend),
    imageUrl: images[0]?.url ?? null,
    images,
    variants,
    referenceImageUrl: product.referenceStorageId ? await ctx.storage.getUrl(product.referenceStorageId) : null,
    sourceUploadId: product.sourceUploadId ?? null,
    sourceBbox: product.sourceBbox ?? null,
    soldCount: product.soldCount ?? 0,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export async function toProductViews(ctx: Ctx, products: Doc<"products">[]): Promise<ProductView[]> {
  const cache: VendorCache = new Map();
  const views: ProductView[] = [];
  for (const product of products) views.push(await toProductView(ctx, product, cache));
  return views;
}

/** Resolve catalog attributeSelections into human labels for search / embeddings. */
export async function resolveAttributeSelectionLabels(
  ctx: Ctx,
  selections:
    | Array<{ attributeTypeId: Id<"attributeTypes">; attributeIds: Id<"attributes">[] }>
    | undefined,
): Promise<string[]> {
  if (!selections?.length) return [];
  const parts: string[] = [];
  for (const row of selections) {
    const type = await ctx.db.get(row.attributeTypeId);
    if (type) {
      const typeName = type.displayLabel.trim() || type.label.trim();
      if (typeName) parts.push(typeName);
    }
    for (const attributeId of row.attributeIds) {
      const attr = await ctx.db.get(attributeId);
      if (!attr) continue;
      const value = attr.label.trim() || attr.value.trim();
      if (value) parts.push(value);
    }
  }
  return parts;
}

/** Text the storefront search index and the embedding both read. */
export function buildProductSearchText(product: {
  name: string;
  brand?: string;
  category: string;
  /** Leaf category path, e.g. `men/topwear/shirts/formal`. */
  categoryPath?: string;
  subcategory?: string;
  productType?: string;
  colours?: ProductColours;
  pattern?: string;
  material?: string;
  description?: string;
  attributes?: ProductAttribute[];
  /** Resolved attribute type + value labels from attributeSelections. */
  selectionLabels?: string[];
}): string {
  const pathParts = (product.categoryPath ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const part of [
    product.name,
    product.brand,
    product.category,
    ...pathParts,
    product.subcategory,
    product.productType,
    product.colours?.primary,
    ...(product.colours?.secondary ?? []),
    product.pattern,
    product.material,
    product.description,
    ...(product.selectionLabels ?? []),
    ...(product.attributes ?? []).flatMap((row) => [row.label, row.value]),
  ]) {
    if (typeof part !== "string") continue;
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(trimmed);
  }
  return parts.join(" ").slice(0, 1000);
}

/** Build searchText with live catalog labels for create/update/embed. */
export async function resolveProductSearchText(
  ctx: Ctx,
  product: {
    name: string;
    brand?: string;
    category: string;
    categoryPath?: string;
    subcategory?: string;
    productType?: string;
    colours?: ProductColours;
    pattern?: string;
    material?: string;
    description?: string;
    attributes?: ProductAttribute[];
    attributeSelections?: Array<{
      attributeTypeId: Id<"attributeTypes">;
      attributeIds: Id<"attributes">[];
    }>;
  },
): Promise<string> {
  const selectionLabels = await resolveAttributeSelectionLabels(ctx, product.attributeSelections);
  return buildProductSearchText({ ...product, selectionLabels });
}

async function allocateSku(ctx: MutationCtx, vendor: Doc<"vendors">, category: ProductCategory): Promise<string> {
  const sequence = await bumpSystemCounter(ctx, "product_sku", 1);
  return `${vendor.code}-${PRODUCT_SKU_PREFIX[category]}-${String(sequence).padStart(4, "0")}`;
}

async function uniqueProductSlug(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
  name: string,
  sku: string,
  selfId?: Id<"products">,
): Promise<string> {
  const base = slugify(name) || "product";
  const taken = await ctx.db
    .query("products")
    .withIndex("by_vendorId_and_slug", (q) => q.eq("vendorId", vendorId).eq("slug", base))
    .unique();
  if (!taken || taken._id === selfId) return base;
  return `${base}-${sku.toLowerCase()}`;
}

export async function requireVendorProduct(
  ctx: Ctx,
  vendor: Doc<"vendors">,
  productId: Id<"products">,
): Promise<Doc<"products">> {
  const product = await ctx.db.get(productId);
  if (!product || product.vendorId !== vendor._id) {
    throw appError("NOT_FOUND", "That product doesn't exist.");
  }
  return product;
}

async function resolveCategory(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  categoryId: Id<"categories"> | undefined,
): Promise<{ categoryId: Id<"categories">; categoryPath: string } | undefined> {
  if (!categoryId) return undefined;
  const category = await ctx.db.get(categoryId);
  if (!category || category.vendorId !== vendorId) {
    throw appError("NOT_FOUND", "That category doesn't exist.");
  }
  if (!category.isActive) throw appError("INVALID_INPUT", "That category is not active.");
  return { categoryId, categoryPath: category.path };
}

async function assertAttributeSelections(
  ctx: Ctx,
  vendorId: Id<"vendors">,
  selections: Array<{ attributeTypeId: Id<"attributeTypes">; attributeIds: Id<"attributes">[] }>,
): Promise<void> {
  for (const row of selections) {
    const type = await ctx.db.get(row.attributeTypeId);
    if (!type || type.vendorId !== vendorId || !type.isActive) {
      throw appError("INVALID_INPUT", "That attribute type is not available.");
    }
    for (const attributeId of row.attributeIds) {
      const attr = await ctx.db.get(attributeId);
      if (!attr || attr.vendorId !== vendorId || attr.attributeTypeId !== row.attributeTypeId) {
        throw appError("INVALID_INPUT", "That attribute value is not available.");
      }
      if (!attr.isActive) throw appError("INVALID_INPUT", "That attribute value is not active.");
    }
  }
}

export async function createProduct(
  ctx: MutationCtx,
  vendor: Doc<"vendors">,
  input: ProductInput,
  extra: { source?: Doc<"products">["source"]; status?: ProductStatus } = {},
): Promise<Id<"products">> {
  const clean = cleanProductInput(input);
  const category = await resolveCategory(ctx, vendor._id, clean.categoryId);
  await assertAttributeSelections(ctx, vendor._id, clean.attributeSelections);
  const brandFields = await resolveProductBrand(ctx, vendor._id, {
    brandId: clean.brandId,
    brand: clean.brand,
  });
  const variantCategoryIds = clean.variantCategoryIds?.length
    ? await requireActiveVariantCategories(ctx, vendor._id, clean.variantCategoryIds)
    : [];
  const plan = VENDOR_PLANS[vendor.plan];
  if (vendor.productCount >= plan.maxProducts) {
    throw appError("RATE_LIMITED", `Your plan allows ${plan.maxProducts} products. Archive some or upgrade.`);
  }
  const now = Date.now();
  const sku = await allocateSku(ctx, vendor, clean.category);
  const slug = await uniqueProductSlug(ctx, vendor._id, clean.name, sku);
  const searchText = await resolveProductSearchText(ctx, {
    ...clean,
    brand: brandFields.brand,
    categoryPath: category?.categoryPath,
  });
  const productId = await ctx.db.insert("products", {
    vendorId: vendor._id,
    status: extra.status ?? "draft",
    slug,
    source: extra.source ?? "manual",
    category: clean.category,
    ...(category ? { categoryId: category.categoryId, categoryPath: category.categoryPath } : {}),
    presentation: clean.presentation,
    name: clean.name,
    sku,
    ...(brandFields.brandId ? { brandId: brandFields.brandId } : {}),
    ...(brandFields.brand ? { brand: brandFields.brand } : {}),
    description: clean.description,
    attributes: clean.attributes,
    ...(clean.attributeSelections.length > 0
      ? { attributeSelections: clean.attributeSelections }
      : {}),
    ...(clean.infoSections.length > 0 ? { infoSections: clean.infoSections } : {}),
    ...(clean.otherDetails.length > 0 ? { otherDetails: clean.otherDetails } : {}),
    // Mirror into legacy columns so wardrobe match / older indexes keep working.
    subcategory: clean.subcategory,
    ...(clean.productType ? { productType: clean.productType } : {}),
    colours: clean.colours,
    ...(clean.pattern ? { pattern: clean.pattern } : {}),
    ...(clean.material ? { material: clean.material } : {}),
    ...(clean.season ? { season: clean.season } : {}),
    ...(clean.formality ? { formality: clean.formality } : {}),
    ...(clean.fit ? { fit: clean.fit } : {}),
    ...(clean.size ? { size: clean.size } : {}),
    ...(clean.ageGroup ? { ageGroup: clean.ageGroup } : {}),
    ...(clean.occasion ? { occasion: clean.occasion } : {}),
    priceInr: clean.priceInr,
    ...(clean.compareAtPriceInr ? { compareAtPriceInr: clean.compareAtPriceInr } : {}),
    hasVariants: hasRealVariants(clean.variants),
    ...(variantCategoryIds.length > 0 ? { variantCategoryIds } : {}),
    active: extra.status === "active",
    ...(clean.aiRecommend ? { aiRecommend: true } : {}),
    searchText,
    soldCount: 0,
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const product = await ctx.db.get(productId);
  if (!product) throw appError("NOT_FOUND", "Product was not created.");
  await syncImages(ctx, product, vendor, clean.imageIds);
  await syncVariants(ctx, product, vendor, clean.variants, undefined, variantCategoryIds);
  await ctx.db.patch(vendor._id, { productCount: vendor.productCount + 1, updatedAt: now });
  await syncProductEmbeddingSchedule(ctx, productId);
  return productId;
}

export async function updateProduct(
  ctx: MutationCtx,
  vendor: Doc<"vendors">,
  productId: Id<"products">,
  input: ProductInput,
): Promise<void> {
  const product = await requireVendorProduct(ctx, vendor, productId);
  const clean = cleanProductInput(input);
  await assertAttributeSelections(ctx, vendor._id, clean.attributeSelections);
  const category =
    clean.categoryId !== undefined
      ? await resolveCategory(ctx, vendor._id, clean.categoryId)
      : product.categoryId
        ? await resolveCategory(ctx, vendor._id, product.categoryId)
        : undefined;
  const brandFields = await resolveProductBrand(ctx, vendor._id, {
    brandId: clean.brandId,
    brand: clean.brand,
  });
  const variantCategoryIds =
    clean.variantCategoryIds !== undefined
      ? clean.variantCategoryIds.length > 0
        ? await requireActiveVariantCategories(ctx, vendor._id, clean.variantCategoryIds)
        : []
      : (product.variantCategoryIds ?? []);
  const sku = product.sku ?? (await allocateSku(ctx, vendor, clean.category));
  const slug =
    product.slug && product.name === clean.name
      ? product.slug
      : await uniqueProductSlug(ctx, vendor._id, clean.name, sku, product._id);
  const categoryPath = category?.categoryPath ?? product.categoryPath;
  const searchText = await resolveProductSearchText(ctx, {
    ...clean,
    brand: brandFields.brand,
    categoryPath,
  });
  await ctx.db.patch(product._id, {
    slug,
    category: clean.category,
    categoryId: category?.categoryId,
    categoryPath,
    presentation: clean.presentation,
    name: clean.name,
    sku,
    brandId: brandFields.brandId,
    brand: brandFields.brand,
    description: clean.description,
    attributes: clean.attributes,
    attributeSelections:
      clean.attributeSelections.length > 0 ? clean.attributeSelections : undefined,
    infoSections: clean.infoSections.length > 0 ? clean.infoSections : undefined,
    otherDetails: clean.otherDetails.length > 0 ? clean.otherDetails : undefined,
    subcategory: clean.subcategory,
    productType: clean.productType,
    colours: clean.colours,
    pattern: clean.pattern,
    material: clean.material,
    season: clean.season,
    formality: clean.formality,
    fit: clean.fit,
    size: clean.size,
    ageGroup: clean.ageGroup,
    occasion: clean.occasion,
    priceInr: clean.priceInr,
    compareAtPriceInr: clean.compareAtPriceInr,
    hasVariants: hasRealVariants(clean.variants),
    variantCategoryIds: variantCategoryIds.length > 0 ? variantCategoryIds : undefined,
    searchText,
    aiRecommend: clean.aiRecommend ? true : undefined,
    // Legacy fields are superseded by productImages rows.
    imageIds: undefined,
    storageId: undefined,
    updatedAt: Date.now(),
  });
  await syncImages(ctx, product, vendor, clean.imageIds);
  await syncVariants(ctx, product, vendor, clean.variants, undefined, variantCategoryIds);
  await syncProductEmbeddingSchedule(ctx, product._id);
}

function hasRealVariants(variants: VariantInput[]): boolean {
  return (
    variants.length > 1 ||
    variants.some((variant) => Boolean(variant.size || variant.colour || variant.attributeIds?.length))
  );
}

/** Makes `productImages` match `imageIds` in order; removed photos are deleted from storage. */
export async function syncImages(
  ctx: MutationCtx,
  product: Doc<"products">,
  vendor: Doc<"vendors">,
  imageIds: Id<"_storage">[],
): Promise<void> {
  const now = Date.now();
  const existing = await loadImages(ctx, product._id);
  const legacy = existing.length === 0 ? productImageIds(product) : [];
  const byStorage = new Map(existing.map((row) => [row.storageId, row]));
  for (const row of existing) {
    if (!imageIds.includes(row.storageId)) {
      await ctx.db.delete(row._id);
      if (row.kind !== "reference") await ctx.storage.delete(row.storageId);
    }
  }
  for (const storageId of legacy) {
    if (!imageIds.includes(storageId)) await ctx.storage.delete(storageId);
  }
  for (const [position, storageId] of imageIds.entries()) {
    const row = byStorage.get(storageId);
    if (row) {
      if (row.position !== position) await ctx.db.patch(row._id, { position });
      continue;
    }
    await ctx.db.insert("productImages", {
      productId: product._id,
      vendorId: vendor._id,
      storageId,
      kind: storageId === product.cutoutStorageId ? "cutout" : "studio",
      position,
      createdAt: now,
    });
  }
}

/** Upserts variants by id; rows left out are removed. Stock changes write inventory movements. */
export async function syncVariants(
  ctx: MutationCtx,
  product: Doc<"products">,
  vendor: Doc<"vendors">,
  variants: VariantInput[],
  actorUserId?: Id<"users">,
  allowedCategoryIds?: Id<"variantCategories">[],
): Promise<void> {
  const now = Date.now();
  const categoryIds = allowedCategoryIds ?? product.variantCategoryIds ?? [];
  const existing = await loadVariants(ctx, product._id);
  const keep = new Set(variants.map((variant) => variant.id).filter(Boolean));
  for (const row of existing) {
    if (!keep.has(row._id)) await ctx.db.delete(row._id);
  }
  const baseSku = product.sku ?? "SKU";
  let nextSuffix = existing.length + 1;
  for (const [position, variant] of variants.entries()) {
    const row = variant.id ? existing.find((candidate) => candidate._id === variant.id) : undefined;
    if (variant.id && !row) throw appError("NOT_FOUND", "One of the options no longer exists.");
    let attributeIds = variant.attributeIds;
    let size = variant.size;
    let colour = variant.colour;
    if (attributeIds?.length) {
      const resolved = await resolveAttributeIds(
        ctx,
        attributeIds,
        categoryIds.length > 0 ? categoryIds : undefined,
        vendor._id,
      );
      attributeIds = resolved.attributeIds;
      const legacy = legacyFieldsFromAttributes(resolved.attributes, resolved.types);
      size = legacy.size ?? size;
      colour = legacy.colour ?? colour;
    }
    if (row) {
      await ctx.db.patch(row._id, {
        attributeIds: attributeIds && attributeIds.length > 0 ? attributeIds : undefined,
        size,
        colour,
        priceInr: variant.priceInr,
        compareAtPriceInr: variant.compareAtPriceInr,
        active: variant.active,
        position,
        updatedAt: now,
      });
      if (row.stock !== variant.stock) {
        await ctx.db.patch(row._id, { stock: variant.stock });
        await ctx.db.insert("inventoryMovements", {
          vendorId: vendor._id,
          variantId: row._id,
          delta: variant.stock - row.stock,
          reason: "manual",
          stockAfter: variant.stock,
          ...(actorUserId ? { actorUserId } : {}),
          createdAt: now,
        });
      }
      continue;
    }
    const variantId = await ctx.db.insert("productVariants", {
      productId: product._id,
      vendorId: vendor._id,
      sku: `${baseSku}-${String(nextSuffix).padStart(2, "0")}`,
      ...(attributeIds && attributeIds.length > 0 ? { attributeIds } : {}),
      ...(size ? { size } : {}),
      ...(colour ? { colour } : {}),
      ...(variant.priceInr !== undefined ? { priceInr: variant.priceInr } : {}),
      ...(variant.compareAtPriceInr ? { compareAtPriceInr: variant.compareAtPriceInr } : {}),
      stock: variant.stock,
      active: variant.active,
      position,
      createdAt: now,
      updatedAt: now,
    });
    nextSuffix += 1;
    if (variant.stock !== 0) {
      await ctx.db.insert("inventoryMovements", {
        vendorId: vendor._id,
        variantId,
        delta: variant.stock,
        reason: "manual",
        stockAfter: variant.stock,
        ...(actorUserId ? { actorUserId } : {}),
        createdAt: now,
      });
    }
  }
}

export async function publishProduct(ctx: MutationCtx, vendor: Doc<"vendors">, productId: Id<"products">) {
  const product = await requireVendorProduct(ctx, vendor, productId);
  if (vendor.status !== "active") {
    throw appError("FORBIDDEN", "Your store is awaiting approval. Products go live once it is active.");
  }
  const images = await loadImages(ctx, product._id);
  if (images.length === 0 && productImageIds(product).length === 0) {
    throw appError("INVALID_INPUT", "Add at least one photo before publishing.");
  }
  const variants = await loadVariants(ctx, product._id);
  if (!variants.some((variant) => variant.active)) {
    throw appError("INVALID_INPUT", "Add at least one active option before publishing.");
  }
  const now = Date.now();
  await ctx.db.patch(product._id, {
    status: "active",
    active: true,
    publishedAt: product.publishedAt ?? now,
    updatedAt: now,
  });
  await syncProductEmbeddingSchedule(ctx, product._id);
}

export async function archiveProduct(ctx: MutationCtx, vendor: Doc<"vendors">, productId: Id<"products">) {
  const product = await requireVendorProduct(ctx, vendor, productId);
  if (productStatus(product) === "archived") return;
  await ctx.db.patch(product._id, { status: "archived", active: false, updatedAt: Date.now() });
  await ctx.db.patch(vendor._id, {
    productCount: Math.max(0, vendor.productCount - 1),
    updatedAt: Date.now(),
  });
  await syncProductEmbeddingSchedule(ctx, productId);
}

export async function unpublishProduct(ctx: MutationCtx, vendor: Doc<"vendors">, productId: Id<"products">) {
  const product = await requireVendorProduct(ctx, vendor, productId);
  await ctx.db.patch(product._id, { status: "draft", active: false, updatedAt: Date.now() });
  await syncProductEmbeddingSchedule(ctx, productId);
}

export async function adjustStock(
  ctx: MutationCtx,
  vendor: Doc<"vendors">,
  variantId: Id<"productVariants">,
  delta: number,
  reason: Doc<"inventoryMovements">["reason"],
  opts: { orderItemId?: Id<"orderItems">; actorUserId?: Id<"users"> } = {},
): Promise<number> {
  const variant = await ctx.db.get(variantId);
  if (!variant || variant.vendorId !== vendor._id) throw appError("NOT_FOUND", "That option doesn't exist.");
  if (!Number.isInteger(delta)) throw appError("INVALID_INPUT", "Stock change must be a whole number.");
  const stockAfter = variant.stock + delta;
  if (stockAfter < 0) throw appError("CONFLICT", "Not enough stock.", { stock: variant.stock });
  const now = Date.now();
  await ctx.db.patch(variant._id, { stock: stockAfter, updatedAt: now });
  await ctx.db.insert("inventoryMovements", {
    vendorId: vendor._id,
    variantId: variant._id,
    delta,
    reason,
    stockAfter,
    ...(opts.orderItemId ? { orderItemId: opts.orderItemId } : {}),
    ...(opts.actorUserId ? { actorUserId: opts.actorUserId } : {}),
    createdAt: now,
  });
  return stockAfter;
}

/** Storefront visibility for a shopper. */
export function productVisibleTo(
  userPresentation: Presentation,
  product: Doc<"products">,
  vendor: Doc<"vendors"> | null,
): boolean {
  if (!isProductActive(product)) return false;
  if (!vendor || !vendorSellable(vendor)) return false;
  if (userPresentation === "neutral") return true;
  return product.presentation === userPresentation || product.presentation === "neutral";
}

export async function getOrCreateCart(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing;
  const cartId = await ctx.db.insert("carts", { userId, updatedAt: Date.now() });
  const created = await ctx.db.get(cartId);
  if (!created) throw appError("NOT_FOUND", "Could not open a cart.");
  return created;
}

export async function cartLines(ctx: Ctx, cartId: Id<"carts">) {
  return ctx.db
    .query("cartItems")
    .withIndex("by_cartId", (q) => q.eq("cartId", cartId))
    .take(MAX_CART_LINES);
}

/** Resolves a cart line to product, variant and vendor, and whether it can be bought right now. */
export async function resolveCartLine(ctx: Ctx, line: Doc<"cartItems">, cache: VendorCache) {
  const product = await ctx.db.get(line.productId);
  const variant = line.variantId ? await ctx.db.get(line.variantId) : null;
  const vendor = product ? await vendorFor(ctx, product.vendorId, cache) : null;
  const available =
    Boolean(product && vendor && isProductActive(product) && vendorSellable(vendor)) &&
    (variant ? variant.active && variant.stock >= line.quantity : true);
  return { product, variant, vendor, available };
}

export async function toCartView(ctx: Ctx, userId: Id<"users">) {
  const cart = await ctx.db
    .query("carts")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!cart) return { lines: [], itemCount: 0, totalInr: 0 };
  const rows = await cartLines(ctx, cart._id);
  const cache: VendorCache = new Map();
  const lines = [];
  for (const line of rows) {
    const { product, variant, vendor, available } = await resolveCartLine(ctx, line, cache);
    const priceInr =
      product && available ? await pricedUnitInr(ctx, product, variant) : line.priceInr;
    lines.push({
      id: line._id,
      productId: line.productId,
      variantId: line.variantId ?? null,
      variantLabel: variant ? variantLabel(variant) : null,
      vendorId: line.vendorId ?? product?.vendorId ?? ("" as Id<"vendors">),
      vendorName: vendor?.name ?? "",
      name: line.name,
      quantity: line.quantity,
      priceInr,
      imageUrl: product ? await coverUrl(ctx, product) : null,
      available,
    });
  }
  const availableLines = lines.filter((line) => line.available);
  return {
    lines,
    itemCount: availableLines.reduce((sum, line) => sum + line.quantity, 0),
    totalInr: availableLines.reduce((sum, line) => sum + line.priceInr * line.quantity, 0),
  };
}

export type AddCartOptions = {
  variantId?: Id<"productVariants">;
  quantity?: number;
  addedFrom?: Doc<"cartItems">["addedFrom"];
  sourceItemId?: Id<"items">;
};

export async function addCartLine(
  ctx: MutationCtx,
  user: Doc<"users">,
  productId: Id<"products">,
  opts: AddCartOptions = {},
) {
  const quantity = opts.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_QTY) {
    throw appError("INVALID_INPUT", `Quantity must be 1–${MAX_CART_QTY}.`);
  }
  const product = await ctx.db.get(productId);
  const vendor = product?.vendorId ? await ctx.db.get(product.vendorId) : null;
  if (!product || !productVisibleTo(user.prefs.presentation, product, vendor)) {
    throw appError("NOT_FOUND", "That product is not available.");
  }
  const variants = (await loadVariants(ctx, product._id)).filter((variant) => variant.active);
  let variant: Doc<"productVariants"> | null = null;
  if (opts.variantId) {
    variant = variants.find((candidate) => candidate._id === opts.variantId) ?? null;
    if (!variant) throw appError("NOT_FOUND", "That option is not available.");
  } else if (variants.length === 1) {
    variant = variants[0] ?? null;
  } else if (variants.length > 1) {
    throw appError("INVALID_INPUT", "Choose a size or option first.", { needsVariant: true });
  }
  if (variant && variant.stock < quantity) {
    throw appError("CONFLICT", variant.stock === 0 ? "Sold out." : `Only ${variant.stock} left.`, {
      stock: variant.stock,
    });
  }
  const price = await pricedUnitInr(ctx, product, variant);
  const cart = await getOrCreateCart(ctx, user._id);
  const existing = await ctx.db
    .query("cartItems")
    .withIndex("by_cartId_and_productId_and_variantId", (q) =>
      q.eq("cartId", cart._id).eq("productId", productId).eq("variantId", variant?._id),
    )
    .unique();
  if (existing) {
    const next = Math.min(MAX_CART_QTY, existing.quantity + quantity, variant?.stock ?? MAX_CART_QTY);
    await ctx.db.patch(existing._id, { quantity: next, priceInr: price, name: product.name });
  } else {
    const count = (await cartLines(ctx, cart._id)).length;
    if (count >= MAX_CART_LINES) {
      throw appError("INVALID_INPUT", "The bag is full. Remove something before adding more.");
    }
    await ctx.db.insert("cartItems", {
      cartId: cart._id,
      userId: user._id,
      vendorId: product.vendorId,
      productId,
      ...(variant ? { variantId: variant._id } : {}),
      quantity,
      priceInr: price,
      name: product.name,
      ...(opts.addedFrom ? { addedFrom: opts.addedFrom } : {}),
      ...(opts.sourceItemId ? { sourceItemId: opts.sourceItemId } : {}),
    });
  }
  await ctx.db.patch(cart._id, { updatedAt: Date.now() });
}

export async function setCartQuantity(
  ctx: MutationCtx,
  userId: Id<"users">,
  lineId: Id<"cartItems">,
  quantity: number,
) {
  const line = await ctx.db.get(lineId);
  if (!line || line.userId !== userId) throw appError("NOT_FOUND", "That bag line doesn't exist.");
  if (quantity === 0) {
    await ctx.db.delete(line._id);
    return;
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_CART_QTY) {
    throw appError("INVALID_INPUT", `Quantity must be 1–${MAX_CART_QTY}.`);
  }
  if (line.variantId) {
    const variant = await ctx.db.get(line.variantId);
    if (variant && variant.stock < quantity) {
      throw appError("CONFLICT", `Only ${variant.stock} left.`, { stock: variant.stock });
    }
  }
  await ctx.db.patch(line._id, { quantity });
}

/** Deletes an uploaded photo that never made it onto a product. */
export async function discardUnusedProductImage(ctx: MutationCtx, storageId: Id<"_storage">) {
  const used = await ctx.db
    .query("productImages")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first();
  if (!used) await ctx.storage.delete(storageId);
}
