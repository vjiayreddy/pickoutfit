import { registerRoutes } from "@convex-dev/stripe";
import { httpRouter } from "convex/server";
import { components, internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  events: {
    "customer.subscription.created": async (ctx, event) => {
      await reconcileAuthId(ctx, event.data.object.metadata?.userId);
    },
    "customer.subscription.updated": async (ctx, event) => {
      await reconcileAuthId(ctx, event.data.object.metadata?.userId);
    },
    "customer.subscription.deleted": async (ctx, event) => {
      await reconcileAuthId(ctx, event.data.object.metadata?.userId);
    },
    "checkout.session.completed": async (ctx, event) => {
      const session = event.data.object;
      const authId =
        session.metadata?.userId ??
        ("client_reference_id" in session
          ? (session.client_reference_id as string | null)
          : null);
      await reconcileAuthId(ctx, authId);
    },
  },
});

async function reconcileAuthId(
  ctx: {
    runMutation: (
      ref: typeof internal.billing.reconcileByAuthId,
      args: { authId: string },
    ) => Promise<null>;
  },
  authId: string | null | undefined,
) {
  if (!authId) return;
  await ctx.runMutation(internal.billing.reconcileByAuthId, { authId });
}

export default http;
