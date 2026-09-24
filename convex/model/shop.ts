import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertOwner, requireUser } from "../lib/auth";
import { appError } from "../lib/errors";
import {
  lookupView,
  SHOP_CHECK_CAP,
  shopQuery,
  type ShopLookupView,
  type ShopOffer,
} from "../shared/shop";

type Ctx = QueryCtx | MutationCtx;

export async function prepareLookup(
  ctx: Ctx,
  itemId: Id<"items">,
): Promise<
  | { kind: "cached"; result: ShopLookupView }
  | { kind: "search"; query: string }
  | { kind: "fallback"; query: string }
> {
  const user = await requireUser(ctx);
  const item = assertOwner(await ctx.db.get(itemId), user, "item");
  if (item.status !== "ready") {
    throw appError("INVALID_INPUT", "This piece has to finish extracting before you can shop it.");
  }

  const existing = await lookupForItem(ctx, item._id);
  const query = shopQuery(item, user.prefs.presentation);
  if (existing) return { kind: "cached", result: lookupView(existing.mode, existing.query, existing.offers) };

  const used = await ctx.db
    .query("shopLookups")
    .withIndex("by_user_mode", (q) => q.eq("userId", user._id).eq("mode", "offers"))
    .take(SHOP_CHECK_CAP);
  if (used.length >= SHOP_CHECK_CAP) return { kind: "fallback", query };
  return { kind: "search", query };
}

export async function saveLookup(
  ctx: MutationCtx,
  itemId: Id<"items">,
  query: string,
  offers: ShopOffer[],
): Promise<ShopLookupView> {
  const user = await requireUser(ctx);
  const item = assertOwner(await ctx.db.get(itemId), user, "item");
  const existing = await lookupForItem(ctx, item._id);
  if (existing) return lookupView(existing.mode, existing.query, existing.offers);

  const mode = offers.length > 0 ? "offers" : "links";
  await ctx.db.insert("shopLookups", {
    userId: user._id,
    itemId: item._id,
    query,
    mode,
    offers,
    createdAt: Date.now(),
  });
  return lookupView(mode, query, offers);
}

export async function deleteShopLookup(ctx: MutationCtx, itemId: Id<"items">): Promise<void> {
  const existing = await lookupForItem(ctx, itemId);
  if (existing) await ctx.db.delete(existing._id);
}

async function lookupForItem(ctx: Ctx, itemId: Id<"items">): Promise<Doc<"shopLookups"> | null> {
  return ctx.db
    .query("shopLookups")
    .withIndex("by_item", (q) => q.eq("itemId", itemId))
    .unique();
}
