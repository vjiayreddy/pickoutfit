import type { Category, Formality, Slot } from "./wardrobe";
import { slotForCategory } from "./wardrobe";

/** Product fields the rail matcher reads. */
export type MatchProduct = {
  name: string;
  category: string;
  subcategory?: string | null;
  productType?: string | null;
  colours?: { primary: string; secondary?: string[]; hex?: string[] } | null;
  pattern?: string | null;
  material?: string | null;
  formality?: Formality | string | null;
};

/** Ready wardrobe item fields the rail matcher reads. */
export type MatchItem = {
  _id: string;
  name: string;
  category: Category;
  subcategory: string;
  colours: { primary: string; secondary: string[]; hex: string[] };
  pattern: string;
  material: string;
  formality: Formality | string;
};

export type RelationKind = "similar" | "pairs";

export type MatchRelation = {
  kind: RelationKind;
  itemId: string;
  itemName: string;
  score: number;
};

/** Maps catalog clothes/accessories types onto wardrobe categories. */
const PRODUCT_TYPE_CATEGORY: Record<string, Category> = {
  "t-shirt": "top",
  shirt: "top",
  polo: "top",
  knit: "top",
  hoodie: "top",
  jacket: "outerwear",
  coat: "outerwear",
  suit: "outerwear",
  blazer: "outerwear",
  dress: "dress",
  skirt: "bottom",
  trouser: "bottom",
  jeans: "bottom",
  shorts: "bottom",
  shoes: "shoes",
  bag: "bag",
  belt: "accessory",
  hat: "headwear",
  jewelry: "accessory",
  scarf: "accessory",
  watch: "accessory",
  glasses: "accessory",
  sunglasses: "accessory",
};

/** Colour families so "white" matches "off-white" / "ivory". */
const COLOUR_FAMILIES: Record<string, string> = {
  white: "white",
  ivory: "white",
  cream: "white",
  ecru: "white",
  "off-white": "white",
  offwhite: "white",
  black: "black",
  charcoal: "black",
  navy: "blue",
  blue: "blue",
  "light blue": "blue",
  "sky blue": "blue",
  denim: "blue",
  grey: "grey",
  gray: "grey",
  silver: "grey",
  beige: "neutral",
  tan: "neutral",
  khaki: "neutral",
  brown: "brown",
  camel: "brown",
  red: "red",
  burgundy: "red",
  maroon: "red",
  green: "green",
  olive: "green",
  pink: "pink",
  purple: "purple",
  yellow: "yellow",
  orange: "orange",
};

/** Pattern synonyms so "pinstripe" matches "stripe" / "striped". */
const PATTERN_FAMILIES: Record<string, string> = {
  solid: "solid",
  plain: "solid",
  stripe: "stripe",
  striped: "stripe",
  stripes: "stripe",
  pinstripe: "stripe",
  pinstriped: "stripe",
  "pin stripe": "stripe",
  check: "check",
  checked: "check",
  plaid: "check",
  gingham: "check",
  floral: "floral",
  flower: "floral",
  print: "print",
  printed: "print",
  dot: "dot",
  dotted: "dot",
  polka: "dot",
  "colourblock": "colourblock",
  colorblock: "colourblock",
};

/** Slots that complete each other in an outfit (product slot → owned slots). */
const PAIR_SLOTS: Record<Slot, readonly Slot[]> = {
  top: ["bottom", "shoes", "outerwear", "accessories"],
  bottom: ["top", "shoes", "outerwear", "accessories"],
  dress: ["shoes", "outerwear", "accessories"],
  outerwear: ["top", "bottom", "dress", "shoes"],
  shoes: ["top", "bottom", "dress", "outerwear"],
  accessories: ["top", "bottom", "dress", "shoes", "outerwear"],
};

const SIMILAR_THRESHOLD = 4;
const PAIRS_THRESHOLD = 2;

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return norm(value)
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 2);
}

function colourFamily(value: string): string {
  const key = norm(value);
  return COLOUR_FAMILIES[key] ?? key;
}

function patternFamily(value: string): string {
  const key = norm(value);
  return PATTERN_FAMILIES[key] ?? key;
}

function coloursOverlap(
  a: { primary: string; secondary?: string[]; hex?: string[] },
  b: { primary: string; secondary?: string[]; hex?: string[] },
): boolean {
  const aNames = new Set(
    [a.primary, ...(a.secondary ?? [])].map(colourFamily).filter((c) => c.length > 0 && c !== "unknown"),
  );
  const bNames = [b.primary, ...(b.secondary ?? [])].map(colourFamily);
  if (bNames.some((c) => aNames.has(c))) return true;
  const aHex = new Set((a.hex ?? []).map((h) => h.toLowerCase()));
  return (b.hex ?? []).some((h) => aHex.has(h.toLowerCase()));
}

/** Infer a wardrobe category from catalog type / subcategory / name. */
export function inferProductWardrobeCategory(product: MatchProduct): Category | null {
  const type = product.productType ? norm(product.productType) : "";
  if (type && PRODUCT_TYPE_CATEGORY[type]) return PRODUCT_TYPE_CATEGORY[type];

  if (product.category === "accessories" || product.category === "eyewear") {
    const text = `${product.subcategory ?? ""} ${product.name}`.toLowerCase();
    if (/\bbag\b|tote|backpack|clutch/.test(text)) return "bag";
    if (/\bhat\b|cap|beanie/.test(text)) return "headwear";
    return "accessory";
  }
  if (product.category !== "clothes") return null;

  const text = `${product.subcategory ?? ""} ${product.name}`.toLowerCase();
  if (/\bdress\b|gown|frock/.test(text)) return "dress";
  if (/\bshoe|trainer|sneaker|boot|loafer|sandal|heel/.test(text)) return "shoes";
  if (/\bjacket|coat|blazer|parka|puffer|overcoat/.test(text)) return "outerwear";
  if (/\bjeans\b|trouser|pant|skirt|short|chino|legging/.test(text)) return "bottom";
  if (/\bshirt|blouse|tee|t-shirt|polo|knit|hoodie|sweater|top\b|henley/.test(text)) return "top";
  return null;
}

function nameOverlap(a: string, b: string): number {
  const aTokens = new Set(tokens(a));
  if (aTokens.size === 0) return 0;
  let hits = 0;
  for (const token of tokens(b)) {
    if (aTokens.has(token)) hits += 1;
  }
  return hits;
}

/** Score how much a catalog product duplicates an owned piece. Higher = more alike. */
export function scoreSimilar(product: MatchProduct, item: MatchItem): number {
  const productCategory = inferProductWardrobeCategory(product);
  if (!productCategory || productCategory !== item.category) return 0;

  let score = 2; // same category is the floor

  if (product.colours && coloursOverlap(product.colours, item.colours)) score += 2;

  const productPattern = product.pattern ? patternFamily(product.pattern) : "";
  const itemPattern = patternFamily(item.pattern);
  if (productPattern && itemPattern && productPattern === itemPattern) score += 2;
  else if (
    productPattern === "stripe" &&
    /stripe|pinstripe/.test(`${norm(item.name)} ${norm(item.subcategory)}`)
  ) {
    score += 1;
  } else if (
    itemPattern === "stripe" &&
    /stripe|pinstripe/.test(`${norm(product.name)} ${norm(product.subcategory ?? "")}`)
  ) {
    score += 1;
  }

  const type = product.productType ? norm(product.productType) : "";
  const sub = norm(item.subcategory);
  if (type && (sub.includes(type) || type.includes(sub.split(" ")[0] ?? ""))) score += 1;

  score += Math.min(2, nameOverlap(product.name, item.name));

  if (product.formality && item.formality && norm(String(product.formality)) === norm(String(item.formality))) {
    score += 1;
  }

  const productMaterial = product.material ? norm(product.material) : "";
  if (productMaterial && productMaterial === norm(item.material)) score += 1;

  return score;
}

/** Score how well a catalog product completes an owned piece (different slot). */
export function scorePairs(product: MatchProduct, item: MatchItem): number {
  const productCategory = inferProductWardrobeCategory(product);
  if (!productCategory) return 0;
  const productSlot = slotForCategory(productCategory);
  const itemSlot = slotForCategory(item.category);
  if (productSlot === itemSlot) return 0;
  if (!PAIR_SLOTS[productSlot].includes(itemSlot)) return 0;

  let score = 2;
  if (product.formality && item.formality && norm(String(product.formality)) === norm(String(item.formality))) {
    score += 2;
  }
  // Soft colour coordination: same family or both neutrals reads as intentional.
  if (product.colours && coloursOverlap(product.colours, item.colours)) score += 1;
  else if (product.colours) {
    const a = colourFamily(product.colours.primary);
    const b = colourFamily(item.colours.primary);
    const neutrals = new Set(["white", "black", "grey", "neutral", "brown"]);
    if (neutrals.has(a) || neutrals.has(b)) score += 1;
  }
  return score;
}

/**
 * Pick the strongest wardrobe relation for a catalog product.
 * Similar wins over pairs when both clear the threshold — don't pitch a twin as a complement.
 */
export function bestRelation(product: MatchProduct, items: MatchItem[]): MatchRelation | null {
  let bestSimilar: MatchRelation | null = null;
  let bestPairs: MatchRelation | null = null;

  for (const item of items) {
    const similar = scoreSimilar(product, item);
    if (similar >= SIMILAR_THRESHOLD && (!bestSimilar || similar > bestSimilar.score)) {
      bestSimilar = { kind: "similar", itemId: item._id, itemName: item.name, score: similar };
    }
    const pairs = scorePairs(product, item);
    if (pairs >= PAIRS_THRESHOLD && (!bestPairs || pairs > bestPairs.score)) {
      bestPairs = { kind: "pairs", itemId: item._id, itemName: item.name, score: pairs };
    }
  }

  if (bestSimilar) return bestSimilar;
  return bestPairs;
}

/** Sort key: promote complements, demote near-duplicates. */
export function relationSortRank(kind: RelationKind | null): number {
  if (kind === "pairs") return 0;
  if (kind === null) return 1;
  return 2;
}
