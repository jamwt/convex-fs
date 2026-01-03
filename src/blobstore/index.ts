export type {
  BlobStore,
  BunnyBlobStoreConfig,
  TestBlobStoreConfig,
  UploadUrlOptions,
  DownloadUrlOptions,
  PutOptions,
  DeleteResult,
  // Client-facing type aliases
  BunnyStorageConfig,
  TestStorageConfig,
  StorageConfig,
} from "./types.js";

export { createBunnyBlobStore } from "./bunny.js";
export { createTestBlobStore } from "./test.js";

import type { BlobStore, StorageConfig } from "./types.js";
import { createBunnyBlobStore } from "./bunny.js";
import { createTestBlobStore } from "./test.js";

/**
 * Factory function that creates the appropriate BlobStore based on config type.
 */
export function createBlobStore(config: StorageConfig): BlobStore {
  switch (config.type) {
    case "bunny":
      return createBunnyBlobStore({
        apiKey: config.apiKey,
        storageZoneName: config.storageZoneName,
        region: config.region,
        cdnHostname: config.cdnHostname,
        tokenKey: config.tokenKey,
      });
    case "test":
      return createTestBlobStore();
    default:
      throw new Error(
        `Unknown storage type: ${(config as { type: string }).type}`,
      );
  }
}
