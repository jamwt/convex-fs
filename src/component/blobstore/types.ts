/**
 * Configuration for creating an S3-compatible blob store.
 */
export interface S3BlobStoreConfig {
  /** AWS access key ID or equivalent for S3-compatible services */
  accessKeyId: string;
  /** AWS secret access key or equivalent for S3-compatible services */
  secretAccessKey: string;
  /**
   * Base URL including bucket path.
   * Examples:
   * - AWS S3: "https://my-bucket.s3.us-east-1.amazonaws.com"
   * - Cloudflare R2: "https://account-id.r2.cloudflarestorage.com/my-bucket"
   * - MinIO: "https://minio.example.com/my-bucket"
   */
  endpoint: string;
  /** AWS region. Defaults to "auto" which works for most S3-compatible services. */
  region?: string;
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
 * Metadata returned from a head request.
 */
export interface BlobMetadata {
  /** Content-Type of the blob, if set. */
  contentType?: string;
  /** Size of the blob in bytes. */
  contentLength: number;
}

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
   * Download a blob directly to the server.
   * Returns null if the blob does not exist.
   */
  get(key: string): Promise<Blob | null>;

  /**
   * Get metadata for a blob without downloading it.
   * Returns null if the blob does not exist.
   */
  head(key: string): Promise<BlobMetadata | null>;

  /**
   * Check if a blob exists.
   */
  exists(key: string): Promise<boolean>;

  /**
   * Delete a blob. Idempotent - does not throw if blob doesn't exist.
   */
  delete(key: string): Promise<void>;
}
