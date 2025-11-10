// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { TempFilePath, TempPath } from "./types.ts";

export function generateUniqueName(prefix?: string, suffix?: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const uuid = crypto.randomUUID().substring(0, 8);

  const parts = [
    prefix || "temp",
    timestamp,
    random,
    uuid,
    suffix || "",
  ].filter(Boolean);

  return parts.join("_");
}

export function asTempPath(path: string): TempPath {
  return path as TempPath;
}

export function asTempFilePath(path: string): TempFilePath {
  return path as TempFilePath;
}

export function simpleEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

export function simpleDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  // XOR encryption is symmetric
  return simpleEncrypt(data, key);
}
