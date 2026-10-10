export const PRODUCT_STATUS_FILTERS = ["all", "active", "draft", "archived"] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number];

/** Query keys that are not facet type params. */
export const RESERVED_PRODUCT_QUERY_KEYS = new Set(["status", "q"]);

/** Convex opaque ids are long alphanumeric; category slugs are short / hyphenated. */
export function isConvexDocumentId(segment: string): boolean {
  return /^[a-z0-9]{20,}$/.test(segment);
}

/** URL query key for a facet type slug (`colour` → `colors`). */
export function facetParamKey(typeSlug: string): string {
  const normalized = typeSlug.trim().toLowerCase();
  if (normalized === "colour" || normalized === "color") return "colors";
  return normalized;
}

/** Reverse of facetParamKey for known aliases. */
export function typeSlugFromParamKey(paramKey: string): string {
  const normalized = paramKey.trim().toLowerCase();
  if (normalized === "colors" || normalized === "color") return "colour";
  return normalized;
}

export type FacetValueRef = {
  _id: string;
  label: string;
  value: string;
  slug: string;
};

export type FacetTypeRef = {
  _id: string;
  slug: string;
  values: FacetValueRef[];
};

/** Token written to the URL for a facet value (prefer short readable label). */
export function facetValueToken(value: FacetValueRef): string {
  const label = value.label.trim();
  if (label && /^[A-Za-z0-9._-]+$/.test(label)) return label;
  if (value.slug) return value.slug;
  return value.value;
}

function tokenMatches(value: FacetValueRef, token: string): boolean {
  const t = token.trim().toLowerCase();
  if (!t) return false;
  return (
    value.slug.toLowerCase() === t ||
    value.value.toLowerCase() === t ||
    value.label.trim().toLowerCase() === t
  );
}

/** Resolve URL facet tokens → attribute ids using loaded facets. */
export function attributeIdsFromFacetParams(
  facets: FacetTypeRef[],
  paramsByKey: Record<string, string[]>,
): string[] {
  const ids: string[] = [];
  for (const [paramKey, tokens] of Object.entries(paramsByKey)) {
    if (RESERVED_PRODUCT_QUERY_KEYS.has(paramKey)) continue;
    if (tokens.length === 0) continue;
    const typeSlug = typeSlugFromParamKey(paramKey);
    const type =
      facets.find((facet) => facet.slug === typeSlug) ??
      facets.find((facet) => facetParamKey(facet.slug) === paramKey.toLowerCase());
    if (!type) continue;
    for (const token of tokens) {
      const match = type.values.find((value) => tokenMatches(value, token));
      if (match) ids.push(match._id);
    }
  }
  return ids;
}

/** Build facet query map (param key → tokens) from selected attribute ids. */
export function facetParamsFromAttributeIds(
  facets: FacetTypeRef[],
  attributeIds: readonly string[],
): Record<string, string[]> {
  const selected = new Set(attributeIds);
  const out: Record<string, string[]> = {};
  for (const type of facets) {
    const tokens: string[] = [];
    for (const value of type.values) {
      if (selected.has(value._id)) tokens.push(facetValueToken(value));
    }
    if (tokens.length > 0) out[facetParamKey(type.slug)] = tokens;
  }
  return out;
}

export function parseFacetSearchParams(
  searchParams: URLSearchParams | ReadonlyURLSearchParams,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  searchParams.forEach((raw, key) => {
    if (RESERVED_PRODUCT_QUERY_KEYS.has(key)) return;
    // Browsers decode `+` in query values as space; accept both separators.
    const tokens = raw
      .split(/[+\s]+/)
      .map((part) => {
        try {
          return decodeURIComponent(part.trim());
        } catch {
          return part.trim();
        }
      })
      .filter(Boolean);
    if (tokens.length > 0) out[key] = tokens;
  });
  return out;
}

type ReadonlyURLSearchParams = {
  forEach: (cb: (value: string, key: string) => void) => void;
  get: (key: string) => string | null;
};

/** Build query string with literal `+` separators (not %2B). */
export function buildProductFilterQuery(opts: {
  status?: ProductStatusFilter | null;
  q?: string | null;
  facets?: Record<string, string[]> | null;
}): string {
  const parts: string[] = [];
  if (opts.status && opts.status !== "all") {
    parts.push(`status=${encodeURIComponent(opts.status)}`);
  }
  const q = opts.q?.trim();
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (opts.facets) {
    for (const [key, tokens] of Object.entries(opts.facets)) {
      if (tokens.length === 0) continue;
      const value = tokens
        .map((token) => encodeURIComponent(token).replace(/%20/g, "+"))
        .join("+");
      parts.push(`${encodeURIComponent(key)}=${value}`);
    }
  }
  return parts.join("&");
}

export function vendorProductsListHref(opts: {
  categoryPath?: string | null;
  status?: ProductStatusFilter | null;
  q?: string | null;
  facets?: Record<string, string[]> | null;
}): string {
  const path = opts.categoryPath?.replace(/^\/+|\/+$/g, "");
  const base = path ? `/vendor/products/${path}` : "/vendor/products";
  const query = buildProductFilterQuery(opts);
  return query ? `${base}?${query}` : base;
}

export function storeCatalogHref(
  storeSlug: string,
  opts: {
    categoryPath?: string | null;
    facets?: Record<string, string[]> | null;
  },
): string {
  const path = opts.categoryPath?.replace(/^\/+|\/+$/g, "");
  const base = path ? `/store/${storeSlug}/${path}` : `/store/${storeSlug}`;
  const query = buildProductFilterQuery({ facets: opts.facets });
  return query ? `${base}?${query}` : base;
}
