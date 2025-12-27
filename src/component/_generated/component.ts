/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    lib: {
      commitFiles: FunctionReference<
        "action",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
          files: Array<{ basis?: string; blobId: string; path: string }>;
        },
        null,
        Name
      >;
      getDownloadUrl: FunctionReference<
        "action",
        "internal",
        {
          blobId: string;
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
        },
        string,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          prefix?: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            blobId: string;
            contentType: string;
            path: string;
            size: number;
          }>;
        },
        Name
      >;
      prepareUpload: FunctionReference<
        "action",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
        },
        { blobId: string; url: string },
        Name
      >;
      stat: FunctionReference<
        "query",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
          path: string;
        },
        null | {
          blobId: string;
          contentType: string;
          path: string;
          size: number;
        },
        Name
      >;
      transact: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
          ops: Array<
            | {
                dest: { basis?: string; path: string };
                op: "move";
                source: {
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
            | {
                dest: { basis?: string; path: string };
                op: "copy";
                source: {
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
            | {
                op: "delete";
                source: {
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
          >;
        },
        null,
        Name
      >;
    };
    ops: {
      commitFiles: FunctionReference<
        "action",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
          files: Array<{ basis?: string; blobId: string; path: string }>;
        },
        null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          prefix?: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            blobId: string;
            contentType: string;
            path: string;
            size: number;
          }>;
        },
        Name
      >;
      stat: FunctionReference<
        "query",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
          path: string;
        },
        null | {
          blobId: string;
          contentType: string;
          path: string;
          size: number;
        },
        Name
      >;
      transact: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
          ops: Array<
            | {
                dest: { basis?: string; path: string };
                op: "move";
                source: {
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
            | {
                dest: { basis?: string; path: string };
                op: "copy";
                source: {
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
            | {
                op: "delete";
                source: {
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
          >;
        },
        null,
        Name
      >;
    };
    transfer: {
      getDownloadUrl: FunctionReference<
        "action",
        "internal",
        {
          blobId: string;
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
        },
        string,
        Name
      >;
      prepareUpload: FunctionReference<
        "action",
        "internal",
        {
          config: {
            accessKeyId: string;
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            endpoint: string;
            region?: string;
            secretAccessKey: string;
            uploadUrlTtl?: number;
          };
        },
        { blobId: string; url: string },
        Name
      >;
    };
  };
