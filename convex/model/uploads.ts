import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertOwner } from "../lib/auth";
import { appError } from "../lib/errors";
import { detectUsageToUsd, LIMITS } from "../shared/credits";
import { INGEST_STEPS, isTerminalJobStatus } from "../shared/jobs";
import type { vDetectedItem } from "../shared/validators";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "../shared/wardrobe";
import type { UploadView } from "../views";
import {
  assertBelowJobLimit,
  completeJob,
  createJob,
  getJob,
  setStep,
} from "./jobs";
import { bumpDailyStats } from "./stats";

type Ctx = QueryCtx | MutationCtx;

export type UploadFileInput = {
  storageId: Id<"_storage">;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

const PIPELINES_UNAVAILABLE =
  "AI pipelines are not enabled yet. Detect and extract land in Phase 3.";

export async function toUploadView(
  ctx: Ctx,
  upload: Doc<"uploads">,
): Promise<UploadView> {
  return {
    _id: upload._id,
    batchId: upload.batchId,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    sizeBytes: upload.sizeBytes,
    status: upload.status,
    detectedCount: upload.detectedCount,
    candidates: upload.candidates,
    selectedIndices: upload.selectedIndices,
    selectionConfirmedAt: upload.selectionConfirmedAt,
    jobId: upload.jobId,
    url: await ctx.storage.getUrl(upload.storageId),
    createdAt: upload.createdAt,
  };
}

/** Rejects the batch before any row is written: count, mime type and size all have hard caps. */
export function assertValidFiles(files: UploadFileInput[]): void {
  if (files.length === 0) {
    throw appError("INVALID_INPUT", "Pick at least one photo.");
  }
  if (files.length > LIMITS.maxPhotosPerUpload) {
    throw appError(
      "INVALID_INPUT",
      `You can add up to ${LIMITS.maxPhotosPerUpload} photos at a time.`,
      { limit: LIMITS.maxPhotosPerUpload },
    );
  }
  const accepted = Object.keys(ACCEPTED_IMAGE_TYPES);
  for (const file of files) {
    if (!accepted.includes(file.mimeType)) {
      throw appError(
        "INVALID_INPUT",
        `"${file.fileName}" isn't a supported image (${file.mimeType}).`,
        { accepted },
      );
    }
    if (file.sizeBytes <= 0 || file.sizeBytes > MAX_UPLOAD_BYTES) {
      throw appError(
        "INVALID_INPUT",
        `"${file.fileName}" is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`,
        { maxBytes: MAX_UPLOAD_BYTES },
      );
    }
  }
}

/**
 * Cross-checks what the client claimed against the blob Convex actually stored.
 */
export async function assertStoredImage(
  ctx: Ctx,
  storageId: Id<"_storage">,
  fileName: string,
): Promise<void> {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) {
    throw appError(
      "INVALID_INPUT",
      `"${fileName}" was not uploaded. Try again.`,
    );
  }
  const contentType = metadata.contentType ?? "";
  if (!Object.keys(ACCEPTED_IMAGE_TYPES).includes(contentType)) {
    throw appError(
      "INVALID_INPUT",
      `"${fileName}" isn't a supported image (${contentType || "unknown type"}).`,
      { accepted: Object.keys(ACCEPTED_IMAGE_TYPES) },
    );
  }
  if (metadata.size > MAX_UPLOAD_BYTES) {
    throw appError(
      "INVALID_INPUT",
      `"${fileName}" is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`,
      { maxBytes: MAX_UPLOAD_BYTES },
    );
  }
}

export async function listBatch(
  ctx: Ctx,
  userId: Id<"users">,
  batchId: string,
): Promise<Doc<"uploads">[]> {
  const uploads = await ctx.db
    .query("uploads")
    .withIndex("by_batch", (q) => q.eq("batchId", batchId))
    .take(LIMITS.maxPhotosPerUpload);
  return uploads
    .filter((upload) => upload.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Reserves credits and would start extraction — gated until Phase 3 workflows land.
 * Shared by uploads.resume and items.reextract.
 */
export async function startExtractionJob(
  _ctx: MutationCtx,
  _user: Doc<"users">,
  itemIds: Id<"items">[],
  _uploadId?: Id<"uploads">,
): Promise<Id<"jobs">> {
  if (itemIds.length === 0) {
    throw appError("INVALID_INPUT", "There's nothing left to extract here.");
  }
  throw appError("UPSTREAM_FAILED", PIPELINES_UNAVAILABLE);
}

/**
 * Registers uploaded photos as one batch with an ingest job per photo.
 * Detect workflow starts in Phase 3 — jobs stay queued after the upload step.
 */
export async function createBatch(
  ctx: MutationCtx,
  user: Doc<"users">,
  files: UploadFileInput[],
): Promise<{
  batchId: string;
  uploads: Array<{ uploadId: Id<"uploads">; jobId: Id<"jobs"> }>;
}> {
  assertValidFiles(files);
  for (const file of files) {
    await assertStoredImage(ctx, file.storageId, file.fileName);
  }
  await assertBelowJobLimit(ctx, user._id);

  const batchId = crypto.randomUUID();
  const now = Date.now();
  const uploads: Array<{ uploadId: Id<"uploads">; jobId: Id<"jobs"> }> = [];

  for (const file of files) {
    const uploadId = await ctx.db.insert("uploads", {
      userId: user._id,
      batchId,
      storageId: file.storageId,
      fileName: file.fileName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      status: "queued",
      createdAt: now,
    });
    const jobId = await createJob(ctx, user, {
      type: "ingest",
      steps: [
        { key: INGEST_STEPS.upload },
        { key: INGEST_STEPS.detect },
        { key: INGEST_STEPS.review },
      ],
      uploadId,
      batchId,
    });
    await setStep(ctx, jobId, INGEST_STEPS.upload, { status: "done" });
    // Phase 3 starts detect here. Until then, skip remaining steps so jobs
    // don't sit in `queued`/`running` and burn the per-user job limit.
    await setStep(ctx, jobId, INGEST_STEPS.detect, {
      status: "skipped",
      label: "Detect pending (Phase 3)",
    });
    await setStep(ctx, jobId, INGEST_STEPS.review, { status: "skipped" });
    await completeJob(ctx, jobId, { status: "done" });
    await ctx.db.patch(uploadId, { jobId });
    uploads.push({ uploadId, jobId });
  }

  return { batchId, uploads };
}

/** Scanning finishes here. Candidates are review data, never wardrobe items or credit reservations. */
export async function recordCandidates(
  ctx: MutationCtx,
  {
    uploadId,
    jobId,
    items,
  }: {
    uploadId: Id<"uploads">;
    jobId: Id<"jobs">;
    items: Infer<typeof vDetectedItem>[];
  },
): Promise<number> {
  const job = await getJob(ctx, jobId);
  const upload = await ctx.db.get(uploadId);
  if (!upload || upload.userId !== job.userId || job.uploadId !== uploadId) {
    throw appError("NOT_FOUND", "That upload no longer exists.");
  }
  if (upload.candidates !== undefined || isTerminalJobStatus(job.status)) {
    return upload.detectedCount ?? 0;
  }
  if (upload.jobId !== jobId) {
    throw appError("CONFLICT", "This upload has a newer job.");
  }
  const candidates = items.slice(0, LIMITS.maxItemsPerPhoto);
  const meta = job.steps.find((step) => step.key === INGEST_STEPS.detect)?.meta;
  const costUsd = detectUsageToUsd({
    inputTextTokens:
      typeof meta?.inputTextTokens === "number" ? meta.inputTextTokens : 0,
    inputImageTokens: 0,
    outputTokens:
      typeof meta?.outputTokens === "number" ? meta.outputTokens : 0,
  });
  await ctx.db.patch(uploadId, {
    candidates,
    detectedCount: candidates.length,
    status: candidates.length > 0 ? "awaiting_selection" : "done",
  });
  await setStep(ctx, jobId, INGEST_STEPS.detect, {
    status: "done",
    meta: { found: candidates.length, costUsd },
  });
  if (costUsd > 0) await bumpDailyStats(ctx, { cogsUsd: costUsd });
  await setStep(ctx, jobId, INGEST_STEPS.review, {
    status: candidates.length > 0 ? "done" : "skipped",
    label: candidates.length > 0 ? "Ready to review" : "No clothing found",
  });
  await completeJob(ctx, jobId, { status: "done" });
  return candidates.length;
}

/**
 * Selection validation ready for Phase 3; extract/reserve path needs workflows.
 */
export async function confirmSelection(
  ctx: MutationCtx,
  user: Doc<"users">,
  uploadId: Id<"uploads">,
  indices: number[],
): Promise<Id<"jobs">> {
  const upload = assertOwner(await ctx.db.get(uploadId), user, "upload");
  const candidates = upload.candidates;
  if (
    !candidates ||
    indices.length === 0 ||
    indices.length > candidates.length ||
    new Set(indices).size !== indices.length ||
    indices.some(
      (index) =>
        !Number.isInteger(index) ||
        index < 0 ||
        index >= candidates.length,
    )
  ) {
    throw appError(
      "INVALID_INPUT",
      "Choose at least one valid item from this photo, without duplicates.",
    );
  }
  const selectedIndices = [...indices].sort((a, b) => a - b);
  if (upload.selectionJobId) {
    if (
      JSON.stringify(upload.selectedIndices) ===
      JSON.stringify(selectedIndices)
    ) {
      return upload.selectionJobId;
    }
    throw appError("CONFLICT", "This photo's selection is already confirmed.");
  }
  if (upload.status !== "awaiting_selection") {
    throw appError("CONFLICT", "This photo isn't ready for selection.");
  }
  throw appError("UPSTREAM_FAILED", PIPELINES_UNAVAILABLE);
}
