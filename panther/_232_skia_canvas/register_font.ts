// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomStyle,
  type FontInfo,
  Fonts,
  getFontInfoId,
  getWoffFontAbsoluteFilePath,
} from "./deps.ts";
import { FontRegistrationError } from "./errors.ts";

// A load is stored from the moment it starts, so a concurrent caller awaits it
// instead of returning at once and measuring in Skia's fallback font.
const fontLoads: Map<string, Promise<void>> = new Map();

export function registerFontWithSkiaIfNeeded(
  fontInfo: FontInfo,
): Promise<void> {
  const fontInfoId = getFontInfoId(fontInfo);
  const existing = fontLoads.get(fontInfoId);
  if (existing !== undefined) {
    return existing;
  }
  const load = registerFont(fontInfo).catch((error) => {
    fontLoads.delete(fontInfoId);
    throw error;
  });
  fontLoads.set(fontInfoId, load);
  return load;
}

async function registerFont(fontInfo: FontInfo): Promise<void> {
  const absFilePath = getWoffFontAbsoluteFilePath(fontInfo);
  try {
    const dataArray = await Deno.readFile(absFilePath);
    if (dataArray.length === 0) {
      throw new FontRegistrationError("Empty font file: " + absFilePath);
    }
    Fonts.register(dataArray);
  } catch (error) {
    if (error instanceof FontRegistrationError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new FontRegistrationError(
      `Could not read font file: ${absFilePath} - ${errorMessage}`,
    );
  }
}

export async function registerGlobalFontsWithSkia(): Promise<void> {
  const fonts = new CustomStyle().getFontsToRegister();
  for (const font of fonts) {
    await registerFontWithSkiaIfNeeded(font);
  }
}
