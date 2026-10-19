import { start } from "@convex-dev/workflow";
import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appError } from "../lib/errors";
import { LIMITS } from "../shared/credits";
import { INGEST_STEPS } from "../shared/jobs";
import type { ProductCategory } from "../shared/products";
import type { vDetectedItem } from "../shared/validators";
import type { Category, Presentation } from "../shared/wardrobe";
import { addSteps, createJob, setStep, setWorkflowId } from "./jobs";
import { createProduct } from "./products";
import { assertValidFiles, assertStoredImage, type UploadFileInput } from "./uploads";
import { assertQuota, consumeQuota } from "./vendors";

type DetectedItem = Infer<typeof vDetectedItem>;

/** How many look photos a vendor may scan in one go. Scans are free; extractions use quota. */
export const MAX_VENDOR_PHOTOS_PER_BATCH = 6;

/** Wardrobe taxonomy → shop taxonomy. Shoes sell under clothes until footwear gets its own section. */
export function productCategoryFor(category: Category): ProductCategory {
  switch (category) {
    case "accessory":
    case "bag":
    case "headwear":
      return "accessories";
    default:
      return "clothes";
  }
}

export function extractStepKey(index: number): string {
  return `${INGEST_STEPS.extract}:${index}`;
}

/**
 * Registers look photos for a store and starts the free scan on each. Mirrors `createBatch` for
 * wardrobes but stamps `target: "vendor_catalog"` and the vendor so the review step can turn
 * candidates into product drafts.
 */
export async function createVendorBatch(
  ctx: MutationCtx,
  user: Doc<"users">,
  vendor: Doc<"vendors">,
  files: UploadFileInput[],
): Promise<{ batchId: string; uploads: Array<{ uploadId: Id<"uploads">; jobId: Id<"jobs"> }> }> {
  if (files.length > MAX_VENDOR_PHOTOS_PER_BATCH) {
    throw appError("INVALID_INPUT", `Scan up to ${MAX_VENDOR_PHOTOS_PER_BATCH} look photos at a time.`);
  }
  assertValidFiles(files);
  for (const file of files) await assertStoredImage(ctx, file.storageId, file.fileName);
  // Fail early when the month is already spent: a scan whose pieces can't be extracted is wasted.
  assertQuota(vendor, 1);

  const batchId = crypto.randomUUID();
  const now = Date.now();
  const uploads: Array<{ uploadId: Id<"uploads">; jobId: Id<"jobs"> }> = [];
  for (const file of files) {
    const uploadId = await ctx.db.insert("uploads", {
      userId: user._id,
      vendorId: vendor._id,
      target: "vendor_catalog",
      batchId,
      storageId: file.storageId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      status: "queued",
      createdAt: now,
    });
    const jobId = await createJob(ctx, user, {
      type: "vendor_ingest",
      steps: [{ key: INGEST_STEPS.upload }, { key: INGEST_STEPS.detect }, { key: INGEST_STEPS.review }],
      uploadId,
      batchId,
    });
    await ctx.db.patch(jobId, { vendorId: vendor._id });
    await setStep(ctx, jobId, INGEST_STEPS.upload, { status: "done" });
    await ctx.db.patch(uploadId, { jobId });
    const workflowId = await start(
      ctx,
      internal.workflows.ingest.scanUpload,
      { uploadId, jobId },
      { onComplete: internal.workflows.ingest.onScanComplete, context: { jobId } },
    );
    await setWorkflowId(ctx, jobId, workflowId);
    uploads.push({ uploadId, jobId });
  }
  return { batchId, uploads };
}

export function requireVendorUpload(upload: Doc<"uploads"> | null, vendor: Doc<"vendors">): Doc<"uploads"> {
  if (!upload || upload.vendorId !== vendor._id || upload.target !== "vendor_catalog") {
    throw appError("NOT_FOUND", "That photo isn't in your store.");
  }
  return upload;
}

function draftInput(
  candidate: DetectedItem,
  presentation: Presentation,
  priceInr: number,
  referenceStorageId: Id<"_storage">,
) {
  const { bbox: _bbox, ...attrs } = candidate;
  return {
    category: productCategoryFor(attrs.category),
    presentation,
    name: attrs.name,
    brand: attrs.brand,
    subcategory: attrs.subcategory,
    description: attrs.description,
    colours: attrs.colours,
    pattern: attrs.pattern || undefined,
    material: attrs.material || undefined,
    season: attrs.season,
    formality: attrs.formality,
    fit: attrs.fit,
    priceInr,
    imageIds: [referenceStorageId],
    variants: [{ stock: 0, active: true }],
  };
}

/**
 * Turns chosen candidates into `draft` products (reference photo attached, cutout pending),
 * charges the month's quota and starts the extraction workflow. One transaction, like
 * `confirmSelection` for wardrobes.
 */
export async function confirmVendorSelection(
  ctx: MutationCtx,
  user: Doc<"users">,
  vendor: Doc<"vendors">,
  uploadId: Id<"uploads">,
  indices: number[],
  opts: { presentation: Presentation; priceInr: number },
): Promise<{ jobId: Id<"jobs">; productIds: Id<"products">[] }> {
  const upload = requireVendorUpload(await ctx.db.get(uploadId), vendor);
  const candidates = upload.candidates;
  if (
    !candidates ||
    indices.length === 0 ||
    indices.length > Math.min(candidates.length, LIMITS.maxItemsPerPhoto) ||
    new Set(indices).size !== indices.length ||
    indices.some((index) => !Number.isInteger(index) || index < 0 || index >= candidates.length)
  ) {
    throw appError("INVALID_INPUT", "Choose at least one piece from this photo, without duplicates.");
  }
  if (upload.selectionJobId) throw appError("CONFLICT", "This photo's pieces were already imported.");
  if (upload.status !== "awaiting_selection") throw appError("CONFLICT", "This photo isn't ready to import.");
  if (!Number.isFinite(opts.priceInr) || opts.priceInr < 0) {
    throw appError("INVALID_INPUT", "Enter a starting price for the drafts.");
  }

  const selectedIndices = [...indices].sort((a, b) => a - b);
  assertQuota(vendor, selectedIndices.length);

  const productIds: Id<"products">[] = [];
  for (const index of selectedIndices) {
    const candidate = candidates[index];
    const productId = await createProduct(
      ctx,
      { ...vendor, productCount: vendor.productCount + productIds.length },
      draftInput(candidate, opts.presentation, Math.round(opts.priceInr), upload.storageId),
      { source: "extracted", status: "draft" },
    );
    await ctx.db.patch(productId, {
      sourceUploadId: upload._id,
      referenceStorageId: upload.storageId,
      sourceBbox: candidate.bbox,
    });
    // The reference row must never be deleted with the product's own photos.
    const rows = await ctx.db
      .query("productImages")
      .withIndex("by_productId_and_position", (q) => q.eq("productId", productId))
      .take(2);
    for (const row of rows) {
      if (row.storageId === upload.storageId && row.kind !== "reference") {
        await ctx.db.patch(row._id, { kind: "reference" });
      }
    }
    productIds.push(productId);
  }
  await consumeQuota(ctx, vendor._id, productIds.length);

  const jobId = await createJob(ctx, user, {
    type: "vendor_ingest",
    uploadId: upload._id,
    batchId: upload.batchId,
    steps: [
      ...productIds.map((productId, index) => ({ key: extractStepKey(index), meta: { productId } })),
      { key: INGEST_STEPS.finalize },
    ],
  });
  await ctx.db.patch(jobId, { vendorId: vendor._id });
  await addSteps(ctx, jobId, []);
  await ctx.db.patch(upload._id, {
    selectedIndices,
    selectionConfirmedAt: Date.now(),
    selectionJobId: jobId,
    jobId,
    status: "extracting",
  });
  const workflowId = await start(
    ctx,
    internal.workflows.vendorIngest.extractProducts,
    { jobId, productIds },
    { onComplete: internal.workflows.vendorIngest.onExtractComplete, context: { jobId } },
  );
  await setWorkflowId(ctx, jobId, workflowId);
  return { jobId, productIds };
}
