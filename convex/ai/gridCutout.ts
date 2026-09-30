"use node";

/**
 * Shared catalogue-grid cutout helpers used by the grid demo and vendor import.
 * One gpt-image-2 board + local transparent PNG crops (no per-piece image regenerate).
 */

import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { normalizeImageInput } from "./image_input";
import { optionalEnv, requireEnv } from "../lib/env";
import { appError } from "../lib/errors";
import type { TokenUsage } from "../shared/credits";

export const IMAGE_MODEL = "gpt-image-2";
const REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export type GridPiece = { name: string; description: string };

export type Grid = {
  size: "1024x1024" | "1024x1536";
  width: number;
  height: number;
  cols: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
};

export const MIN_PIECE_PIXELS = 40;
const BACKGROUND = 252;
const SECOND_PIECE_FRACTION = 0.25;
const CROP_PADDING = 16;
/** Catalogue cutouts fit inside this square (transparent pad). */
const CATALOGUE_SIZE = 1024;

export function openaiClient(): OpenAI {
  const directKey = optionalEnv("OPENAI_API_KEY");
  return new OpenAI({
    apiKey: directKey ?? requireEnv("AI_GATEWAY_API_KEY"),
    ...(directKey ? {} : { baseURL: "https://ai-gateway.vercel.sh/v1" }),
    maxRetries: 0,
    timeout: REQUEST_TIMEOUT_MS,
  });
}

export function modelId(model: string): string {
  return optionalEnv("OPENAI_API_KEY") ? model : `openai/${model}`;
}

/** Even cells only. 1024 and 1536 both divide cleanly for these counts. */
export function gridFor(count: number): Grid {
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

export function gridPrompt(pieces: GridPiece[], grid: Grid): string {
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

export function imageUsage(usage: OpenAI.ImagesResponse["usage"]): TokenUsage {
  return {
    inputTextTokens: usage?.input_tokens_details?.text_tokens ?? 0,
    inputImageTokens: usage?.input_tokens_details?.image_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
  };
}

export function asBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes;
}

export function upstream(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    throw appError("UPSTREAM_FAILED", error.message.slice(0, 240));
  }
  throw error;
}

function isContent(data: Buffer, offset: number): boolean {
  return data[offset]! < BACKGROUND || data[offset + 1]! < BACKGROUND || data[offset + 2]! < BACKGROUND;
}

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
 * Neighbour pixels and the studio background are transparent.
 */
export async function cropPieces(board: Buffer, grid: Grid, count: number): Promise<Buffer[]> {
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

export async function opaquePixels(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let index = 3; index < data.length; index += info.channels) {
    if ((data[index] ?? 0) > 0) count += 1;
  }
  return count;
}

/** Fit cutout inside a square catalogue canvas with transparent padding. */
export async function fitCataloguePng(png: Buffer, size = CATALOGUE_SIZE): Promise<Buffer> {
  return sharp(png)
    .ensureAlpha()
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

export async function storePngId(ctx: ActionCtx, buffer: Buffer): Promise<Id<"_storage">> {
  return ctx.storage.store(new Blob([asBytes(buffer)], { type: "image/png" }));
}

export async function storePngUrl(ctx: ActionCtx, buffer: Buffer): Promise<string> {
  const storageId = await storePngId(ctx, buffer);
  const url = await ctx.storage.getUrl(storageId);
  if (!url) throw appError("UPSTREAM_FAILED", "The cropped image could not be stored.");
  return url;
}

/**
 * One image edit → board → local transparent crops for each piece (same order as `pieces`).
 * Throws on model failure. Callers filter empty/weak crops with `opaquePixels`.
 */
export async function renderBoardAndCrop(
  photo: Blob,
  pieces: GridPiece[],
): Promise<{ board: Buffer; cutouts: Buffer[]; usage: TokenUsage; grid: Grid }> {
  if (pieces.length < 1) {
    throw appError("INVALID_INPUT", "Need at least one piece for a catalogue board.");
  }
  const client = openaiClient();
  const normalized = await normalizeImageInput(photo, "photo");
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
  return { board, cutouts, usage: imageUsage(response.usage), grid };
}
