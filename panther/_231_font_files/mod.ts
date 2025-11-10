// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  getDefaultFontDirectory,
  getTtfFontAbsoluteFilePath,
  getWoffFontAbsoluteFilePath,
  isTtfFontIdValid,
  isWoffFontIdValid,
  verifyAllTtfFontFilesExist,
  verifyAllWoffFontFilesExist,
  verifyTtfFontFileExists,
  verifyWoffFontFileExists,
} from "./get_font_absolute_file_path.ts";

export { FONT_MAP_WOFF, type FontIdWoff } from "./font_map_data_woff.ts";
export { FONT_MAP_TTF, type FontIdTtf } from "./font_map_data_ttf.ts";
