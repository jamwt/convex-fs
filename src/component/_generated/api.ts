/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as blobstore_index from "../blobstore/index.js";
import type * as blobstore_s3 from "../blobstore/s3.js";
import type * as blobstore_types from "../blobstore/types.js";
import type * as lib from "../lib.js";
import type * as ops from "../ops.js";
import type * as transfer from "../transfer.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  "blobstore/index": typeof blobstore_index;
  "blobstore/s3": typeof blobstore_s3;
  "blobstore/types": typeof blobstore_types;
  lib: typeof lib;
  ops: typeof ops;
  transfer: typeof transfer;
  validators: typeof validators;
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
