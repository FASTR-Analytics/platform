// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type TempPath = string & { readonly __brand: "TempPath" };

export type TempFilePath = string & { readonly __brand: "TempFilePath" };

export interface TempDirOptions {
  prefix?: string;
  suffix?: string;
  keep?: boolean;
  ttl?: number;
  mode?: number;
}

export interface TempFileOptions extends TempDirOptions {
  extension?: string;
}

export interface TempConfig {
  baseDir?: string;
  debug?: boolean;
  autoCleanup?: boolean;
  maxTotalSize?: number;
  defaultTtl?: number;
  encryptionKey?: Uint8Array;
}

export interface TempItemMetadata {
  path: string;
  type: "file" | "directory";
  created: Date;
  ttl?: number;
  size: number;
  keep: boolean;
}

export interface TempStats {
  totalItems: number;
  totalSize: number;
  directories: number;
  files: number;
  oldestItem: Date | null;
  newestItem: Date | null;
}
