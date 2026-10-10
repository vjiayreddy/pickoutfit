/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminVendors from "../adminVendors.js";
import type * as agent from "../agent.js";
import type * as agentShop from "../agentShop.js";
import type * as ai_colours from "../ai/colours.js";
import type * as ai_gridCutout from "../ai/gridCutout.js";
import type * as ai_image_input from "../ai/image_input.js";
import type * as ai_openai from "../ai/openai.js";
import type * as ai_pipeline from "../ai/pipeline.js";
import type * as ai_productDraft from "../ai/productDraft.js";
import type * as ai_productEmbed from "../ai/productEmbed.js";
import type * as ai_prompts from "../ai/prompts.js";
import type * as ai_shop from "../ai/shop.js";
import type * as ai_vendorCutout from "../ai/vendorCutout.js";
import type * as ai_vendorPipeline from "../ai/vendorPipeline.js";
import type * as attributes from "../attributes.js";
import type * as auth from "../auth.js";
import type * as avatars from "../avatars.js";
import type * as billing from "../billing.js";
import type * as brands from "../brands.js";
import type * as cart from "../cart.js";
import type * as categories from "../categories.js";
import type * as credits from "../credits.js";
import type * as crons from "../crons.js";
import type * as demoWardrobe from "../demoWardrobe.js";
import type * as discountsExpire from "../discountsExpire.js";
import type * as gridDemo from "../gridDemo.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as jobs from "../jobs.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_errors from "../lib/errors.js";
import type * as migrations_brandsBackfill from "../migrations/brandsBackfill.js";
import type * as migrations_catalogReset from "../migrations/catalogReset.js";
import type * as migrations_orderItemsBackfill from "../migrations/orderItemsBackfill.js";
import type * as migrations_productAttributesBackfill from "../migrations/productAttributesBackfill.js";
import type * as migrations_vendorsBackfill from "../migrations/vendorsBackfill.js";
import type * as model_admin from "../model/admin.js";
import type * as model_attributes from "../model/attributes.js";
import type * as model_avatars from "../model/avatars.js";
import type * as model_brands from "../model/brands.js";
import type * as model_catalog from "../model/catalog.js";
import type * as model_categories from "../model/categories.js";
import type * as model_credits from "../model/credits.js";
import type * as model_demo_wardrobe from "../model/demo_wardrobe.js";
import type * as model_items from "../model/items.js";
import type * as model_jobs from "../model/jobs.js";
import type * as model_looks from "../model/looks.js";
import type * as model_offers from "../model/offers.js";
import type * as model_orders from "../model/orders.js";
import type * as model_outfits from "../model/outfits.js";
import type * as model_productEmbeddings from "../model/productEmbeddings.js";
import type * as model_products from "../model/products.js";
import type * as model_profiles from "../model/profiles.js";
import type * as model_renders from "../model/renders.js";
import type * as model_shop from "../model/shop.js";
import type * as model_shopLooks from "../model/shopLooks.js";
import type * as model_stats from "../model/stats.js";
import type * as model_subscriptions from "../model/subscriptions.js";
import type * as model_threads from "../model/threads.js";
import type * as model_uploads from "../model/uploads.js";
import type * as model_users from "../model/users.js";
import type * as model_variantCategories from "../model/variantCategories.js";
import type * as model_variants from "../model/variants.js";
import type * as model_vendorIngest from "../model/vendorIngest.js";
import type * as model_vendors from "../model/vendors.js";
import type * as orders from "../orders.js";
import type * as outfits from "../outfits.js";
import type * as productEmbeddings from "../productEmbeddings.js";
import type * as products from "../products.js";
import type * as renders from "../renders.js";
import type * as services from "../services.js";
import type * as shared_attributes from "../shared/attributes.js";
import type * as shared_brands from "../shared/brands.js";
import type * as shared_categories from "../shared/categories.js";
import type * as shared_credits from "../shared/credits.js";
import type * as shared_demo_wardrobe from "../shared/demo_wardrobe.js";
import type * as shared_grooming from "../shared/grooming.js";
import type * as shared_jobs from "../shared/jobs.js";
import type * as shared_productFilters from "../shared/productFilters.js";
import type * as shared_productPhotoFill from "../shared/productPhotoFill.js";
import type * as shared_products from "../shared/products.js";
import type * as shared_services from "../shared/services.js";
import type * as shared_shop from "../shared/shop.js";
import type * as shared_validators from "../shared/validators.js";
import type * as shared_variants from "../shared/variants.js";
import type * as shared_vendors from "../shared/vendors.js";
import type * as shared_wardrobe from "../shared/wardrobe.js";
import type * as shared_wardrobeMatch from "../shared/wardrobeMatch.js";
import type * as shop from "../shop.js";
import type * as threads from "../threads.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";
import type * as variants from "../variants.js";
import type * as vendorCarts from "../vendorCarts.js";
import type * as vendorCollections from "../vendorCollections.js";
import type * as vendorDiscounts from "../vendorDiscounts.js";
import type * as vendorOrders from "../vendorOrders.js";
import type * as vendorProducts from "../vendorProducts.js";
import type * as vendorUploads from "../vendorUploads.js";
import type * as vendors from "../vendors.js";
import type * as views from "../views.js";
import type * as workflows_groom from "../workflows/groom.js";
import type * as workflows_ingest from "../workflows/ingest.js";
import type * as workflows_manager from "../workflows/manager.js";
import type * as workflows_render from "../workflows/render.js";
import type * as workflows_vendorIngest from "../workflows/vendorIngest.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminVendors: typeof adminVendors;
  agent: typeof agent;
  agentShop: typeof agentShop;
  "ai/colours": typeof ai_colours;
  "ai/gridCutout": typeof ai_gridCutout;
  "ai/image_input": typeof ai_image_input;
  "ai/openai": typeof ai_openai;
  "ai/pipeline": typeof ai_pipeline;
  "ai/productDraft": typeof ai_productDraft;
  "ai/productEmbed": typeof ai_productEmbed;
  "ai/prompts": typeof ai_prompts;
  "ai/shop": typeof ai_shop;
  "ai/vendorCutout": typeof ai_vendorCutout;
  "ai/vendorPipeline": typeof ai_vendorPipeline;
  attributes: typeof attributes;
  auth: typeof auth;
  avatars: typeof avatars;
  billing: typeof billing;
  brands: typeof brands;
  cart: typeof cart;
  categories: typeof categories;
  credits: typeof credits;
  crons: typeof crons;
  demoWardrobe: typeof demoWardrobe;
  discountsExpire: typeof discountsExpire;
  gridDemo: typeof gridDemo;
  http: typeof http;
  items: typeof items;
  jobs: typeof jobs;
  "lib/auth": typeof lib_auth;
  "lib/env": typeof lib_env;
  "lib/errors": typeof lib_errors;
  "migrations/brandsBackfill": typeof migrations_brandsBackfill;
  "migrations/catalogReset": typeof migrations_catalogReset;
  "migrations/orderItemsBackfill": typeof migrations_orderItemsBackfill;
  "migrations/productAttributesBackfill": typeof migrations_productAttributesBackfill;
  "migrations/vendorsBackfill": typeof migrations_vendorsBackfill;
  "model/admin": typeof model_admin;
  "model/attributes": typeof model_attributes;
  "model/avatars": typeof model_avatars;
  "model/brands": typeof model_brands;
  "model/catalog": typeof model_catalog;
  "model/categories": typeof model_categories;
  "model/credits": typeof model_credits;
  "model/demo_wardrobe": typeof model_demo_wardrobe;
  "model/items": typeof model_items;
  "model/jobs": typeof model_jobs;
  "model/looks": typeof model_looks;
  "model/offers": typeof model_offers;
  "model/orders": typeof model_orders;
  "model/outfits": typeof model_outfits;
  "model/productEmbeddings": typeof model_productEmbeddings;
  "model/products": typeof model_products;
  "model/profiles": typeof model_profiles;
  "model/renders": typeof model_renders;
  "model/shop": typeof model_shop;
  "model/shopLooks": typeof model_shopLooks;
  "model/stats": typeof model_stats;
  "model/subscriptions": typeof model_subscriptions;
  "model/threads": typeof model_threads;
  "model/uploads": typeof model_uploads;
  "model/users": typeof model_users;
  "model/variantCategories": typeof model_variantCategories;
  "model/variants": typeof model_variants;
  "model/vendorIngest": typeof model_vendorIngest;
  "model/vendors": typeof model_vendors;
  orders: typeof orders;
  outfits: typeof outfits;
  productEmbeddings: typeof productEmbeddings;
  products: typeof products;
  renders: typeof renders;
  services: typeof services;
  "shared/attributes": typeof shared_attributes;
  "shared/brands": typeof shared_brands;
  "shared/categories": typeof shared_categories;
  "shared/credits": typeof shared_credits;
  "shared/demo_wardrobe": typeof shared_demo_wardrobe;
  "shared/grooming": typeof shared_grooming;
  "shared/jobs": typeof shared_jobs;
  "shared/productFilters": typeof shared_productFilters;
  "shared/productPhotoFill": typeof shared_productPhotoFill;
  "shared/products": typeof shared_products;
  "shared/services": typeof shared_services;
  "shared/shop": typeof shared_shop;
  "shared/validators": typeof shared_validators;
  "shared/variants": typeof shared_variants;
  "shared/vendors": typeof shared_vendors;
  "shared/wardrobe": typeof shared_wardrobe;
  "shared/wardrobeMatch": typeof shared_wardrobeMatch;
  shop: typeof shop;
  threads: typeof threads;
  uploads: typeof uploads;
  users: typeof users;
  variants: typeof variants;
  vendorCarts: typeof vendorCarts;
  vendorCollections: typeof vendorCollections;
  vendorDiscounts: typeof vendorDiscounts;
  vendorOrders: typeof vendorOrders;
  vendorProducts: typeof vendorProducts;
  vendorUploads: typeof vendorUploads;
  vendors: typeof vendors;
  views: typeof views;
  "workflows/groom": typeof workflows_groom;
  "workflows/ingest": typeof workflows_ingest;
  "workflows/manager": typeof workflows_manager;
  "workflows/render": typeof workflows_render;
  "workflows/vendorIngest": typeof workflows_vendorIngest;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  stripe: import("@convex-dev/stripe/_generated/component.js").ComponentApi<"stripe">;
};
