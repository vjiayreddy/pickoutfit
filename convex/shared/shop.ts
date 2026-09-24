import { v, type Infer } from "convex/values";
import { literals } from "./validators";
import type { Presentation } from "./wardrobe";

export const SHOP_STORES = ["amazon", "flipkart", "myntra"] as const;
export type ShopStore = (typeof SHOP_STORES)[number];

export const SHOP_CHECK_CAP = 10;

/** Missing means shown, so existing accounts keep the button until they hide it. */
export function shopSimilarVisible(prefs: { shopSimilar?: boolean }): boolean {
  return prefs.shopSimilar !== false;
}
export const AMAZON_PARTNER_TAG = "wardrobeai-21";

const STORE_ORDER: Record<ShopStore, number> = {
  amazon: 0,
  flipkart: 1,
  myntra: 2,
};

const SKIP_WORDS = new Set([
  "solid",
  "plain",
  "none",
  "n/a",
  "na",
  "unknown",
  "unspecified",
]);

export const vShopStore = literals(SHOP_STORES);

export const vShopOffer = v.object({
  store: vShopStore,
  title: v.string(),
  priceInr: v.optional(v.number()),
  url: v.string(),
  imageUrl: v.optional(v.string()),
});
export type ShopOffer = Infer<typeof vShopOffer>;

export const vShopLink = v.object({
  store: vShopStore,
  url: v.string(),
});
export type ShopLink = Infer<typeof vShopLink>;

export const vShopLookupView = v.object({
  mode: v.union(v.literal("offers"), v.literal("links")),
  query: v.string(),
  offers: v.array(vShopOffer),
  links: v.array(vShopLink),
});
export type ShopLookupView = Infer<typeof vShopLookupView>;

type QuerySource = {
  brand?: string;
  colours: { primary: string };
  pattern: string;
  material: string;
  subcategory: string;
};

/** Words already stored on the item. No model call. */
export function shopQuery(item: QuerySource, presentation: Presentation): string {
  const audience =
    presentation === "masculine" ? "men" : presentation === "feminine" ? "women" : "";
  const parts = [item.brand, item.colours.primary, item.pattern, item.material, item.subcategory, audience]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0 && !SKIP_WORDS.has(part.toLowerCase()));
  const query = parts.join(" ").replace(/\s+/g, " ").trim();
  return (query.length > 0 ? query : "clothing").slice(0, 160);
}

export function storeLinks(query: string): ShopLink[] {
  const q = query.trim() || "clothing";
  const amazon = new URL("https://www.amazon.in/s");
  amazon.searchParams.set("k", q);
  amazon.searchParams.set("tag", AMAZON_PARTNER_TAG);
  const flipkart = new URL("https://www.flipkart.com/search");
  flipkart.searchParams.set("q", q);
  const slug = q
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return [
    { store: "amazon", url: amazon.toString() },
    { store: "flipkart", url: flipkart.toString() },
    { store: "myntra", url: `https://www.myntra.com/${slug || "clothing"}` },
  ];
}

export function withAmazonTag(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (storeFromHost(parsed.hostname) !== "amazon") return url;
  if (!parsed.searchParams.get("tag")) parsed.searchParams.set("tag", AMAZON_PARTNER_TAG);
  return parsed.toString();
}

/** Keeps at most one real product page per store. Drops anything off Amazon.in, Flipkart, or Myntra. */
export function normalizeOffers(value: unknown): ShopOffer[] {
  if (!value || typeof value !== "object") return [];
  const rows = (value as { offers?: unknown }).offers;
  if (!Array.isArray(rows)) return [];
  const seen = new Set<ShopStore>();
  const offers: ShopOffer[] = [];
  for (const row of rows) {
    const offer = normalizeOffer(row);
    if (!offer || seen.has(offer.store)) continue;
    seen.add(offer.store);
    offers.push(offer);
  }
  offers.sort((a, b) => STORE_ORDER[a.store] - STORE_ORDER[b.store]);
  return offers;
}

export function lookupView(
  mode: "offers" | "links",
  query: string,
  offers: ShopOffer[],
): ShopLookupView {
  return { mode, query, offers, links: storeLinks(query) };
}

function normalizeOffer(row: unknown): ShopOffer | null {
  if (!row || typeof row !== "object") return null;
  const record = row as Record<string, unknown>;
  if (typeof record.url !== "string" || typeof record.title !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(record.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const store = storeFromHost(parsed.hostname);
  if (!store || !isProductPath(store, parsed.pathname)) return null;
  const title = record.title.trim().slice(0, 200);
  if (title.length === 0) return null;
  const offer: ShopOffer = {
    store,
    title,
    url: store === "amazon" ? withAmazonTag(parsed.toString()) : parsed.toString(),
  };
  if (typeof record.priceInr === "number" && Number.isFinite(record.priceInr) && record.priceInr > 0 && record.priceInr < 10_000_000) {
    offer.priceInr = Math.round(record.priceInr);
  }
  if (typeof record.imageUrl === "string") {
    try {
      const image = new URL(record.imageUrl);
      if (image.protocol === "https:") offer.imageUrl = image.toString();
    } catch {
      // A missing picture still leaves a buy link.
    }
  }
  return offer;
}

function storeFromHost(hostname: string): ShopStore | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  if (host === "amazon.in" || host.endsWith(".amazon.in")) return "amazon";
  if (host === "flipkart.com" || host.endsWith(".flipkart.com")) return "flipkart";
  if (host === "myntra.com" || host.endsWith(".myntra.com")) return "myntra";
  return null;
}

function isProductPath(store: ShopStore, pathname: string): boolean {
  const path = pathname.toLowerCase();
  if (store === "amazon") return path.includes("/dp/") || path.includes("/gp/product/");
  if (store === "flipkart") return path.includes("/p/");
  return path.length > 1 && !path.startsWith("/search");
}
