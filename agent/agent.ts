import { defineAgent } from "eve";

/**
 * The WardrobeAI stylist. Routed through the Vercel AI Gateway, so the runtime needs
 * `AI_GATEWAY_API_KEY` (or a linked Vercel project supplying `VERCEL_OIDC_TOKEN`).
 *
 * Tools are registered by file under `agent/tools/`: `get_context`, `get_wardrobe`, `gap_analysis`,
 * `get_weather`, `compose_outfits`, `quote_renders`, `start_renders` and `save_outfit`. Sandbox,
 * shell and file tools are disabled; only the question and skill tools are explicitly added back.
 *
 * Model: free-tier Gateway chat model with tool-use
 * (https://vercel.com/ai-gateway/models?freeTier=true). Switch back to
 * `openai/gpt-5.4-mini` once AI Gateway paid credits are topped up.
 */
export default defineAgent({
  defaultTools: false,
  model: "inclusionai/ling-3.0-flash-fin",
  reasoning: "low",
});
