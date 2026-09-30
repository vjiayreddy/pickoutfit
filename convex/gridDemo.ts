"use node";

import { v } from "convex/values";
import {
  MIN_PIECE_PIXELS,
  modelId,
  opaquePixels,
  openaiClient,
  renderBoardAndCrop,
  storePngId,
  storePngUrl,
  upstream,
  type GridPiece,
} from "./ai/gridCutout";
import { normalizeImageInput } from "./ai/image_input";
import { detectionInstructions } from "./ai/prompts";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction } from "./_generated/server";
import { appError } from "./lib/errors";
import { detectUsageToUsd, usageToUsd, type TokenUsage, LIMITS } from "./shared/credits";
import { vTokenUsage } from "./shared/validators";

/**
 * Demo only. Detects the wearable pieces in one photo, lays them on one board
 * with a single gpt-image-2 edit, then crops each cell. Does not create wardrobe
 * items or charge credits.
 */

const DETECT_MODEL = "gpt-5-mini";

type Piece = GridPiece;

function parsePieces(raw: string): Piece[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw appError("UPSTREAM_FAILED", "The vision model returned something that isn't JSON.");
  }
  const items =
    parsed !== null && typeof parsed === "object" && "items" in parsed && Array.isArray(parsed.items)
      ? parsed.items
      : [];
  const pieces: Piece[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") continue;
    const name = "name" in item && typeof item.name === "string" ? item.name.trim() : "";
    const description = "description" in item && typeof item.description === "string" ? item.description.trim() : "";
    if (!name || !description) continue;
    pieces.push({ name: name.slice(0, 80), description: description.slice(0, 400) });
    if (pieces.length >= LIMITS.maxItemsPerPhoto) break;
  }
  return pieces;
}

/**
 * One gpt-image-2 board for several selected pieces, then free transparent crops.
 * Does not write wardrobe rows. A missing crop is omitted so the workflow can
 * fall back to a per-item extract. The action is not retried.
 */
export const cutSelection = internalAction({
  args: { jobId: v.id("jobs"), itemIds: v.array(v.id("items")) },
  returns: v.object({
    crops: v.array(v.object({ itemId: v.id("items"), storageId: v.id("_storage") })),
    usage: vTokenUsage,
  }),
  handler: async (ctx, args) => {
    if (args.itemIds.length < 2) {
      throw appError("INVALID_INPUT", "A shared cutout needs at least two pieces.");
    }
    const pieces: Array<Piece & { itemId: Id<"items"> }> = [];
    let photoStorageId: Id<"_storage"> | null = null;
    for (const itemId of args.itemIds) {
      const item = await ctx.runQuery(internal.ai.pipeline.extractContext, { itemId });
      if (photoStorageId && item.photoStorageId !== photoStorageId) {
        throw appError("INVALID_INPUT", "These pieces do not come from one photo.");
      }
      photoStorageId = item.photoStorageId;
      const description = item.description.trim() || item.name;
      pieces.push({ itemId, name: item.name, description });
    }
    const blob = photoStorageId ? await ctx.storage.get(photoStorageId) : null;
    if (!blob) throw appError("NOT_FOUND", "The source photo for this selection is gone.");

    const { cutouts, usage } = await renderBoardAndCrop(blob, pieces);
    const crops: Array<{ itemId: Id<"items">; storageId: Id<"_storage"> }> = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      const cutout = cutouts[index];
      if (!piece || !cutout || (await opaquePixels(cutout)) < MIN_PIECE_PIXELS) continue;
      crops.push({ itemId: piece.itemId, storageId: await storePngId(ctx, cutout) });
    }
    return { crops, usage };
  },
});

export const extractGrid = action({
  args: { storageId: v.id("_storage") },
  returns: v.object({
    boardUrl: v.string(),
    columns: v.number(),
    crops: v.array(v.object({ label: v.string(), url: v.string() })),
    usage: v.object({
      inputTextTokens: v.number(),
      inputImageTokens: v.number(),
      outputTokens: v.number(),
      estimatedUsd: v.number(),
    }),
  }),
  handler: async (ctx, { storageId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw appError("UNAUTHENTICATED", "Sign in to continue.");

    const blob = await ctx.storage.get(storageId);
    if (!blob) throw appError("NOT_FOUND", "That photo is no longer available. Upload it again.");

    const client = openaiClient();
    const normalized = await normalizeImageInput(blob, "photo");
    const imageUrl = `data:image/png;base64,${Buffer.from(normalized).toString("base64")}`;
    const { instructions, schema } = detectionInstructions();

    let detected;
    try {
      detected = await client.responses.create({
        model: modelId(DETECT_MODEL),
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instructions },
              { type: "input_image", image_url: imageUrl, detail: "high" },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "detected_items", schema, strict: true } },
      });
    } catch (error) {
      upstream(error);
    }

    const pieces = parsePieces(detected.output_text);
    if (pieces.length === 0) {
      throw appError("INVALID_INPUT", "No wearable items were found in that photo.");
    }

    const { board, cutouts, usage: image, grid } = await renderBoardAndCrop(blob, pieces);
    const boardUrl = await storePngUrl(ctx, board);
    const crops = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      const cutout = cutouts[index];
      if (!piece || !cutout) continue;
      crops.push({ label: piece.name, url: await storePngUrl(ctx, cutout) });
    }

    const detectUsage: TokenUsage = {
      inputTextTokens: detected.usage?.input_tokens ?? 0,
      inputImageTokens: 0,
      outputTokens: detected.usage?.output_tokens ?? 0,
    };
    return {
      boardUrl,
      columns: grid.cols,
      crops,
      usage: {
        inputTextTokens: image.inputTextTokens + detectUsage.inputTextTokens,
        inputImageTokens: image.inputImageTokens,
        outputTokens: image.outputTokens + detectUsage.outputTokens,
        estimatedUsd: usageToUsd(image) + detectUsageToUsd(detectUsage),
      },
    };
  },
});
