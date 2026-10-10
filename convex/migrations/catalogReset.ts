import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { listAttributes, listAttributeTypes, seedAttributeCatalog } from "../model/attributes";
import { listChildren, seedCategories } from "../model/categories";
import { upsertVariantCategory } from "../model/variantCategories";

/**
 * DEV-only catalog wipe + reseed.
 * Keeps users/vendors/auth; clears products, SKUs, catalog, and product-linked commerce.
 *
 *   npx convex run migrations/catalogReset:run
 *
 * Self-schedules until clears finish, then seeds categories, attributes, and Size/Colour recipes.
 */
const BATCH = 80;

/** Delete order: dependents first, then catalog. */
const CLEAR_ORDER = [
  "inventoryMovements",
  "productEmbeddings",
  "productImages",
  "productVariants",
  "cartItems",
  "carts",
  "orderItems",
  "shipments",
  "returns",
  "orders",
  "collections",
  "discounts",
  "shopLooks",
  "products",
  "variantCategories",
  "attributes",
  "attributeTypes",
  "brands",
  "categories",
] as const;

type ClearTable = (typeof CLEAR_ORDER)[number];

async function deleteBatch(ctx: MutationCtx, table: ClearTable): Promise<number> {
  const rows = await ctx.db.query(table).take(BATCH);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return rows.length;
}

/** Size + Colour SKU recipes scoped to Men/Women/Kids roots. */
async function seedDefaultVariantRecipes(
  ctx: MutationCtx,
  vendorId: Id<"vendors">,
): Promise<number> {
  const types = await listAttributeTypes(ctx, vendorId, { activeOnly: true });
  const sizeType = types.find((row) => row.slug === "size");
  const colourType = types.find((row) => row.slug === "colour" || row.slug === "color");
  if (!sizeType || !colourType) return 0;

  const roots = await listChildren(ctx, vendorId, undefined, { activeOnly: true });
  if (roots.length === 0) return 0;
  const rootIds = roots.map((row) => row._id);

  const sizeAttrs = await listAttributes(ctx, vendorId, {
    attributeTypeId: sizeType._id,
    activeOnly: true,
  });
  const colourAttrs = await listAttributes(ctx, vendorId, {
    attributeTypeId: colourType._id,
    activeOnly: true,
  });
  if (sizeAttrs.length === 0 || colourAttrs.length === 0) return 0;

  await upsertVariantCategory(ctx, vendorId, {
    title: "Size",
    attributeTypeId: sizeType._id,
    categoryIds: rootIds,
    attributeIds: sizeAttrs.map((row) => row._id),
  });
  await upsertVariantCategory(ctx, vendorId, {
    title: "Colour",
    attributeTypeId: colourType._id,
    categoryIds: rootIds,
    attributeIds: colourAttrs.map((row) => row._id),
  });
  return 2;
}

export const run = internalMutation({
  args: {
    tableIndex: v.optional(v.number()),
  },
  returns: v.object({
    status: v.string(),
    table: v.optional(v.string()),
    deleted: v.optional(v.number()),
    vendorsSeeded: v.optional(v.number()),
  }),
  handler: async (ctx, { tableIndex = 0 }) => {
    if (tableIndex < CLEAR_ORDER.length) {
      const table = CLEAR_ORDER[tableIndex]!;
      const deleted = await deleteBatch(ctx, table);
      if (deleted > 0) {
        await ctx.scheduler.runAfter(0, internal.migrations.catalogReset.run, { tableIndex });
        return { status: "clearing", table, deleted };
      }
      await ctx.scheduler.runAfter(0, internal.migrations.catalogReset.run, {
        tableIndex: tableIndex + 1,
      });
      return { status: "clearing", table, deleted: 0 };
    }

    const vendors = await ctx.db.query("vendors").take(200);
    let vendorsSeeded = 0;
    for (const vendor of vendors) {
      await ctx.db.patch(vendor._id, { productCount: 0, updatedAt: Date.now() });
      await seedCategories(ctx, vendor._id);
      await seedAttributeCatalog(ctx, vendor._id);
      await seedDefaultVariantRecipes(ctx, vendor._id);
      vendorsSeeded += 1;
    }
    return { status: "seeded", vendorsSeeded };
  },
});
