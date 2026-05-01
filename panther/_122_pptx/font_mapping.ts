// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

const PPTX_FONT_MAP: Record<string, string> = {
  // Sans-serif → Calibri
  "International Inter": "Calibri",
  "Inter": "Calibri",
  "Inter Display": "Calibri",
  "Inter Variable": "Calibri",
  "Fira Sans": "Calibri",
  "Poppins": "Calibri",
  "Roboto": "Calibri",
  "Gibson": "Calibri",
  "Gibson VF": "Calibri",
  "IBM Plex Sans": "Calibri",
  "IBM Plex Sans Text": "Calibri",
  "IBM Plex Sans ExtLt": "Calibri",
  "IBM Plex Sans Medm": "Calibri",
  "IBM Plex Sans SmBld": "Calibri",
  "Noto Sans": "Calibri",
  "Josefin Sans": "Calibri",
  "Sarabun": "Calibri",
  "Source Sans 3": "Calibri",
  "Söhne": "Calibri",
  "Die Grotesk A": "Calibri",
  "Die Grotesk B": "Calibri",
  "Die Grotesk C": "Calibri",
  "Die Grotesk D": "Calibri",
  "National 2": "Calibri",

  // Sans-serif condensed → Arial Narrow
  "Fira Sans Condensed": "Arial Narrow",
  "IBM Plex Sans Condensed": "Arial Narrow",
  "Roboto Condensed": "Arial Narrow",
  "National 2 Narrow": "Arial Narrow",
  "Pragati Narrow": "Arial Narrow",

  // Serif → Georgia
  "Merriweather": "Georgia",
  "Martina Plantijn": "Georgia",
  "Source Serif 4": "Georgia",
  "Tiempos Text": "Georgia",
  "Tiempos Headline": "Georgia",

  // Monospace → Consolas
  "Roboto Mono": "Consolas",
  "Fira Mono": "Consolas",
};

export function mapFontForPptx(fontFamily: string): string {
  return PPTX_FONT_MAP[fontFamily] ?? fontFamily;
}
