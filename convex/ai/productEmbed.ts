"use node";

import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { optionalEnv, requireEnv } from "../lib/env";
import { appError } from "../lib/errors";
import { EMBEDDING_DIMENSIONS } from "../schema";

const EMBED_MODEL = "text-embedding-3-small";

let cached: OpenAI | null = null;

function openai(): OpenAI {
  if (!cached) {
    const directKey = optionalEnv("OPENAI_API_KEY");
    cached = new OpenAI(
      directKey
        ? { apiKey: directKey }
        : {
            apiKey: requireEnv("AI_GATEWAY_API_KEY"),
            baseURL: "https://ai-gateway.vercel.sh/v1",
          },
    );
  }
  return cached;
}

function modelId(model: string): string {
  return optionalEnv("OPENAI_API_KEY") ? model : `openai/${model}`;
}

async function embedText(input: string): Promise<number[]> {
  const response = await openai().embeddings.create({
    model: modelId(EMBED_MODEL),
    input,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  const vector = response.data[0]?.embedding;
  if (!vector) throw appError("UPSTREAM_FAILED", "Could not embed this product.");
  return vector;
}

/** Builds or refreshes the style embedding for one AI-recommended product. */
export const embedProduct = internalAction({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, { productId }) => {
    const product = await ctx.runQuery(internal.productEmbeddings.productForEmbed, {
      productId,
    });
    if (!product) return null;
    const embedding = await embedText(product.searchText);
    await ctx.runMutation(internal.productEmbeddings.saveEmbedding, {
      productId,
      embedding,
    });
    return null;
  },
});

/** Embeds an arbitrary query string for shop vector search (agent). */
export const embedQuery = internalAction({
  args: { text: v.string() },
  returns: v.array(v.float64()),
  handler: async (_ctx, { text }) => {
    const trimmed = text.trim().slice(0, 1000);
    if (!trimmed) throw appError("INVALID_INPUT", "A search brief is required.");
    return embedText(trimmed);
  },
});
