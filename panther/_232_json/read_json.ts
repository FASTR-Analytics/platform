// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  handleFileError,
  InvalidFileContentError,
  validateFilePath,
} from "./deps.ts";

export async function readJsonFile<T = unknown>(filePath: string): Promise<T> {
  validateFilePath(filePath);

  try {
    const content = await Deno.readTextFile(filePath);

    // Handle empty files
    if (content.trim() === "") {
      throw new InvalidFileContentError(filePath, "JSON file is empty");
    }

    // Handle BOM (Byte Order Mark)
    const cleanContent = content.replace(/^\uFEFF/, "");

    return JSON.parse(cleanContent);
  } catch (error) {
    if (error instanceof InvalidFileContentError) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw new InvalidFileContentError(
        filePath,
        `Invalid JSON: ${error.message}`,
      );
    }
    handleFileError(error, filePath, "read", "JSON");
  }
}

export async function readJsonFileOrUndefined<T = unknown>(
  filePath: string,
): Promise<T | undefined> {
  try {
    return await readJsonFile<T>(filePath);
  } catch {
    return undefined;
  }
}
