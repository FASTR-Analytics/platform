import type { FontInfo, FontWeight } from "@timroberton/panther";

type SlideFontConfig = {
  family: string;
  label: string;
  regularWeight: FontWeight;
  boldWeight: FontWeight;
  letterSpacing: string;
};

export const SLIDE_FONTS: SlideFontConfig[] = [
  { family: "International Inter", label: "Inter", regularWeight: 400, boldWeight: 800, letterSpacing: "-0.02em" },
  { family: "Fira Sans", label: "Fira Sans", regularWeight: 400, boldWeight: 800, letterSpacing: "0" },
  { family: "Merriweather", label: "Merriweather", regularWeight: 400, boldWeight: 700, letterSpacing: "0" },
  { family: "Poppins", label: "Poppins", regularWeight: 400, boldWeight: 700, letterSpacing: "0" },
];

export const SLIDE_FONT_FAMILIES = SLIDE_FONTS.map((f) => f.family) as [string, ...string[]];

export type SlideFontFamily = (typeof SLIDE_FONTS)[number]["family"];

function getFontConfig(family: SlideFontFamily): SlideFontConfig {
  return SLIDE_FONTS.find((f) => f.family === family) ?? SLIDE_FONTS[0];
}

export function getSlideFontInfo(
  family: SlideFontFamily,
  bold: boolean,
  italic: boolean,
): FontInfo {
  const config = getFontConfig(family);
  return {
    fontFamily: config.family,
    weight: bold ? config.boldWeight : config.regularWeight,
    italic,
  };
}

export function getAllSlideFontVariants(family: SlideFontFamily): FontInfo[] {
  const config = getFontConfig(family);
  return [
    { fontFamily: config.family, weight: config.regularWeight, italic: false },
    { fontFamily: config.family, weight: config.regularWeight, italic: true },
    { fontFamily: config.family, weight: config.boldWeight, italic: false },
    { fontFamily: config.family, weight: config.boldWeight, italic: true },
  ];
}

export function getBoldWeight(family: SlideFontFamily): FontWeight {
  return getFontConfig(family).boldWeight;
}

export function getLetterSpacing(family: SlideFontFamily): string {
  return getFontConfig(family).letterSpacing;
}
