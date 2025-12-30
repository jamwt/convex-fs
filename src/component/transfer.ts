import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { createBlobStore } from "./blobstore/index.js";
import { configValidator } from "./validators.js";

const DEFAULT_DOWNLOAD_URL_TTL = 3600; // 1 hour
const DEFAULT_UPLOAD_COMMIT_TTL = 14400; // 4 hours - time for client to commit after upload
const MAX_UPLOAD_SIZE = 16 * 1024 * 1024; // 16MB

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
 * Upload a blob to storage via server-side proxy.
 * Called from HTTP action handler.
 */
export const uploadBlob = action({
  args: {
    config: configValidator,
    data: v.bytes(),
    contentType: v.string(),
  },
  returns: v.object({
    blobId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { config, data, contentType } = args;

    // Validate size
    if (data.byteLength > MAX_UPLOAD_SIZE) {
      throw new Error(
        `File too large: ${data.byteLength} bytes (max ${MAX_UPLOAD_SIZE} bytes)`,
      );
    }

    // Store config for background GC (components can't access env vars)
    await ctx.runMutation(internal.config.ensureConfigStored, { config });

    // Generate blobId
    const blobId = crypto.randomUUID();

    // Create blob store and upload
    const store = createBlobStore(config.storage);
    await store.put(blobId, new Uint8Array(data), { contentType });

    // Record the pending upload with metadata (we know size/contentType since we proxied)
    const ttl = DEFAULT_UPLOAD_COMMIT_TTL;
    const expiresAt = Date.now() + ttl * 1000;
    await ctx.runMutation(internal.transfer.createUpload, {
      blobId,
      expiresAt,
      contentType,
      size: data.byteLength,
    });

    return { blobId };
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
