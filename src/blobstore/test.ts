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
      data: Blob | Uint8Array | ReadableStream<Uint8Array>,
      opts?: PutOptions,
    ): Promise<void> {
      let bytes: Uint8Array;

      if (data instanceof ReadableStream) {
        // Collect all chunks from the stream
        const chunks: Uint8Array[] = [];
        const reader = data.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }

        // Concatenate chunks into single Uint8Array
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        bytes = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
      } else if (data instanceof Blob) {
        bytes = new Uint8Array(await data.arrayBuffer());
      } else {
        bytes = data;
      }

      blobs.set(key, {
        data: bytes,
        contentType: opts?.contentType ?? "application/octet-stream",
      });
    },

    async get(key: string): Promise<Blob | null> {
      const stored = blobs.get(key);
      if (!stored) return null;
      return new Blob([stored.data.buffer as ArrayBuffer], {
        type: stored.contentType,
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
