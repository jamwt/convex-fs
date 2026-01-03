/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as background from "../background.js";
import type * as config from "../config.js";
import type * as crons from "../crons.js";
import type * as lib from "../lib.js";
import type * as ops_basics from "../ops/basics.js";
import type * as ops_helpers from "../ops/helpers.js";
import type * as ops_transact from "../ops/transact.js";
import type * as ops_types from "../ops/types.js";
import type * as transfer from "../transfer.js";
import type * as types from "../types.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  background: typeof background;
  config: typeof config;
  crons: typeof crons;
  lib: typeof lib;
  "ops/basics": typeof ops_basics;
  "ops/helpers": typeof ops_helpers;
  "ops/transact": typeof ops_transact;
  "ops/types": typeof ops_types;
  transfer: typeof transfer;
  types: typeof types;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
