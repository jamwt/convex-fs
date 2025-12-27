import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import { api, internal } from "./_generated/api.js";
import { createS3BlobStore } from "./blobstore/index.js";
import type { BlobMetadata } from "./blobstore/index.js";
import {
  configValidator,
  fileMetadataValidator,
  opValidator,
} from "./validators.js";
import { paginator } from "convex-helpers/server/pagination";
import schema from "./schema.js";

// Internal validator for a single file in the commit
const fileCommitValidator = v.object({
  path: v.string(),
  blobId: v.string(),
  basis: v.optional(v.string()), // Expected current blobId for CAS semantics
});

// Internal validator for S3 metadata passed to commitFilesInternal
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
        basis: v.optional(v.string()),
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

export const commitFiles = action({
  args: {
    config: configValidator,
    files: v.array(fileCommitValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { config, files } = args;

    if (files.length === 0) {
      return null;
    }

    // Create blob store client
    const store = createS3BlobStore({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      region: config.region,
    });

    // 1. Verify all blobs exist in S3 and collect metadata
    const metadataResults = await Promise.all(
      files.map(async (file) => {
        const metadata = await store.head(file.blobId);
        return { blobId: file.blobId, metadata };
      }),
    );

    // Check all blobs exist
    const missingBlobs = metadataResults.filter((r) => r.metadata === null);
    if (missingBlobs.length > 0) {
      const missingIds = missingBlobs.map((r) => r.blobId).join(", ");
      throw new Error(`Blobs not found in object store: ${missingIds}`);
    }

    // Build metadata map
    const metadataMap = new Map<string, BlobMetadata>();
    for (const result of metadataResults) {
      metadataMap.set(result.blobId, result.metadata!);
    }

    // 2. Prepare files with metadata for the internal mutation
    const filesWithMetadata = files.map((file) => {
      const metadata = metadataMap.get(file.blobId)!;
      return {
        path: file.path,
        blobId: file.blobId,
        basis: file.basis,
        metadata: {
          contentType: metadata.contentType ?? "application/octet-stream",
          size: metadata.contentLength,
        },
      };
    });

    // 3. Commit atomically via internal mutation (handles CAS check)
    await ctx.runMutation(internal.ops.commitFilesInternal, {
      files: filesWithMetadata,
    });

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
        throw new Error(
          `Source conflict at "${op.source.path}": expected blobId "${op.source.blobId}", found null`,
        );
      }

      if (sourceFile.blobId !== op.source.blobId) {
        throw new Error(
          `Source conflict at "${op.source.path}": expected blobId "${op.source.blobId}", found "${sourceFile.blobId}"`,
        );
      }

      // Check dest predicate (for move/copy)
      if (op.op === "move" || op.op === "copy") {
        const destFile = await ctx.db
          .query("files")
          .withIndex("path", (q) => q.eq("path", op.dest.path))
          .unique();

        if (op.dest.basis === undefined) {
          // No basis: dest must not exist
          if (destFile) {
            throw new Error(
              `Dest conflict at "${op.dest.path}": expected no file, found blobId "${destFile.blobId}"`,
            );
          }
        } else {
          // Basis provided: dest blobId must match
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
          // Handle overwrite at dest if basis was provided
          if (op.dest.basis !== undefined) {
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

          // Handle overwrite at dest if basis was provided
          if (op.dest.basis !== undefined) {
            const destFile = await ctx.db
              .query("files")
              .withIndex("path", (q) => q.eq("path", op.dest.path))
              .unique();

            if (destFile) {
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
            }
          } else {
            // Create new file record at dest
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
 * This query is compatible with `usePaginatedQuery` from `convex-helpers/react`.
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
      ops: [{ op: "copy", source, dest: { path: args.destPath } }],
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
      ops: [{ op: "move", source, dest: { path: args.destPath } }],
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
