export type {
  BlobStore,
  BunnyBlobStoreConfig,
  BlobMetadata,
  UploadUrlOptions,
  DownloadUrlOptions,
  PutOptions,
  DeleteResult,
} from "./types.js";

export { createBunnyBlobStore } from "./bunny.js";

import type { BlobStore, BunnyBlobStoreConfig } from "./types.js";
import { createBunnyBlobStore } from "./bunny.js";

/**
 * Storage configuration type.
 * Currently only supports Bunny.net Edge Storage.
 */
export type StorageConfig = { type: "bunny" } & BunnyBlobStoreConfig;

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
    default:
      throw new Error(
        `Unknown storage type: ${(config as { type: string }).type}`,
      );
  }
}
