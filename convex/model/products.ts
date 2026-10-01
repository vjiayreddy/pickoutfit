import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import {
  isProductType,
  MAX_CART_LINES,
  MAX_CART_QTY,
  MAX_PRODUCT_IMAGES,
  PRODUCT_SKU_PREFIX,
  productTypeLabel,
  type AgeGroup,
  type Occasion,
  type ProductCategory,
  type ProductStatus,
  type vProductView,
  type vVariantInput,
  type vVariantView,
} from "../shared/products";
import { MAX_PRODUCT_VARIANTS, VENDOR_PLANS, slugify, vendorSellable } from "../shared/vendors";
import type { Fit, Formality, Presentation, Season } from "../shared/wardrobe";
import { bumpSystemCounter } from "./stats";
import {
  legacyFieldsFromOptions,
  optionRefsFor,
  requireActiveVariantTypes,
  resolveOptionIds,
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
  /** Nested taxonomy node. Optional during migration from flat enums. */
  categoryId?: Id<"categories">;
  presentation: Presentation;
  name: string;
  brand?: string;
  subcategory: string;
  productType?: string;
  description: string;
  colours: ProductColours;
  pattern?: string;
  material?: string;
  season?: Season[];
  formality?: Formality;
  fit?: Fit;
  size?: string;
  ageGroup?: AgeGroup;
  occasion?: Occasion;
  priceInr: number;
  compareAtPriceInr?: number;
  /** Payload-style option dimensions enabled on this product. */
  variantTypeIds?: Id<"variantTypes">[];
  /** Photos in display order. Existing rows are matched by storageId. */
  imageIds: Id<"_storage">[];
  variants: VariantInput[];
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

export function cleanProductInput(input: ProductInput): ProductInput {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 80) {
    throw appError("INVALID_INPUT", "Product name must be 1–80 characters.");
  }
  const brand = input.brand?.trim() ?? "";
  if (brand.length > 80) throw appError("INVALID_INPUT", "Brand must be 80 characters or fewer.");
  const productType = input.productType?.trim() ?? "";
  if (productType && !isProductType(input.category, productType)) {
    throw appError("INVALID_INPUT", "Choose a type from this category.");
  }
  const subcategory = (input.subcategory.trim() || (productType ? productTypeLabel(productType) : "")).slice(0, 80);
  const size = input.size?.trim() ?? "";
  if (size.length > 24) throw appError("INVALID_INPUT", "Size must be 24 characters or fewer.");
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
  if (input.variants.length < 1) {
    throw appError("INVALID_INPUT", "Add at least one size or option.");
  }
  if (input.variants.length > MAX_PRODUCT_VARIANTS) {
    throw appError("INVALID_INPUT", `A product can have at most ${MAX_PRODUCT_VARIANTS} options.`);
  }
  const variants = input.variants.map((variant) => cleanVariant(variant, priceInr));
  const primary = input.colours.primary.trim().slice(0, 40);
  const secondary = input.colours.secondary
    .map((colour) => colour.trim())
    .filter((colour) => colour.length > 0)
    .slice(0, 6)
    .map((colour) => colour.slice(0, 40));
  const pattern = input.pattern?.trim().slice(0, 40) ?? "";
  const material = input.material?.trim().slice(0, 40) ?? "";
  return {
    ...input,
    name,
    brand: brand.length > 0 ? brand : undefined,
    subcategory,
    productType: productType || undefined,
    description,
    pattern: pattern || undefined,
    material: material || undefined,
    imageIds,
    variants,
    variantTypeIds: input.variantTypeIds,
    size: size || undefined,
    priceInr,
    compareAtPriceInr: compareAtPriceInr && compareAtPriceInr > 0 ? compareAtPriceInr : undefined,
    colours: {
      primary,
      secondary,
      hex: input.colours.hex.map(normalHex).filter((hex): hex is string => hex !== null).slice(0, 6),
    },
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
  const optionIds = variant.optionIds ? [...new Set(variant.optionIds)] : undefined;
  return {
    ...(variant.id ? { id: variant.id } : {}),
    ...(optionIds && optionIds.length > 0 ? { optionIds } : {}),
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
  const optionIds = variant.optionIds ?? [];
  return {
    id: variant._id,
    sku: variant.sku,
    optionIds,
    options: await optionRefsFor(ctx, optionIds),
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
      position: row.position,
      url: await ctx.storage.getUrl(row.storageId),
    })),
    ...legacy.map(async (storageId, position) => ({
      // Legacy rows have no image row yet; the id is a stable stand-in until the backfill runs.
      id: `${product._id}:${position}` as unknown as Id<"productImages">,
      storageId,
      kind: "studio" as const,
      position,
      url: await ctx.storage.getUrl(storageId),
    })),
  ]);
  const variants = await Promise.all(variantRows.map((variant) => toVariantView(ctx, variant, product)));
  const status = productStatus(product);
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
    presentation: product.presentation,
    name: product.name,
    sku: product.sku ?? null,
    brand: product.brand ?? null,
    subcategory: product.subcategory ?? "",
    productType: product.productType ?? null,
    description: product.description ?? "",
    colours: product.colours ?? EMPTY_COLOURS,
    pattern: product.pattern ?? null,
    material: product.material ?? null,
    size: product.size ?? null,
    ageGroup: product.ageGroup ?? null,
    occasion: product.occasion ?? null,
    priceInr: product.priceInr,
    compareAtPriceInr: product.compareAtPriceInr ?? null,
    hasVariants: product.hasVariants ?? false,
    variantTypeIds: product.variantTypeIds ?? [],
    totalStock: variants.filter((variant) => variant.active).reduce((sum, variant) => sum + variant.stock, 0),
    active: status === "active",
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

/** Text the storefront search index and the embedding both read. */
export function buildProductSearchText(product: {
  name: string;
  brand?: string;
  category: string;
  subcategory?: string;
  productType?: string;
  colours?: ProductColours;
  pattern?: string;
  material?: string;
  description?: string;
}): string {
  return [
    product.name,
    product.brand,
    product.category,
    product.subcategory,
    product.productType,
    product.colours?.primary,
    ...(product.colours?.secondary ?? []),
    product.pattern,
    product.material,
    product.description,
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .slice(0, 1000);
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

async function resolveCategoryId(
  ctx: Ctx,
  categoryId: Id<"categories"> | undefined,
): Promise<Id<"categories"> | undefined> {
  if (!categoryId) return undefined;
  const category = await ctx.db.get(categoryId);
  if (!category) throw appError("NOT_FOUND", "That category doesn't exist.");
  if (!category.isActive) throw appError("INVALID_INPUT", "That category is not active.");
  return categoryId;
}

export async function createProduct(
  ctx: MutationCtx,
  vendor: Doc<"vendors">,
  input: ProductInput,
  extra: { source?: Doc<"products">["source"]; status?: ProductStatus } = {},
): Promise<Id<"products">> {
  const clean = cleanProductInput(input);
  const categoryId = await resolveCategoryId(ctx, clean.categoryId);
  const variantTypeIds = clean.variantTypeIds?.length
    ? await requireActiveVariantTypes(ctx, clean.variantTypeIds)
    : [];
  const plan = VENDOR_PLANS[vendor.plan];
  if (vendor.productCount >= plan.maxProducts) {
    throw appError("RATE_LIMITED", `Your plan allows ${plan.maxProducts} products. Archive some or upgrade.`);
  }
  const now = Date.now();
  const sku = await allocateSku(ctx, vendor, clean.category);
  const slug = await uniqueProductSlug(ctx, vendor._id, clean.name, sku);
  const productId = await ctx.db.insert("products", {
    vendorId: vendor._id,
    status: extra.status ?? "draft",
    slug,
    source: extra.source ?? "manual",
    category: clean.category,
    ...(categoryId ? { categoryId } : {}),
    presentation: clean.presentation,
    name: clean.name,
    sku,
    ...(clean.brand ? { brand: clean.brand } : {}),
    subcategory: clean.subcategory,
    ...(clean.productType ? { productType: clean.productType } : {}),
    description: clean.description,
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
    ...(variantTypeIds.length > 0 ? { variantTypeIds } : {}),
    active: extra.status === "active",
    searchText: buildProductSearchText(clean),
    soldCount: 0,
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  const product = await ctx.db.get(productId);
  if (!product) throw appError("NOT_FOUND", "Product was not created.");
  await syncImages(ctx, product, vendor, clean.imageIds);
  await syncVariants(ctx, product, vendor, clean.variants, undefined, variantTypeIds);
  await ctx.db.patch(vendor._id, { productCount: vendor.productCount + 1, updatedAt: now });
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
  const categoryId =
    clean.categoryId !== undefined
      ? await resolveCategoryId(ctx, clean.categoryId)
      : product.categoryId;
  const variantTypeIds =
    clean.variantTypeIds !== undefined
      ? clean.variantTypeIds.length > 0
        ? await requireActiveVariantTypes(ctx, clean.variantTypeIds)
        : []
      : (product.variantTypeIds ?? []);
  const sku = product.sku ?? (await allocateSku(ctx, vendor, clean.category));
  const slug =
    product.slug && product.name === clean.name
      ? product.slug
      : await uniqueProductSlug(ctx, vendor._id, clean.name, sku, product._id);
  await ctx.db.patch(product._id, {
    slug,
    category: clean.category,
    categoryId,
    presentation: clean.presentation,
    name: clean.name,
    sku,
    brand: clean.brand,
    subcategory: clean.subcategory,
    productType: clean.productType,
    description: clean.description,
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
    variantTypeIds: variantTypeIds.length > 0 ? variantTypeIds : undefined,
    searchText: buildProductSearchText(clean),
    // Legacy fields are superseded by productImages rows.
    imageIds: undefined,
    storageId: undefined,
    updatedAt: Date.now(),
  });
  await syncImages(ctx, product, vendor, clean.imageIds);
  await syncVariants(ctx, product, vendor, clean.variants, undefined, variantTypeIds);
}

function hasRealVariants(variants: VariantInput[]): boolean {
  return (
    variants.length > 1 ||
    variants.some((variant) => Boolean(variant.size || variant.colour || variant.optionIds?.length))
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
  allowedTypeIds?: Id<"variantTypes">[],
): Promise<void> {
  const now = Date.now();
  const typeIds = allowedTypeIds ?? product.variantTypeIds ?? [];
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
    let optionIds = variant.optionIds;
    let size = variant.size;
    let colour = variant.colour;
    if (optionIds?.length) {
      const resolved = await resolveOptionIds(ctx, optionIds, typeIds.length > 0 ? typeIds : undefined);
      optionIds = resolved.optionIds;
      const legacy = legacyFieldsFromOptions(resolved.options, resolved.types);
      size = legacy.size ?? size;
      colour = legacy.colour ?? colour;
    }
    if (row) {
      await ctx.db.patch(row._id, {
        optionIds: optionIds && optionIds.length > 0 ? optionIds : undefined,
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
      ...(optionIds && optionIds.length > 0 ? { optionIds } : {}),
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
}

export async function archiveProduct(ctx: MutationCtx, vendor: Doc<"vendors">, productId: Id<"products">) {
  const product = await requireVendorProduct(ctx, vendor, productId);
  if (productStatus(product) === "archived") return;
  await ctx.db.patch(product._id, { status: "archived", active: false, updatedAt: Date.now() });
  await ctx.db.patch(vendor._id, {
    productCount: Math.max(0, vendor.productCount - 1),
    updatedAt: Date.now(),
  });
}

export async function unpublishProduct(ctx: MutationCtx, vendor: Doc<"vendors">, productId: Id<"products">) {
  const product = await requireVendorProduct(ctx, vendor, productId);
  await ctx.db.patch(product._id, { status: "draft", active: false, updatedAt: Date.now() });
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
    lines.push({
      id: line._id,
      productId: line.productId,
      variantId: line.variantId ?? null,
      variantLabel: variant ? variantLabel(variant) : null,
      vendorId: line.vendorId ?? product?.vendorId ?? ("" as Id<"vendors">),
      vendorName: vendor?.name ?? "",
      name: line.name,
      quantity: line.quantity,
      priceInr: line.priceInr,
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
  const price = effectivePrice(product, variant);
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
