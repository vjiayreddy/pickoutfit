import { v } from "convex/values";

/** Soft cap per store so one vendor cannot blow the table. */
export const MAX_BRANDS_PER_VENDOR = 500;

export const vBrandDoc = v.object({
  _id: v.id("brands"),
  _creationTime: v.number(),
  vendorId: v.id("vendors"),
  name: v.string(),
  slug: v.string(),
  logoStorageId: v.optional(v.id("_storage")),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** List row for vendor management / product picker. */
export const vBrandListRow = vBrandDoc.extend({
  logoUrl: v.union(v.string(), v.null()),
  productCount: v.number(),
});

/** Lowercase slug so "Nike" and "nike" share one brand row. */
export function brandSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
