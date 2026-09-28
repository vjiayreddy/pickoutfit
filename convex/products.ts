import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { listCatalog } from "./model/products";
import { vProductCategory, vProductView } from "./shared/products";

/** Active catalog rows for the signed-in user's presentation. */
export const listForCategory = query({
  args: { category: vProductCategory },
  returns: v.array(vProductView),
  handler: async (ctx, { category }) => {
    const user = await requireUser(ctx);
    return listCatalog(ctx, category, user.prefs.presentation);
  },
});
