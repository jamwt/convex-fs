import { v } from "convex/values";
import {
  action,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { createBlobStore } from "../blobstore/index.js";
import { configValidator } from "./types.js";

const DEFAULT_DOWNLOAD_URL_TTL = 3600; // 1 hour
const DEFAULT_UPLOAD_COMMIT_TTL = 14400; // 4 hours - time for client to commit after upload

export const createUpload = internalMutation({
  args: {
    blobId: v.string(),
    expiresAt: v.number(),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  },
  returns: v.id("uploads"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("uploads", {
      blobId: args.blobId,
      expiresAt: args.expiresAt,
      contentType: args.contentType,
      size: args.size,
    });
  },
});

/**
 * Register a pending upload after the blob has been uploaded to storage.
 * Called by the client after uploading directly to the blob store.
 * This records the upload for GC tracking - uncommitted uploads will be
 * cleaned up after the grace period expires.
 */
export const registerPendingUpload = mutation({
  args: {
    config: configValidator,
    blobId: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { config, blobId, contentType, size } = args;

    // Store config for background GC (components can't access env vars)
    await ctx.runMutation(internal.config.ensureConfigStored, { config });

    // Record the pending upload with metadata
    const ttl = DEFAULT_UPLOAD_COMMIT_TTL;
    const expiresAt = Date.now() + ttl * 1000;
    await ctx.db.insert("uploads", {
      blobId,
      expiresAt,
      contentType,
      size,
    });

    return null;
  },
});

// Internal query to get upload records by blobIds (for cached metadata)
export const getUploadsByBlobIds = internalQuery({
  args: {
    blobIds: v.array(v.string()),
  },
  returns: v.array(
    v.union(
      v.null(),
      v.object({
        blobId: v.string(),
        contentType: v.optional(v.string()),
        size: v.optional(v.number()),
      }),
    ),
  ),
  handler: async (ctx, args) => {
    return await Promise.all(
      args.blobIds.map(async (blobId) => {
        const upload = await ctx.db
          .query("uploads")
          .withIndex("blobId", (q) => q.eq("blobId", blobId))
          .unique();
        if (!upload) return null;
        return {
          blobId: upload.blobId,
          contentType: upload.contentType,
          size: upload.size,
        };
      }),
    );
  },
});

/**
 * Get a download URL for a blob.
 * For Bunny storage, this generates a signed CDN URL.
 */
export const getDownloadUrl = action({
  args: {
    config: configValidator,
    blobId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const { config, blobId } = args;

    const store = createBlobStore(config.storage);
    const ttl = config.downloadUrlTtl ?? DEFAULT_DOWNLOAD_URL_TTL;

    return store.generateDownloadUrl(blobId, { expiresIn: ttl });
  },
});
