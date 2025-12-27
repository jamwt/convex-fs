/**
 * Client API for the ConvexFS blob store component.
 *
 * @example
 * ```typescript
 * // convex/fs.ts
 * import { ConvexFS } from "@convex/fs";
 * import { components } from "./_generated/api";
 *
 * export const fs = new ConvexFS(components.fs);
 * ```
 *
 * @example
 * ```typescript
 * // convex/files.ts
 * import { action, query } from "./_generated/server";
 * import { fs } from "./fs";
 *
 * export const getUploadUrl = action({
 *   args: {},
 *   handler: async (ctx) => {
 *     return await fs.prepareUpload(ctx);
 *   },
 * });
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
 * ConvexFS client for interacting with the blob store component.
 *
 * Configuration is read from environment variables by default:
 * - FS_ACCESS_KEY_ID
 * - FS_SECRET_ACCESS_KEY
 * - FS_ENDPOINT
 * - FS_REGION (optional)
 *
 * You can override these in the constructor for multi-store setups.
 *
 * @example
 * ```typescript
 * // Default: reads from env vars
 * const fs = new ConvexFS(components.fs);
 *
 * // Override for multiple stores
 * const userUploads = new ConvexFS(components.fs, {
 *   FS_ACCESS_KEY_ID: process.env.USER_UPLOADS_ACCESS_KEY,
 *   FS_SECRET_ACCESS_KEY: process.env.USER_UPLOADS_SECRET_KEY,
 *   FS_ENDPOINT: process.env.USER_UPLOADS_ENDPOINT,
 * });
 * ```
 */
export class ConvexFS {
  constructor(
    public component: ComponentApi,
    private options: ConvexFSOptions = {},
  ) {}

  /**
   * Build config from options + env vars.
   * Throws if required values are missing.
   */
  private get config() {
    const accessKeyId =
      this.options.FS_ACCESS_KEY_ID ?? process.env.FS_ACCESS_KEY_ID;
    const secretAccessKey =
      this.options.FS_SECRET_ACCESS_KEY ?? process.env.FS_SECRET_ACCESS_KEY;
    const endpoint = this.options.FS_ENDPOINT ?? process.env.FS_ENDPOINT;
    const region = this.options.FS_REGION ?? process.env.FS_REGION;

    if (!accessKeyId) {
      throw new Error("FS_ACCESS_KEY_ID is not set");
    }
    if (!secretAccessKey) {
      throw new Error("FS_SECRET_ACCESS_KEY is not set");
    }
    if (!endpoint) {
      throw new Error("FS_ENDPOINT is not set");
    }

    return {
      accessKeyId,
      secretAccessKey,
      endpoint,
      region,
      uploadUrlTtl: this.options.uploadUrlTtl,
      downloadUrlTtl: this.options.downloadUrlTtl,
      blobGracePeriod: this.options.blobGracePeriod,
    };
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Get a presigned upload URL and blob ID.
   *
   * The client should PUT the file content directly to the returned URL.
   * After upload completes, call `commitFiles()` to associate the blob with a path.
   *
   * @returns Object with `url` (presigned upload URL) and `blobId` (unique blob identifier)
   *
   * @example
   * ```typescript
   * const { url, blobId } = await fs.prepareUpload(ctx);
   *
   * // Client uploads to URL...
   *
   * await fs.commitFiles(ctx, [{ path: "/uploads/file.txt", blobId }]);
   * ```
   */
  async prepareUpload(
    ctx: ActionCtx,
  ): Promise<{ url: string; blobId: string }> {
    return await ctx.runAction(this.component.lib.prepareUpload, {
      config: this.config,
    });
  }

  /**
   * Commit uploaded blobs to file paths.
   *
   * This verifies the blobs exist in object storage and atomically
   * creates/updates the file records.
   *
   * @param files - Array of file commits with path, blobId, and optional basis for CAS
   *
   * @example
   * ```typescript
   * // Simple commit
   * await fs.commitFiles(ctx, [
   *   { path: "/uploads/file.txt", blobId },
   * ]);
   *
   * // With CAS: only succeeds if current blobId matches basis
   * await fs.commitFiles(ctx, [
   *   { path: "/uploads/file.txt", blobId: newBlobId, basis: oldBlobId },
   * ]);
   * ```
   */
  async commitFiles(
    ctx: ActionCtx,
    files: Array<{ path: string; blobId: string; basis?: string }>,
  ): Promise<void> {
    await ctx.runAction(this.component.lib.commitFiles, {
      config: this.config,
      files,
    });
  }

  /**
   * Get a presigned download URL for a blob.
   *
   * URLs are cached to avoid regenerating them on every request.
   *
   * @param blobId - The blob identifier
   * @returns Presigned download URL
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
   * This method is compatible with `usePaginatedQuery` from `convex-helpers/react`.
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
   * @param ops - Array of operations to execute
   *
   * @example
   * ```typescript
   * const file = await fs.stat(ctx, "/old/path.txt");
   * if (file) {
   *   // Move file to new path
   *   await fs.transact(ctx, [
   *     { op: "move", source: file, dest: { path: "/new/path.txt" } },
   *   ]);
   *
   *   // Copy file (creates new reference to same blob)
   *   await fs.transact(ctx, [
   *     { op: "copy", source: file, dest: { path: "/copy.txt" } },
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
          dest: { path: string; basis?: string };
        }
      | {
          op: "copy";
          source: {
            path: string;
            blobId: string;
            contentType: string;
            size: number;
          };
          dest: { path: string; basis?: string };
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
 * Register HTTP routes for blob downloads.
 *
 * Creates a route at `{pathPrefix}/{blobId}` that returns a 302 redirect
 * to the presigned download URL.
 *
 * @param http - The HTTP router instance
 * @param component - The FS component reference
 * @param config - Optional configuration
 *
 * @example
 * ```typescript
 * // convex/http.ts
 * import { httpRouter } from "convex/server";
 * import { registerRoutes } from "@convex/fs";
 * import { components } from "./_generated/api";
 *
 * const http = httpRouter();
 *
 * registerRoutes(http, components.fs, {
 *   pathPrefix: "/blobs",
 *   auth: async (ctx, blobId) => {
 *     const identity = await ctx.auth.getUserIdentity();
 *     return identity !== null;
 *   },
 * });
 *
 * export default http;
 * ```
 */
export function registerRoutes(
  http: HttpRouter,
  component: ComponentApi,
  config?: RegisterRoutesConfig,
): void {
  const pathPrefix = config?.pathPrefix ?? "/blobs";

  // Route: GET /blobs/{blobId} -> 302 redirect to presigned URL
  http.route({
    path: `${pathPrefix}/{blobId}`,
    method: "GET",
    handler: httpActionGeneric(async (ctx, req) => {
      // Extract blobId from URL
      const url = new URL(req.url);
      const pathParts = url.pathname.split("/");
      const blobId = pathParts[pathParts.length - 1];

      if (!blobId) {
        return new Response("Missing blobId", { status: 400 });
      }

      // Auth check if provided
      if (config?.auth) {
        try {
          const allowed = await config.auth(ctx, blobId);
          if (!allowed) {
            return new Response("Forbidden", { status: 403 });
          }
        } catch {
          return new Response("Forbidden", { status: 403 });
        }
      }

      // Build config from options + env vars
      const accessKeyId =
        config?.FS_ACCESS_KEY_ID ?? process.env.FS_ACCESS_KEY_ID;
      const secretAccessKey =
        config?.FS_SECRET_ACCESS_KEY ?? process.env.FS_SECRET_ACCESS_KEY;
      const endpoint = config?.FS_ENDPOINT ?? process.env.FS_ENDPOINT;
      const region = config?.FS_REGION ?? process.env.FS_REGION;

      if (!accessKeyId || !secretAccessKey || !endpoint) {
        console.error("FS storage not configured: missing env vars");
        return new Response("Storage not configured", { status: 500 });
      }

      const fsConfig = {
        accessKeyId,
        secretAccessKey,
        endpoint,
        region,
        downloadUrlTtl: config?.downloadUrlTtl,
      };

      // Check if blob exists by trying to get download URL
      // The component will throw if the blob doesn't exist
      try {
        const downloadUrl = await ctx.runAction(component.lib.getDownloadUrl, {
          config: fsConfig,
          blobId,
        });

        // Return 302 redirect with no-store to prevent caching
        // (presigned URLs expire, so cached redirects would break)
        return new Response(null, {
          status: 302,
          headers: {
            Location: downloadUrl,
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        // Blob not found or other error
        console.error("Error getting download URL:", error);
        return new Response("Not Found", { status: 404 });
      }
    }),
  });
}

export default ConvexFS;
