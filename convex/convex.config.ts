import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import stripe from "@convex-dev/stripe/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";

const app = defineApp();
app.use(betterAuth);
app.use(workflow);
app.use(stripe);

export default app;
