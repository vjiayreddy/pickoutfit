import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { appError } from "./lib/errors";
import { listOrdersForUser, placeOrder, toBuyerOrderDetail } from "./model/orders";
import { vBuyerOrderDetail, vBuyerOrderListItem } from "./shared/products";

export const checkout = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    city: v.string(),
    pincode: v.string(),
  },
  returns: v.object({
    orderId: v.id("orders"),
    droppedNames: v.array(v.string()),
  }),
  handler: async (ctx, input) => {
    const user = await requireUser(ctx);
    return placeOrder(ctx, user, input);
  },
});

export const listMine = query({
  args: {},
  returns: v.array(vBuyerOrderListItem),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return listOrdersForUser(ctx, user._id);
  },
});

export const getMine = query({
  args: { orderId: v.id("orders") },
  returns: vBuyerOrderDetail,
  handler: async (ctx, { orderId }) => {
    const user = await requireUser(ctx);
    const order = await ctx.db.get(orderId);
    if (!order || order.userId !== user._id) {
      throw appError("NOT_FOUND", "That order doesn't exist.");
    }
    return toBuyerOrderDetail(ctx, order);
  },
});
