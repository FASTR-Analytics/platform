// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Modern API
export { defaultTempManager, TempManager } from "./temp_manager.ts";
export * from "./types.ts";
export * from "./errors.ts";
export * from "./utils.ts";

// Legacy API for backward compatibility
export { clearTempDir, getTempDir } from "./legacy.ts";
