import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { getPublicProductById } from "./model/catalog";
import { vSlot } from "./shared/validators";
import type { Slot } from "./shared/wardrobe";

const MAX_TRIAL_ITEMS = 24;

const vTrialPiece = v.object({
  lineId: v.id("trialRoomItems"),
  productId: v.id("products"),
  slot: vSlot,
  name: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  vendorName: v.string(),
  vendorSlug: v.string(),
  slug: v.string(),
  priceInr: v.number(),
  canTryOn: v.boolean(),
  addedAt: v.number(),
});

export const current = query({
  args: {},
  returns: v.object({
    pieces: v.array(vTrialPiece),
    count: v.number(),
  }),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("trialRoomItems")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_TRIAL_ITEMS);
    const pieces = [];
    for (const row of rows) {
      try {
        const product = await getPublicProductById(ctx, row.productId);
        pieces.push({
          lineId: row._id,
          productId: product.id,
          slot: row.slot,
          name: product.name,
          imageUrl: product.imageUrl,
          vendorName: product.vendorName,
          vendorSlug: product.vendorSlug,
          slug: product.slug,
          priceInr: product.priceInr,
          canTryOn: product.canTryOn,
          addedAt: row.addedAt,
        });
      } catch {
        // Drop stale / unpublished products from the view.
      }
    }
    pieces.sort((a, b) => a.addedAt - b.addedAt);
    return { pieces, count: pieces.length };
  },
});

export const count = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("trialRoomItems")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_TRIAL_ITEMS);
    return rows.length;
  },
});

export const add = mutation({
  args: {
    productId: v.id("products"),
    slot: vSlot,
  },
  returns: v.null(),
  handler: async (ctx, { productId, slot }) => {
    const user = await requireUser(ctx);
    const product = await getPublicProductById(ctx, productId);
    if (!product.canTryOn) {
      throw appError(
        "INVALID_INPUT",
        "This product needs a cutout before it can go in the trial room.",
      );
    }

    const existing = await ctx.db
      .query("trialRoomItems")
      .withIndex("by_userId_and_productId", (q) =>
        q.eq("userId", user._id).eq("productId", productId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { slot });
      await enforceSlotRules(ctx, user._id, slot, existing._id);
      return null;
    }

    const all = await ctx.db
      .query("trialRoomItems")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_TRIAL_ITEMS);
    if (all.length >= MAX_TRIAL_ITEMS) {
      throw appError(
        "INVALID_INPUT",
        `Trial room can hold at most ${MAX_TRIAL_ITEMS} pieces. Remove some first.`,
      );
    }

    const lineId = await ctx.db.insert("trialRoomItems", {
      userId: user._id,
      productId,
      slot,
      addedAt: Date.now(),
    });
    await enforceSlotRules(ctx, user._id, slot, lineId);
    return null;
  },
});

/** Add several products (e.g. shop-the-look) using each product's try-on slot. */
export const addMany = mutation({
  args: {
    items: v.array(
      v.object({
        productId: v.id("products"),
        slot: vSlot,
      }),
    ),
  },
  returns: v.object({ added: v.number() }),
  handler: async (ctx, { items }) => {
    const user = await requireUser(ctx);
    let added = 0;
    for (const item of items.slice(0, MAX_TRIAL_ITEMS)) {
      try {
        const product = await getPublicProductById(ctx, item.productId);
        if (!product.canTryOn) continue;
        const existing = await ctx.db
          .query("trialRoomItems")
          .withIndex("by_userId_and_productId", (q) =>
            q.eq("userId", user._id).eq("productId", item.productId),
          )
          .unique();
        if (existing) {
          await ctx.db.patch(existing._id, { slot: item.slot });
          await enforceSlotRules(ctx, user._id, item.slot, existing._id);
          added += 1;
          continue;
        }
        const all = await ctx.db
          .query("trialRoomItems")
          .withIndex("by_userId", (q) => q.eq("userId", user._id))
          .take(MAX_TRIAL_ITEMS);
        if (all.length >= MAX_TRIAL_ITEMS) break;
        const lineId = await ctx.db.insert("trialRoomItems", {
          userId: user._id,
          productId: item.productId,
          slot: item.slot,
          addedAt: Date.now(),
        });
        await enforceSlotRules(ctx, user._id, item.slot, lineId);
        added += 1;
      } catch {
        // Skip unavailable products.
      }
    }
    return { added };
  },
});

export const remove = mutation({
  args: { lineId: v.id("trialRoomItems") },
  returns: v.null(),
  handler: async (ctx, { lineId }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(lineId);
    if (!row || row.userId !== user._id) {
      throw appError("NOT_FOUND", "That trial room piece is gone.");
    }
    await ctx.db.delete(lineId);
    return null;
  },
});

export const setSlot = mutation({
  args: {
    lineId: v.id("trialRoomItems"),
    slot: vSlot,
  },
  returns: v.null(),
  handler: async (ctx, { lineId, slot }) => {
    const user = await requireUser(ctx);
    const row = await ctx.db.get(lineId);
    if (!row || row.userId !== user._id) {
      throw appError("NOT_FOUND", "That trial room piece is gone.");
    }
    await ctx.db.patch(lineId, { slot });
    await enforceSlotRules(ctx, user._id, slot, lineId);
    return null;
  },
});

export const clear = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("trialRoomItems")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(MAX_TRIAL_ITEMS);
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});

/**
 * Single slots keep one piece; dress clears top+bottom and vice versa.
 * Accessories are many.
 */
async function enforceSlotRules(
  ctx: MutationCtx,
  userId: Id<"users">,
  slot: Slot,
  keepLineId: Id<"trialRoomItems">,
) {
  if (slot !== "accessories") {
    const sameSlot = await ctx.db
      .query("trialRoomItems")
      .withIndex("by_userId_and_slot", (q) =>
        q.eq("userId", userId).eq("slot", slot),
      )
      .take(8);
    for (const row of sameSlot) {
      if (row._id !== keepLineId) await ctx.db.delete(row._id);
    }
  }

  if (slot === "dress") {
    for (const other of ["top", "bottom"] as const) {
      const rows = await ctx.db
        .query("trialRoomItems")
        .withIndex("by_userId_and_slot", (q) =>
          q.eq("userId", userId).eq("slot", other),
        )
        .take(8);
      for (const row of rows) await ctx.db.delete(row._id);
    }
  }

  if (slot === "top" || slot === "bottom") {
    const dresses = await ctx.db
      .query("trialRoomItems")
      .withIndex("by_userId_and_slot", (q) =>
        q.eq("userId", userId).eq("slot", "dress"),
      )
      .take(8);
    for (const row of dresses) await ctx.db.delete(row._id);
  }
}
