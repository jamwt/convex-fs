/**
 * Main entry point for the file storage component.
 * Re-exports all public API.
 */

// Public API from ops
export {
  stat,
  commitFiles,
  transact,
  list,
  copyByPath,
  moveByPath,
  deleteByPath,
  getBlob,
  getFile,
} from "./ops.js";

// Public API from transfer
export { getDownloadUrl, uploadBlob } from "./transfer.js";

// Public validators and types
export {
  configValidator,
  fileMetadataValidator,
  destValidator,
  opValidator,
} from "./validators.js";

export type { Config, FileMetadata, Dest, Op } from "./validators.js";
