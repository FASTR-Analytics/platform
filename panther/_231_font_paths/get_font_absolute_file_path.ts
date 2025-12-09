// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assertNotUndefined,
  FONT_MAP,
  type FontId,
  type FontInfo,
  getFontInfoId,
  getHomeDir,
  join,
  toAbsolutePath,
  validateFilePath,
} from "./deps.ts";

export function getWoffFontAbsoluteFilePath(
  fontInfoOrId: FontInfo | FontId,
): string {
  return getFontAbsoluteFilePathWithExtension(fontInfoOrId, ".woff");
}

export function getTtfFontAbsoluteFilePath(
  fontInfoOrId: FontInfo | FontId,
): string {
  return getFontAbsoluteFilePathWithExtension(fontInfoOrId, ".ttf");
}

export function getDefaultFontDirectory(): string {
  const preferredPath = "/Users/timroberton/projects/FONT_FILES";

  try {
    Deno.statSync(preferredPath);
    return preferredPath;
  } catch {
    try {
      const homeDir = getHomeDir();
      return join(homeDir, "fonts");
    } catch {
      return "/usr/share/fonts";
    }
  }
}

function getFontAbsoluteFilePathWithExtension(
  fontInfoOrId: FontInfo | FontId,
  extension: string,
): string {
  const fontInfoId = typeof fontInfoOrId === "string"
    ? fontInfoOrId
    : getFontInfoId(fontInfoOrId);

  const relativeFilePath = FONT_MAP[fontInfoId as FontId];
  assertNotUndefined(relativeFilePath, `No font file path for: ${fontInfoId}`);
  const fontFilesDir = Deno.env.get("FONT_FILES") ?? getDefaultFontDirectory();
  const absolutePath = join(fontFilesDir, relativeFilePath + extension);

  validateFilePath(absolutePath);
  return toAbsolutePath(absolutePath);
}

export function isFontIdValid(id: string): id is FontId {
  return id in FONT_MAP;
}

export function verifyWoffFontFileExists(fontInfoId: FontId): boolean {
  return verifyFontFileExists(fontInfoId, getWoffFontAbsoluteFilePath);
}

export function verifyTtfFontFileExists(fontInfoId: FontId): boolean {
  return verifyFontFileExists(fontInfoId, getTtfFontAbsoluteFilePath);
}

function verifyFontFileExists(
  fontInfoId: FontId,
  getFontPath: (id: FontId) => string,
): boolean {
  try {
    const fontPath = getFontPath(fontInfoId);
    Deno.statSync(fontPath);
    return true;
  } catch {
    return false;
  }
}

export function verifyAllWoffFontFilesExist(): FontId[] {
  return verifyAllFontFilesExist(verifyWoffFontFileExists);
}

export function verifyAllTtfFontFilesExist(): FontId[] {
  return verifyAllFontFilesExist(verifyTtfFontFileExists);
}

function verifyAllFontFilesExist(
  verifyExists: (id: FontId) => boolean,
): FontId[] {
  const missingFonts: FontId[] = [];
  for (const fontId of Object.keys(FONT_MAP) as FontId[]) {
    if (!verifyExists(fontId)) {
      missingFonts.push(fontId);
    }
  }
  return missingFonts;
}
