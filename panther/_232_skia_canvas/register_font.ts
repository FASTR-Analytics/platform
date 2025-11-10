// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type FontInfo,
  Fonts,
  getFontInfoId,
  getWoffFontAbsoluteFilePath,
} from "./deps.ts";
import { FontRegistrationError } from "./errors.ts";

const registeredFonts: Set<string> = new Set();
const DEBUG_FONTS = false; // Set to true to enable font registration logging

export async function registerFontWithSkiaIfNeeded(
  fontInfo: FontInfo,
): Promise<void> {
  const fontInfoId = getFontInfoId(fontInfo);

  if (registeredFonts.has(fontInfoId)) {
    return;
  }

  if (DEBUG_FONTS) {
    console.log("Registering font", fontInfoId);
  }

  registeredFonts.add(fontInfoId);
  const absFilePath = getWoffFontAbsoluteFilePath(fontInfo);

  try {
    const dataArray = await Deno.readFile(absFilePath);
    if (dataArray.length === 0) {
      throw new FontRegistrationError("Empty font file: " + absFilePath);
    }
    Fonts.register(dataArray);
  } catch (error) {
    registeredFonts.delete(fontInfoId); // Remove from cache if registration failed
    if (error instanceof FontRegistrationError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new FontRegistrationError(
      `Could not read font file: ${absFilePath} - ${errorMessage}`,
    );
  }
}
