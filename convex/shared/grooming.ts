/**
 * Hair / beard restyle presets. Labels are UI copy; phrases feed the gpt-image-2 edit prompt.
 * Masculine cuts stay as they were. Feminine and neutral sets are additional ids on the same union.
 */

import type { BudgetTier, HairGoal, HairLength, HairTexture } from "./services";
import type { Presentation } from "./wardrobe";

export const HAIR_STYLES = [
  "keep",
  "buzz",
  "crew",
  "fade",
  "textured_crop",
  "medium",
  "slicked_back",
  "bob",
  "lob",
  "long_layers",
  "pixie",
  "curtain_bangs",
  "high_ponytail",
  "sleek_bun",
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const BEARD_STYLES = [
  "keep",
  "clean",
  "stubble",
  "short_boxed",
  "full",
  "goatee",
] as const;
export type BeardStyle = (typeof BEARD_STYLES)[number];

const MASCULINE_HAIR: readonly HairStyle[] = [
  "keep",
  "buzz",
  "crew",
  "fade",
  "textured_crop",
  "medium",
  "slicked_back",
];

const FEMININE_HAIR: readonly HairStyle[] = [
  "keep",
  "bob",
  "lob",
  "long_layers",
  "pixie",
  "curtain_bangs",
  "high_ponytail",
  "sleek_bun",
];

const NEUTRAL_HAIR: readonly HairStyle[] = [
  "keep",
  "pixie",
  "bob",
  "medium",
  "long_layers",
  "sleek_bun",
  "textured_crop",
];

export const HAIR_STYLES_BY_PRESENTATION: Record<Presentation, readonly HairStyle[]> = {
  masculine: MASCULINE_HAIR,
  feminine: FEMININE_HAIR,
  neutral: NEUTRAL_HAIR,
};

export function hairStylesFor(presentation: Presentation): readonly HairStyle[] {
  return HAIR_STYLES_BY_PRESENTATION[presentation];
}

export const RENDER_KINDS = ["try_on", "groom"] as const;
export type RenderKind = (typeof RENDER_KINDS)[number];

export type GroomingSelection = {
  hair: HairStyle;
  beard: BeardStyle;
  custom?: string;
};

export const HAIR_LABELS: Record<HairStyle, string> = {
  keep: "Keep current",
  buzz: "Buzz cut",
  crew: "Crew cut",
  fade: "Short fade",
  textured_crop: "Textured crop",
  medium: "Medium length",
  slicked_back: "Slicked back",
  bob: "Bob",
  lob: "Lob",
  long_layers: "Long layers",
  pixie: "Pixie",
  curtain_bangs: "Curtain bangs",
  high_ponytail: "High ponytail",
  sleek_bun: "Sleek bun",
};

/** Catalog portraits for the hairstyle studio. "Keep current" uses the selected look. */
export const HAIR_REFERENCES: Record<Exclude<HairStyle, "keep">, string> = {
  buzz: "/grooming/hair/buzz.png",
  crew: "/grooming/hair/crew.png",
  fade: "/grooming/hair/fade.png",
  textured_crop: "/grooming/hair/textured-crop.png",
  medium: "/grooming/hair/medium.png",
  slicked_back: "/grooming/hair/slicked-back.png",
  bob: "/grooming/hair/bob.png",
  lob: "/grooming/hair/lob.png",
  long_layers: "/grooming/hair/long-layers.png",
  pixie: "/grooming/hair/pixie.png",
  curtain_bangs: "/grooming/hair/curtain-bangs.png",
  high_ponytail: "/grooming/hair/high-ponytail.png",
  sleek_bun: "/grooming/hair/sleek-bun.png",
};

export function hairReference(style: HairStyle): string | null {
  if (style === "keep") return null;
  return HAIR_REFERENCES[style];
}

export const BEARD_LABELS: Record<BeardStyle, string> = {
  keep: "Keep current",
  clean: "Clean shaven",
  stubble: "Light stubble",
  short_boxed: "Short boxed",
  full: "Full beard",
  goatee: "Goatee",
};

export const HAIR_PHRASES: Record<HairStyle, string | null> = {
  keep: null,
  buzz: "a very short buzz cut, evenly cropped close to the scalp",
  crew: "a classic short crew cut with a neat tapered nape",
  fade: "a short fade haircut with clean faded sides and a bit of length on top",
  textured_crop: "a modern textured crop with short sides and tousled top",
  medium: "medium-length hair, styled naturally and neatly",
  slicked_back: "medium hair slicked back with a polished finish",
  bob: "a chin-length bob with a clean line",
  lob: "a long bob that sits around the collarbone",
  long_layers: "long layered hair with soft movement",
  pixie: "a short pixie cut, cropped close at the nape with a little length on top",
  curtain_bangs: "medium hair with face-framing curtain bangs",
  high_ponytail: "a high ponytail with the hair pulled up and smoothed",
  sleek_bun: "a sleek low bun with the hair smoothed back",
};

export const BEARD_PHRASES: Record<BeardStyle, string | null> = {
  keep: null,
  clean: "clean-shaven with no facial hair",
  stubble: "a light, even stubble beard",
  short_boxed: "a short, neatly trimmed boxed beard",
  full: "a full, well-groomed beard of medium length",
  goatee: "a neat goatee with a clean chin and mustache focus",
};

/** Search phrases for shop links. No model call. */
export const GROOMING_SHOP_QUERIES: Record<HairStyle | BeardStyle, string> = {
  keep: "hair care",
  buzz: "hair clipper",
  crew: "matte hair clay",
  fade: "matte hair clay",
  textured_crop: "texture hair clay",
  medium: "hair cream",
  slicked_back: "hair pomade",
  bob: "bob haircut care",
  lob: "hair oil",
  long_layers: "leave in conditioner",
  pixie: "short hair clay",
  curtain_bangs: "fringe hair cream",
  high_ponytail: "hair serum",
  sleek_bun: "hair gel",
  clean: "face wash",
  stubble: "beard trimmer",
  short_boxed: "beard oil trimmer",
  full: "beard oil balm",
  goatee: "goatee trimmer",
};

const LENGTH_SCORE: Record<HairStyle, number> = {
  keep: 2,
  buzz: 0,
  crew: 0,
  fade: 1,
  textured_crop: 1,
  pixie: 1,
  medium: 2,
  bob: 2,
  curtain_bangs: 2,
  slicked_back: 2,
  lob: 3,
  long_layers: 3,
  high_ponytail: 3,
  sleek_bun: 3,
};

const LENGTH_TARGET: Record<HairLength, number> = {
  buzz: 0,
  short: 1,
  medium: 2,
  long: 3,
};

export type HairProfileHint = {
  hairLength?: HairLength;
  texture?: HairTexture;
  hairGoal?: HairGoal;
};

/**
 * Puts cuts that match the profile first. A long answer does not open on a fade.
 * "Go shorter" leads with short cuts. "Keep current" stays last.
 */
export function orderHairStyles(
  styles: readonly HairStyle[],
  profile?: HairProfileHint | null,
): HairStyle[] {
  const target =
    profile?.hairGoal === "shorter"
      ? 1
      : profile?.hairGoal === "longer"
        ? 3
        : profile?.hairLength
          ? LENGTH_TARGET[profile.hairLength]
          : 2;
  const curly = profile?.texture === "curly" || profile?.texture === "coily";
  const changing: HairStyle[] = [];
  let hasKeep = false;
  for (const style of styles) {
    if (style === "keep") hasKeep = true;
    else changing.push(style);
  }
  const ranked = changing
    .map((style) => {
      let score = Math.abs(LENGTH_SCORE[style] - target);
      if (curly && (style === "slicked_back" || style === "sleek_bun" || style === "fade")) {
        score += 2;
      }
      if (curly && (style === "long_layers" || style === "textured_crop" || style === "bob")) {
        score -= 0.5;
      }
      return { style, score };
    })
    .sort((a, b) => a.score - b.score || a.style.localeCompare(b.style));
  const ordered = ranked.map((entry) => entry.style);
  if (hasKeep) ordered.push("keep");
  return ordered;
}

export function groomingShopQuery(
  kind: "hairstyle" | "beard",
  style: HairStyle | BeardStyle,
  extras?: { texture?: HairTexture; tier?: BudgetTier },
): string {
  const base =
    kind === "beard" && style === "keep"
      ? "beard care"
      : GROOMING_SHOP_QUERIES[style];
  const texture =
    kind === "hairstyle"
      ? extras?.texture === "curly" || extras?.texture === "coily"
        ? "curl cream"
        : extras?.texture === "wavy"
          ? "wave cream"
          : extras?.texture === "straight"
            ? "hair clay"
            : undefined
      : undefined;
  const tier =
    extras?.tier === "value" ? "affordable" : extras?.tier === "premium" ? "premium" : undefined;
  return [base, texture, tier].filter((part): part is string => Boolean(part)).join(" ");
}

const CUSTOM_MIN = 3;
const CUSTOM_MAX = 200;

export function isHairStyle(value: string): value is HairStyle {
  return (HAIR_STYLES as readonly string[]).includes(value);
}

export function isBeardStyle(value: string): value is BeardStyle {
  return (BEARD_STYLES as readonly string[]).includes(value);
}

/** Trim and bound optional free-text; empty becomes undefined. */
export function normalizeGroomCustom(custom?: string): string | undefined {
  const trimmed = custom?.trim() ?? "";
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, CUSTOM_MAX);
}

/**
 * At least one of hair/beard must change, or custom text (≥3 chars) must be present.
 * Hair must belong to the presentation's set. Beard changes are masculine only.
 */
export function validateGroomingSelection(
  selection: GroomingSelection,
  presentation: Presentation,
): string | null {
  const custom = normalizeGroomCustom(selection.custom);
  if (!isHairStyle(selection.hair) || !hairStylesFor(presentation).includes(selection.hair)) {
    return "Pick a hair style.";
  }
  if (!isBeardStyle(selection.beard)) return "Pick a beard style.";
  if (selection.beard !== "keep" && presentation !== "masculine") {
    return "Beard styling is part of a men's wardrobe.";
  }
  const hairChange = selection.hair !== "keep";
  const beardChange = selection.beard !== "keep";
  if (!hairChange && !beardChange && !custom) {
    return "Change hair, beard, or add a custom note.";
  }
  if (custom !== undefined && custom.length < CUSTOM_MIN) {
    return `Custom note needs at least ${CUSTOM_MIN} characters.`;
  }
  return null;
}

/** Short caption for lookbook / try-on tiles. */
export function groomingCaption(selection: GroomingSelection): string {
  const parts: string[] = [];
  if (selection.hair !== "keep") parts.push(HAIR_LABELS[selection.hair]);
  if (selection.beard !== "keep") parts.push(BEARD_LABELS[selection.beard]);
  if (selection.custom?.trim()) parts.push("Custom");
  return parts.join(" · ") || "Styled";
}
