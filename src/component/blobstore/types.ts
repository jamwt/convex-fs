/**
 * Configuration for the in-memory test blob store.
 *
 * NOT for production use - blobs are stored in-memory and don't persist
 * across Convex function invocations. This is only useful in convex-test
 * where everything runs in a single process.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TestBlobStoreConfig {
  // No configuration needed - just a marker type
}

/**
 * Configuration for creating a Bunny.net Edge Storage blob store.
 */
export interface BunnyBlobStoreConfig {
  /** Bunny.net Edge Storage API key (found in FTP & API Access section) */
  apiKey: string;
  /** Name of the storage zone */
  storageZoneName: string;
  /**
   * Region for the storage zone endpoint.
   * Leave empty for Frankfurt (default), or use:
   * - "uk" for London
   * - "ny" for New York
   * - "la" for Los Angeles
   * - "sg" for Singapore
   * - "se" for Stockholm
   * - "br" for São Paulo
   * - "jh" for Johannesburg
   * - "syd" for Sydney
   */
  region?: string;
  /**
   * CDN hostname for downloads.
   * This is the full hostname, e.g., "myzone.b-cdn.net" or a custom domain like "cdn.example.com".
   */
  cdnHostname: string;
  /**
   * Token authentication key for signed CDN URLs.
   * Found in Pull Zone > Security > Token Authentication.
   * If not provided, URLs will be unsigned (requires public Pull Zone).
   */
  tokenKey?: string;
}

/**
 * Options for generating a presigned upload URL.
 */
export interface UploadUrlOptions {
  /** URL expiration time in seconds. Defaults to 3600 (1 hour). */
  expiresIn?: number;
}

/**
 * Options for generating a presigned download URL.
 */
export interface DownloadUrlOptions {
  /** URL expiration time in seconds. Defaults to 3600 (1 hour). */
  expiresIn?: number;
}

/**
 * Options for putting a blob.
 */
export interface PutOptions {
  /** Content-Type of the blob. */
  contentType?: string;
}

/**
 * Result of a delete operation.
 * - "deleted": The blob was successfully deleted from storage
 * - "not_found": The blob did not exist (may have already been deleted)
 *
 * Note: Throws on storage errors (5xx, network issues).
 */
export type DeleteResult = { status: "deleted" } | { status: "not_found" };

/**
 * Interface for a blob store that supports basic CRUD operations
 * and presigned URL generation for client-side uploads/downloads.
 */
export interface BlobStore {
  /**
   * Generate a presigned URL for uploading a blob.
   * Clients can PUT directly to this URL.
   */
  generateUploadUrl(key: string, opts?: UploadUrlOptions): Promise<string>;

  /**
   * Generate a presigned URL for downloading a blob.
   * Clients can GET directly from this URL.
   */
  generateDownloadUrl(key: string, opts?: DownloadUrlOptions): Promise<string>;

  /**
   * Upload a blob directly from the server.
   * For small, in-memory objects only.
   */
  put(key: string, data: Blob | Uint8Array, opts?: PutOptions): Promise<void>;

  /**
   * Delete a blob.
   * Returns { status: "deleted" } on success, { status: "not_found" } if blob didn't exist.
   * Throws on storage errors (5xx, network issues).
   */
  delete(key: string): Promise<DeleteResult>;
}
