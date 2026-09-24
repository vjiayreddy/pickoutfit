"use node";

import { v } from "convex/values";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { normalizeImageInput } from "./ai/image_input";
import { detectionInstructions } from "./ai/prompts";
import { optionalEnv, requireEnv } from "./lib/env";
import { appError } from "./lib/errors";
import { detectUsageToUsd, usageToUsd, type TokenUsage, LIMITS } from "./shared/credits";
import { vTokenUsage } from "./shared/validators";

/**
 * Demo only. Detects the wearable pieces in one photo, lays them on one board
 * with a single gpt-image-2 edit, then crops each cell. Does not create wardrobe
 * items or charge credits.
 */

const DETECT_MODEL = "gpt-5-mini";
const IMAGE_MODEL = "gpt-image-2";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

type Piece = { name: string; description: string };

type Grid = {
  size: "1024x1024" | "1024x1536";
  width: number;
  height: number;
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
};

function openai(): OpenAI {
  const directKey = optionalEnv("OPENAI_API_KEY");
  return new OpenAI({
    apiKey: directKey ?? requireEnv("AI_GATEWAY_API_KEY"),
    ...(directKey ? {} : { baseURL: "https://ai-gateway.vercel.sh/v1" }),
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

function modelId(model: string): string {
  return optionalEnv("OPENAI_API_KEY") ? model : `openai/${model}`;
}

/** Even cells only. 1024 and 1536 both divide cleanly for these counts. */
function gridFor(count: number): Grid {
  if (count <= 1) {
    return { size: "1024x1024", width: 1024, height: 1024, cols: 1, rows: 1, cellWidth: 1024, cellHeight: 1024 };
  }
  if (count <= 2) {
    return { size: "1024x1024", width: 1024, height: 1024, cols: 2, rows: 1, cellWidth: 512, cellHeight: 1024 };
  }
  if (count <= 4) {
    return { size: "1024x1024", width: 1024, height: 1024, cols: 2, rows: 2, cellWidth: 512, cellHeight: 512 };
  }
  if (count <= 6) {
    return { size: "1024x1536", width: 1024, height: 1536, cols: 2, rows: 3, cellWidth: 512, cellHeight: 512 };
  }
  if (count <= 8) {
    return { size: "1024x1536", width: 1024, height: 1536, cols: 2, rows: 4, cellWidth: 512, cellHeight: 384 };
  }
  return { size: "1024x1536", width: 1024, height: 1536, cols: 4, rows: 3, cellWidth: 256, cellHeight: 512 };
}

function gridPrompt(pieces: Piece[], grid: Grid): string {
  const cells = pieces.map((piece, index) => {
    const column = (index % grid.cols) + 1;
    const row = Math.floor(index / grid.cols) + 1;
    return `Row ${row}, column ${column}: ${piece.description} The item alone, neatly laid flat, fully visible, centred in that cell.`;
  });
  const empty = grid.cols * grid.rows - pieces.length;
  return [
    `Arrange ONLY these ${pieces.length} wearable items from the photo into a strict ${grid.cols} column by ${grid.rows} row catalogue grid on a plain white background.`,
    `The image is ${grid.width} by ${grid.height} pixels. Each cell is exactly ${grid.cellWidth} by ${grid.cellHeight} pixels. Fill cells left to right, then top to bottom.`,
    "Cell boundaries are invisible and exact. Keep every item centred inside its own cell with a wide white margin on all four sides. No item may touch or cross a cell boundary.",
    "",
    ...cells,
    "",
    empty > 0 ? `The remaining ${empty} cell${empty === 1 ? "" : "s"} stay completely empty white.` : "",
    "Include every listed item once, including accessories such as sunglasses, jewellery, and watches. A pair of shoes is one item in one cell.",
    "Do not include the person, the original photograph, any item that is not listed, text, labels, captions, or detail close-ups. Do not invent garments. Preserve each item's colours, print, stitching, and proportions.",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

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

function imageUsage(usage: OpenAI.ImagesResponse["usage"]): TokenUsage {
  return {
    inputTextTokens: usage?.input_tokens_details?.text_tokens ?? 0,
    inputImageTokens: usage?.input_tokens_details?.image_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
}

function asBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

async function storePng(ctx: ActionCtx, buffer: Buffer): Promise<string> {
  const bytes = asBytes(buffer);
  const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw appError("UPSTREAM_FAILED", "The cropped image could not be stored.");
  return url;
}

const BACKGROUND = 252;
const MIN_PIECE_PIXELS = 40;
/** A second shoe or lens stays. A neighbour sliver in the same cell does not. */
const SECOND_PIECE_FRACTION = 0.25;
const CROP_PADDING = 16;

function isContent(data: Buffer, offset: number): boolean {
  return data[offset]! < BACKGROUND || data[offset + 1]! < BACKGROUND || data[offset + 2]! < BACKGROUND;
}

/** Garment pixels stay opaque. Everything else in the box is transparent. */
async function transparentCutout(
  data: Buffer,
  content: Uint8Array,
  boardWidth: number,
  channels: 1 | 2 | 3 | 4,
  left: number,
  top: number,
  cropWidth: number,
  cropHeight: number,
): Promise<Buffer> {
  const out = Buffer.alloc(cropWidth * cropHeight * channels);
  for (let y = 0; y < cropHeight; y += 1) {
    for (let x = 0; x < cropWidth; x += 1) {
      const index = (top + y) * boardWidth + (left + x);
      if (!content[index]) continue;
      const from = index * channels;
      const to = (y * cropWidth + x) * channels;
      out[to] = data[from]!;
      out[to + 1] = data[from + 1]!;
      out[to + 2] = data[from + 2]!;
      out[to + 3] = 255;
    }
  }
  return sharp(out, { raw: { width: cropWidth, height: cropHeight, channels } }).png().toBuffer();
}

type PieceShape = {
  area: number;
  sumX: number;
  sumY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/**
 * Crops each garment by its real shape on the board, not by the grid line.
 * Pixels that spill into the next cell stay with the garment they belong to.
 * Neighbour pixels and the studio background are transparent. The garment stays opaque.
 */
async function cropPieces(board: Buffer, grid: Grid, count: number): Promise<Buffer[]> {
  const { data, info } = await sharp(board).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  const pixels = width * height;
  const parent = new Int32Array(pixels);
  const content = new Uint8Array(pixels);

  for (let index = 0; index < pixels; index += 1) {
    parent[index] = index;
    if (isContent(data, index * channels)) content[index] = 1;
  }

  function find(index: number): number {
    let root = index;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[index] !== root) {
      const next = parent[index]!;
      parent[index] = root;
      index = next;
    }
    return root;
  }

  function union(left: number, right: number) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!content[index]) continue;
      if (x > 0 && content[index - 1]) union(index, index - 1);
      if (y > 0 && content[index - width]) union(index, index - width);
    }
  }

  const shapes = new Map<number, PieceShape>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!content[index]) continue;
      const root = find(index);
      const shape = shapes.get(root);
      if (shape) {
        shape.area += 1;
        shape.sumX += x;
        shape.sumY += y;
        shape.minX = Math.min(shape.minX, x);
        shape.minY = Math.min(shape.minY, y);
        shape.maxX = Math.max(shape.maxX, x);
        shape.maxY = Math.max(shape.maxY, y);
      } else {
        shapes.set(root, { area: 1, sumX: x, sumY: y, minX: x, minY: y, maxX: x, maxY: y });
      }
    }
  }

  const byCell = new Map<number, number[]>();
  for (const [root, shape] of shapes) {
    if (shape.area < MIN_PIECE_PIXELS) continue;
    const col = Math.min(grid.cols - 1, Math.max(0, Math.floor(shape.sumX / shape.area / grid.cellWidth)));
    const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(shape.sumY / shape.area / grid.cellHeight)));
    const cell = row * grid.cols + col;
    if (cell >= count) continue;
    const list = byCell.get(cell) ?? [];
    list.push(root);
    byCell.set(cell, list);
  }

  const keptByCell = new Map<number, Set<number>>();
  for (const [cell, roots] of byCell) {
    const largest = Math.max(...roots.map((root) => shapes.get(root)?.area ?? 0));
    keptByCell.set(
      cell,
      new Set(roots.filter((root) => (shapes.get(root)?.area ?? 0) >= largest * SECOND_PIECE_FRACTION)),
    );
  }

  const crops: Buffer[] = [];
  for (let cell = 0; cell < count; cell += 1) {
    const kept = keptByCell.get(cell);
    if (!kept || kept.size === 0) {
      const left = (cell % grid.cols) * grid.cellWidth;
      const top = Math.floor(cell / grid.cols) * grid.cellHeight;
      crops.push(await transparentCutout(data, content, width, channels, left, top, grid.cellWidth, grid.cellHeight));
      continue;
    }

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (const root of kept) {
      const shape = shapes.get(root);
      if (!shape) continue;
      minX = Math.min(minX, shape.minX);
      minY = Math.min(minY, shape.minY);
      maxX = Math.max(maxX, shape.maxX);
      maxY = Math.max(maxY, shape.maxY);
    }
    minX = Math.max(0, minX - CROP_PADDING);
    minY = Math.max(0, minY - CROP_PADDING);
    maxX = Math.min(width - 1, maxX + CROP_PADDING);
    maxY = Math.min(height - 1, maxY + CROP_PADDING);

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;
    const out = Buffer.alloc(cropWidth * cropHeight * channels);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const index = y * width + x;
        if (!content[index] || !kept.has(find(index))) continue;
        const from = index * channels;
        const to = ((y - minY) * cropWidth + (x - minX)) * channels;
        out[to] = data[from]!;
        out[to + 1] = data[from + 1]!;
        out[to + 2] = data[from + 2]!;
        out[to + 3] = 255;
      }
    }
    crops.push(await sharp(out, { raw: { width: cropWidth, height: cropHeight, channels } }).png().toBuffer());
  }
  return crops;
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

    const client = openai();
    const normalized = await normalizeImageInput(blob, "photo");
    const grid = gridFor(pieces.length);
    let response: OpenAI.ImagesResponse;
    try {
      response = await client.images.edit({
        model: modelId(IMAGE_MODEL),
        image: await toFile(normalized, "photo.png", { type: "image/png" }),
        prompt: gridPrompt(pieces, grid),
        size: grid.size,
        quality: "medium",
        output_format: "png",
      });
    } catch (error) {
      upstream(error);
    }

    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw appError("UPSTREAM_FAILED", "The image model returned no image.");

    let board = Buffer.from(encoded, "base64");
    const meta = await sharp(board).metadata();
    if (meta.width !== grid.width || meta.height !== grid.height) {
      board = await sharp(board).resize(grid.width, grid.height, { fit: "fill" }).png().toBuffer();
    }

    const cutouts = await cropPieces(board, grid, pieces.length);
    const crops: Array<{ itemId: Id<"items">; storageId: Id<"_storage"> }> = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      const cutout = cutouts[index];
      if (!piece || !cutout || (await opaquePixels(cutout)) < MIN_PIECE_PIXELS) continue;
      crops.push({ itemId: piece.itemId, storageId: await storePngId(ctx, cutout) });
    }
    return { crops, usage: imageUsage(response.usage) };
  },
});

async function opaquePixels(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let index = 3; index < data.length; index += info.channels) {
    if ((data[index] ?? 0) > 0) count += 1;
  }
  return count;
}

async function storePngId(ctx: ActionCtx, buffer: Buffer): Promise<Id<"_storage">> {
  return ctx.storage.store(new Blob([asBytes(buffer)], { type: "image/png" }));
}

function upstream(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    throw appError("UPSTREAM_FAILED", error.message.slice(0, 240));
  }
  throw error;
}

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

    const client = openai();
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

    const grid = gridFor(pieces.length);
    let response: OpenAI.ImagesResponse;
    try {
      response = await client.images.edit({
        model: modelId(IMAGE_MODEL),
        image: await toFile(normalized, "photo.png", { type: "image/png" }),
        prompt: gridPrompt(pieces, grid),
        size: grid.size,
        quality: "medium",
        output_format: "png",
      });
    } catch (error) {
      upstream(error);
    }

    const encoded = response.data?.[0]?.b64_json;
    if (!encoded) throw appError("UPSTREAM_FAILED", "The image model returned no image.");

    let board = Buffer.from(encoded, "base64");
    const meta = await sharp(board).metadata();
    if (meta.width !== grid.width || meta.height !== grid.height) {
      board = await sharp(board).resize(grid.width, grid.height, { fit: "fill" }).png().toBuffer();
    }

    const boardUrl = await storePng(ctx, board);
    const cutouts = await cropPieces(board, grid, pieces.length);
    const crops = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      const cutout = cutouts[index];
      if (!piece || !cutout) continue;
      crops.push({ label: piece.name, url: await storePng(ctx, cutout) });
    }

    const image = imageUsage(response.usage);
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
