export type {
  BlobStore,
  BunnyBlobStoreConfig,
  TestBlobStoreConfig,
  UploadUrlOptions,
  DownloadUrlOptions,
  PutOptions,
  DeleteResult,
} from "./types.js";

export { MAX_FILE_SIZE_BYTES } from "./types.js";

export { createBunnyBlobStore } from "./bunny.js";
export { createTestBlobStore } from "./test.js";

import type {
  BlobStore,
  BunnyBlobStoreConfig,
  TestBlobStoreConfig,
} from "./types.js";
import { createBunnyBlobStore } from "./bunny.js";
import { createTestBlobStore } from "./test.js";

/**
 * Storage configuration type.
 * Supports Bunny.net Edge Storage and in-memory test storage.
 */
export type StorageConfig =
  | ({ type: "bunny" } & BunnyBlobStoreConfig)
  | ({ type: "test" } & TestBlobStoreConfig);

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
