import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vAgeGroup,
  vDiscountKind,
  vDiscountScope,
  vInventoryReason,
  vOccasion,
  vOrderLineStatus,
  vOrderStatus,
  vProductCategory,
  vProductImageKind,
  vProductSource,
  vProductStatus,
  vReturnStatus,
  vShipmentStatus,
  vVariantColour,
} from "./shared/products";
import { vShopOffer } from "./shared/shop";
import {
  vBeardGoal,
  vBeardNow,
  vBudget,
  vDetectedItem,
  vFeature,
  vFit,
  vFormality,
  vGrooming,
  vHairGoal,
  vHairLength,
  vHairTexture,
  vItemAttributes,
  vItemStatus,
  vJobStatus,
  vJobStep,
  vJobType,
  vOutfitSlots,
  vPlanId,
  vPrefs,
  vRenderKind,
  vRenderQuality,
  vReservation,
  vSeason,
  vServiceId,
  vStyleOrigin,
  vStyleRefServiceId,
  vStyleRefStatus,
  vColours,
  vTokenUsage,
  vPresentation,
  vUploadTarget,
  vUserRole,
} from "./shared/validators";
import {
  vListingQuota,
  vPayoutStatus,
  vVendorAddress,
  vVendorPlanId,
  vVendorPlanStatus,
  vVendorRole,
  vVendorStatus,
} from "./shared/vendors";

export const EMBEDDING_DIMENSIONS = 1536;

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    role: vUserRole,
    plan: vPlanId,
    planPeriodEnd: v.optional(v.number()),
    billingCheckedAt: v.optional(v.number()),
    features: v.array(vFeature),
    planCredits: v.number(),
    packCredits: v.number(),
    dailySpend: v.object({ dayKey: v.string(), credits: v.number() }),
    defaultAvatarId: v.optional(v.id("avatars")),
    onboardedAt: v.optional(v.number()),
    prefs: vPrefs,
    createdAt: v.number(),
  })
    .index("by_authId", ["authId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_role", ["role"]),

  /** A seller on the marketplace. Members sign in with their normal account. */
  vendors: defineTable({
    name: v.string(),
    slug: v.string(),
    /** Short code used in SKUs, e.g. "V0007". */
    code: v.string(),
    ownerUserId: v.id("users"),
    status: vVendorStatus,
    description: v.optional(v.string()),
    supportEmail: v.string(),
    supportPhone: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    bannerStorageId: v.optional(v.id("_storage")),
    legalName: v.optional(v.string()),
    gstin: v.optional(v.string()),
    pan: v.optional(v.string()),
    address: vVendorAddress,
    /** Razorpay Route linked account. Set once onboarding is submitted. */
    payoutAccountId: v.optional(v.string()),
    payoutStatus: vPayoutStatus,
    commissionBps: v.number(),
    holdDays: v.number(),
    plan: vVendorPlanId,
    planStatus: vVendorPlanStatus,
    planPeriodEnd: v.optional(v.number()),
    listingQuota: vListingQuota,
    productCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_ownerUserId", ["ownerUserId"])
    .index("by_status", ["status"])
    .index("by_planStatus_and_planPeriodEnd", ["planStatus", "planPeriodEnd"])
    .index("by_createdAt", ["createdAt"]),

  vendorMembers: defineTable({
    vendorId: v.id("vendors"),
    userId: v.id("users"),
    role: vVendorRole,
    invitedBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_vendorId", ["vendorId"])
    .index("by_userId", ["userId"])
    .index("by_vendorId_and_userId", ["vendorId", "userId"]),

  avatars: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    label: v.string(),
    isDefault: v.boolean(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  uploads: defineTable({
    userId: v.id("users"),
    batchId: v.string(),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    sizeBytes: v.number(),
    jobId: v.optional(v.id("jobs")),
    /** Unset means wardrobe. A grooming upload skips garment detection. */
    serviceId: v.optional(vServiceId),
    /** Unset means wardrobe. `vendor_catalog` extractions become product drafts. */
    target: v.optional(vUploadTarget),
    vendorId: v.optional(v.id("vendors")),
    detectedCount: v.optional(v.number()),
    candidates: v.optional(v.array(vDetectedItem)),
    selectedIndices: v.optional(v.array(v.number())),
    selectionJobId: v.optional(v.id("jobs")),
    selectionConfirmedAt: v.optional(v.number()),
    status: v.union(
      v.literal("queued"),
      v.literal("detecting"),
      v.literal("awaiting_selection"),
      v.literal("extracting"),
      v.literal("done"),
      v.literal("failed"),
      v.literal("partial"),
    ),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"])
    .index("by_batch", ["batchId"])
    .index("by_vendorId", ["vendorId"]),

  items: defineTable({
    userId: v.id("users"),
    demoKey: v.optional(v.string()),
    uploadId: v.optional(v.id("uploads")),
    storageId: v.optional(v.id("_storage")),
    thumbStorageId: v.optional(v.id("_storage")),
    sourceBbox: v.optional(v.array(v.number())),
    ...vItemAttributes.fields,
    notes: v.optional(v.string()),
    searchText: v.string(),
    status: vItemStatus,
    wearCount: v.number(),
    lastWornAt: v.optional(v.number()),
    duplicateOfId: v.optional(v.id("items")),
    /** Set while an extraction job is rewriting this item's cutout (re-extract); the item stays visible meanwhile. */
    pendingJobId: v.optional(v.id("jobs")),
    usage: v.optional(vTokenUsage),
    costUsd: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user_category", ["userId", "category"])
    .index("by_user_demoKey", ["userId", "demoKey"])
    .index("by_upload", ["uploadId"])
    .index("by_createdAt", ["createdAt"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["userId"],
    }),

  /** Embeddings live apart from items so wardrobe reads stay small (a 1536-float vector is ~12 KB per item). */
  itemEmbeddings: defineTable({
    itemId: v.id("items"),
    userId: v.id("users"),
    embedding: v.array(v.float64()),
  })
    .index("by_item", ["itemId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIMENSIONS,
      filterFields: ["userId"],
    }),

  /** One shop-similar result per item. `offers` rows count toward the OpenAI check cap. */
  shopLookups: defineTable({
    userId: v.id("users"),
    itemId: v.id("items"),
    query: v.string(),
    mode: v.union(v.literal("offers"), v.literal("links")),
    offers: v.array(vShopOffer),
    createdAt: v.number(),
  })
    .index("by_item", ["itemId"])
    .index("by_user_mode", ["userId", "mode"]),

  outfits: defineTable({
    userId: v.id("users"),
    name: v.string(),
    slots: vOutfitSlots,
    occasion: v.optional(v.string()),
    brief: v.optional(v.string()),
    reasoning: v.optional(v.string()),
    source: v.union(v.literal("manual"), v.literal("agent")),
    threadId: v.optional(v.id("threads")),
    /** When the outfit was listed in /outfits: creation for manual outfits, "Save" for agent proposals. Unset = proposal only. */
    savedAt: v.optional(v.number()),
    wornOn: v.array(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_savedAt", ["userId", "savedAt"])
    .index("by_thread", ["threadId"]),

  renders: defineTable({
    userId: v.id("users"),
    /** Wardrobe try-ons. Absent on a standalone grooming preview. */
    outfitId: v.optional(v.id("outfits")),
    /** Profile-photo try-on. Absent on wardrobe renders. */
    lookId: v.optional(v.id("looks")),
    avatarId: v.id("avatars"),
    jobId: v.id("jobs"),
    storageId: v.optional(v.id("_storage")),
    /** Snapshot of the source try-on PNG at groom create time (avoids parent-delete races). */
    sourceStorageId: v.optional(v.id("_storage")),
    quality: vRenderQuality,
    /** Absent on legacy rows — treat as try_on. */
    kind: v.optional(vRenderKind),
    /** Which service produced this image. Unset on legacy wardrobe try-ons. */
    serviceId: v.optional(vServiceId),
    parentRenderId: v.optional(v.id("renders")),
    grooming: v.optional(vGrooming),
    status: v.union(
      v.literal("pending"),
      v.literal("done"),
      v.literal("failed"),
    ),
    prompt: v.string(),
    usage: v.optional(vTokenUsage),
    costUsd: v.optional(v.number()),
    creditsCharged: v.number(),
    shareToken: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_kind", ["userId", "kind"])
    .index("by_user_kind_service", ["userId", "kind", "serviceId"])
    .index("by_outfit", ["outfitId"])
    .index("by_job", ["jobId"])
    .index("by_shareToken", ["shareToken"])
    .index("by_createdAt", ["createdAt"])
    .index("by_parent", ["parentRenderId"]),

  jobs: defineTable({
    userId: v.id("users"),
    type: vJobType,
    /** Unset means wardrobe (ingest or outfit try-on). */
    serviceId: v.optional(vServiceId),
    /** Set on vendor catalog jobs; the vendor desk lists jobs by this. */
    vendorId: v.optional(v.id("vendors")),
    status: vJobStatus,
    steps: v.array(vJobStep),
    progress: v.number(),
    reservation: vReservation,
    refunds: vReservation,
    workflowId: v.optional(v.string()),
    uploadId: v.optional(v.id("uploads")),
    /** Upload batch this ingest job belongs to; a whole batch counts as one running unit for LIMITS.maxRunningJobsPerUser. */
    batchId: v.optional(v.string()),
    outfitIds: v.optional(v.array(v.id("outfits"))),
    resultIds: v.array(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user", ["userId"])
    .index("by_workflowId", ["workflowId"])
    .index("by_status", ["status", "createdAt"])
    .index("by_vendorId_and_createdAt", ["vendorId", "createdAt"]),

  creditLedger: defineTable({
    userId: v.id("users"),
    delta: v.number(),
    bucket: v.union(v.literal("plan"), v.literal("pack")),
    kind: v.union(
      v.literal("plan_grant"),
      v.literal("plan_reset"),
      v.literal("signup_bonus"),
      v.literal("topup"),
      v.literal("reserve"),
      v.literal("refund"),
      v.literal("admin"),
    ),
    jobId: v.optional(v.id("jobs")),
    ref: v.string(),
    note: v.optional(v.string()),
    balanceAfter: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_ref", ["ref"])
    .index("by_createdAt", ["createdAt"]),

  threads: defineTable({
    userId: v.id("users"),
    title: v.string(),
    eveSessionId: v.optional(v.string()),
    sessionVerifiedAt: v.optional(v.number()),
    streamIndex: v.optional(v.number()),
    lastMessageAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_eveSessionId", ["eveSessionId"]),

  proposals: defineTable({
    threadId: v.id("threads"),
    userId: v.id("users"),
    outfitId: v.id("outfits"),
    jobId: v.optional(v.id("jobs")),
    createdAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_user", ["userId"]),

  systemCounters: defineTable({
    dayKey: v.string(),
    key: v.union(
      v.literal("credits_reserved"),
      v.literal("users_total"),
      v.literal("product_sku"),
      v.literal("vendor_code"),
      v.literal("order_number"),
    ),
    value: v.number(),
  }).index("by_day_key", ["dayKey", "key"]),

  usageCounters: defineTable({
    userId: v.id("users"),
    dayKey: v.string(),
    counter: v.union(v.literal("detect"), v.literal("stylist")),
    count: v.number(),
  }).index("by_user_day_counter", ["userId", "dayKey", "counter"]),

  /** Per-day aggregates for the admin dashboard, bumped in the same mutations that change the underlying rows. */
  dailyStats: defineTable({
    dayKey: v.string(),
    creditsSold: v.number(),
    creditsGranted: v.number(),
    creditsSpent: v.number(),
    creditsRefunded: v.number(),
    revenueUsd: v.number(),
    cogsUsd: v.number(),
    rendersDone: v.number(),
    itemsExtracted: v.number(),
    jobsFailed: v.number(),
    newUsers: v.number(),
  }).index("by_day", ["dayKey"]),

  /**
   * One row per user per service. Hairstyle and beard are the live variants.
   * Skincare and later advice services use the same table.
   */
  serviceProfiles: defineTable({
    userId: v.id("users"),
    serviceId: vServiceId,
    budget: vBudget,
    hairLength: v.optional(vHairLength),
    texture: v.optional(vHairTexture),
    hairGoal: v.optional(vHairGoal),
    beardNow: v.optional(vBeardNow),
    beardGoal: v.optional(vBeardGoal),
    updatedAt: v.number(),
  }).index("by_user_service", ["userId", "serviceId"]),

  /** A saved hair or beard style, not the finished photo. */
  styleRefs: defineTable({
    userId: v.id("users"),
    serviceId: vStyleRefServiceId,
    origin: vStyleOrigin,
    uploadId: v.optional(v.id("uploads")),
    storageId: v.optional(v.id("_storage")),
    label: v.string(),
    status: vStyleRefStatus,
    createdAt: v.number(),
  }).index("by_user_service", ["userId", "serviceId"]),

  /** One try-on request on the profile photo. Outfit is empty until a look stacks clothes. */
  looks: defineTable({
    userId: v.id("users"),
    avatarId: v.id("avatars"),
    outfitId: v.optional(v.id("outfits")),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Which styles are on a look. At most one hairstyle and one beard. */
  lookRefs: defineTable({
    lookId: v.id("looks"),
    styleRefId: v.id("styleRefs"),
    serviceId: vStyleRefServiceId,
  })
    .index("by_look", ["lookId"])
    .index("by_styleRef", ["styleRefId"]),

  /**
   * Nested catalog taxonomy (Clothes → Men → Shirt → Formal).
   * Roots omit `parentId`. `path` is the slug breadcrumb for branch queries.
   */
  categories: defineTable({
    name: v.string(),
    slug: v.string(),
    parentId: v.optional(v.id("categories")),
    path: v.string(),
    /** Optional cover / icon for the category. */
    imageStorageId: v.optional(v.id("_storage")),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_parentId", ["parentId"])
    .index("by_slug", ["slug"])
    .index("by_parentId_and_slug", ["parentId", "slug"])
    .index("by_path", ["path"]),

  /**
   * Option dimensions (Payload `variantTypes`): Size, Colour, etc.
   * Platform-level; products opt in via `variantTypeIds`.
   */
  variantTypes: defineTable({
    label: v.string(),
    slug: v.string(),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_sortOrder", ["sortOrder"]),

  /**
   * Values on a dimension (Payload `variantOptions`): S/M/L, Black/Navy, etc.
   */
  variantOptions: defineTable({
    variantTypeId: v.id("variantTypes"),
    label: v.string(),
    value: v.string(),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_variantTypeId_and_sortOrder", ["variantTypeId", "sortOrder"])
    .index("by_variantTypeId_and_value", ["variantTypeId", "value"]),

  /**
   * Marketplace catalog. One row per sellable product, owned by a vendor.
   * `vendorId` / `status` are optional only until the House-vendor backfill has run.
   */
  products: defineTable({
    vendorId: v.optional(v.id("vendors")),
    status: v.optional(vProductStatus),
    /** Unique within the vendor. */
    slug: v.optional(v.string()),
    source: v.optional(vProductSource),
    category: vProductCategory,
    /** Nested taxonomy leaf (or any node). Optional until products are backfilled. */
    categoryId: v.optional(v.id("categories")),
    presentation: vPresentation,
    name: v.string(),
    /** Assigned once at create. Absent on rows saved before SKUs existed. */
    sku: v.optional(v.string()),
    /** Absent on rows created before catalog details. */
    brand: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    /** Controlled type for the shop section, e.g. t-shirt or serum. */
    productType: v.optional(v.string()),
    description: v.optional(v.string()),
    colours: v.optional(vColours),
    pattern: v.optional(v.string()),
    material: v.optional(v.string()),
    season: v.optional(v.array(vSeason)),
    formality: v.optional(vFormality),
    fit: v.optional(vFit),
    /** Only when a size label is visible. Absent when unknown. */
    size: v.optional(v.string()),
    ageGroup: v.optional(vAgeGroup),
    occasion: v.optional(vOccasion),
    priceInr: v.number(),
    /** MRP shown struck through when higher than `priceInr`. */
    compareAtPriceInr: v.optional(v.number()),
    hasVariants: v.optional(v.boolean()),
    /**
     * Option dimensions enabled on this product (Payload `variantTypes` relation).
     * Empty / absent means free-form size+colour fields only.
     */
    variantTypeIds: v.optional(v.array(v.id("variantTypes"))),
    /** Cover image. The first entry of `imageIds` when that list is set. Legacy; see `productImages`. */
    storageId: v.optional(v.id("_storage")),
    /** Legacy photo list, moved to `productImages` by the backfill. */
    imageIds: v.optional(v.array(v.id("_storage"))),
    /** Legacy flag, replaced by `status`. */
    active: v.boolean(),
    /** Extraction provenance: the look photo this garment was cut from. */
    sourceUploadId: v.optional(v.id("uploads")),
    referenceStorageId: v.optional(v.id("_storage")),
    sourceBbox: v.optional(v.array(v.number())),
    cutoutStorageId: v.optional(v.id("_storage")),
    searchText: v.optional(v.string()),
    soldCount: v.optional(v.number()),
    viewCount: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_category_and_presentation", ["category", "presentation"])
    .index("by_categoryId", ["categoryId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_sku", ["sku"])
    .index("by_vendorId_and_status", ["vendorId", "status"])
    .index("by_vendorId_and_slug", ["vendorId", "slug"])
    .index("by_status_and_category_and_presentation", ["status", "category", "presentation"])
    .index("by_status_and_category_and_subcategory", ["status", "category", "subcategory"])
    .index("by_sourceUploadId", ["sourceUploadId"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status", "category", "vendorId"],
    }),

  /** Every photo on a product, in display order. Cutouts come from extraction. */
  productImages: defineTable({
    productId: v.id("products"),
    vendorId: v.id("vendors"),
    storageId: v.id("_storage"),
    kind: vProductImageKind,
    variantId: v.optional(v.id("productVariants")),
    position: v.number(),
    createdAt: v.number(),
  })
    .index("by_productId_and_position", ["productId", "position"])
    .index("by_vendorId", ["vendorId"])
    .index("by_storageId", ["storageId"]),

  /**
   * Sellable SKUs (Payload `variants`).
   * Prefer `optionIds` (one option per enabled type); `size`/`colour` stay for cart labels + legacy rows.
   */
  productVariants: defineTable({
    productId: v.id("products"),
    vendorId: v.id("vendors"),
    sku: v.string(),
    /** Selected `variantOptions` for this SKU (Payload `variants.options`). */
    optionIds: v.optional(v.array(v.id("variantOptions"))),
    size: v.optional(v.string()),
    colour: v.optional(vVariantColour),
    /** Unset means the product price. */
    priceInr: v.optional(v.number()),
    compareAtPriceInr: v.optional(v.number()),
    stock: v.number(),
    active: v.boolean(),
    position: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_productId_and_position", ["productId", "position"])
    .index("by_vendorId", ["vendorId"])
    .index("by_sku", ["sku"]),

  /** Stock audit trail. Every stock change writes one row. */
  inventoryMovements: defineTable({
    vendorId: v.id("vendors"),
    variantId: v.id("productVariants"),
    delta: v.number(),
    reason: vInventoryReason,
    orderItemId: v.optional(v.id("orderItems")),
    stockAfter: v.number(),
    actorUserId: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("by_variantId_and_createdAt", ["variantId", "createdAt"])
    .index("by_vendorId_and_createdAt", ["vendorId", "createdAt"]),

  /** Vendor promotions. No `code` means the discount applies automatically. */
  discounts: defineTable({
    vendorId: v.id("vendors"),
    name: v.string(),
    code: v.optional(v.string()),
    kind: vDiscountKind,
    value: v.number(),
    scope: vDiscountScope,
    categories: v.optional(v.array(vProductCategory)),
    collectionId: v.optional(v.id("collections")),
    productIds: v.optional(v.array(v.id("products"))),
    minOrderInr: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    usedCount: v.number(),
    startsAt: v.number(),
    endsAt: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_vendorId_and_active", ["vendorId", "active"])
    .index("by_code", ["code"]),

  /** Vendor-defined groupings. Categories stay a platform taxonomy. */
  collections: defineTable({
    vendorId: v.id("vendors"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    coverStorageId: v.optional(v.id("_storage")),
    productIds: v.array(v.id("products")),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_vendorId", ["vendorId"])
    .index("by_vendorId_and_slug", ["vendorId", "slug"]),

  /** One open bag per user. Checkout deletes it. */
  carts: defineTable({
    userId: v.id("users"),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  cartItems: defineTable({
    cartId: v.id("carts"),
    userId: v.id("users"),
    vendorId: v.optional(v.id("vendors")),
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    quantity: v.number(),
    priceInr: v.number(),
    name: v.string(),
    /** Where the shopper found it, for vendor analytics. */
    addedFrom: v.optional(
      v.union(
        v.literal("similar"),
        v.literal("outfit"),
        v.literal("agent"),
        v.literal("rail"),
        v.literal("store"),
      ),
    ),
    sourceItemId: v.optional(v.id("items")),
  })
    .index("by_cartId", ["cartId"])
    .index("by_cartId_and_productId", ["cartId", "productId"])
    .index("by_cartId_and_productId_and_variantId", ["cartId", "productId", "variantId"])
    .index("by_userId", ["userId"]),

  /** Buyer fields are a snapshot so sales history survives account deletion. */
  orders: defineTable({
    userId: v.id("users"),
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    pincode: v.string(),
    status: vOrderStatus,
    totalInr: v.number(),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_createdAt", ["createdAt"]),

  orderItems: defineTable({
    orderId: v.id("orders"),
    productId: v.optional(v.id("products")),
    /** Set on new checkouts; absent on legacy rows until backfill. */
    vendorId: v.optional(v.id("vendors")),
    variantId: v.optional(v.id("productVariants")),
    name: v.string(),
    sku: v.optional(v.string()),
    size: v.optional(v.string()),
    colour: v.optional(v.string()),
    quantity: v.number(),
    priceInr: v.number(),
    lineStatus: v.optional(vOrderLineStatus),
    /** Copied from the order so vendors can page their lines by time. */
    createdAt: v.optional(v.number()),
  })
    .index("by_orderId", ["orderId"])
    .index("by_vendorId_and_createdAt", ["vendorId", "createdAt"])
    .index("by_vendorId_and_lineStatus_and_createdAt", ["vendorId", "lineStatus", "createdAt"]),

  /** Vendor shipment with optional carrier tracking. One shipment can cover several lines. */
  shipments: defineTable({
    orderId: v.id("orders"),
    vendorId: v.id("vendors"),
    orderItemIds: v.array(v.id("orderItems")),
    carrier: v.optional(v.string()),
    trackingNumber: v.optional(v.string()),
    status: vShipmentStatus,
    shippedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_vendorId_and_createdAt", ["vendorId", "createdAt"])
    .index("by_orderId", ["orderId"]),

  /** Vendor-ops returns. Accepting restocks via inventory reason `return`. */
  returns: defineTable({
    orderId: v.id("orders"),
    orderItemId: v.id("orderItems"),
    vendorId: v.id("vendors"),
    quantity: v.number(),
    reason: v.string(),
    status: vReturnStatus,
    restocked: v.boolean(),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_vendorId_and_createdAt", ["vendorId", "createdAt"])
    .index("by_orderItemId", ["orderItemId"])
    .index("by_vendorId_and_status_and_createdAt", ["vendorId", "status", "createdAt"]),

  /** Running average duration per step prefix ("detect", "extract", "render") for ETAs. */
  stepStats: defineTable({
    key: v.string(),
    count: v.number(),
    avgMs: v.number(),
  }).index("by_key", ["key"]),
});
