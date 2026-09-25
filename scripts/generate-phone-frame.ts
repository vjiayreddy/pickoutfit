/**
 * Draws the try-on hero phone frame.
 * The screen opening is fully transparent. Insets are printed as percentages
 * of the PNG, including the transparent padding, and must match
 * PHONE_FRAME in src/components/landing/try-on-assets.ts.
 *
 *   node --experimental-strip-types scripts/generate-phone-frame.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const PAD = 56;
const BODY_W = 820;
const BODY_H = 1680;
const BODY_R = 118;
const BEZEL = 18;
const SCREEN_R = 96;

const WIDTH = BODY_W + PAD * 2;
const HEIGHT = BODY_H + PAD * 2;
const BODY_X = PAD;
const BODY_Y = PAD;
const SCREEN_X = PAD + BEZEL;
const SCREEN_Y = PAD + BEZEL;
const SCREEN_W = BODY_W - BEZEL * 2;
const SCREEN_H = BODY_H - BEZEL * 2;

const ISLAND_W = 132;
const ISLAND_H = 38;
const ISLAND_X = SCREEN_X + (SCREEN_W - ISLAND_W) / 2;
const ISLAND_Y = SCREEN_Y + 22;

export const PHONE_FRAME_METRICS = {
  width: WIDTH,
  height: HEIGHT,
  screen: {
    top: (SCREEN_Y / HEIGHT) * 100,
    left: (SCREEN_X / WIDTH) * 100,
    width: (SCREEN_W / WIDTH) * 100,
    height: (SCREEN_H / HEIGHT) * 100,
    radiusX: (SCREEN_R / SCREEN_W) * 100,
    radiusY: (SCREEN_R / SCREEN_H) * 100,
  },
} as const;

function sdfRoundRect(
  px: number,
  py: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): number {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function coverage(distance: number): number {
  return Math.min(1, Math.max(0, 0.5 - distance));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const png = new PNG({ width: WIDTH, height: HEIGHT });

for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const px = x + 0.5;
    const py = y + 0.5;
    const body = sdfRoundRect(px, py, BODY_X, BODY_Y, BODY_W, BODY_H, BODY_R);
    const volumeUp = sdfRoundRect(px, py, BODY_X - 7, BODY_Y + 250, 10, 64, 4);
    const volumeDown = sdfRoundRect(px, py, BODY_X - 7, BODY_Y + 332, 10, 64, 4);
    const power = sdfRoundRect(px, py, BODY_X + BODY_W - 3, BODY_Y + 390, 10, 108, 4);

    let alpha = Math.max(
      coverage(body),
      coverage(volumeUp),
      coverage(volumeDown),
      coverage(power),
    );
    if (alpha <= 0) continue;

    const shade = (py - BODY_Y) / BODY_H;
    let red = lerp(38, 17, shade);
    let green = lerp(38, 17, shade);
    let blue = lerp(40, 17, shade);

    if (body > -2.4 && body < 0.6) {
      red = lerp(red, 92, 0.55);
      green = lerp(green, 92, 0.55);
      blue = lerp(blue, 96, 0.55);
    }

    const screen = sdfRoundRect(px, py, SCREEN_X, SCREEN_Y, SCREEN_W, SCREEN_H, SCREEN_R);
    alpha *= 1 - coverage(screen);

    const island = sdfRoundRect(px, py, ISLAND_X, ISLAND_Y, ISLAND_W, ISLAND_H, ISLAND_H / 2);
    const islandCover = coverage(island);
    if (islandCover > 0) {
      const keep = 1 - islandCover;
      red = red * keep + 12 * islandCover;
      green = green * keep + 12 * islandCover;
      blue = blue * keep + 12 * islandCover;
      alpha = alpha * keep + islandCover;
    }

    if (alpha <= 0) continue;
    const index = (WIDTH * y + x) << 2;
    png.data[index] = Math.round(red);
    png.data[index + 1] = Math.round(green);
    png.data[index + 2] = Math.round(blue);
    png.data[index + 3] = Math.round(alpha * 255);
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public/images/try-on");
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "phone-frame.png");
writeFileSync(outFile, PNG.sync.write(png));
console.log(JSON.stringify(PHONE_FRAME_METRICS));
console.log(outFile);
