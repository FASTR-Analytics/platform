import type { LogoSectionConfig, SlideDeckConfig } from "../types/slides.ts";

export type BuiltInLogoForAI = { value: string; label: string };

export const LOGO_SECTIONS = ["cover", "header", "footer"] as const;

function quoted(values: readonly string[]): string {
  return values.length === 0
    ? "none"
    : values.map((v) => JSON.stringify(v)).join(", ");
}

function sectionLines(
  name: (typeof LOGO_SECTIONS)[number],
  section: LogoSectionConfig,
): string[] {
  return [
    `logos.${name}.selected: ${quoted(section.selected)}`,
    `logos.${name}.showByDefault: ${section.showByDefault}`,
    `logos.${name}.sizing: ${
      section.sizing === undefined ? "default" : JSON.stringify(section.sizing)
    }`,
  ];
}

// The deck's settings as the model reads them (`get_deck`, and the result of
// `update_deck_settings`): the logos, the footer text and the watermark, under
// their stored names. The theme is the user's and `showPageNumbers` and
// `headerSize` draw nothing, so none of them is shown. Pure over its
// arguments, so the server tests pin the text.
export function formatDeckSettingsForAI(
  config: SlideDeckConfig,
  builtInLogos: readonly BuiltInLogoForAI[],
): string {
  const { logos } = config;
  return [
    "DECK SETTINGS",
    "=".repeat(80),
    "",
    "Built-in logos, selectable in any section:",
    ...builtInLogos.map((l) => `  ${JSON.stringify(l.value)} (${l.label})`),
    `logos.availableCustom (the deck's own logos, selectable in any section): ${
      quoted(logos.availableCustom)
    }`,
    ...LOGO_SECTIONS.flatMap((name) => sectionLines(name, logos[name])),
    'A slide shows a section\'s logos when showByDefault is true, unless its own setting (a cover\'s showLogos, a content slide\'s showHeaderLogos or showFooterLogos) is "hide"; "show" shows them whatever showByDefault says.',
    config.globalFooterText === undefined
      ? "globalFooterText: not set (each content slide shows its own footer)"
      : `globalFooterText: ${
        JSON.stringify(config.globalFooterText)
      } (every content slide shows it in place of its own footer)`,
    `useWatermark: ${config.useWatermark}`,
    `watermarkText: ${JSON.stringify(config.watermarkText)}`,
    "",
  ].join("\n");
}
