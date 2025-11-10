// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assertNotUndefined,
  type FontInfo,
  getFontInfoId,
  getHomeDir,
  join,
  toAbsolutePath,
  validateFilePath,
} from "./deps.ts";
import { FONT_MAP_TTF, type FontIdTtf } from "./font_map_data_ttf.ts";
import { FONT_MAP_WOFF, type FontIdWoff } from "./font_map_data_woff.ts";

export function getWoffFontAbsoluteFilePath(
  fontInfoOrId: FontInfo | FontIdWoff,
): string {
  return getFontAbsoluteFilePathBase(
    fontInfoOrId,
    FONT_MAP_WOFF,
    "No font file path for this font info id",
  );
}

export function getTtfFontAbsoluteFilePath(
  fontInfoOrId: FontInfo | FontIdTtf,
): string {
  return getFontAbsoluteFilePathBase(
    fontInfoOrId,
    FONT_MAP_TTF,
    "No TTF font file path for this font info id",
  );
}

export function getDefaultFontDirectory(): string {
  const preferredPath = "/Users/timroberton/projects/FONT_FILES";

  try {
    // Check if the preferred path exists
    Deno.statSync(preferredPath);
    return preferredPath;
  } catch {
    // If preferred path doesn't exist, continue with original logic
    try {
      const homeDir = getHomeDir();
      return join(homeDir, "fonts");
    } catch {
      // Fallback to a hardcoded path if home directory can't be determined
      return "/usr/share/fonts";
    }
  }
}

export function getFontAbsoluteFilePathBase<T extends string>(
  fontInfoOrId: FontInfo | T,
  fontMap: Record<T, string>,
  errorPrefix: string,
): string {
  const fontInfoId = typeof fontInfoOrId === "string"
    ? fontInfoOrId
    : getFontInfoId(fontInfoOrId);

  const relativeFilePath = fontMap[fontInfoId as T];
  assertNotUndefined(relativeFilePath, `${errorPrefix}: ${fontInfoId}`);
  const fontFilesDir = Deno.env.get("FONT_FILES") ?? getDefaultFontDirectory();
  const absolutePath = join(fontFilesDir, relativeFilePath);

  // Validate the path for security
  validateFilePath(absolutePath);

  // Ensure it's an absolute path
  return toAbsolutePath(absolutePath);
}

export function isFontIdValidBase<T extends string>(
  id: string,
  fontMap: Record<T, string>,
): id is T {
  return id in fontMap;
}

export function verifyFontFileExistsBase<T extends string>(
  fontInfoId: T,
  getFontPath: (id: T) => string,
): boolean {
  try {
    const fontPath = getFontPath(fontInfoId);
    // Use Deno's built-in file check
    Deno.statSync(fontPath);
    return true;
  } catch {
    return false;
  }
}

export function verifyAllFontFilesExistBase<T extends string>(
  fontMap: Record<T, string>,
  verifyExists: (id: T) => boolean,
): T[] {
  const missingFonts: T[] = [];

  for (const fontId of Object.keys(fontMap) as T[]) {
    if (!verifyExists(fontId)) {
      missingFonts.push(fontId);
    }
  }

  return missingFonts;
}

// Validation functions for WOFF fonts
export function isWoffFontIdValid(id: string): id is FontIdWoff {
  return isFontIdValidBase(id, FONT_MAP_WOFF);
}

export function verifyWoffFontFileExists(fontInfoId: FontIdWoff): boolean {
  return verifyFontFileExistsBase(fontInfoId, getWoffFontAbsoluteFilePath);
}

export function verifyAllWoffFontFilesExist(): FontIdWoff[] {
  return verifyAllFontFilesExistBase(FONT_MAP_WOFF, verifyWoffFontFileExists);
}

// Validation functions for TTF fonts
export function isTtfFontIdValid(id: string): id is FontIdTtf {
  return isFontIdValidBase(id, FONT_MAP_TTF);
}

export function verifyTtfFontFileExists(fontInfoId: FontIdTtf): boolean {
  return verifyFontFileExistsBase(fontInfoId, getTtfFontAbsoluteFilePath);
}

export function verifyAllTtfFontFilesExist(): FontIdTtf[] {
  return verifyAllFontFilesExistBase(FONT_MAP_TTF, verifyTtfFontFileExists);
}
