/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as avatars from "../avatars.js";
import type * as credits from "../credits.js";
import type * as http from "../http.js";
import type * as items from "../items.js";
import type * as jobs from "../jobs.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_errors from "../lib/errors.js";
import type * as model_avatars from "../model/avatars.js";
import type * as model_credits from "../model/credits.js";
import type * as model_items from "../model/items.js";
import type * as model_jobs from "../model/jobs.js";
import type * as model_outfits from "../model/outfits.js";
import type * as model_renders from "../model/renders.js";
import type * as model_stats from "../model/stats.js";
import type * as model_threads from "../model/threads.js";
import type * as model_uploads from "../model/uploads.js";
import type * as model_users from "../model/users.js";
import type * as outfits from "../outfits.js";
import type * as renders from "../renders.js";
import type * as shared_credits from "../shared/credits.js";
import type * as shared_jobs from "../shared/jobs.js";
import type * as shared_validators from "../shared/validators.js";
import type * as shared_wardrobe from "../shared/wardrobe.js";
import type * as threads from "../threads.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";
import type * as views from "../views.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  avatars: typeof avatars;
  credits: typeof credits;
  http: typeof http;
  items: typeof items;
  jobs: typeof jobs;
  "lib/auth": typeof lib_auth;
  "lib/env": typeof lib_env;
  "lib/errors": typeof lib_errors;
  "model/avatars": typeof model_avatars;
  "model/credits": typeof model_credits;
  "model/items": typeof model_items;
  "model/jobs": typeof model_jobs;
  "model/outfits": typeof model_outfits;
  "model/renders": typeof model_renders;
  "model/stats": typeof model_stats;
  "model/threads": typeof model_threads;
  "model/uploads": typeof model_uploads;
  "model/users": typeof model_users;
  outfits: typeof outfits;
  renders: typeof renders;
  "shared/credits": typeof shared_credits;
  "shared/jobs": typeof shared_jobs;
  "shared/validators": typeof shared_validators;
  "shared/wardrobe": typeof shared_wardrobe;
  threads: typeof threads;
  uploads: typeof uploads;
  users: typeof users;
  views: typeof views;
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
};
