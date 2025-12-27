import { AwsClient, AwsV4Signer } from "aws4fetch";
import type {
  BlobStore,
  S3BlobStoreConfig,
  UploadUrlOptions,
  DownloadUrlOptions,
  PutOptions,
  BlobMetadata,
} from "./types.js";

const DEFAULT_EXPIRES_IN = 3600; // 1 hour

/**
 * Create a BlobStore backed by an S3-compatible object storage service.
 * Uses AWS Signature V4 for authentication via the aws4fetch library.
 */
export function createS3BlobStore(config: S3BlobStoreConfig): BlobStore {
  const { accessKeyId, secretAccessKey, region = "auto" } = config;
  const baseUrl = config.endpoint.replace(/\/$/, ""); // trim trailing slash

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
    service: "s3",
    retries: 0, // Disable automatic retries - let the caller handle retry logic
  });

  function buildUrl(key: string): string {
    return `${baseUrl}/${encodeURIComponent(key)}`;
  }

  async function generatePresignedUrl(
    key: string,
    method: "GET" | "PUT",
    opts?: { expiresIn?: number },
  ): Promise<string> {
    const url = buildUrl(key);
    const expiresIn = opts?.expiresIn ?? DEFAULT_EXPIRES_IN;

    // Use AwsV4Signer directly for presigned URLs with custom expiration
    const signer = new AwsV4Signer({
      method,
      url,
      accessKeyId,
      secretAccessKey,
      region,
      service: "s3",
      signQuery: true,
    });

    // Sign the request
    const signed = await signer.sign();
    const signedUrl = signed.url;

    // Set the expiration (X-Amz-Expires)
    signedUrl.searchParams.set("X-Amz-Expires", String(expiresIn));

    // Re-sign with the expiration included
    const finalSigner = new AwsV4Signer({
      method,
      url: signedUrl.toString(),
      accessKeyId,
      secretAccessKey,
      region,
      service: "s3",
      signQuery: true,
    });

    const finalSigned = await finalSigner.sign();
    return finalSigned.url.toString();
  }

  return {
    async generateUploadUrl(
      key: string,
      opts?: UploadUrlOptions,
    ): Promise<string> {
      return generatePresignedUrl(key, "PUT", opts);
    },

    async generateDownloadUrl(
      key: string,
      opts?: DownloadUrlOptions,
    ): Promise<string> {
      return generatePresignedUrl(key, "GET", opts);
    },

    async put(
      key: string,
      data: Blob | Uint8Array,
      opts?: PutOptions,
    ): Promise<void> {
      const url = buildUrl(key);
      const headers: Record<string, string> = {};

      if (opts?.contentType) {
        headers["Content-Type"] = opts.contentType;
      }

      const response = await client.fetch(url, {
        method: "PUT",
        headers,
        body: data as BodyInit,
      });

      if (!response.ok) {
        throw new Error(
          `Failed to put blob: ${response.status} ${response.statusText}`,
        );
      }
    },

    async get(key: string): Promise<Blob | null> {
      const url = buildUrl(key);
      const response = await client.fetch(url, { method: "GET" });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(
          `Failed to get blob: ${response.status} ${response.statusText}`,
        );
      }

      return response.blob();
    },

    async head(key: string): Promise<BlobMetadata | null> {
      const url = buildUrl(key);
      const response = await client.fetch(url, { method: "HEAD" });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(
          `Failed to head blob: ${response.status} ${response.statusText}`,
        );
      }

      const contentType = response.headers.get("Content-Type") ?? undefined;
      const contentLengthHeader = response.headers.get("Content-Length");
      const contentLength = contentLengthHeader
        ? parseInt(contentLengthHeader, 10)
        : 0;

      return { contentType, contentLength };
    },

    async exists(key: string): Promise<boolean> {
      const metadata = await this.head(key);
      return metadata !== null;
    },

    async delete(key: string): Promise<void> {
      const url = buildUrl(key);
      const response = await client.fetch(url, { method: "DELETE" });

      // S3 returns 204 on success, and also handles non-existent objects gracefully
      // We only throw on unexpected errors
      if (!response.ok && response.status !== 404) {
        throw new Error(
          `Failed to delete blob: ${response.status} ${response.statusText}`,
        );
      }
    },
  };
}
