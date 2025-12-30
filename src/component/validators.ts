import { v, type Infer } from "convex/values";

/**
 * Validator for Bunny.net Edge Storage configuration.
 */
export const bunnyStorageConfigValidator = v.object({
  type: v.literal("bunny"),
  apiKey: v.string(),
  storageZoneName: v.string(),
  region: v.optional(v.string()),
  cdnHostname: v.string(), // Full hostname, e.g., "myzone.b-cdn.net" or custom domain
  tokenKey: v.optional(v.string()), // For token-authenticated Pull Zones
});

/** TypeScript type for Bunny storage config. */
export type BunnyStorageConfig = Infer<typeof bunnyStorageConfigValidator>;

/**
 * Storage backend configuration validator.
 * Currently only supports Bunny.net Edge Storage.
 */
export const storageConfigValidator = bunnyStorageConfigValidator;

/** TypeScript type for storage config. */
export type StorageConfig = Infer<typeof storageConfigValidator>;

/**
 * Validator for full blob store configuration.
 * Pass this as an argument to component queries/mutations/actions.
 */
export const configValidator = v.object({
  // Storage backend configuration
  storage: storageConfigValidator,

  // Presigned URL TTL configuration (in seconds)
  uploadUrlTtl: v.optional(v.number()), // defaults to 3600 (1 hour)
  downloadUrlTtl: v.optional(v.number()), // defaults to 3600 (1 hour)

  // GC configuration
  blobGracePeriod: v.optional(v.number()), // seconds before orphaned blobs are deleted, defaults to 86400 (24 hours)
  // NOTE: freezeGc is a dashboard-only field (not in client config) - set it manually
  // in the config table to freeze all GC jobs for emergency investigation/recovery
});

/** TypeScript type derived from the config validator. */
export type Config = Infer<typeof configValidator>;

/**
 * Validator for file metadata returned by stat and other queries.
 */
export const fileMetadataValidator = v.object({
  path: v.string(),
  blobId: v.string(),
  contentType: v.string(),
  size: v.number(),
});

/** TypeScript type for file metadata. */
export type FileMetadata = Infer<typeof fileMetadataValidator>;

/**
 * Validator for destination in move/copy operations.
 */
export const destValidator = v.object({
  path: v.string(),
  // If provided, dest blobId must match (allows overwrite).
  // If omitted, dest must not exist.
  basis: v.optional(v.string()),
});

/** TypeScript type for destination. */
export type Dest = Infer<typeof destValidator>;

/**
 * Validators for transact operations.
 */
export const moveOpValidator = v.object({
  op: v.literal("move"),
  source: fileMetadataValidator,
  dest: destValidator,
});

export const copyOpValidator = v.object({
  op: v.literal("copy"),
  source: fileMetadataValidator,
  dest: destValidator,
});

export const deleteOpValidator = v.object({
  op: v.literal("delete"),
  source: fileMetadataValidator,
});

export const opValidator = v.union(
  moveOpValidator,
  copyOpValidator,
  deleteOpValidator,
);

/** TypeScript type for a transact operation. */
export type Op = Infer<typeof opValidator>;
