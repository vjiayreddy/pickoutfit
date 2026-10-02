import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { scheduleOfferExpiry } from "./discountsExpire";
import { assertVendorWritable, requireVendor } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  vDiscountKind,
  vDiscountScope,
  vDiscountView,
  vOfferKind,
  vProductCategory,
  type OfferKind,
} from "./shared/products";
import { MAX_VENDOR_DISCOUNTS } from "./shared/vendors";

const vDiscountFields = {
  name: v.string(),
  code: v.optional(v.string()),
  kind: vDiscountKind,
  value: v.number(),
  scope: vDiscountScope,
  offerKind: v.optional(vOfferKind),
  badge: v.optional(v.string()),
  priority: v.optional(v.number()),
  categories: v.optional(v.array(vProductCategory)),
  collectionId: v.optional(v.id("collections")),
  productIds: v.optional(v.array(v.id("products"))),
  attributeKey: v.optional(v.string()),
  attributeValues: v.optional(v.array(v.string())),
  minOrderInr: v.optional(v.number()),
  maxUses: v.optional(v.number()),
  startsAt: v.number(),
  endsAt: v.optional(v.number()),
  active: v.boolean(),
};

type DiscountInput = {
  name: string;
  code?: string;
  kind: Doc<"discounts">["kind"];
  value: number;
  scope: Doc<"discounts">["scope"];
  offerKind?: OfferKind;
  badge?: string;
  priority?: number;
  categories?: Doc<"discounts">["categories"];
  collectionId?: Doc<"discounts">["collectionId"];
  productIds?: Doc<"discounts">["productIds"];
  attributeKey?: string;
  attributeValues?: string[];
  minOrderInr?: number;
  maxUses?: number;
  startsAt: number;
  endsAt?: number;
  active: boolean;
};

function normaliseCode(code: string | undefined): string | undefined {
  const clean = code?.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  return clean ? clean.slice(0, 24) : undefined;
}

async function cleanDiscount(ctx: MutationCtx, vendor: Doc<"vendors">, input: DiscountInput, selfId?: Doc<"discounts">["_id"]) {
  const name = input.name.trim().slice(0, 80);
  if (!name) throw appError("INVALID_INPUT", "Give the discount a name.");
  if (!Number.isFinite(input.value) || input.value <= 0) {
    throw appError("INVALID_INPUT", "The discount value must be positive.");
  }
  if (input.kind === "percent" && input.value > 90) {
    throw appError("INVALID_INPUT", "Percent discounts are capped at 90%.");
  }
  if (input.endsAt !== undefined && input.endsAt <= input.startsAt) {
    throw appError("INVALID_INPUT", "The end date must come after the start date.");
  }
  if (input.scope === "category" && !input.categories?.length) {
    throw appError("INVALID_INPUT", "Pick at least one category.");
  }
  if (input.scope === "products" && !input.productIds?.length) {
    throw appError("INVALID_INPUT", "Pick at least one product.");
  }
  if (input.scope === "attribute") {
    const key = input.attributeKey?.trim().toLowerCase().replace(/\s+/g, "_");
    const values = (input.attributeValues ?? []).map((value) => value.trim()).filter(Boolean);
    if (!key || values.length === 0) {
      throw appError("INVALID_INPUT", "Attribute offers need a key and at least one value.");
    }
  }
  if (input.scope === "collection") {
    const collection = input.collectionId ? await ctx.db.get(input.collectionId) : null;
    if (!collection || collection.vendorId !== vendor._id) {
      throw appError("INVALID_INPUT", "Pick one of your collections.");
    }
  }
  if (input.productIds) {
    for (const productId of input.productIds.slice(0, 200)) {
      const product = await ctx.db.get(productId);
      if (!product || product.vendorId !== vendor._id) {
        throw appError("FORBIDDEN", "That product isn't yours.");
      }
    }
  }
  const code = normaliseCode(input.code);
  if (code) {
    const clash = await ctx.db
      .query("discounts")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (clash && clash._id !== selfId) throw appError("CONFLICT", "That code is already in use.");
  }
  const badge = input.badge?.trim().slice(0, 40) || undefined;
  const attributeKey =
    input.scope === "attribute"
      ? input.attributeKey?.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40)
      : undefined;
  const attributeValues =
    input.scope === "attribute"
      ? (input.attributeValues ?? [])
          .map((value) => value.trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, 40)
      : undefined;
  return {
    name,
    code,
    kind: input.kind,
    value: Math.round(input.value * 100) / 100,
    scope: input.scope,
    offerKind: input.offerKind ?? "standard",
    badge,
    priority: Number.isFinite(input.priority) ? Math.round(input.priority!) : 0,
    categories: input.scope === "category" ? input.categories : undefined,
    collectionId: input.scope === "collection" ? input.collectionId : undefined,
    productIds: input.scope === "products" ? input.productIds?.slice(0, 200) : undefined,
    attributeKey,
    attributeValues,
    minOrderInr: input.minOrderInr && input.minOrderInr > 0 ? Math.round(input.minOrderInr) : undefined,
    maxUses: input.maxUses && input.maxUses > 0 ? Math.round(input.maxUses) : undefined,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    active: input.active,
  };
}

function toView(discount: Doc<"discounts">) {
  return {
    id: discount._id,
    name: discount.name,
    code: discount.code ?? null,
    kind: discount.kind,
    value: discount.value,
    scope: discount.scope,
    offerKind: discount.offerKind ?? ("standard" as const),
    badge: discount.badge ?? null,
    priority: discount.priority ?? 0,
    categories: discount.categories ?? [],
    collectionId: discount.collectionId ?? null,
    productIds: discount.productIds ?? [],
    attributeKey: discount.attributeKey ?? null,
    attributeValues: discount.attributeValues ?? [],
    minOrderInr: discount.minOrderInr ?? null,
    maxUses: discount.maxUses ?? null,
    usedCount: discount.usedCount,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt ?? null,
    active: discount.active,
    createdAt: discount.createdAt,
  };
}

async function requireOwn(ctx: MutationCtx, vendor: Doc<"vendors">, discountId: Doc<"discounts">["_id"]) {
  const discount = await ctx.db.get(discountId);
  if (!discount || discount.vendorId !== vendor._id) throw appError("NOT_FOUND", "That discount doesn't exist.");
  return discount;
}

export const list = query({
  args: {},
  returns: v.array(vDiscountView),
  handler: async (ctx) => {
    const { vendor } = await requireVendor(ctx);
    const rows = await ctx.db
      .query("discounts")
      .withIndex("by_vendorId_and_active", (q) => q.eq("vendorId", vendor._id))
      .order("desc")
      .take(MAX_VENDOR_DISCOUNTS);
    return rows.map(toView);
  },
});

export const create = mutation({
  args: vDiscountFields,
  returns: v.id("discounts"),
  handler: async (ctx, input) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const existing = await ctx.db
      .query("discounts")
      .withIndex("by_vendorId_and_active", (q) => q.eq("vendorId", vendor._id))
      .take(MAX_VENDOR_DISCOUNTS);
    if (existing.length >= MAX_VENDOR_DISCOUNTS) {
      throw appError("INVALID_INPUT", `You can keep at most ${MAX_VENDOR_DISCOUNTS} discounts. Delete one first.`);
    }
    const clean = await cleanDiscount(ctx, vendor, input);
    const now = Date.now();
    const discountId = await ctx.db.insert("discounts", {
      vendorId: vendor._id,
      ...clean,
      usedCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await scheduleOfferExpiry(ctx, discountId, clean.endsAt);
    return discountId;
  },
});

export const update = mutation({
  args: { discountId: v.id("discounts"), ...vDiscountFields },
  returns: v.null(),
  handler: async (ctx, { discountId, ...input }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const discount = await requireOwn(ctx, vendor, discountId);
    const clean = await cleanDiscount(ctx, vendor, input, discount._id);
    await ctx.db.patch(discount._id, { ...clean, updatedAt: Date.now() });
    await scheduleOfferExpiry(ctx, discountId, clean.endsAt);
    return null;
  },
});

export const setActive = mutation({
  args: { discountId: v.id("discounts"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { discountId, active }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    assertVendorWritable(vendor);
    const discount = await requireOwn(ctx, vendor, discountId);
    await ctx.db.patch(discount._id, { active, updatedAt: Date.now() });
    return null;
  },
});

export const remove = mutation({
  args: { discountId: v.id("discounts") },
  returns: v.null(),
  handler: async (ctx, { discountId }) => {
    const { vendor } = await requireVendor(ctx, { minRole: "manager" });
    const discount = await requireOwn(ctx, vendor, discountId);
    await ctx.db.delete(discount._id);
    return null;
  },
});
