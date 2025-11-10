// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

/////////////////////////////////////////////
//  _______              __      __        //
// /       \            /  |    /  |       //
// $$$$$$$  | ______   _$$ |_   $$ |____   //
// $$ |__$$ |/      \ / $$   |  $$      \  //
// $$    $$/ $$$$$$  |$$$$$$/   $$$$$$$  | //
// $$$$$$$/  /    $$ |  $$ | __ $$ |  $$ | //
// $$ |     /$$$$$$$ |  $$ |/  |$$ |  $$ | //
// $$ |     $$    $$ |  $$  $$/ $$ |  $$ | //
// $$/       $$$$$$$/    $$$$/  $$/   $$/  //
//                                         //
/////////////////////////////////////////////

// ================================================================================
// TYPES
// ================================================================================

export type AbsoluteFilePath = string & {
  readonly __brand: "AbsoluteFilePath";
};

// ================================================================================
// PATH VALIDATION
// ================================================================================

export function validateFilePath(filePath: string): void {
  if (!filePath || filePath.trim() === "") {
    throw new Error("File path cannot be empty");
  }

  // Check for null bytes
  if (filePath.includes("\0")) {
    throw new Error("File path contains invalid characters");
  }

  // Check for relative path traversal
  if (filePath.includes("..")) {
    throw new Error("File path cannot contain '..' for security reasons");
  }
}

export function toAbsolutePath(filePath: string): AbsoluteFilePath {
  validateFilePath(filePath);

  // Convert to absolute using Deno's built-in
  const absolute = Deno.build.os === "windows"
    ? filePath.startsWith("/") || filePath.match(/^[A-Za-z]:[\\/]/)
      ? filePath
      : Deno.cwd() + "\\" + filePath
    : filePath.startsWith("/")
    ? filePath
    : Deno.cwd() + "/" + filePath;

  return absolute as AbsoluteFilePath;
}
