import { defineAgent } from "eve";

/**
 * The WardrobeAI stylist. Routed through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`).
 *
 * Free Gateway tier cannot call paid OpenAI ids like `openai/gpt-5.4-mini`. Use a
 * free + tool-use catalog model until the team tops up AI Gateway credits.
 *
 * Tools are registered by file under `agent/tools/`: `get_context`, `get_wardrobe`, `gap_analysis`,
 * `get_weather`, `search_shop`, `compose_outfits`, `compose_shop_looks`, `quote_renders`,
 * `start_renders` and `save_outfit`. Sandbox, shell and file tools are disabled; only the question
 * and skill tools are explicitly added back.
 */
export default defineAgent({
  defaultTools: false,
  model: "poolside/laguna-s-2.1-free",
  reasoning: "low",
});
