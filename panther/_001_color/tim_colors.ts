// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export const TIM_COLORS = {
  DarkBlue: "#003f5c",
  Black: "#000000",
  White: "#ffffff",
  UWABlue: "#20409A",
  UWAGold: "#DAAA00",
  UWAYellow: "#FFD100",
  UWAOrange: "#FF8200",
  UWATeal: "#00B2A9",
};

// chroma.scale([TIM_COLORS.DarkBlue, TIM_COLORS.White]).mode("lch").colors(20);
const PALETTE_DARKBLUE_TO_WHITE_20 = [
  "#003f5c",
  "#184864",
  "#28516c",
  "#365a74",
  "#42637c",
  "#4f6d84",
  "#5b768d",
  "#678095",
  "#748a9d",
  "#8094a6",
  "#8c9eaf",
  "#99a9b7",
  "#a5b3c0",
  "#b2bec9",
  "#bec8d2",
  "#cbd3db",
  "#d8dee4",
  "#e5e9ed",
  "#f2f4f6",
  "#ffffff",
];

// chroma.scale([TIM_COLORS.Black, TIM_COLORS.White]).mode("lch").colors(20);
const PALETTE_BLACK_TO_WHITE_20 = [
  "#000000",
  "#121212",
  "#1d1d1d",
  "#272727",
  "#333333",
  "#3e3e3e",
  "#4a4a4a",
  "#575757",
  "#636363",
  "#707070",
  "#7e7e7e",
  "#8b8b8b",
  "#999999",
  "#a7a7a7",
  "#b5b5b5",
  "#c3c3c3",
  "#d2d2d2",
  "#e1e1e1",
  "#f0f0f0",
  "#ffffff",
];
export const TIM_COLOR_SETS = {
  DarkBlue: {
    base100: PALETTE_DARKBLUE_TO_WHITE_20[19],
    base200: PALETTE_DARKBLUE_TO_WHITE_20[18],
    base300: PALETTE_DARKBLUE_TO_WHITE_20[17],
    baseContent: TIM_COLORS.DarkBlue,
    baseContentLessVisible: PALETTE_DARKBLUE_TO_WHITE_20[5],
    primary: "#000C5C",
    primaryContent: TIM_COLORS.White,
  },
  DarkBlueInverted: {
    base100: PALETTE_DARKBLUE_TO_WHITE_20[0],
    base200: PALETTE_DARKBLUE_TO_WHITE_20[1],
    base300: PALETTE_DARKBLUE_TO_WHITE_20[2],
    baseContent: PALETTE_DARKBLUE_TO_WHITE_20[19],
    baseContentLessVisible: PALETTE_DARKBLUE_TO_WHITE_20[17],
    primary: TIM_COLORS.White,
    primaryContent: "#000C5C",
  },
  DarkRed: {
    base100: PALETTE_DARKBLUE_TO_WHITE_20[19],
    base200: PALETTE_DARKBLUE_TO_WHITE_20[18],
    base300: PALETTE_DARKBLUE_TO_WHITE_20[17],
    baseContent: "red",
    baseContentLessVisible: "pink",
    primary: "purple",
    primaryContent: TIM_COLORS.White,
  },
  UWA: {
    base100: PALETTE_BLACK_TO_WHITE_20[19],
    base200: PALETTE_BLACK_TO_WHITE_20[18],
    base300: PALETTE_BLACK_TO_WHITE_20[17],
    baseContent: TIM_COLORS.Black,
    baseContentLessVisible: PALETTE_BLACK_TO_WHITE_20[8],
    primary: TIM_COLORS.UWABlue,
    primaryContent: TIM_COLORS.White,
  },
  CarbonDark: {
    base100: "#262626",
    base200: "#393939",
    base300: "#525252",
    baseContent: "#F4F4F4",
    baseContentLessVisible: "#A8A8A8",
    primary: "#002D9C",
    primaryContent: "#D0E2FF",
  },
};
