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
import type * as credits from "../credits.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_errors from "../lib/errors.js";
import type * as model_credits from "../model/credits.js";
import type * as model_jobs from "../model/jobs.js";
import type * as model_stats from "../model/stats.js";
import type * as shared_credits from "../shared/credits.js";
import type * as shared_jobs from "../shared/jobs.js";
import type * as shared_validators from "../shared/validators.js";
import type * as shared_wardrobe from "../shared/wardrobe.js";
import type * as users from "../users.js";
import type * as views from "../views.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  credits: typeof credits;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/env": typeof lib_env;
  "lib/errors": typeof lib_errors;
  "model/credits": typeof model_credits;
  "model/jobs": typeof model_jobs;
  "model/stats": typeof model_stats;
  "shared/credits": typeof shared_credits;
  "shared/jobs": typeof shared_jobs;
  "shared/validators": typeof shared_validators;
  "shared/wardrobe": typeof shared_wardrobe;
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
