import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { createJob } from "./model/jobs";
import { productCategoryFor } from "./model/vendorIngest";
import { refundQuota } from "./model/vendors";
import { VENDOR_PLANS } from "./shared/vendors";
import { asUser, harness, PRODUCT_INPUT, seedUser, VENDOR_PROFILE, type Harness } from "../tests/convex-harness";

const NOW = 1_790_700_000_000;

const CANDIDATE = {
  name: "Linen overshirt",
  category: "outerwear" as const,
  subcategory: "overshirt",
  colours: { primary: "sand", secondary: [], hex: ["#d8c9a8"] },
  pattern: "solid",
  material: "linen",
  season: ["summer" as const],
  formality: "casual" as const,
  description: "Sand linen overshirt with patch pockets",
  bbox: [0.1, 0.1, 0.6, 0.9],
};

async function seedLookPhoto(t: Harness, vendorId: Id<"vendors">, userId: Id<"users">, candidates = [CANDIDATE]) {
  return t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["look"], { type: "image/jpeg" }));
    return ctx.db.insert("uploads", {
      userId,
      vendorId,
      target: "vendor_catalog",
      batchId: "batch-1",
      storageId,
      fileName: "look.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 4,
      status: "awaiting_selection",
      detectedCount: candidates.length,
      candidates,
      createdAt: Date.now(),
    });
  });
}

describe("store import", () => {
  test("maps wardrobe categories onto the shop taxonomy", () => {
    expect(productCategoryFor("top")).toBe("clothes");
    expect(productCategoryFor("shoes")).toBe("clothes");
    expect(productCategoryFor("bag")).toBe("accessories");
    expect(productCategoryFor("headwear")).toBe("accessories");
  });

  test("rejects bad selections before touching quota", async () => {
    const t = harness();
    const owner = await seedUser(t);
    const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
    const uploadId = await seedLookPhoto(t, vendorId, owner.userId);

    await expect(
      asUser(t, owner).mutation(api.vendorUploads.confirmSelection, { uploadId, indices: [] }),
    ).rejects.toThrow(/at least one/i);
    await expect(
      asUser(t, owner).mutation(api.vendorUploads.confirmSelection, { uploadId, indices: [3] }),
    ).rejects.toThrow(/at least one/i);
    await expect(
      asUser(t, owner).mutation(api.vendorUploads.confirmSelection, { uploadId, indices: [0], priceInr: -5 }),
    ).rejects.toThrow(/price/i);

    const quota = await asUser(t, owner).query(api.vendorUploads.quota, { now: NOW });
    expect(quota.used).toBe(0);
  });

  test("refuses to import past the month's extraction quota", async () => {
    const t = harness();
    const owner = await seedUser(t);
    const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
    const limit = VENDOR_PLANS.starter.extractionQuota;
    await t.run(async (ctx) => {
      const vendor = await ctx.db.get(vendorId);
      await ctx.db.patch(vendorId, {
        listingQuota: { monthKey: vendor!.listingQuota.monthKey, extractionsUsed: limit },
      });
    });
    const uploadId = await seedLookPhoto(t, vendorId, owner.userId);
    await expect(
      asUser(t, owner).mutation(api.vendorUploads.confirmSelection, { uploadId, indices: [0] }),
    ).rejects.toThrow(/quota/i);
  });

  test("refunds only within the current month and never below zero", async () => {
    const t = harness();
    const owner = await seedUser(t);
    const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
    await t.run(async (ctx) => {
      const vendor = await ctx.db.get(vendorId);
      await ctx.db.patch(vendorId, { listingQuota: { monthKey: vendor!.listingQuota.monthKey, extractionsUsed: 2 } });
      await refundQuota(ctx, vendorId, 5);
      expect((await ctx.db.get(vendorId))?.listingQuota.extractionsUsed).toBe(0);
      await ctx.db.patch(vendorId, { listingQuota: { monthKey: "1999-01", extractionsUsed: 3 } });
      await refundQuota(ctx, vendorId, 1);
      expect((await ctx.db.get(vendorId))?.listingQuota.extractionsUsed).toBe(3);
    });
  });

  test("a finished cutout becomes the cover and the look photo moves behind it", async () => {
    const t = harness();
    const owner = await seedUser(t);
    const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
    const referenceId = await t.run((ctx) => ctx.storage.store(new Blob(["look"], { type: "image/jpeg" })));
    const productId = await asUser(t, owner).mutation(api.vendorProducts.create, {
      ...PRODUCT_INPUT,
      imageIds: [referenceId],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(productId, { referenceStorageId: referenceId });
      const rows = await ctx.db
        .query("productImages")
        .withIndex("by_productId_and_position", (q) => q.eq("productId", productId))
        .collect();
      for (const row of rows) await ctx.db.patch(row._id, { kind: "reference" });
    });
    const jobId = await t.run(async (ctx) => {
      const user = await ctx.db.get(owner.userId);
      const jobId = await createJob(ctx, user!, {
        type: "vendor_ingest",
        steps: [{ key: "extract:0", meta: { productId } }, { key: "finalize" }],
      });
      await ctx.db.patch(jobId, { vendorId });
      return jobId;
    });
    const cutoutId = await t.run((ctx) => ctx.storage.store(new Blob(["png"], { type: "image/png" })));
    await t.mutation(internal.ai.vendorPipeline.productCutoutReady, {
      productId,
      jobId,
      stepKey: "extract:0",
      storageId: cutoutId,
      hex: ["#c2b280"],
      usage: { inputTextTokens: 10, inputImageTokens: 100, outputTokens: 1000 },
    });

    const product = await t.run((ctx) => ctx.db.get(productId));
    expect(product?.cutoutStorageId).toBe(cutoutId);
    expect(product?.imageIds?.[0]).toBe(cutoutId);
    expect(product?.colours?.hex).toEqual(["#c2b280"]);

    const rows = await t.run((ctx) =>
      ctx.db
        .query("productImages")
        .withIndex("by_productId_and_position", (q) => q.eq("productId", productId))
        .collect(),
    );
    expect(rows.map((row) => [row.kind, row.position])).toEqual([
      ["cutout", 0],
      ["reference", 1],
    ]);

    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job?.steps[0]?.status).toBe("done");
    expect(job?.resultIds).toContain(productId);
  });

  test("look photos are private to their store", async () => {
    const t = harness();
    const owner = await seedUser(t);
    const rival = await seedUser(t, { email: "rival@example.com" });
    const vendorId = await asUser(t, owner).mutation(api.vendors.register, VENDOR_PROFILE);
    await asUser(t, rival).mutation(api.vendors.register, { ...VENDOR_PROFILE, name: "Rival Co" });
    const uploadId = await seedLookPhoto(t, vendorId, owner.userId);

    expect(await asUser(t, owner).query(api.vendorUploads.get, { uploadId })).not.toBeNull();
    expect(await asUser(t, rival).query(api.vendorUploads.get, { uploadId })).toBeNull();
    expect(await asUser(t, rival).query(api.vendorUploads.listRecent, {})).toHaveLength(0);
    await expect(
      asUser(t, rival).mutation(api.vendorUploads.confirmSelection, { uploadId, indices: [0] }),
    ).rejects.toThrow(/isn't in your store/i);
  });
});
