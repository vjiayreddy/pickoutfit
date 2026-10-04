import { describe, expect, test, beforeAll } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { EMBEDDING_DIMENSIONS } from "./schema";
import { asUser, harness, PRODUCT_INPUT, seedUser, VENDOR_PROFILE } from "../tests/convex-harness";

const SERVICE_KEY = "test-agent-service-key";

beforeAll(() => {
  process.env.AGENT_SERVICE_KEY = SERVICE_KEY;
});

function fakeEmbedding(seed = 0.01): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => seed + i * 0.000001);
}

describe("AI recommend + shop looks", () => {
  async function liveProduct() {
    const t = harness();
    const owner = await seedUser(t);
    const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
    await t.run((ctx) => ctx.db.patch(vendorId, { status: "active" }));
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["png"])));
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, {
      ...PRODUCT_INPUT,
      imageIds: [storageId],
      aiRecommend: true,
      variants: [
        { size: "S", stock: 2, active: true },
        { size: "M", stock: 4, active: true },
      ],
    });
    await asUser(t, owner).mutation(api.vendorProducts.publish, { productId });
    return { t, owner, vendorId, productId };
  }

  test("persists aiRecommend and clears embeddings when unpublished", async () => {
    const { t, owner, productId } = await liveProduct();
    const view = await asUser(t, owner).query(api.vendorProducts.get, { productId });
    expect(view.aiRecommend).toBe(true);

    await t.run(async (ctx) => {
      const product = await ctx.db.get(productId);
      expect(product?.aiRecommend).toBe(true);
      await ctx.db.insert("productEmbeddings", {
        productId,
        vendorId: product!.vendorId!,
        embedding: fakeEmbedding(),
      });
    });

    await asUser(t, owner).mutation(api.vendorProducts.unpublish, { productId });
    const embedding = await t.run(async (ctx) =>
      ctx.db
        .query("productEmbeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .unique(),
    );
    expect(embedding).toBeNull();
  });

  test("hydrateShopHits drops suspended vendors and non-ai products", async () => {
    const { t, owner, vendorId, productId } = await liveProduct();
    const shopper = await seedUser(t);

    const embeddingId = await t.run(async (ctx) => {
      const product = await ctx.db.get(productId);
      return ctx.db.insert("productEmbeddings", {
        productId,
        vendorId: product!.vendorId!,
        embedding: fakeEmbedding(0.02),
      });
    });

    const hits = await t.query(internal.productEmbeddings.hydrateShopHits, {
      serviceKey: SERVICE_KEY,
      authId: shopper.authId,
      hits: [{ embeddingId, score: 0.91 }],
      limit: 8,
    });
    expect(hits.map((hit) => hit.productId)).toEqual([productId]);

    await t.run((ctx) => ctx.db.patch(vendorId, { status: "suspended" }));
    const afterSuspend = await t.query(internal.productEmbeddings.hydrateShopHits, {
      serviceKey: SERVICE_KEY,
      authId: shopper.authId,
      hits: [{ embeddingId, score: 0.91 }],
      limit: 8,
    });
    expect(afterSuspend).toEqual([]);

    await t.run((ctx) => ctx.db.patch(vendorId, { status: "active", planStatus: "cancelled" }));
    const afterCancel = await t.query(internal.productEmbeddings.hydrateShopHits, {
      serviceKey: SERVICE_KEY,
      authId: shopper.authId,
      hits: [{ embeddingId, score: 0.91 }],
      limit: 8,
    });
    expect(afterCancel).toEqual([]);

    await t.run((ctx) => ctx.db.patch(vendorId, { planStatus: "active" }));
    await t.run(async (ctx) => {
      await ctx.db.patch(productId, { aiRecommend: false });
      const existing = await ctx.db
        .query("productEmbeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .unique();
      if (!existing) {
        await ctx.db.insert("productEmbeddings", {
          productId,
          vendorId,
          embedding: fakeEmbedding(0.03),
        });
      }
    });
    const embeddingAgain = await t.run(async (ctx) =>
      ctx.db
        .query("productEmbeddings")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .unique(),
    );
    const noAi = await t.query(internal.productEmbeddings.hydrateShopHits, {
      serviceKey: SERVICE_KEY,
      authId: shopper.authId,
      hits: [{ embeddingId: embeddingAgain!._id, score: 0.9 }],
      limit: 8,
    });
    expect(noAi).toEqual([]);
  });

  test("composeShopLooks + addLook auto-picks an in-stock variant", async () => {
    const { t, productId } = await liveProduct();
    const shopper = await seedUser(t);
    const threadId = await asUser(t, shopper).mutation(api.threads.create, { title: "Shop" });

    const results = await t.mutation(api.agent.composeShopLooks, {
      serviceKey: SERVICE_KEY,
      authId: shopper.authId,
      threadId,
      brief: "Casual linen day",
      looks: [
        {
          name: "Linen edit",
          reasoning: "Oat linen keeps the look light.",
          lines: [{ slot: "top", productId }],
        },
      ],
    });
    expect(results).toHaveLength(1);
    expect(results[0].shopLookId).toBeTruthy();
    expect(results[0].problems).toEqual([]);
    expect(results[0].totalInr).toBeGreaterThan(0);
    expect(results[0].lines[0].productId).toBe(productId);

    const shopLookId = results[0].shopLookId as Id<"shopLooks">;
    const added = await asUser(t, shopper).mutation(api.cart.addLook, { shopLookId });
    expect(added.added).toBe(1);
    expect(added.skipped).toEqual([]);

    const cart = await asUser(t, shopper).query(api.cart.current, {});
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].productId).toBe(productId);
    expect(cart.lines[0].variantId).toBeTruthy();
    const line = await t.run(async (ctx) => ctx.db.get(cart.lines[0].id));
    expect(line?.addedFrom).toBe("agent");
  });
});
