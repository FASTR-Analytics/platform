// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// ================================================================================
// FILE PATH UTILITIES
// ================================================================================

export {
  type AbsoluteFilePath,
  toAbsolutePath,
  validateFilePath,
} from "./path_utils.ts";

// ================================================================================
// FILE SYSTEM UTILITIES
// ================================================================================

export {
  calculateDirSize,
  calculateDirSizeSync,
  setPermissions,
  setPermissionsSync,
  validateFileSize,
} from "./file_system.ts";

// ================================================================================
// MIME TYPE UTILITIES
// ================================================================================

export { getExtension, getMimeType } from "./mime_types.ts";

// ================================================================================
// DIRECTORY UTILITIES
// ================================================================================

export { ensureParentDir, getParentDirectory } from "./directory.ts";

// ================================================================================
// SYSTEM UTILITIES
// ================================================================================

export { getHomeDir, getSystemTempDir } from "./system.ts";

// ================================================================================
// ERROR HANDLING
// ================================================================================

export {
  FileNotFoundError,
  FileOperationError,
  handleFileError,
  InvalidFileContentError,
  PermissionDeniedError,
} from "./errors.ts";

// ================================================================================
// TYPES
// ================================================================================

export { type FileMetadata } from "./types.ts";
