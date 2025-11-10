// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { join } from "./deps.ts";

////////////////////////////////////////////////////////////////////////////////////////////////////////
//  ________  __  __                                                  __                              //
// /        |/  |/  |                                                /  |                             //
// $$$$$$$$/ $$/ $$ |  ______          _______  __    __   _______  _$$ |_     ______   _____  ____   //
// $$ |__    /  |$$ | /      \        /       |/  |  /  | /       |/ $$   |   /      \ /     \/    \  //
// $$    |   $$ |$$ |/$$$$$$  |      /$$$$$$$/ $$ |  $$ |/$$$$$$$/ $$$$$$/   /$$$$$$  |$$$$$$ $$$$  | //
// $$$$$/    $$ |$$ |$$    $$ |      $$      \ $$ |  $$ |$$      \   $$ | __ $$    $$ |$$ | $$ | $$ | //
// $$ |      $$ |$$ |$$$$$$$$/        $$$$$$  |$$ \__$$ | $$$$$$  |  $$ |/  |$$$$$$$$/ $$ | $$ | $$ | //
// $$ |      $$ |$$ |$$       |      /     $$/ $$    $$ |/     $$/   $$  $$/ $$       |$$ | $$ | $$ | //
// $$/       $$/ $$/  $$$$$$$/       $$$$$$$/   $$$$$$$ |$$$$$$$/     $$$$/   $$$$$$$/ $$/  $$/  $$/  //
//                                             /  \__$$ |                                             //
//                                             $$    $$/                                              //
//                                              $$$$$$/                                               //
//                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////

// ================================================================================
// FILE SIZE UTILITIES
// ================================================================================

export function validateFileSize(size: number, maxSizeBytes: number): void {
  if (size > maxSizeBytes) {
    throw new Error(
      `File size ${size} bytes exceeds maximum allowed size of ${maxSizeBytes} bytes`,
    );
  }
}

// ================================================================================
// DIRECTORY SIZE - Complex utility not provided by Deno
// ================================================================================

export async function calculateDirSize(path: string): Promise<number> {
  let totalSize = 0;

  try {
    for await (const entry of Deno.readDir(path)) {
      const entryPath = join(path, entry.name);

      if (entry.isDirectory) {
        totalSize += await calculateDirSize(entryPath);
      } else if (entry.isFile) {
        try {
          const stat = await Deno.stat(entryPath);
          totalSize += stat.size;
        } catch {
          // Ignore files we can't stat
        }
      }
    }
  } catch {
    // Ignore directories we can't read
  }

  return totalSize;
}

export function calculateDirSizeSync(path: string): number {
  let totalSize = 0;

  try {
    for (const entry of Deno.readDirSync(path)) {
      const entryPath = join(path, entry.name);

      if (entry.isDirectory) {
        totalSize += calculateDirSizeSync(entryPath);
      } else if (entry.isFile) {
        try {
          const stat = Deno.statSync(entryPath);
          totalSize += stat.size;
        } catch {
          // Ignore files we can't stat
        }
      }
    }
  } catch {
    // Ignore directories we can't read
  }

  return totalSize;
}

// ================================================================================
// FILE PERMISSIONS - Cross-platform utility
// ================================================================================

export async function setPermissions(
  path: string,
  mode: number,
): Promise<void> {
  if (Deno.build.os !== "windows") {
    await Deno.chmod(path, mode);
  }
}

export function setPermissionsSync(path: string, mode: number): void {
  if (Deno.build.os !== "windows") {
    Deno.chmodSync(path, mode);
  }
}
