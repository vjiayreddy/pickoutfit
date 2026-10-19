"use node";

import { v } from "convex/values";
import { dominantHex } from "./colours";
import {
  asBytes,
  fitCataloguePng,
  MIN_PIECE_PIXELS,
  opaquePixels,
  renderBoardAndCrop,
  storePngId,
  type GridPiece,
} from "./gridCutout";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";
import { appError } from "../lib/errors";
import { INGEST_STEPS } from "../shared/jobs";
import { vTokenUsage } from "../shared/validators";

const EMPTY_USAGE = { inputTextTokens: 0, inputImageTokens: 0, outputTokens: 0 };

function extractStepKey(index: number): string {
  return `${INGEST_STEPS.extract}:${index}`;
}

/**
 * Vendor Import Pieces: one catalogue-grid board + local transparent PNG crops.
 * Lands each cutout via `productCutoutReady`. Weak/missing crops are marked failed
 * so the workflow can fall back to a single-piece extract.
 */
export const cutVendorSelection = internalAction({
  args: { jobId: v.id("jobs"), productIds: v.array(v.id("products")) },
  returns: v.object({
    cropped: v.array(v.id("products")),
    failed: v.array(v.id("products")),
    usage: vTokenUsage,
  }),
  handler: async (ctx, args) => {
    if (args.productIds.length < 2) {
      throw appError("INVALID_INPUT", "A shared cutout needs at least two pieces.");
    }

    const pieces: Array<GridPiece & { productId: Id<"products">; stepKey: string }> = [];
    let photoStorageId: Id<"_storage"> | null = null;

    for (let index = 0; index < args.productIds.length; index += 1) {
      const productId = args.productIds[index]!;
      const stepKey = extractStepKey(index);
      await ctx.runMutation(internal.ai.pipeline.markStep, {
        jobId: args.jobId,
        key: stepKey,
        status: "running",
      });
      const product = await ctx.runQuery(internal.ai.vendorPipeline.productExtractContext, {
        productId,
      });
      if (photoStorageId && product.photoStorageId !== photoStorageId) {
        throw appError("INVALID_INPUT", "These drafts do not come from one look photo.");
      }
      photoStorageId = product.photoStorageId;
      pieces.push({
        productId,
        stepKey,
        name: product.name,
        description: product.description.trim() || product.name,
      });
    }

    const blob = photoStorageId ? await ctx.storage.get(photoStorageId) : null;
    if (!blob) throw appError("NOT_FOUND", "The look photo for this import is gone.");

    let cutouts: Buffer[];
    let usage = EMPTY_USAGE;
    try {
      const rendered = await renderBoardAndCrop(blob, pieces);
      cutouts = rendered.cutouts;
      usage = rendered.usage;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The shared catalogue cutout failed.";
      for (const piece of pieces) {
        await ctx.runMutation(internal.ai.vendorPipeline.productCutoutFailed, {
          productId: piece.productId,
          jobId: args.jobId,
          stepKey: piece.stepKey,
          error: message,
        });
      }
      throw error;
    }

    const cropped: Id<"products">[] = [];
    const failed: Id<"products">[] = [];
    let usageAssigned = false;

    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index]!;
      const raw = cutouts[index];
      if (!raw || (await opaquePixels(raw)) < MIN_PIECE_PIXELS) {
        await ctx.runMutation(internal.ai.vendorPipeline.productCutoutFailed, {
          productId: piece.productId,
          jobId: args.jobId,
          stepKey: piece.stepKey,
          error: "This piece could not be cut cleanly from the catalogue board.",
        });
        failed.push(piece.productId);
        continue;
      }

      try {
        const fitted = await fitCataloguePng(raw);
        const storageId = await storePngId(ctx, fitted);
        const hex = dominantHex(asBytes(fitted), 3);
        await ctx.runMutation(internal.ai.vendorPipeline.productCutoutReady, {
          productId: piece.productId,
          jobId: args.jobId,
          stepKey: piece.stepKey,
          storageId,
          hex,
          // Attribute the single board edit once so COGS is not multiplied by piece count.
          usage: usageAssigned ? EMPTY_USAGE : usage,
        });
        usageAssigned = true;
        cropped.push(piece.productId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not save this cutout.";
        await ctx.runMutation(internal.ai.vendorPipeline.productCutoutFailed, {
          productId: piece.productId,
          jobId: args.jobId,
          stepKey: piece.stepKey,
          error: message,
        });
        failed.push(piece.productId);
      }
    }

    return { cropped, failed, usage };
  },
});
