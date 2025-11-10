// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { defaultTempManager } from "./temp_manager.ts";

export function getTempDir(): string {
  const path = defaultTempManager.createTempDirSync();
  // Return as string for backward compatibility
  return path;
}

export function clearTempDir(): void {
  // This used to clear a specific hardcoded directory
  // Now it cleans up all managed temp items
  defaultTempManager.cleanupAll().catch(console.error);
}
