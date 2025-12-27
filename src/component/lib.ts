/**
 * Main entry point for the blob store component.
 * Re-exports all public API.
 */

// Public API from ops
export { stat, commitFiles, transact, list } from "./ops.js";

// Public API from transfer
export { prepareUpload, getDownloadUrl } from "./transfer.js";

// Public validators and types
export {
  configValidator,
  fileMetadataValidator,
  destValidator,
  opValidator,
} from "./validators.js";

export type { Config, FileMetadata, Dest, Op } from "./validators.js";
