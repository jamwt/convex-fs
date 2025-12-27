import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { createS3BlobStore } from "./blobstore/index.js";
import { configValidator } from "./validators.js";

const DEFAULT_URL_TTL = 3600; // 1 hour

export const createUpload = internalMutation({
  args: {
    blobId: v.string(),
    expiresAt: v.number(),
  },
  returns: v.id("uploads"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("uploads", {
      blobId: args.blobId,
      expiresAt: args.expiresAt,
    });
  },
});

export const prepareUpload = action({
  args: {
    config: configValidator,
  },
  returns: v.object({
    url: v.string(),
    blobId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { config } = args;
    const blobId = crypto.randomUUID();
    const ttl = config.uploadUrlTtl ?? DEFAULT_URL_TTL;
    const expiresAt = Date.now() + ttl * 1000;

    // Record the pending upload in the database
    await ctx.runMutation(internal.transfer.createUpload, {
      blobId,
      expiresAt,
    });

    // Generate presigned URL
    const store = createS3BlobStore({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      region: config.region,
    });

    const url = await store.generateUploadUrl(blobId, {
      expiresIn: ttl,
    });

    return { url, blobId };
  },
});

// Internal query to get cached download URL
export const getCachedDownloadUrl = internalQuery({
  args: {
    blobId: v.string(),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const cached = await ctx.db
      .query("blobDownloadUrls")
      .withIndex("blobId", (q) => q.eq("blobId", args.blobId))
      .unique();

    if (!cached) {
      return null;
    }

    // Check if URL is still valid (with some buffer time)
    const bufferMs = 60 * 1000; // 1 minute buffer
    if (cached.expiresAt <= Date.now() + bufferMs) {
      return null;
    }

    return cached.url;
  },
});

// Internal mutation to cache download URL
export const cacheDownloadUrl = internalMutation({
  args: {
    blobId: v.string(),
    url: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete any existing cached URL for this blob
    const existing = await ctx.db
      .query("blobDownloadUrls")
      .withIndex("blobId", (q) => q.eq("blobId", args.blobId))
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Insert new cached URL
    await ctx.db.insert("blobDownloadUrls", {
      blobId: args.blobId,
      url: args.url,
      expiresAt: args.expiresAt,
    });

    return null;
  },
});

export const getDownloadUrl = action({
  args: {
    config: configValidator,
    blobId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const { config, blobId } = args;

    // 1. Check cache for valid URL
    const cachedUrl: string | null = await ctx.runQuery(
      internal.transfer.getCachedDownloadUrl,
      { blobId },
    );

    if (cachedUrl) {
      return cachedUrl;
    }

    // 2. Generate new presigned URL from S3
    const store = createS3BlobStore({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
      region: config.region,
    });

    const ttl = config.downloadUrlTtl ?? DEFAULT_URL_TTL;
    const url = await store.generateDownloadUrl(blobId, {
      expiresIn: ttl,
    });

    // 3. Cache the URL
    const expiresAt = Date.now() + ttl * 1000;
    await ctx.runMutation(internal.transfer.cacheDownloadUrl, {
      blobId,
      url,
      expiresAt,
    });

    return url;
  },
});
