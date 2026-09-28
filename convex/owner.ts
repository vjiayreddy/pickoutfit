import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwner, signInOwner, signOutOwner } from "./lib/ownerAuth";
import { appError } from "./lib/errors";
import {
  createProduct,
  listAllProducts,
  setProductActive,
  toProductView,
  updateProduct,
} from "./model/products";
import {
  listOrders as listOrderDocs,
  salesSummary,
  setOrderStatus,
  toOrderView,
} from "./model/orders";
import { vOrderStatus, vProductCategory, vProductView, vOrderView } from "./shared/products";
import { vPresentation } from "./shared/validators";

const vSession = { sessionToken: v.string() };

export const signIn = mutation({
  args: { email: v.string(), password: v.string() },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, { email, password }) => {
    if (password.length < 8 || password.length > 200) {
      throw appError("UNAUTHENTICATED", "Those owner credentials are not valid.");
    }
    const token = await signInOwner(ctx, email, password);
    return { token };
  },
});

export const signOut = mutation({
  args: vSession,
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => {
    await signOutOwner(ctx, sessionToken);
    return null;
  },
});

export const sales = query({
  args: vSession,
  returns: v.object({
    counts: v.object({
      placed: v.number(),
      fulfilled: v.number(),
      cancelled: v.number(),
    }),
    bookedInr: v.number(),
    bookedCount: v.number(),
    truncated: v.boolean(),
    sampleCap: v.number(),
  }),
  handler: async (ctx, { sessionToken }) => {
    await requireOwner(ctx, sessionToken);
    return salesSummary(ctx);
  },
});

export const listProducts = query({
  args: vSession,
  returns: v.array(vProductView),
  handler: async (ctx, { sessionToken }) => {
    await requireOwner(ctx, sessionToken);
    return listAllProducts(ctx);
  },
});

export const getProduct = query({
  args: { ...vSession, productId: v.id("products") },
  returns: vProductView,
  handler: async (ctx, { sessionToken, productId }) => {
    await requireOwner(ctx, sessionToken);
    const product = await ctx.db.get(productId);
    if (!product) throw appError("NOT_FOUND", "That product doesn't exist.");
    return toProductView(ctx, product);
  },
});

export const create = mutation({
  args: {
    ...vSession,
    category: vProductCategory,
    presentation: vPresentation,
    name: v.string(),
    priceInr: v.number(),
    storageId: v.optional(v.id("_storage")),
    active: v.boolean(),
  },
  returns: v.id("products"),
  handler: async (ctx, { sessionToken, ...input }) => {
    await requireOwner(ctx, sessionToken);
    return createProduct(ctx, input);
  },
});

export const update = mutation({
  args: {
    ...vSession,
    productId: v.id("products"),
    category: vProductCategory,
    presentation: vPresentation,
    name: v.string(),
    priceInr: v.number(),
    storageId: v.optional(v.id("_storage")),
    active: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { sessionToken, productId, ...input }) => {
    await requireOwner(ctx, sessionToken);
    await updateProduct(ctx, productId, input);
    return null;
  },
});

export const setActive = mutation({
  args: { ...vSession, productId: v.id("products"), active: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { sessionToken, productId, active }) => {
    await requireOwner(ctx, sessionToken);
    await setProductActive(ctx, productId, active);
    return null;
  },
});

export const generateUploadUrl = mutation({
  args: vSession,
  returns: v.string(),
  handler: async (ctx, { sessionToken }) => {
    await requireOwner(ctx, sessionToken);
    return ctx.storage.generateUploadUrl();
  },
});

export const listOrders = query({
  args: vSession,
  returns: v.array(vOrderView),
  handler: async (ctx, { sessionToken }) => {
    await requireOwner(ctx, sessionToken);
    return listOrderDocs(ctx);
  },
});

export const getOrder = query({
  args: { ...vSession, orderId: v.id("orders") },
  returns: vOrderView,
  handler: async (ctx, { sessionToken, orderId }) => {
    await requireOwner(ctx, sessionToken);
    const order = await ctx.db.get(orderId);
    if (!order) throw appError("NOT_FOUND", "That order doesn't exist.");
    return toOrderView(ctx, order);
  },
});

export const setStatus = mutation({
  args: { ...vSession, orderId: v.id("orders"), status: vOrderStatus },
  returns: v.null(),
  handler: async (ctx, { sessionToken, orderId, status }) => {
    await requireOwner(ctx, sessionToken);
    await setOrderStatus(ctx, orderId, status);
    return null;
  },
});
