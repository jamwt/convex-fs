import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import { api, internal } from "./_generated/api.js";

import {
  configValidator,
  fileMetadataValidator,
  opValidator,
} from "./validators.js";
import { paginator } from "convex-helpers/server/pagination";
import schema from "./schema.js";
import { createBlobStore } from "./blobstore/index.js";

// Internal validator for a single file in the commit
// basis: undefined = overwrite, null = must not exist, string = must match
const fileCommitValidator = v.object({
  path: v.string(),
  blobId: v.string(),
  basis: v.optional(v.union(v.null(), v.string())),
});

// Internal validator for blob metadata passed to commitFilesInternal
const blobMetadataValidator = v.object({
  contentType: v.string(),
  size: v.number(),
});

// Internal query to get current file versions for CAS check
export const getFilesByPaths = internalQuery({
  args: {
    paths: v.array(v.string()),
  },
  returns: v.array(
    v.union(
      v.null(),
      v.object({
        path: v.string(),
        blobId: v.string(),
      }),
    ),
  ),
  handler: async (ctx, args) => {
    const results = await Promise.all(
      args.paths.map(async (path) => {
        const file = await ctx.db
          .query("files")
          .withIndex("path", (q) => q.eq("path", path))
          .unique();
        return file ? { path: file.path, blobId: file.blobId } : null;
      }),
    );
    return results;
  },
});

// Internal mutation to commit files atomically
export const commitFilesInternal = internalMutation({
  args: {
    files: v.array(
      v.object({
        path: v.string(),
        blobId: v.string(),
        basis: v.optional(v.union(v.null(), v.string())),
        metadata: blobMetadataValidator,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify CAS conditions
    for (const file of args.files) {
      if (file.basis !== undefined) {
        const currentFile = await ctx.db
          .query("files")
          .withIndex("path", (q) => q.eq("path", file.path))
          .unique();
        const currentBlobId = currentFile?.blobId ?? null;

        if (currentBlobId !== file.basis) {
          throw new Error(
            `CAS conflict for path "${file.path}": expected basis "${file.basis}", found "${currentBlobId}"`,
          );
        }
      }
    }

    // All checks passed, commit the files
    const now = Date.now();

    for (const file of args.files) {
      // 1. Insert into blobs table with refCount=1
      await ctx.db.insert("blobs", {
        blobId: file.blobId,
        metadata: {
          contentType: file.metadata.contentType,
          size: file.metadata.size,
        },
        refCount: 1,
        updatedAt: now,
      });

      // 2. Update or insert into files table
      const existingFile = await ctx.db
        .query("files")
        .withIndex("path", (q) => q.eq("path", file.path))
        .unique();

      if (existingFile) {
        // Update existing file to point to new blob
        await ctx.db.patch(existingFile._id, {
          blobId: file.blobId,
        });

        // Decrement refCount on old blob (GC will clean up if it hits 0)
        const oldBlob = await ctx.db
          .query("blobs")
          .withIndex("blobId", (q) => q.eq("blobId", existingFile.blobId))
          .unique();
        if (oldBlob) {
          await ctx.db.patch(oldBlob._id, {
            refCount: oldBlob.refCount - 1,
            updatedAt: now,
          });
        }
      } else {
        // Insert new file
        await ctx.db.insert("files", {
          path: file.path,
          blobId: file.blobId,
        });
      }

      // 3. Delete from uploads table
      const upload = await ctx.db
        .query("uploads")
        .withIndex("blobId", (q) => q.eq("blobId", file.blobId))
        .unique();
      if (upload) {
        await ctx.db.delete(upload._id);
      }
    }

    return null;
  },
});

export const commitFiles = mutation({
  args: {
    config: configValidator,
    files: v.array(fileCommitValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { config: _config, files } = args;

    if (files.length === 0) {
      return null;
    }

    // Get metadata from uploads table (populated during proxy upload)
    const metadataMap = new Map<
      string,
      { contentType: string; size: number }
    >();
    for (const file of files) {
      const upload = await ctx.db
        .query("uploads")
        .withIndex("blobId", (q) => q.eq("blobId", file.blobId))
        .unique();
      if (
        upload &&
        upload.contentType !== undefined &&
        upload.size !== undefined
      ) {
        metadataMap.set(file.blobId, {
          contentType: upload.contentType,
          size: upload.size,
        });
      }
    }

    // Verify all blobs have metadata (should always be true with proxy upload)
    const missingMetadata = files.filter((f) => !metadataMap.has(f.blobId));
    if (missingMetadata.length > 0) {
      const missingIds = missingMetadata.map((f) => f.blobId).join(", ");
      throw new Error(
        `Upload records not found for blobs: ${missingIds}. ` +
          `Blobs must be uploaded via the /fs/upload endpoint before committing.`,
      );
    }

    // Verify CAS conditions
    for (const file of files) {
      if (file.basis !== undefined) {
        const currentFile = await ctx.db
          .query("files")
          .withIndex("path", (q) => q.eq("path", file.path))
          .unique();
        const currentBlobId = currentFile?.blobId ?? null;

        if (currentBlobId !== file.basis) {
          throw new Error(
            `CAS conflict for path "${file.path}": expected basis "${file.basis}", found "${currentBlobId}"`,
          );
        }
      }
    }

    // All checks passed, commit the files
    const now = Date.now();

    for (const file of files) {
      const metadata = metadataMap.get(file.blobId)!;

      // 1. Insert into blobs table with refCount=1
      await ctx.db.insert("blobs", {
        blobId: file.blobId,
        metadata: {
          contentType: metadata.contentType,
          size: metadata.size,
        },
        refCount: 1,
        updatedAt: now,
      });

      // 2. Update or insert into files table
      const existingFile = await ctx.db
        .query("files")
        .withIndex("path", (q) => q.eq("path", file.path))
        .unique();

      if (existingFile) {
        // Update existing file to point to new blob
        await ctx.db.patch(existingFile._id, {
          blobId: file.blobId,
        });

        // Decrement refCount on old blob (GC will clean up if it hits 0)
        const oldBlob = await ctx.db
          .query("blobs")
          .withIndex("blobId", (q) => q.eq("blobId", existingFile.blobId))
          .unique();
        if (oldBlob) {
          await ctx.db.patch(oldBlob._id, {
            refCount: oldBlob.refCount - 1,
            updatedAt: now,
          });
        }
      } else {
        // Insert new file
        await ctx.db.insert("files", {
          path: file.path,
          blobId: file.blobId,
        });
      }

      // 3. Delete from uploads table
      const upload = await ctx.db
        .query("uploads")
        .withIndex("blobId", (q) => q.eq("blobId", file.blobId))
        .unique();
      if (upload) {
        await ctx.db.delete(upload._id);
      }
    }

    return null;
  },
});

export const stat = query({
  args: {
    config: configValidator,
    path: v.string(),
  },
  returns: v.union(v.null(), fileMetadataValidator),
  handler: async (ctx, args) => {
    const file = await ctx.db
      .query("files")
      .withIndex("path", (q) => q.eq("path", args.path))
      .unique();

    if (!file) {
      return null;
    }

    const blob = await ctx.db
      .query("blobs")
      .withIndex("blobId", (q) => q.eq("blobId", file.blobId))
      .unique();

    if (!blob) {
      throw new Error(
        `Invariant violation: blob not found for blobId "${file.blobId}" (path: "${args.path}")`,
      );
    }

    return {
      path: file.path,
      blobId: file.blobId,
      contentType: blob.metadata.contentType,
      size: blob.metadata.size,
    };
  },
});

export const transact = mutation({
  args: {
    config: configValidator,
    ops: v.array(opValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Phase 1: Validate all operations
    for (const op of args.ops) {
      // Check source predicate
      const sourceFile = await ctx.db
        .query("files")
        .withIndex("path", (q) => q.eq("path", op.source.path))
        .unique();

      if (!sourceFile) {
        throw new Error(`Source file not found: "${op.source.path}"`);
      }

      if (sourceFile.blobId !== op.source.blobId) {
        throw new Error(
          `Source file changed: "${op.source.path}" expected blobId "${op.source.blobId}", found "${sourceFile.blobId}"`,
        );
      }

      // Check dest predicate (for move/copy)
      // basis: undefined = no check (overwrite), null = must not exist, string = must match
      if (op.op === "move" || op.op === "copy") {
        const destFile = await ctx.db
          .query("files")
          .withIndex("path", (q) => q.eq("path", op.dest.path))
          .unique();

        if (op.dest.basis === undefined) {
          // No basis: no check, allow overwrite
        } else if (op.dest.basis === null) {
          // Null basis: dest must not exist
          if (destFile) {
            throw new Error(
              `Dest conflict at "${op.dest.path}": expected no file, found blobId "${destFile.blobId}"`,
            );
          }
        } else {
          // String basis: dest blobId must match
          if (!destFile) {
            throw new Error(
              `Dest conflict at "${op.dest.path}": expected blobId "${op.dest.basis}", found null`,
            );
          }
          if (destFile.blobId !== op.dest.basis) {
            throw new Error(
              `Dest conflict at "${op.dest.path}": expected blobId "${op.dest.basis}", found "${destFile.blobId}"`,
            );
          }
        }
      }
    }

    // Phase 2: Apply all operations
    for (const op of args.ops) {
      if (op.op === "delete") {
        // Delete file record
        const file = await ctx.db
          .query("files")
          .withIndex("path", (q) => q.eq("path", op.source.path))
          .unique();

        if (file) {
          await ctx.db.delete(file._id);

          // Decrement refCount on source blob
          const blob = await ctx.db
            .query("blobs")
            .withIndex("blobId", (q) => q.eq("blobId", file.blobId))
            .unique();

          if (blob) {
            await ctx.db.patch(blob._id, {
              refCount: blob.refCount - 1,
              updatedAt: now,
            });
          }
        }
      } else if (op.op === "move") {
        // Get source file
        const sourceFile = await ctx.db
          .query("files")
          .withIndex("path", (q) => q.eq("path", op.source.path))
          .unique();

        if (sourceFile) {
          // Handle overwrite at dest (basis: undefined or string means overwrite may happen)
          // basis: null means dest must not exist (validated above), so no overwrite needed
          if (op.dest.basis !== null) {
            const destFile = await ctx.db
              .query("files")
              .withIndex("path", (q) => q.eq("path", op.dest.path))
              .unique();

            if (destFile) {
              // Delete dest file record
              await ctx.db.delete(destFile._id);

              // Decrement refCount on dest blob
              const destBlob = await ctx.db
                .query("blobs")
                .withIndex("blobId", (q) => q.eq("blobId", destFile.blobId))
                .unique();

              if (destBlob) {
                await ctx.db.patch(destBlob._id, {
                  refCount: destBlob.refCount - 1,
                  updatedAt: now,
                });
              }
            }
          }

          // Update source file's path to dest
          await ctx.db.patch(sourceFile._id, {
            path: op.dest.path,
          });
        }
      } else if (op.op === "copy") {
        // Get source file
        const sourceFile = await ctx.db
          .query("files")
          .withIndex("path", (q) => q.eq("path", op.source.path))
          .unique();

        if (sourceFile) {
          // Increment refCount on source blob
          const sourceBlob = await ctx.db
            .query("blobs")
            .withIndex("blobId", (q) => q.eq("blobId", sourceFile.blobId))
            .unique();

          if (sourceBlob) {
            await ctx.db.patch(sourceBlob._id, {
              refCount: sourceBlob.refCount + 1,
              updatedAt: now,
            });
          }

          // Check if dest exists (for overwrite handling)
          const destFile = await ctx.db
            .query("files")
            .withIndex("path", (q) => q.eq("path", op.dest.path))
            .unique();

          if (destFile) {
            // Dest exists - overwrite (basis: undefined or string, validated above)
            // Update dest file to point to source blob
            await ctx.db.patch(destFile._id, {
              blobId: sourceFile.blobId,
            });

            // Decrement refCount on old dest blob
            const destBlob = await ctx.db
              .query("blobs")
              .withIndex("blobId", (q) => q.eq("blobId", destFile.blobId))
              .unique();

            if (destBlob) {
              await ctx.db.patch(destBlob._id, {
                refCount: destBlob.refCount - 1,
                updatedAt: now,
              });
            }
          } else {
            // Dest doesn't exist - create new file record
            await ctx.db.insert("files", {
              path: op.dest.path,
              blobId: sourceFile.blobId,
            });
          }
        }
      }
    }

    return null;
  },
});

/**
 * List files in the filesystem with pagination.
 *
 * Returns files sorted alphabetically by path, with optional prefix filtering
 * and cursor-based pagination.
 *
 * This query is compatible with `usePaginatedQuery` from `@convex/fs/react`.
 *
 * @example
 * ```typescript
 * // Server-side iteration
 * const result = await ctx.runQuery(api.lib.list, {
 *   config,
 *   prefix: "/uploads/",
 *   paginationOpts: { numItems: 50, cursor: null },
 * });
 *
 * // React with usePaginatedQuery
 * import { usePaginatedQuery } from "@convex/fs/react";
 *
 * const { results, status, loadMore } = usePaginatedQuery(
 *   api.files.list,
 *   { prefix: "/uploads/" },
 *   { initialNumItems: 20 },
 * );
 * ```
 */
export const list = query({
  args: {
    config: configValidator,
    prefix: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(fileMetadataValidator),
    continueCursor: v.string(),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { numItems, cursor, endCursor } = args.paginationOpts;
    const prefix = args.prefix ?? "";

    // Build query with paginator for cursor-based pagination
    const paginatedQuery = paginator(ctx.db, schema)
      .query("files")
      .withIndex("path", (q) => {
        if (prefix) {
          // Match paths starting with prefix using range query
          return q.gte("path", prefix).lt("path", prefix + "\uffff");
        }
        return q;
      })
      .order("asc");

    const result = await paginatedQuery.paginate({
      cursor: cursor,
      numItems: numItems,
      endCursor: endCursor ?? undefined,
    });

    // Join with blobs table to get metadata for each file
    const page = await Promise.all(
      result.page.map(async (file) => {
        const blob = await ctx.db
          .query("blobs")
          .withIndex("blobId", (q) => q.eq("blobId", file.blobId))
          .unique();

        if (!blob) {
          throw new Error(
            `Invariant violation: blob not found for blobId "${file.blobId}" (path: "${file.path}")`,
          );
        }

        return {
          path: file.path,
          blobId: file.blobId,
          contentType: blob.metadata.contentType,
          size: blob.metadata.size,
        };
      }),
    );

    return {
      page,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Copy a file to a new path.
 *
 * This is a convenience wrapper around `transact` for the common case of
 * copying a file to a path that doesn't exist.
 *
 * @throws If source file doesn't exist
 * @throws If destination already exists
 */
export const copyByPath = mutation({
  args: {
    config: configValidator,
    sourcePath: v.string(),
    destPath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.runQuery(api.ops.stat, {
      config: args.config,
      path: args.sourcePath,
    });
    if (!source) {
      throw new Error(`Source file not found: "${args.sourcePath}"`);
    }

    await ctx.runMutation(api.ops.transact, {
      config: args.config,
      ops: [{ op: "copy", source, dest: { path: args.destPath, basis: null } }],
    });
    return null;
  },
});

/**
 * Move a file to a new path.
 *
 * This is a convenience wrapper around `transact` for the common case of
 * moving a file to a path that doesn't exist.
 *
 * @throws If source file doesn't exist
 * @throws If destination already exists
 */
export const moveByPath = mutation({
  args: {
    config: configValidator,
    sourcePath: v.string(),
    destPath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.runQuery(api.ops.stat, {
      config: args.config,
      path: args.sourcePath,
    });
    if (!source) {
      throw new Error(`Source file not found: "${args.sourcePath}"`);
    }

    await ctx.runMutation(api.ops.transact, {
      config: args.config,
      ops: [{ op: "move", source, dest: { path: args.destPath, basis: null } }],
    });
    return null;
  },
});

/**
 * Delete a file by path.
 *
 * This is a convenience wrapper around `transact` for the common case of
 * deleting a file. This operation is idempotent - if the file doesn't exist,
 * it's a no-op.
 */
export const deleteByPath = mutation({
  args: {
    config: configValidator,
    path: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const source = await ctx.runQuery(api.ops.stat, {
      config: args.config,
      path: args.path,
    });
    if (!source) {
      // Idempotent: no-op if file doesn't exist
      return null;
    }

    await ctx.runMutation(api.ops.transact, {
      config: args.config,
      ops: [{ op: "delete", source }],
    });
    return null;
  },
});

// ============================================================================
// Blob/File Download
// ============================================================================

/**
 * Get a blob's raw data by blobId.
 *
 * This downloads the blob from storage and returns it as an ArrayBuffer.
 * Returns null if the blob doesn't exist.
 *
 * @example
 * const data = await ctx.runAction(api.ops.getBlob, {
 *   config,
 *   blobId: "abc123",
 * });
 * if (data) {
 *   // Process the ArrayBuffer...
 * }
 */
export const getBlob = action({
  args: {
    config: configValidator,
    blobId: v.string(),
  },
  returns: v.union(v.null(), v.bytes()),
  handler: async (ctx, args) => {
    const { config, blobId } = args;

    const store = createBlobStore(config.storage);
    const blob = await store.get(blobId);

    if (!blob) {
      return null;
    }

    return await blob.arrayBuffer();
  },
});

/**
 * Get a file's contents and metadata by path.
 *
 * This looks up the file by path, downloads the blob from storage,
 * and returns both the data and metadata.
 * Returns null if the file doesn't exist.
 *
 * @example
 * const result = await ctx.runAction(api.ops.getFile, {
 *   config,
 *   path: "/images/photo.jpg",
 * });
 * if (result) {
 *   console.log(result.contentType); // "image/jpeg"
 *   console.log(result.size); // 12345
 *   // result.data is an ArrayBuffer
 * }
 */
export const getFile = action({
  args: {
    config: configValidator,
    path: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      data: v.bytes(),
      contentType: v.string(),
      size: v.number(),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<{
    data: ArrayBuffer;
    contentType: string;
    size: number;
  } | null> => {
    const { config, path } = args;

    // Look up file by path to get blobId and metadata
    const file: {
      path: string;
      blobId: string;
      contentType: string;
      size: number;
    } | null = await ctx.runQuery(api.ops.stat, { config, path });
    if (!file) {
      return null;
    }

    // Get blob from storage
    const store = createBlobStore(config.storage);
    const blob = await store.get(file.blobId);
    if (!blob) {
      // File record exists but blob is missing from storage
      // This shouldn't happen in normal operation
      return null;
    }

    return {
      data: await blob.arrayBuffer(),
      contentType: file.contentType,
      size: file.size,
    };
  },
});

// ============================================================================
// Internal Dev Utilities
// ============================================================================

/**
 * Restore a file by re-linking an existing blob to a path.
 *
 * This is an admin utility for recovering accidentally deleted files.
 * It increments the blob's refCount and creates a new file record.
 *
 * NOTE: There's a small race condition if the blob is being GC'd at the
 * exact moment of restore. In practice this is unlikely since GC runs
 * periodically and has a grace period.
 *
 * @throws If blob doesn't exist (may have been garbage collected)
 */
export const restore = internalMutation({
  args: {
    blobId: v.string(),
    path: v.string(),
  },
  returns: fileMetadataValidator,
  handler: async (ctx, args) => {
    // 1. Look up blob
    const blob = await ctx.db
      .query("blobs")
      .withIndex("blobId", (q) => q.eq("blobId", args.blobId))
      .unique();

    if (!blob) {
      throw new Error(
        `Blob not found: "${args.blobId}". It may have been garbage collected.`,
      );
    }

    // 2. Increment refCount
    const now = Date.now();
    await ctx.db.patch(blob._id, {
      refCount: blob.refCount + 1,
      updatedAt: now,
    });

    // 3. Insert file record
    await ctx.db.insert("files", {
      path: args.path,
      blobId: args.blobId,
    });

    // 4. Return metadata
    return {
      path: args.path,
      blobId: args.blobId,
      contentType: blob.metadata.contentType,
      size: blob.metadata.size,
    };
  },
});

/**
 * Delete all files from the filesystem.
 *
 * This is an internal dev utility that deletes files in batches of 100,
 * rescheduling itself until all files are gone. Orphaned blobs will be
 * cleaned up by the background garbage collector.
 *
 * Reads config from the config table (key: "storage").
 */
export const clearAllFiles = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Read config from config table
    const configDoc = await ctx.runQuery(internal.config.getConfig, {
      key: "storage",
    });
    if (!configDoc) {
      throw new Error(
        'No config found in config table with key "storage". ' +
          "Upload a file first to initialize the config.",
      );
    }
    const config = configDoc.value;

    // Get a page of files
    const result = await ctx.runQuery(api.ops.list, {
      config,
      paginationOpts: { numItems: 100, cursor: null },
    });

    if (result.page.length === 0) {
      // Done - no more files
      console.log("clearAllFiles: No more files to delete");
      return null;
    }

    console.log(`clearAllFiles: Deleting ${result.page.length} files`);

    // Delete all files in this page
    await ctx.runMutation(api.ops.transact, {
      config,
      ops: result.page.map((file) => ({
        op: "delete" as const,
        source: file,
      })),
    });

    // If we got a full page, there might be more - reschedule
    if (result.page.length === 100) {
      await ctx.scheduler.runAfter(0, internal.ops.clearAllFiles, {});
    }

    return null;
  },
});
