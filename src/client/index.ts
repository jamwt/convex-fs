/**
 * Client API for the ConvexFS file storage component.
 *
 * @example
 * ```typescript
 * // convex/fs.ts
 * import { ConvexFS } from "@convex/fs";
 * import { components } from "./_generated/api";
 *
 * export const fs = new ConvexFS(components.fs, {
 *   storage: {
 *     type: "bunny",
 *     apiKey: process.env.BUNNY_API_KEY!,
 *     storageZoneName: process.env.BUNNY_STORAGE_ZONE!,
 *     cdnHostname: process.env.BUNNY_CDN_HOSTNAME!,
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // convex/files.ts
 * import { action, query } from "./_generated/server";
 * import { fs } from "./fs";
 *
 * export const getFile = query({
 *   args: { path: v.string() },
 *   handler: async (ctx, args) => {
 *     return await fs.stat(ctx, args.path);
 *   },
 * });
 * ```
 */

import { httpActionGeneric } from "convex/server";
import type { PaginationOptions, PaginationResult } from "convex/server";
import { corsRouter } from "convex-helpers/server/cors";
import type { ComponentApi } from "../component/_generated/component.js";
import type {
  QueryCtx,
  MutationCtx,
  ActionCtx,
  RegisterRoutesConfig,
  ConvexFSOptions,
  HttpRouter,
} from "./types.js";
import type { FileMetadata } from "../component/validators.js";

// Re-export types for consumers
export type {
  Config,
  FileMetadata,
  Op,
  Dest,
} from "../component/validators.js";

export type {
  QueryCtx,
  MutationCtx,
  ActionCtx,
  RegisterRoutesConfig,
  ConvexFSOptions,
};

export type FSComponent = ComponentApi;

/**
 * ConvexFS client for interacting with the file storage component.
 *
 * Configuration requires a `storage` option specifying the Bunny.net backend:
 *
 * @example
 * ```typescript
 * const fs = new ConvexFS(components.fs, {
 *   storage: {
 *     type: "bunny",
 *     apiKey: process.env.BUNNY_API_KEY!,
 *     storageZoneName: process.env.BUNNY_STORAGE_ZONE!,
 *     cdnHostname: process.env.BUNNY_CDN_HOSTNAME!,
 *     tokenKey: process.env.BUNNY_TOKEN_KEY, // Optional, for signed URLs
 *   },
 * });
 * ```
 */
export class ConvexFS {
  constructor(
    public component: ComponentApi,
    private options: ConvexFSOptions,
  ) {}

  /**
   * Build config from options.
   * Used internally and by registerRoutes for the upload proxy.
   */
  get config() {
    return {
      storage: this.options.storage,
      downloadUrlTtl: this.options.downloadUrlTtl,
      blobGracePeriod: this.options.blobGracePeriod,
    };
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Commit uploaded blobs to file paths.
   *
   * This atomically creates/updates file records for previously uploaded blobs.
   *
   * @param files - Array of file commits with path, blobId, and optional basis for CAS
   *
   * The `basis` field controls overwrite behavior:
   * - `undefined`: No check - silently overwrite if file exists
   * - `null`: File must not exist (fails if file exists)
   * - `string`: File's current blobId must match (CAS update)
   *
   * @example
   * ```typescript
   * // Simple commit - overwrites if exists (after uploading via /fs/upload endpoint)
   * await fs.commitFiles(ctx, [
   *   { path: "/uploads/file.txt", blobId },
   * ]);
   *
   * // Create only - fails if file already exists
   * await fs.commitFiles(ctx, [
   *   { path: "/uploads/file.txt", blobId, basis: null },
   * ]);
   *
   * // CAS update - only succeeds if current blobId matches basis
   * await fs.commitFiles(ctx, [
   *   { path: "/uploads/file.txt", blobId: newBlobId, basis: oldBlobId },
   * ]);
   * ```
   */
  async commitFiles(
    ctx: MutationCtx,
    files: Array<{ path: string; blobId: string; basis?: string | null }>,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.commitFiles, {
      config: this.config,
      files,
    });
  }

  /**
   * Get a download URL for a blob.
   *
   * For Bunny storage with token authentication, this generates a signed CDN URL.
   * Without token authentication, returns an unsigned CDN URL.
   *
   * @param blobId - The blob identifier
   * @returns Download URL
   *
   * @example
   * ```typescript
   * const file = await fs.stat(ctx, "/uploads/file.txt");
   * if (file) {
   *   const url = await fs.getDownloadUrl(ctx, file.blobId);
   *   // Return URL to client for download
   * }
   * ```
   */
  async getDownloadUrl(ctx: ActionCtx, blobId: string): Promise<string> {
    return await ctx.runAction(this.component.lib.getDownloadUrl, {
      config: this.config,
      blobId,
    });
  }

  /**
   * Get a blob's raw data by blobId.
   *
   * This downloads the blob from storage and returns it as an ArrayBuffer.
   * Returns null if the blob doesn't exist.
   *
   * @param blobId - The blob identifier
   * @returns ArrayBuffer of blob data, or null if not found
   *
   * @example
   * ```typescript
   * const data = await fs.getBlob(ctx, blobId);
   * if (data) {
   *   // Process the ArrayBuffer...
   *   const text = new TextDecoder().decode(data);
   * }
   * ```
   */
  async getBlob(ctx: ActionCtx, blobId: string): Promise<ArrayBuffer | null> {
    return await ctx.runAction(this.component.lib.getBlob, {
      config: this.config,
      blobId,
    });
  }

  /**
   * Get a file's contents and metadata by path.
   *
   * This looks up the file by path, downloads the blob from storage,
   * and returns both the data and metadata.
   * Returns null if the file doesn't exist.
   *
   * @param path - The file path
   * @returns Object with data, contentType, and size, or null if not found
   *
   * @example
   * ```typescript
   * const result = await fs.getFile(ctx, "/images/photo.jpg");
   * if (result) {
   *   console.log(result.contentType); // "image/jpeg"
   *   console.log(result.size); // 12345
   *   // result.data is an ArrayBuffer
   * }
   * ```
   */
  async getFile(
    ctx: ActionCtx,
    path: string,
  ): Promise<{ data: ArrayBuffer; contentType: string; size: number } | null> {
    return await ctx.runAction(this.component.lib.getFile, {
      config: this.config,
      path,
    });
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Get file metadata by path.
   *
   * @param path - The file path
   * @returns File metadata or null if not found
   *
   * @example
   * ```typescript
   * const file = await fs.stat(ctx, "/uploads/file.txt");
   * if (file) {
   *   console.log(file.contentType, file.size);
   * }
   * ```
   */
  async stat(
    ctx: QueryCtx,
    path: string,
  ): Promise<{
    path: string;
    blobId: string;
    contentType: string;
    size: number;
  } | null> {
    return await ctx.runQuery(this.component.lib.stat, {
      config: this.config,
      path,
    });
  }

  /**
   * List files in the filesystem with pagination.
   *
   * Returns files sorted alphabetically by path, with optional prefix filtering
   * and cursor-based pagination.
   *
   * This method is compatible with `usePaginatedQuery` from `@convex/fs/react`.
   *
   * @param options.prefix - Optional path prefix filter (e.g., "/uploads/")
   * @param options.paginationOpts - Pagination options (numItems, cursor, endCursor)
   * @returns Page of files with continuation cursor
   *
   * @example
   * ```typescript
   * // Server-side: List first page
   * const page1 = await fs.list(ctx, {
   *   prefix: "/uploads/",
   *   paginationOpts: { numItems: 50, cursor: null },
   * });
   *
   * // Server-side: Get next page
   * const page2 = await fs.list(ctx, {
   *   prefix: "/uploads/",
   *   paginationOpts: { numItems: 50, cursor: page1.continueCursor },
   * });
   *
   * // React: Use with usePaginatedQuery (in your wrapper query)
   * // See @convex/fs/react for the usePaginatedQuery hook
   * ```
   */
  async list(
    ctx: QueryCtx,
    options: {
      prefix?: string;
      paginationOpts: PaginationOptions;
    },
  ): Promise<PaginationResult<FileMetadata>> {
    return await ctx.runQuery(this.component.lib.list, {
      config: this.config,
      prefix: options.prefix,
      paginationOpts: options.paginationOpts,
    });
  }

  // ============================================================================
  // Mutations
  // ============================================================================

  /**
   * Execute atomic file operations (move/copy/delete).
   *
   * All operations are validated and applied atomically. If any operation
   * fails its preconditions (source doesn't match, dest conflict), the
   * entire transaction is rejected.
   *
   * The `dest.basis` field controls overwrite behavior:
   * - `undefined`: No check - silently overwrite if dest exists
   * - `null`: Dest must not exist (fails if file exists)
   * - `string`: Dest's current blobId must match (CAS update)
   *
   * @param ops - Array of operations to execute
   *
   * @example
   * ```typescript
   * const file = await fs.stat(ctx, "/old/path.txt");
   * if (file) {
   *   // Move file, overwriting dest if it exists
   *   await fs.transact(ctx, [
   *     { op: "move", source: file, dest: { path: "/new/path.txt" } },
   *   ]);
   *
   *   // Copy file, fail if dest exists (Unix semantics)
   *   await fs.transact(ctx, [
   *     { op: "copy", source: file, dest: { path: "/copy.txt", basis: null } },
   *   ]);
   *
   *   // Delete file
   *   await fs.transact(ctx, [
   *     { op: "delete", source: file },
   *   ]);
   *
   *   // Overwrite with CAS: only succeeds if dest matches basis
   *   await fs.transact(ctx, [
   *     { op: "move", source: file, dest: { path: "/target.txt", basis: existingBlobId } },
   *   ]);
   * }
   * ```
   */
  async transact(
    ctx: MutationCtx,
    ops: Array<
      | {
          op: "move";
          source: {
            path: string;
            blobId: string;
            contentType: string;
            size: number;
          };
          dest: { path: string; basis?: string | null };
        }
      | {
          op: "copy";
          source: {
            path: string;
            blobId: string;
            contentType: string;
            size: number;
          };
          dest: { path: string; basis?: string | null };
        }
      | {
          op: "delete";
          source: {
            path: string;
            blobId: string;
            contentType: string;
            size: number;
          };
        }
    >,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.transact, {
      config: this.config,
      ops,
    });
  }

  // ============================================================================
  // Convenience Mutations (path-based)
  // ============================================================================

  /**
   * Copy a file to a new path.
   *
   * This is a convenience wrapper around `transact` for the common case of
   * copying a file to a path that doesn't exist.
   *
   * **Note:** This method is not safe against races because it doesn't allow
   * specifying the expected version of the source file. If you need to ensure
   * the source hasn't changed, use `transact` directly with the `source` from
   * a prior `stat` call.
   *
   * @param sourcePath - Path of the file to copy
   * @param destPath - Destination path (must not exist)
   * @throws If source file doesn't exist
   * @throws If destination already exists
   *
   * @example
   * ```typescript
   * await fs.copy(ctx, "/uploads/photo.jpg", "/backups/photo.jpg");
   * ```
   */
  async copy(
    ctx: MutationCtx,
    sourcePath: string,
    destPath: string,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.copyByPath, {
      config: this.config,
      sourcePath,
      destPath,
    });
  }

  /**
   * Move a file to a new path.
   *
   * This is a convenience wrapper around `transact` for the common case of
   * moving a file to a path that doesn't exist.
   *
   * **Note:** This method is not safe against races because it doesn't allow
   * specifying the expected version of the source file. If you need to ensure
   * the source hasn't changed, use `transact` directly with the `source` from
   * a prior `stat` call.
   *
   * @param sourcePath - Path of the file to move
   * @param destPath - Destination path (must not exist)
   * @throws If source file doesn't exist
   * @throws If destination already exists
   *
   * @example
   * ```typescript
   * await fs.move(ctx, "/uploads/temp.txt", "/documents/final.txt");
   * ```
   */
  async move(
    ctx: MutationCtx,
    sourcePath: string,
    destPath: string,
  ): Promise<void> {
    await ctx.runMutation(this.component.lib.moveByPath, {
      config: this.config,
      sourcePath,
      destPath,
    });
  }

  /**
   * Delete a file by path.
   *
   * This is a convenience wrapper around `transact` for the common case of
   * deleting a file. This operation is idempotent - if the file doesn't exist,
   * it's a no-op.
   *
   * **Note:** This method is not safe against races because it doesn't allow
   * specifying the expected version of the file. If you need to ensure the
   * file hasn't changed, use `transact` directly with the `source` from a
   * prior `stat` call.
   *
   * @param path - Path of the file to delete
   *
   * @example
   * ```typescript
   * await fs.delete(ctx, "/uploads/old-file.txt");
   * ```
   */
  async delete(ctx: MutationCtx, path: string): Promise<void> {
    await ctx.runMutation(this.component.lib.deleteByPath, {
      config: this.config,
      path,
    });
  }
}

/**
 * Register HTTP routes for blob downloads and uploads.
 *
 * Creates routes under the given pathPrefix:
 * - POST `{pathPrefix}/upload` - Upload proxy endpoint
 * - GET `{pathPrefix}/blobs/{blobId}` - Returns 302 redirect to download URL
 *
 * @param http - The HTTP router instance
 * @param component - The FS component reference
 * @param fs - A ConvexFS instance with storage configuration
 * @param config - Configuration with required auth callbacks
 *
 * @example
 * ```typescript
 * // convex/http.ts
 * import { httpRouter } from "convex/server";
 * import { ConvexFS, registerRoutes } from "@convex/fs";
 * import { components } from "./_generated/api";
 *
 * const http = httpRouter();
 *
 * const fs = new ConvexFS(components.fs, {
 *   storage: {
 *     type: "bunny",
 *     apiKey: process.env.BUNNY_API_KEY!,
 *     storageZoneName: process.env.BUNNY_STORAGE_ZONE!,
 *     cdnHostname: process.env.BUNNY_CDN_HOSTNAME!,
 *   },
 * });
 *
 * registerRoutes(http, components.fs, fs, {
 *   pathPrefix: "/fs",
 *   uploadAuth: async (ctx) => {
 *     const identity = await ctx.auth.getUserIdentity();
 *     return identity !== null;
 *   },
 *   downloadAuth: async (ctx, blobId) => {
 *     const identity = await ctx.auth.getUserIdentity();
 *     return identity !== null;
 *   },
 * });
 *
 * // Routes created:
 * // POST /fs/upload - Upload proxy (requires uploadAuth)
 * // GET /fs/blobs/{blobId} - Download redirect (requires downloadAuth)
 *
 * export default http;
 * ```
 */
export function registerRoutes(
  http: HttpRouter,
  component: ComponentApi,
  fs: ConvexFS,
  config: RegisterRoutesConfig,
): void {
  const pathPrefix = config.pathPrefix ?? "/fs";

  // Create CORS-enabled router for cross-origin requests
  const cors = corsRouter(http, {
    allowedOrigins: ["*"],
    allowedHeaders: ["Content-Type", "Content-Length"],
  });

  // Route: POST /fs/upload -> Upload proxy
  cors.route({
    path: pathPrefix + "/upload",
    method: "POST",
    handler: httpActionGeneric(async (ctx, req) => {
      // Auth check for upload
      try {
        const allowed = await config.uploadAuth(ctx);
        if (!allowed) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      const contentType =
        req.headers.get("Content-Type") ?? "application/octet-stream";
      const contentLengthHeader = req.headers.get("Content-Length");
      const contentLength = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : 0;

      // Check size limit (15MB to leave headroom under Convex 16MB return limit)
      const MAX_UPLOAD_SIZE = 15 * 1024 * 1024;
      if (contentLength > MAX_UPLOAD_SIZE) {
        return new Response(
          JSON.stringify({ error: "File too large. Maximum size is 15MB." }),
          {
            status: 413,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      try {
        const data = await req.arrayBuffer();

        // Call the upload action with config (stores config for GC)
        const result = await ctx.runAction(component.lib.uploadBlob, {
          config: fs.config,
          data,
          contentType,
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Upload error:", error);
        return new Response(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Upload failed",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }),
  });

  // Route: GET /fs/blobs/{blobId} -> 302 redirect to CDN URL
  cors.route({
    pathPrefix: pathPrefix + "/blobs/",
    method: "GET",
    handler: httpActionGeneric(async (ctx, req) => {
      // Extract blobId from URL
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const blobId = pathParts[pathParts.length - 1];

      if (!blobId) {
        return new Response(JSON.stringify({ error: "Missing blobId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Auth check for download
      try {
        const allowed = await config.downloadAuth(ctx, blobId);
        if (!allowed) {
          return new Response(JSON.stringify({ error: "Forbidden" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Get download URL using the fs instance's config
      try {
        const downloadUrl = await fs.getDownloadUrl(ctx, blobId);

        // Cache for token TTL minus buffer
        const tokenTtl = fs.config.downloadUrlTtl ?? 3600; // Default 1 hour
        const cacheBuffer = 300; // 5 minute buffer
        const cacheTtl = Math.max(0, tokenTtl - cacheBuffer);
        const cacheControl = `private, max-age=${cacheTtl}`;

        return new Response(null, {
          status: 302,
          headers: {
            Location: downloadUrl,
            "Cache-Control": cacheControl,
          },
        });
      } catch (error) {
        // Blob not found or other error
        console.error("Error getting download URL:", error);
        return new Response(JSON.stringify({ error: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }),
  });
}

export default ConvexFS;
