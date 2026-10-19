import {
  legacyProductCategoryFromPath,
  productTypeFromCategoryPath,
  type CategoryTreeNode,
} from "./categories";
import type { ProductCategory } from "./products";
import type { Presentation } from "./wardrobe";

export type PhotoFillDraft = {
  name: string;
  brand: string | null;
  subcategory: string;
  productType: string | null;
  description: string;
  category: ProductCategory;
  presentation: Presentation;
  colours: { primary: string; secondary: string[]; hex: string };
  size: string | null;
  ageGroup: "adult" | "child" | "all" | null;
  occasion: "casual" | "work" | "formal" | "sport" | null;
};

export type PhotoFillBrand = {
  _id: string;
  name: string;
  slug: string;
};

export type PhotoFillAttributeType = {
  _id: string;
  label: string;
  displayLabel?: string;
  slug: string;
};

export type PhotoFillAttribute = {
  _id: string;
  attributeTypeId: string;
  label: string;
  value: string;
  slug: string;
  hex?: string;
};

export type PhotoFillCategoryPick = {
  categoryId: string;
  path: string;
  name: string;
  legacyCategory: ProductCategory;
  productTypeHint: string | null;
};

export type PhotoFillSuggestion = {
  id: string;
  kind: "brand" | "category" | "attribute" | "note";
  label: string;
  detail?: string;
  /** Pre-resolved catalog ids when the user accepts. */
  brandName?: string;
  category?: PhotoFillCategoryPick;
  attributeTypeId?: string;
  attributeId?: string;
};

export type PhotoFillResult = {
  name: string;
  description: string;
  brandId: string | null;
  brand: string;
  categoryId: string | null;
  category: ProductCategory;
  categoryPath?: string;
  subcategory: string;
  productType: string;
  presentation: Presentation;
  attributeSelections: Array<{ attributeTypeId: string; attributeIds: string[] }>;
  suggestions: PhotoFillSuggestion[];
  appliedSummary: string[];
};

type FlatCategory = {
  id: string;
  name: string;
  path: string;
  slug: string;
  depth: number;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function flattenCategories(
  nodes: CategoryTreeNode[],
  depth = 0,
  out: FlatCategory[] = [],
): FlatCategory[] {
  for (const node of nodes) {
    out.push({
      id: node._id,
      name: node.name,
      path: node.path,
      slug: node.slug,
      depth,
    });
    if (node.children.length > 0) flattenCategories(node.children, depth + 1, out);
  }
  return out;
}

function rootPrefers(presentation: Presentation): string | null {
  if (presentation === "masculine") return "men";
  if (presentation === "feminine") return "women";
  return null;
}

/** Pick the deepest category leaf that matches product type + audience root. */
export function matchCategoryFromDraft(
  tree: CategoryTreeNode[],
  draft: Pick<PhotoFillDraft, "productType" | "presentation" | "category" | "subcategory" | "name">,
): PhotoFillCategoryPick | null {
  const productType = draft.productType?.trim().toLowerCase() ?? "";
  if (!productType) return null;
  const flat = flattenCategories(tree).filter((row) => !flatHasChild(tree, row.id));
  const preferredRoot = rootPrefers(draft.presentation);
  const textHints = normalize(`${draft.subcategory ?? ""} ${draft.name ?? ""}`);
  const scored = flat
    .map((row) => {
      const legacy = legacyProductCategoryFromPath(row.path);
      const hint = productTypeFromCategoryPath(row.path, legacy);
      if (hint !== productType) return null;
      let score = row.depth * 10;
      const root = row.path.split("/")[0];
      if (preferredRoot && root === preferredRoot) score += 50;
      if (preferredRoot === null && root === "kids") score -= 5;
      const pathKey = normalize(row.path);
      const nameKey = normalize(row.name);
      const slugKey = normalize(row.slug);
      if (textHints && (textHints.includes(slugKey) || textHints.includes(nameKey) || pathKey.includes(textHints))) {
        score += 40;
      } else if (textHints) {
        for (const part of row.path.split("/")) {
          const partKey = normalize(part);
          if (partKey.length >= 3 && textHints.includes(partKey)) {
            score += 25;
            break;
          }
        }
      }
      return { row, legacy, hint, score };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.score - a.score || b.row.depth - a.row.depth);

  const best = scored[0];
  if (!best) return null;
  // Ambiguous: two top scores within audience → suggest instead of apply.
  if (scored[1] && scored[1].score === best.score && scored[1].row.path !== best.row.path) {
    return null;
  }
  return {
    categoryId: best.row.id,
    path: best.row.path,
    name: best.row.name,
    legacyCategory: best.legacy,
    productTypeHint: best.hint,
  };
}

function flatHasChild(tree: CategoryTreeNode[], id: string): boolean {
  const walk = (nodes: CategoryTreeNode[]): boolean => {
    for (const node of nodes) {
      if (node._id === id) return node.children.length > 0;
      if (walk(node.children)) return true;
    }
    return false;
  };
  return walk(tree);
}

/** List candidate category paths for suggestions when auto-match fails. */
export function suggestCategoriesFromDraft(
  tree: CategoryTreeNode[],
  draft: Pick<PhotoFillDraft, "productType" | "presentation">,
  limit = 3,
): PhotoFillCategoryPick[] {
  const productType = draft.productType?.trim().toLowerCase() ?? "";
  if (!productType) return [];
  const preferredRoot = rootPrefers(draft.presentation);
  const flat = flattenCategories(tree).filter((row) => !flatHasChild(tree, row.id));
  return flat
    .map((row) => {
      const legacy = legacyProductCategoryFromPath(row.path);
      const hint = productTypeFromCategoryPath(row.path, legacy);
      if (hint !== productType) return null;
      let score = row.depth;
      if (preferredRoot && row.path.startsWith(preferredRoot)) score += 20;
      return {
        pick: {
          categoryId: row.id,
          path: row.path,
          name: row.name,
          legacyCategory: legacy,
          productTypeHint: hint,
        },
        score,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.pick);
}

export function matchBrandFromDraft(
  brands: PhotoFillBrand[],
  brandName: string | null,
): PhotoFillBrand | null {
  if (!brandName?.trim()) return null;
  const key = normalize(brandName);
  return brands.find((row) => normalize(row.name) === key || normalize(row.slug) === key) ?? null;
}

function typeBySlug(
  types: PhotoFillAttributeType[],
  ...slugs: string[]
): PhotoFillAttributeType | undefined {
  const set = new Set(slugs.map((s) => s.toLowerCase()));
  return types.find((row) => set.has(row.slug.toLowerCase()));
}

function matchAttributeValue(
  options: PhotoFillAttribute[],
  candidates: string[],
  hex?: string,
): PhotoFillAttribute | null {
  const keys = candidates.map(normalize).filter(Boolean);
  if (hex) {
    const hexNorm = hex.toLowerCase();
    const byHex = options.find((row) => row.hex?.toLowerCase() === hexNorm);
    if (byHex) return byHex;
  }
  for (const key of keys) {
    const hit = options.find(
      (row) =>
        normalize(row.label) === key ||
        normalize(row.value) === key ||
        normalize(row.slug) === key,
    );
    if (hit) return hit;
  }
  // Loose contains for "navy blue" → navy
  for (const key of keys) {
    const hit = options.find(
      (row) =>
        key.includes(normalize(row.label)) ||
        normalize(row.label).includes(key) ||
        key.includes(normalize(row.value)),
    );
    if (hit) return hit;
  }
  return null;
}

function audienceFromPresentation(presentation: Presentation): string | null {
  if (presentation === "masculine") return "men";
  if (presentation === "feminine") return "women";
  if (presentation === "neutral") return "unisex";
  return null;
}

/**
 * Map an AI product photo draft onto the vendor catalog.
 * Confident matches go into applied fields; everything else becomes suggestions.
 */
export function resolvePhotoFill(input: {
  draft: PhotoFillDraft;
  brands: PhotoFillBrand[];
  categoryTree: CategoryTreeNode[];
  attributeTypes: PhotoFillAttributeType[];
  attributes: PhotoFillAttribute[];
}): PhotoFillResult {
  const { draft, brands, categoryTree, attributeTypes, attributes } = input;
  const suggestions: PhotoFillSuggestion[] = [];
  const appliedSummary: string[] = ["Name", "Description"];
  const attributeSelections: Array<{ attributeTypeId: string; attributeIds: string[] }> = [];

  const addSelection = (attributeTypeId: string, attributeId: string) => {
    const existing = attributeSelections.find((row) => row.attributeTypeId === attributeTypeId);
    if (existing) {
      if (!existing.attributeIds.includes(attributeId)) existing.attributeIds.push(attributeId);
      return;
    }
    attributeSelections.push({ attributeTypeId, attributeIds: [attributeId] });
  };

  const brandMatch = matchBrandFromDraft(brands, draft.brand);
  let brandId: string | null = brandMatch?._id ?? null;
  let brand = brandMatch?.name ?? (draft.brand?.trim() ?? "");
  if (brandMatch) {
    appliedSummary.push(`Brand (${brandMatch.name})`);
  } else if (draft.brand?.trim()) {
    suggestions.push({
      id: `brand:${normalize(draft.brand)}`,
      kind: "brand",
      label: draft.brand.trim(),
      detail: "Not in your brand list yet — create it or pick manually.",
      brandName: draft.brand.trim(),
    });
  }

  const categoryMatch = matchCategoryFromDraft(categoryTree, draft);
  let categoryId: string | null = categoryMatch?.categoryId ?? null;
  let category = categoryMatch?.legacyCategory ?? draft.category;
  let subcategory = categoryMatch?.name ?? draft.subcategory;
  let productType = categoryMatch?.productTypeHint ?? draft.productType ?? "";
  let categoryPath = categoryMatch?.path;
  if (categoryMatch) {
    appliedSummary.push(`Category (${categoryMatch.path})`);
  } else {
    const candidates = suggestCategoriesFromDraft(categoryTree, draft);
    if (candidates.length > 0) {
      for (const pick of candidates) {
        suggestions.push({
          id: `category:${pick.categoryId}`,
          kind: "category",
          label: pick.path.replace(/\//g, " → "),
          detail: draft.productType
            ? `Matches AI type “${draft.productType}”.`
            : "Suggested from the photo.",
          category: pick,
        });
      }
    } else if (draft.productType || draft.subcategory) {
      suggestions.push({
        id: "category:note",
        kind: "note",
        label: draft.subcategory || draft.productType || "Category",
        detail: `AI saw type “${draft.productType || draft.subcategory}” — pick a category in Classification.`,
      });
    }
  }

  const byType = new Map<string, PhotoFillAttribute[]>();
  for (const row of attributes) {
    const list = byType.get(row.attributeTypeId) ?? [];
    list.push(row);
    byType.set(row.attributeTypeId, list);
  }

  const colourType = typeBySlug(attributeTypes, "colour", "color");
  if (colourType) {
    const options = byType.get(colourType._id) ?? [];
    const colourNames = [draft.colours.primary, ...draft.colours.secondary].filter(Boolean);
    const matched = matchAttributeValue(options, colourNames, draft.colours.hex || undefined);
    if (matched) {
      addSelection(colourType._id, matched._id);
      appliedSummary.push(`Colour (${matched.label})`);
      for (const name of colourNames) {
        if (normalize(name) === normalize(matched.label) || normalize(name) === normalize(matched.value)) {
          continue;
        }
        const extra = matchAttributeValue(options, [name]);
        if (extra && extra._id !== matched._id) {
          addSelection(colourType._id, extra._id);
        } else if (name.trim()) {
          suggestions.push({
            id: `attr:colour:${normalize(name)}`,
            kind: "attribute",
            label: name,
            detail: "Colour from photo — not in your catalog.",
            attributeTypeId: colourType._id,
          });
        }
      }
    } else if (colourNames[0]) {
      suggestions.push({
        id: `attr:colour:${normalize(colourNames[0])}`,
        kind: "attribute",
        label: colourNames[0],
        detail: draft.colours.hex
          ? `AI colour ${draft.colours.hex} — add or pick under Product traits.`
          : "AI colour — add or pick under Product traits.",
        attributeTypeId: colourType._id,
      });
    }
  }

  const sizeType = typeBySlug(attributeTypes, "size");
  if (sizeType && draft.size?.trim()) {
    const options = byType.get(sizeType._id) ?? [];
    const matched = matchAttributeValue(options, [draft.size]);
    if (matched) {
      addSelection(sizeType._id, matched._id);
      appliedSummary.push(`Size (${matched.label})`);
    } else {
      suggestions.push({
        id: `attr:size:${normalize(draft.size)}`,
        kind: "attribute",
        label: draft.size,
        detail: "Size from photo — not in your Size catalog (or use Stock SKUs).",
        attributeTypeId: sizeType._id,
      });
    }
  }

  const ageType = typeBySlug(attributeTypes, "age");
  if (ageType && draft.ageGroup) {
    const options = byType.get(ageType._id) ?? [];
    const aliases =
      draft.ageGroup === "all"
        ? ["all ages", "all", "adult"]
        : draft.ageGroup === "child"
          ? ["child", "kids", "kid"]
          : ["adult"];
    const matched = matchAttributeValue(options, aliases);
    if (matched) {
      addSelection(ageType._id, matched._id);
      appliedSummary.push(`Age (${matched.label})`);
    } else {
      suggestions.push({
        id: `attr:age:${draft.ageGroup}`,
        kind: "attribute",
        label: draft.ageGroup,
        detail: "Age from photo — pick under Product traits.",
        attributeTypeId: ageType._id,
      });
    }
  }

  const audienceType = typeBySlug(attributeTypes, "audience");
  const audienceValue = audienceFromPresentation(draft.presentation);
  if (audienceType && audienceValue) {
    const options = byType.get(audienceType._id) ?? [];
    const matched = matchAttributeValue(options, [audienceValue]);
    if (matched) {
      addSelection(audienceType._id, matched._id);
      appliedSummary.push(`Audience (${matched.label})`);
    }
  }

  if (draft.occasion) {
    suggestions.push({
      id: `note:occasion:${draft.occasion}`,
      kind: "note",
      label: `Occasion: ${draft.occasion}`,
      detail: "Not a catalog attribute — optional note for your description.",
    });
  }

  return {
    name: draft.name,
    description: draft.description,
    brandId,
    brand,
    categoryId,
    category,
    categoryPath,
    subcategory,
    productType,
    presentation: draft.presentation || "neutral",
    attributeSelections,
    suggestions,
    appliedSummary,
  };
}
