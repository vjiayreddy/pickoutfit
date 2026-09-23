/**
 * Hair / beard restyle presets for post–try-on grooming (masculine presentation).
 * Labels are UI copy; phrases feed the gpt-image-2 edit prompt.
 */

export const HAIR_STYLES = [
  "keep",
  "buzz",
  "crew",
  "fade",
  "textured_crop",
  "medium",
  "slicked_back",
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
};

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
};

export const BEARD_PHRASES: Record<BeardStyle, string | null> = {
  keep: null,
  clean: "clean-shaven with no facial hair",
  stubble: "a light, even stubble beard",
  short_boxed: "a short, neatly trimmed boxed beard",
  full: "a full, well-groomed beard of medium length",
  goatee: "a neat goatee with a clean chin and mustache focus",
};

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
 */
export function validateGroomingSelection(selection: GroomingSelection): string | null {
  const custom = normalizeGroomCustom(selection.custom);
  if (!isHairStyle(selection.hair)) return "Pick a hair style.";
  if (!isBeardStyle(selection.beard)) return "Pick a beard style.";
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
