"use node";

import { v } from "convex/values";
import OpenAI from "openai";
import { internalAction } from "../_generated/server";
import { appError } from "../lib/errors";
import { optionalEnv, requireEnv } from "../lib/env";
import { normalizeOffers, vShopOffer, type ShopOffer } from "../shared/shop";

const SEARCH_MODEL = "gpt-5-mini";
const REQUEST_TIMEOUT_MS = 90_000;

const OFFER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    offers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          store: { type: "string", enum: ["amazon", "flipkart", "myntra"] },
          title: { type: "string" },
          priceInr: { type: ["number", "null"] },
          url: { type: "string" },
          imageUrl: { type: ["string", "null"] },
        },
        required: ["store", "title", "priceInr", "url", "imageUrl"],
      },
    },
  },
  required: ["offers"],
} as const;

let cached: OpenAI | null = null;

function openai(): OpenAI {
  if (!cached) {
    const directKey = optionalEnv("OPENAI_API_KEY");
    cached = new OpenAI({
      apiKey: directKey ?? requireEnv("AI_GATEWAY_API_KEY"),
      ...(directKey ? {} : { baseURL: "https://ai-gateway.vercel.sh/v1" }),
      maxRetries: 0,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }
  return cached;
}

function modelId(model: string): string {
  return optionalEnv("OPENAI_API_KEY") ? model : `openai/${model}`;
}

/**
 * One web search for similar products. The photo is not sent: the query is the item's
 * stored colour, type, pattern, and brand. Empty or unusable results become store links.
 */
export const search = internalAction({
  args: { query: v.string() },
  returns: v.array(vShopOffer),
  handler: async (_ctx, args): Promise<ShopOffer[]> => {
    try {
      const response = await openai().responses.create({
        model: modelId(SEARCH_MODEL),
        tools: [
          {
            type: "web_search",
            search_context_size: "low",
            filters: { allowed_domains: ["amazon.in", "flipkart.com", "myntra.com"] },
            user_location: { type: "approximate", country: "IN", timezone: "Asia/Kolkata" },
          },
        ],
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: [
                  "Search once for a similar garment sold in India.",
                  `Query: ${args.query}`,
                  "Return at most one product page each from Amazon.in, Flipkart, and Myntra.",
                  "priceInr is the numeric price in Indian rupees, or null if you cannot see one.",
                  "url must be the product page, not a search page. imageUrl is the product image, or null.",
                  "Omit a store when you cannot find a real product. Do not invent listings.",
                ].join(" "),
              },
            ],
          },
        ],
        text: {
          format: { type: "json_schema", name: "shop_offers", strict: true, schema: OFFER_SCHEMA },
        },
      });
      return normalizeOffers(parseJson(response.output_text));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Shop search failed.";
      throw appError("UPSTREAM_FAILED", message.slice(0, 240));
    }
  },
});

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}
