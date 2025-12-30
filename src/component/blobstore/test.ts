import type { BlobStore, DeleteResult, PutOptions } from "./types.js";

/**
 * In-memory BlobStore for testing.
 *
 * NOT for production use - blobs are stored in-memory and don't persist
 * across Convex function invocations. This is only useful in convex-test
 * where everything runs in a single process.
 */
export function createTestBlobStore(): BlobStore & {
  /** Access stored blobs for test assertions */
  _blobs: Map<string, { data: Uint8Array; contentType: string }>;
} {
  const blobs = new Map<string, { data: Uint8Array; contentType: string }>();

  return {
    _blobs: blobs,

    async generateUploadUrl(): Promise<string> {
      throw new Error(
        "Test store does not support presigned upload URLs. Use put() directly.",
      );
    },

    async generateDownloadUrl(key: string): Promise<string> {
      return `test://${key}`;
    },

    async put(
      key: string,
      data: Blob | Uint8Array,
      opts?: PutOptions,
    ): Promise<void> {
      const bytes =
        data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data;
      blobs.set(key, {
        data: bytes,
        contentType: opts?.contentType ?? "application/octet-stream",
      });
    },

    async delete(key: string): Promise<DeleteResult> {
      if (blobs.has(key)) {
        blobs.delete(key);
        return { status: "deleted" };
      }
      return { status: "not_found" };
    },
  };
}
