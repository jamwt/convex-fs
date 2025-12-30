import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { storageConfigValidator } from "./validators";

export default defineSchema({
  // Pending uploads awaiting commit
  uploads: defineTable({
    // UUID for the blob in object storage
    blobId: v.string(),
    // Unix timestamp (ms) when the upload expires (for GC)
    expiresAt: v.number(),
    // Metadata from proxy upload
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
  })
    .index("blobId", ["blobId"])
    .index("expiresAt", ["expiresAt"]), // For GC queries

  // Committed blobs with reference counting
  blobs: defineTable({
    blobId: v.string(),
    metadata: v.object({
      contentType: v.string(),
      size: v.number(),
    }),
    refCount: v.number(),
    updatedAt: v.number(), // Unix timestamp (ms) of last refCount change
  })
    .index("blobId", ["blobId"])
    .index("refCountUpdatedAt", ["refCount", "updatedAt"]), // For BGC queries

  // File paths pointing to blobs
  files: defineTable({
    blobId: v.string(),
    path: v.string(),
  }).index("path", ["path"]),

  // Stored config for background jobs (components can't access env vars)
  config: defineTable({
    key: v.string(),
    value: v.object({
      // Storage backend configuration
      storage: storageConfigValidator,
      // Download URL TTL in seconds
      downloadUrlTtl: v.optional(v.number()),
      // GC configuration
      blobGracePeriod: v.optional(v.number()), // Seconds before orphaned blobs are deleted
      freezeGc: v.optional(v.boolean()), // If true, all GC jobs will NOOP (emergency stop)
    }),
    checksum: v.optional(v.string()),
  }).index("key", ["key"]),
});
