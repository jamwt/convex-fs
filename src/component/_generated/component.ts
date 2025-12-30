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
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          files: Array<{ basis?: null | string; blobId: string; path: string }>;
        },
        null,
        Name
      >;
      copyByPath: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          destPath: string;
          sourcePath: string;
        },
        null,
        Name
      >;
      deleteByPath: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          path: string;
        },
        null,
        Name
      >;
      getBlob: FunctionReference<
        "action",
        "internal",
        {
          blobId: string;
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
        },
        null | ArrayBuffer,
        Name
      >;
      getDownloadUrl: FunctionReference<
        "action",
        "internal",
        {
          blobId: string;
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
        },
        string,
        Name
      >;
      getFile: FunctionReference<
        "action",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          path: string;
        },
        null | { contentType: string; data: ArrayBuffer; size: number },
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
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
      moveByPath: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          destPath: string;
          sourcePath: string;
        },
        null,
        Name
      >;
      stat: FunctionReference<
        "query",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
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
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          ops: Array<
            | {
                dest: { basis?: null | string; path: string };
                op: "move";
                source: {
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
            | {
                dest: { basis?: null | string; path: string };
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
      uploadBlob: FunctionReference<
        "action",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          contentType: string;
          data: ArrayBuffer;
        },
        { blobId: string },
        Name
      >;
    };
    ops: {
      commitFiles: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          files: Array<{ basis?: null | string; blobId: string; path: string }>;
        },
        null,
        Name
      >;
      copyByPath: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          destPath: string;
          sourcePath: string;
        },
        null,
        Name
      >;
      deleteByPath: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          path: string;
        },
        null,
        Name
      >;
      getBlob: FunctionReference<
        "action",
        "internal",
        {
          blobId: string;
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
        },
        null | ArrayBuffer,
        Name
      >;
      getFile: FunctionReference<
        "action",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          path: string;
        },
        null | { contentType: string; data: ArrayBuffer; size: number },
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
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
      moveByPath: FunctionReference<
        "mutation",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          destPath: string;
          sourcePath: string;
        },
        null,
        Name
      >;
      stat: FunctionReference<
        "query",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
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
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          ops: Array<
            | {
                dest: { basis?: null | string; path: string };
                op: "move";
                source: {
                  blobId: string;
                  contentType: string;
                  path: string;
                  size: number;
                };
              }
            | {
                dest: { basis?: null | string; path: string };
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
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
        },
        string,
        Name
      >;
      uploadBlob: FunctionReference<
        "action",
        "internal",
        {
          config: {
            blobGracePeriod?: number;
            downloadUrlTtl?: number;
            storage:
              | {
                  apiKey: string;
                  cdnHostname: string;
                  region?: string;
                  storageZoneName: string;
                  tokenKey?: string;
                  type: "bunny";
                }
              | { type: "test" };
          };
          contentType: string;
          data: ArrayBuffer;
        },
        { blobId: string },
        Name
      >;
    };
  };
