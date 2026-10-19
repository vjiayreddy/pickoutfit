import type { FunctionReturnType } from "convex/server";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { SLOTS } from "../../convex/shared/wardrobe";
import { api, convex, serviceArgs, type Id } from "../lib/convex";
import { resolveThreadId } from "../lib/threads";

type Output = {
  threadId: Id<"threads">;
  saved: number;
  results: FunctionReturnType<typeof api.agent.composeShopLooks>;
};

const productId = z
  .string()
  .trim()
  .describe("An exact product id returned by search_shop; never a garment name.");

export default defineTool({
  description:
    "Create one to three shop looks from AI-recommended vendor products so they appear as priced cards. " +
    "Every productId must come from search_shop. Separate from wardrobe compose_outfits. " +
    "Each look shows per-item and total cost; the user can add the look to their cart.",
  inputSchema: z.object({
    brief: z.string().min(1).describe("The request in one line."),
    looks: z
      .array(
        z.object({
          name: z.string().min(1).describe("Short and memorable, e.g. 'Navy market edit'."),
          reasoning: z.string().min(1).describe("One or two sentences on colour and layering."),
          occasion: z.string().nullable().optional(),
          lines: z
            .array(
              z.object({
                slot: z.enum(SLOTS),
                productId,
              }),
            )
            .min(1)
            .max(8),
        }),
      )
      .min(1)
      .max(3),
  }),
  label: {
    start: ({ looks }) => `Building ${looks.length} shop ${looks.length === 1 ? "look" : "looks"}`,
    complete: (_input, output: Output) =>
      output.saved === output.results.length
        ? `Proposed ${output.saved} shop ${output.saved === 1 ? "look" : "looks"}`
        : `Proposed ${output.saved} of ${output.results.length} shop looks`,
  },
  async execute({ brief, looks }, ctx): Promise<Output> {
    const threadId = await resolveThreadId(ctx);
    const results = await convex().mutation(api.agent.composeShopLooks, {
      ...serviceArgs(ctx),
      threadId,
      brief,
      looks: looks.map((look) => ({
        name: look.name,
        reasoning: look.reasoning,
        occasion: look.occasion?.trim() || undefined,
        lines: look.lines.map((line) => ({
          slot: line.slot,
          productId: line.productId as Id<"products">,
        })),
      })),
    });
    return {
      threadId,
      saved: results.filter((result) => result.shopLookId !== null).length,
      results,
    };
  },
});
