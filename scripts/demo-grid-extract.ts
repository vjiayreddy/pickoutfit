/**
 * Demo only. One gpt-image-2 edit lays four garments on a fixed 2x2 board.
 * sharp crops each cell for free. Does not call extractItem or write to Convex.
 *
 *   node scripts/demo-grid-extract.ts [photo-path]
 *
 * Uses OPENAI_API_KEY when set, otherwise AI_GATEWAY_API_KEY the same way
 * convex/ai/openai.ts does. Cost uses the rates in convex/shared/credits.ts usageToUsd.
 */
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI, { toFile } from "openai";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "tmp/grid-extract-demo");
const CELL = 512;

const CELLS = [
  { file: "01-jacket.png", left: 0, top: 0, label: "jacket" },
  { file: "02-polo.png", left: CELL, top: 0, label: "polo" },
  { file: "03-jeans.png", left: 0, top: CELL, label: "jeans" },
  { file: "04-sneakers.png", left: CELL, top: CELL, label: "sneakers" },
] as const;

const PROMPT = [
  "Arrange ONLY these four garments from the photo into a strict 2 by 2 catalogue grid on a plain white background.",
  "",
  "Top-left cell: the checked overshirt jacket, alone, neatly laid flat, fully visible, centred in that cell.",
  "Top-right cell: the cream polo shirt, alone, neatly laid flat, fully visible, centred in that cell.",
  "Bottom-left cell: the light gray jeans, alone, neatly laid flat, fully visible, centred in that cell.",
  "Bottom-right cell: the white sneakers as a pair, alone, neatly laid flat, fully visible, centred in that cell.",
  "",
  "Each cell is exactly one quarter of the square image. The four cells meet at the exact horizontal and vertical midlines, with no gaps, borders, gutters, or frames.",
  "",
  "Do not include the person, the original photograph, any other garment, accessories, text, labels, captions, logos, arrows, or detail close-ups. Do not add anything that is not visible on that garment. Preserve each garment's colours, print, stitching, and proportions.",
].join("\n");

/** Same dollars-per-million as UNIT_ECONOMICS.openaiPricingUsdPerMillion / usageToUsd. */
const USD_PER_MILLION = { textIn: 2.5, imageIn: 4, imageOut: 15 };

function loadEnvFile(filePath: string) {
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function client(): { openai: OpenAI; model: string } {
  const directKey = process.env.OPENAI_API_KEY;
  const gatewayKey = process.env.AI_GATEWAY_API_KEY;
  if (directKey) return { openai: new OpenAI({ apiKey: directKey, maxRetries: 0 }), model: "gpt-image-2" };
  if (!gatewayKey) {
    throw new Error("Set OPENAI_API_KEY or AI_GATEWAY_API_KEY in the environment or .env.local.");
  }
  return {
    openai: new OpenAI({
      apiKey: gatewayKey,
      baseURL: "https://ai-gateway.vercel.sh/v1",
      maxRetries: 0,
    }),
    model: "openai/gpt-image-2",
  };
}

function usageUsd(usage: {
  input_tokens_details?: { text_tokens?: number; image_tokens?: number } | null;
  output_tokens?: number | null;
} | null | undefined) {
  const textIn = usage?.input_tokens_details?.text_tokens ?? 0;
  const imageIn = usage?.input_tokens_details?.image_tokens ?? 0;
  const imageOut = usage?.output_tokens ?? 0;
  const usd =
    (textIn * USD_PER_MILLION.textIn +
      imageIn * USD_PER_MILLION.imageIn +
      imageOut * USD_PER_MILLION.imageOut) /
    1_000_000;
  return { textIn, imageIn, imageOut, usd };
}

async function main() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  const photo = process.argv[2];
  if (!photo) {
    throw new Error("Pass the source photo path. Example: node scripts/demo-grid-extract.ts ./photo.png");
  }
  const photoPath = path.resolve(photo);
  const bytes = await readFile(photoPath);
  const { openai, model } = client();

  console.log(`Editing ${path.basename(photoPath)} with one ${model} call…`);
  const response = await openai.images.edit({
    model,
    image: await toFile(bytes, "photo.png", { type: "image/png" }),
    prompt: PROMPT,
    size: "1024x1024",
    quality: "medium",
    output_format: "png",
  });

  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) throw new Error("The image model returned no image.");
  let board = Buffer.from(encoded, "base64");
  const meta = await sharp(board).metadata();
  if (meta.width !== 1024 || meta.height !== 1024) {
    console.log(`Board was ${meta.width}x${meta.height}; resizing to 1024x1024 before the fixed crop.`);
    board = await sharp(board).resize(1024, 1024, { fit: "fill" }).png().toBuffer();
  }

  await mkdir(OUT_DIR, { recursive: true });
  const boardPath = path.join(OUT_DIR, "board.png");
  await writeFile(boardPath, board);

  for (const cell of CELLS) {
    const out = path.join(OUT_DIR, cell.file);
    await sharp(board)
      .extract({ left: cell.left, top: cell.top, width: CELL, height: CELL })
      .png()
      .toFile(out);
    console.log(`cropped ${cell.label} -> ${path.relative(ROOT, out)}`);
  }

  const cost = usageUsd(response.usage);
  console.log(`board -> ${path.relative(ROOT, boardPath)}`);
  console.log(
    `tokens text=${cost.textIn} imageIn=${cost.imageIn} imageOut=${cost.imageOut} estimatedUsd=${cost.usd.toFixed(4)}`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
