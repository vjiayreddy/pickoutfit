import type { FunctionReturnType } from "convex/server";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { api, convex, serviceArgs } from "../lib/convex";

type Output = {
  count: number;
  products: FunctionReturnType<typeof api.agentShop.searchShop>;
  note?: string;
};

export default defineTool({
  description:
    "Search the marketplace for AI-recommended vendor products that match a brief. " +
    "Only returns products vendors opted into Recommend by AI, that are live, and whose stores are sellable. " +
    "Call this before compose_shop_looks. Never invent product ids.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Style brief to embed, e.g. 'smart casual navy linen shirt warm evening'."),
    limit: z.number().int().min(1).max(24).optional().describe("How many products to return (default 16)."),
    maxPriceInr: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Drop products priced above this rupee amount."),
  }),
  label: {
    start: ({ query }) => `Searching shop (${query.slice(0, 40)}${query.length > 40 ? "…" : ""})`,
    complete: (_input, output: Output) =>
      `Found ${output.count} shop ${output.count === 1 ? "product" : "products"}`,
  },
  async execute({ query, limit, maxPriceInr }, ctx): Promise<Output> {
    const products = await convex().action(api.agentShop.searchShop, {
      ...serviceArgs(ctx),
      query,
      limit,
      maxPriceInr,
    });
    return {
      count: products.length,
      products,
      note:
        products.length === 0
          ? "No AI-recommended shop products matched. Say so and fall back to the wardrobe, or widen the brief."
          : undefined,
    };
  },
});
