import type {
  HttpRouter,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDataModel,
} from "convex/server";

/**
 * Minimal query context type for running component queries.
 */
export type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;

/**
 * Minimal mutation context type for running component queries and mutations.
 */
export type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;

/**
 * Minimal action context type for running component queries, mutations, and actions.
 */
export type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction"
>;

/**
 * HTTP action context with auth support.
 */
export type HttpActionCtx = GenericActionCtx<GenericDataModel>;

/**
 * Auth callback for uploads.
 * Called before an upload is accepted.
 * Return true to allow the upload, false to deny.
 */
export type UploadAuthCallback = (ctx: HttpActionCtx) => Promise<boolean>;

/**
 * Auth callback for downloads.
 * Called before redirecting to the download URL.
 * Return true to allow access, false to deny.
 * If a path is provided, it is the path of the file being downloaded.
 */
export type DownloadAuthCallback = (
  ctx: HttpActionCtx,
  blobId: string,
  path?: string,
) => Promise<boolean>;

// =============================================================================
// Storage Configuration Types
// =============================================================================

/**
 * Bunny.net Edge Storage configuration.
 */
export interface BunnyStorageConfig {
  type: "bunny";
  /** Bunny.net Edge Storage API key */
  apiKey: string;
  /** Name of the storage zone */
  storageZoneName: string;
  /** Region for the storage zone endpoint */
  region?: string;
  /** CDN hostname for downloads, e.g., "myzone.b-cdn.net" or custom domain */
  cdnHostname: string;
  /** Token authentication key for signed CDN URLs */
  tokenKey?: string;
}

/**
 * In-memory test storage configuration.
 *
 * NOT for production use - blobs are stored in-memory and don't persist
 * across Convex function invocations. This is only useful in convex-test.
 */
export interface TestStorageConfig {
  type: "test";
}

/**
 * Storage configuration.
 * Supports Bunny.net Edge Storage and in-memory test storage.
 */
export type StorageConfig = BunnyStorageConfig | TestStorageConfig;

// =============================================================================
// ConvexFS Options
// =============================================================================

/**
 * Options for ConvexFS constructor.
 */
export interface ConvexFSOptions {
  /** Storage backend configuration */
  storage: StorageConfig;

  /** Download URL TTL in seconds. Defaults to 3600 (1 hour) */
  downloadUrlTtl?: number;

  /** Grace period (in seconds) before orphaned blobs are deleted. Defaults to 86400 (24 hours) */
  blobGracePeriod?: number;
}

/**
 * Configuration for registerRoutes().
 */
export interface RegisterRoutesConfig {
  /** Path prefix for routes. Defaults to "/fs" */
  pathPrefix?: string;

  /** Auth callback for uploads - called before upload is accepted */
  uploadAuth: UploadAuthCallback;

  /** Auth callback for downloads - called before redirecting to download URL */
  downloadAuth: DownloadAuthCallback;
}

export type { HttpRouter };
