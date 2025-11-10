// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { FontInfo, KeyFonts } from "./types.ts";

type TimFontOption =
  // Alegreya
  | "Alegreya_400"
  | "Alegreya_400_Italic"
  | "Alegreya_500"
  | "Alegreya_500_Italic"
  | "Alegreya_600"
  | "Alegreya_600_Italic"
  | "Alegreya_700"
  | "Alegreya_700_Italic"
  | "Alegreya_800"
  | "Alegreya_800_Italic"
  | "Alegreya_900"
  | "Alegreya_900_Italic"
  // Cambria
  | "Cambria"
  | "Cambria_Bold"
  | "Cambria_Italic"
  | "Cambria_Bold_Italic"
  // Fira Mono
  | "FiraMono_400"
  | "FiraMono_500"
  | "FiraMono_700"
  // Fira Sans
  | "FiraSans_100"
  | "FiraSans_100_Italic"
  | "FiraSans_200"
  | "FiraSans_200_Italic"
  | "FiraSans_300"
  | "FiraSans_300_Italic"
  | "FiraSans_400"
  | "FiraSans_400_Italic"
  | "FiraSans_500"
  | "FiraSans_500_Italic"
  | "FiraSans_600"
  | "FiraSans_600_Italic"
  | "FiraSans_700"
  | "FiraSans_700_Italic"
  | "FiraSans_800"
  | "FiraSans_800_Italic"
  | "FiraSans_900"
  | "FiraSans_900_Italic"
  // Fira Sans Condensed
  | "FiraSansCondensed_100"
  | "FiraSansCondensed_100_Italic"
  | "FiraSansCondensed_200"
  | "FiraSansCondensed_200_Italic"
  | "FiraSansCondensed_300"
  | "FiraSansCondensed_300_Italic"
  | "FiraSansCondensed_400"
  | "FiraSansCondensed_400_Italic"
  | "FiraSansCondensed_500"
  | "FiraSansCondensed_500_Italic"
  | "FiraSansCondensed_600"
  | "FiraSansCondensed_600_Italic"
  | "FiraSansCondensed_700"
  | "FiraSansCondensed_700_Italic"
  | "FiraSansCondensed_800"
  | "FiraSansCondensed_800_Italic"
  | "FiraSansCondensed_900"
  | "FiraSansCondensed_900_Italic"
  // Gibson
  | "Gibson_100"
  | "Gibson_100_Italic"
  | "Gibson_200"
  | "Gibson_200_Italic"
  | "Gibson_300"
  | "Gibson_300_Italic"
  | "Gibson_400"
  | "Gibson_400_Italic"
  | "Gibson_500"
  | "Gibson_500_Italic"
  | "Gibson_600"
  | "Gibson_600_Italic"
  | "Gibson_700"
  | "Gibson_700_Italic"
  | "Gibson_800"
  | "Gibson_800_Italic"
  | "Gibson_900"
  | "Gibson_900_Italic"
  // IBM Plex Sans Condensed
  | "IBMPlexSansCondensed_100"
  | "IBMPlexSansCondensed_100_Italic"
  | "IBMPlexSansCondensed_200"
  | "IBMPlexSansCondensed_200_Italic"
  | "IBMPlexSansCondensed_300"
  | "IBMPlexSansCondensed_300_Italic"
  | "IBMPlexSansCondensed_400"
  | "IBMPlexSansCondensed_400_Italic"
  | "IBMPlexSansCondensed_500"
  | "IBMPlexSansCondensed_500_Italic"
  | "IBMPlexSansCondensed_600"
  | "IBMPlexSansCondensed_600_Italic"
  | "IBMPlexSansCondensed_700"
  | "IBMPlexSansCondensed_700_Italic"
  // Inter
  | "Inter_100"
  | "Inter_100_Italic"
  | "Inter_200"
  | "Inter_200_Italic"
  | "Inter_300"
  | "Inter_300_Italic"
  | "Inter_400"
  | "Inter_400_Italic"
  | "Inter_500"
  | "Inter_500_Italic"
  | "Inter_600"
  | "Inter_600_Italic"
  | "Inter_700"
  | "Inter_700_Italic"
  | "Inter_800"
  | "Inter_800_Italic"
  | "Inter_900"
  | "Inter_900_Italic"
  // Inter Display
  | "InterDisplay_100"
  | "InterDisplay_100_Italic"
  | "InterDisplay_200"
  | "InterDisplay_200_Italic"
  | "InterDisplay_300"
  | "InterDisplay_300_Italic"
  | "InterDisplay_400"
  | "InterDisplay_400_Italic"
  | "InterDisplay_500"
  | "InterDisplay_500_Italic"
  | "InterDisplay_600"
  | "InterDisplay_600_Italic"
  | "InterDisplay_700"
  | "InterDisplay_700_Italic"
  | "InterDisplay_800"
  | "InterDisplay_800_Italic"
  | "InterDisplay_900"
  | "InterDisplay_900_Italic"
  // Merriweather
  | "Merriweather_300"
  | "Merriweather_300_Italic"
  | "Merriweather_400"
  | "Merriweather_400_Italic"
  | "Merriweather_700"
  | "Merriweather_700_Italic"
  | "Merriweather_900"
  | "Merriweather_900_Italic"
  // National 2
  | "National2_400"
  | "National2_400_Italic"
  | "National2_700"
  | "National2_700_Italic"
  | "National2_800"
  | "National2_900"
  | "National2Narrow_400"
  | "National2Narrow_400_Italic"
  // Noto Sans
  | "NotoSans_100"
  | "NotoSans_100_Italic"
  | "NotoSans_200"
  | "NotoSans_200_Italic"
  | "NotoSans_300"
  | "NotoSans_300_Italic"
  | "NotoSans_400"
  | "NotoSans_400_Italic"
  | "NotoSans_500"
  | "NotoSans_500_Italic"
  | "NotoSans_600"
  | "NotoSans_600_Italic"
  | "NotoSans_700"
  | "NotoSans_700_Italic"
  | "NotoSans_800"
  | "NotoSans_800_Italic"
  | "NotoSans_900"
  | "NotoSans_900_Italic"
  // Noto Sans Ethiopic
  | "NotoSansEthiopic_100"
  | "NotoSansEthiopic_200"
  | "NotoSansEthiopic_300"
  | "NotoSansEthiopic_400"
  | "NotoSansEthiopic_500"
  | "NotoSansEthiopic_600"
  | "NotoSansEthiopic_700"
  | "NotoSansEthiopic_800"
  | "NotoSansEthiopic_900"
  // Poppins
  | "Poppins_100"
  | "Poppins_100_Italic"
  | "Poppins_200"
  | "Poppins_200_Italic"
  | "Poppins_300"
  | "Poppins_300_Italic"
  | "Poppins_400"
  | "Poppins_400_Italic"
  | "Poppins_500"
  | "Poppins_500_Italic"
  | "Poppins_600"
  | "Poppins_600_Italic"
  | "Poppins_700"
  | "Poppins_700_Italic"
  | "Poppins_800"
  | "Poppins_800_Italic"
  | "Poppins_900"
  | "Poppins_900_Italic"
  // Pragati Narrow
  | "PragatiNarrow_400"
  | "PragatiNarrow_700"
  // Reddit Sans
  | "RedditSans_200"
  | "RedditSans_200_Italic"
  | "RedditSans_300"
  | "RedditSans_300_Italic"
  | "RedditSans_400"
  | "RedditSans_400_Italic"
  | "RedditSans_500"
  | "RedditSans_500_Italic"
  | "RedditSans_600"
  | "RedditSans_600_Italic"
  | "RedditSans_700"
  | "RedditSans_700_Italic"
  | "RedditSans_800"
  | "RedditSans_800_Italic"
  | "RedditSans_900"
  | "RedditSans_900_Italic"
  // Roboto
  | "Roboto_100"
  | "Roboto_100_Italic"
  | "Roboto_300"
  | "Roboto_300_Italic"
  | "Roboto_400"
  | "Roboto_400_Italic"
  | "Roboto_500"
  | "Roboto_500_Italic"
  | "Roboto_700"
  | "Roboto_700_Italic"
  | "Roboto_900"
  | "Roboto_900_Italic"
  // Roboto Condensed
  | "RobotoCondensed_300"
  | "RobotoCondensed_300_Italic"
  | "RobotoCondensed_400"
  | "RobotoCondensed_400_Italic"
  | "RobotoCondensed_700"
  | "RobotoCondensed_700_Italic"
  // Roboto Mono
  | "RobotoMono_100"
  | "RobotoMono_100_Italic"
  | "RobotoMono_200"
  | "RobotoMono_200_Italic"
  | "RobotoMono_300"
  | "RobotoMono_300_Italic"
  | "RobotoMono_400"
  | "RobotoMono_400_Italic"
  | "RobotoMono_500"
  | "RobotoMono_500_Italic"
  | "RobotoMono_600"
  | "RobotoMono_600_Italic"
  | "RobotoMono_700"
  | "RobotoMono_700_Italic"
  // Sarabun
  | "Sarabun_100"
  | "Sarabun_100_Italic"
  | "Sarabun_200"
  | "Sarabun_200_Italic"
  | "Sarabun_300"
  | "Sarabun_300_Italic"
  | "Sarabun_400"
  | "Sarabun_400_Italic"
  | "Sarabun_500"
  | "Sarabun_500_Italic"
  | "Sarabun_600"
  | "Sarabun_600_Italic"
  | "Sarabun_700"
  | "Sarabun_700_Italic"
  | "Sarabun_800"
  | "Sarabun_800_Italic"
  // Source Sans 3
  | "SourceSans3_200"
  | "SourceSans3_200_Italic"
  | "SourceSans3_300"
  | "SourceSans3_300_Italic"
  | "SourceSans3_400"
  | "SourceSans3_400_Italic"
  | "SourceSans3_500"
  | "SourceSans3_500_Italic"
  | "SourceSans3_600"
  | "SourceSans3_600_Italic"
  | "SourceSans3_700"
  | "SourceSans3_700_Italic"
  | "SourceSans3_800"
  | "SourceSans3_800_Italic"
  | "SourceSans3_900"
  | "SourceSans3_900_Italic"
  // Source Serif 4
  | "SourceSerif4_200"
  | "SourceSerif4_200_Italic"
  | "SourceSerif4_300"
  | "SourceSerif4_300_Italic"
  | "SourceSerif4_400"
  | "SourceSerif4_400_Italic"
  | "SourceSerif4_500"
  | "SourceSerif4_500_Italic"
  | "SourceSerif4_600"
  | "SourceSerif4_600_Italic"
  | "SourceSerif4_700"
  | "SourceSerif4_700_Italic"
  | "SourceSerif4_800"
  | "SourceSerif4_800_Italic"
  | "SourceSerif4_900"
  | "SourceSerif4_900_Italic";

export const TIM_FONTS: Record<TimFontOption, FontInfo> = {
  // Alegreya
  Alegreya_400: {
    fontFamily: "'Alegreya'",
    weight: 400,
    italic: false,
  },
  Alegreya_400_Italic: {
    fontFamily: "'Alegreya'",
    weight: 400,
    italic: true,
  },
  Alegreya_500: {
    fontFamily: "'Alegreya'",
    weight: 500,
    italic: false,
  },
  Alegreya_500_Italic: {
    fontFamily: "'Alegreya'",
    weight: 500,
    italic: true,
  },
  Alegreya_600: {
    fontFamily: "'Alegreya'",
    weight: 600,
    italic: false,
  },
  Alegreya_600_Italic: {
    fontFamily: "'Alegreya'",
    weight: 600,
    italic: true,
  },
  Alegreya_700: {
    fontFamily: "'Alegreya'",
    weight: 700,
    italic: false,
  },
  Alegreya_700_Italic: {
    fontFamily: "'Alegreya'",
    weight: 700,
    italic: true,
  },
  Alegreya_800: {
    fontFamily: "'Alegreya'",
    weight: 800,
    italic: false,
  },
  Alegreya_800_Italic: {
    fontFamily: "'Alegreya'",
    weight: 800,
    italic: true,
  },
  Alegreya_900: {
    fontFamily: "'Alegreya'",
    weight: 900,
    italic: false,
  },
  Alegreya_900_Italic: {
    fontFamily: "'Alegreya'",
    weight: 900,
    italic: true,
  },

  // Cambria
  Cambria: {
    fontFamily: "'Cambria'",
    weight: 400,
    italic: false,
  },
  Cambria_Bold: {
    fontFamily: "'Cambria'",
    weight: 700,
    italic: false,
  },
  Cambria_Italic: {
    fontFamily: "'Cambria'",
    weight: 400,
    italic: true,
  },
  Cambria_Bold_Italic: {
    fontFamily: "'Cambria'",
    weight: 700,
    italic: true,
  },

  // Fira Mono
  FiraMono_400: {
    fontFamily: "'Fira Mono'",
    weight: 400,
    italic: false,
  },
  FiraMono_500: {
    fontFamily: "'Fira Mono'",
    weight: 500,
    italic: false,
  },
  FiraMono_700: {
    fontFamily: "'Fira Mono'",
    weight: 700,
    italic: false,
  },

  // Fira Sans
  FiraSans_100: {
    fontFamily: "'Fira Sans Thin'",
    weight: 100,
    italic: false,
  },
  FiraSans_100_Italic: {
    fontFamily: "'Fira Sans Thin'",
    weight: 100,
    italic: true,
  },
  FiraSans_200: {
    fontFamily: "'Fira Sans ExtraLight'",
    weight: 200,
    italic: false,
  },
  FiraSans_200_Italic: {
    fontFamily: "'Fira Sans ExtraLight'",
    weight: 200,
    italic: true,
  },
  FiraSans_300: {
    fontFamily: "'Fira Sans Light'",
    weight: 300,
    italic: false,
  },
  FiraSans_300_Italic: {
    fontFamily: "'Fira Sans Light'",
    weight: 300,
    italic: true,
  },
  FiraSans_400: {
    fontFamily: "'Fira Sans'",
    weight: 400,
    italic: false,
  },
  FiraSans_400_Italic: {
    fontFamily: "'Fira Sans'",
    weight: 400,
    italic: true,
  },
  FiraSans_500: {
    fontFamily: "'Fira Sans Medium'",
    weight: 500,
    italic: false,
  },
  FiraSans_500_Italic: {
    fontFamily: "'Fira Sans Medium'",
    weight: 500,
    italic: true,
  },
  FiraSans_600: {
    fontFamily: "'Fira Sans SemiBold'",
    weight: 600,
    italic: false,
  },
  FiraSans_600_Italic: {
    fontFamily: "'Fira Sans SemiBold'",
    weight: 600,
    italic: true,
  },
  FiraSans_700: {
    fontFamily: "'Fira Sans'",
    weight: 700,
    italic: false,
  },
  FiraSans_700_Italic: {
    fontFamily: "'Fira Sans'",
    weight: 700,
    italic: true,
  },
  FiraSans_800: {
    fontFamily: "'Fira Sans ExtraBold'",
    weight: 800,
    italic: false,
  },
  FiraSans_800_Italic: {
    fontFamily: "'Fira Sans ExtraBold'",
    weight: 800,
    italic: true,
  },
  FiraSans_900: {
    fontFamily: "'Fira Sans Black'",
    weight: 900,
    italic: false,
  },
  FiraSans_900_Italic: {
    fontFamily: "'Fira Sans Black'",
    weight: 900,
    italic: true,
  },

  // Fira Sans Condensed
  FiraSansCondensed_100: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 100,
    italic: false,
  },
  FiraSansCondensed_100_Italic: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 100,
    italic: true,
  },
  FiraSansCondensed_200: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 200,
    italic: false,
  },
  FiraSansCondensed_200_Italic: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 200,
    italic: true,
  },
  FiraSansCondensed_300: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 300,
    italic: false,
  },
  FiraSansCondensed_300_Italic: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 300,
    italic: true,
  },
  FiraSansCondensed_400: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 400,
    italic: false,
  },
  FiraSansCondensed_400_Italic: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 400,
    italic: true,
  },
  FiraSansCondensed_500: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 500,
    italic: false,
  },
  FiraSansCondensed_500_Italic: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 500,
    italic: true,
  },
  FiraSansCondensed_600: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 600,
    italic: false,
  },
  FiraSansCondensed_600_Italic: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 600,
    italic: true,
  },
  FiraSansCondensed_700: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 700,
    italic: false,
  },
  FiraSansCondensed_700_Italic: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 700,
    italic: true,
  },
  FiraSansCondensed_800: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 800,
    italic: false,
  },
  FiraSansCondensed_800_Italic: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 800,
    italic: true,
  },
  FiraSansCondensed_900: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 900,
    italic: false,
  },
  FiraSansCondensed_900_Italic: {
    fontFamily: "'Fira Sans Condensed'",
    weight: 900,
    italic: true,
  },

  // Gibson
  Gibson_100: {
    fontFamily: "'Gibson Thin'",
    weight: 100,
    italic: false,
  },
  Gibson_100_Italic: {
    fontFamily: "'Gibson Thin'",
    weight: 100,
    italic: true,
  },
  Gibson_200: {
    fontFamily: "'Gibson Light'",
    weight: 200,
    italic: false,
  },
  Gibson_200_Italic: {
    fontFamily: "'Gibson Light'",
    weight: 200,
    italic: true,
  },
  Gibson_300: {
    fontFamily: "'Gibson Book'",
    weight: 300,
    italic: false,
  },
  Gibson_300_Italic: {
    fontFamily: "'Gibson Book'",
    weight: 300,
    italic: true,
  },
  Gibson_400: {
    fontFamily: "'Gibson'",
    weight: 400,
    italic: false,
  },
  Gibson_400_Italic: {
    fontFamily: "'Gibson'",
    weight: 400,
    italic: true,
  },
  Gibson_500: {
    fontFamily: "'Gibson Medium'",
    weight: 500,
    italic: false,
  },
  Gibson_500_Italic: {
    fontFamily: "'Gibson Medium'",
    weight: 500,
    italic: true,
  },
  Gibson_600: {
    fontFamily: "'Gibson SemiBold'",
    weight: 600,
    italic: false,
  },
  Gibson_600_Italic: {
    fontFamily: "'Gibson SemiBold'",
    weight: 600,
    italic: true,
  },
  Gibson_700: {
    fontFamily: "'Gibson'",
    weight: 700,
    italic: false,
  },
  Gibson_700_Italic: {
    fontFamily: "'Gibson'",
    weight: 700,
    italic: true,
  },
  Gibson_800: {
    fontFamily: "'Gibson ExtraBold'",
    weight: 800,
    italic: false,
  },
  Gibson_800_Italic: {
    fontFamily: "'Gibson ExtraBold'",
    weight: 800,
    italic: true,
  },
  Gibson_900: {
    fontFamily: "'Gibson Heavy'",
    weight: 900,
    italic: false,
  },
  Gibson_900_Italic: {
    fontFamily: "'Gibson Heavy'",
    weight: 900,
    italic: true,
  },

  // IBM Plex Sans Condensed
  IBMPlexSansCondensed_100: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 100,
    italic: false,
  },
  IBMPlexSansCondensed_100_Italic: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 100,
    italic: true,
  },
  IBMPlexSansCondensed_200: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 200,
    italic: false,
  },
  IBMPlexSansCondensed_200_Italic: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 200,
    italic: true,
  },
  IBMPlexSansCondensed_300: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 300,
    italic: false,
  },
  IBMPlexSansCondensed_300_Italic: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 300,
    italic: true,
  },
  IBMPlexSansCondensed_400: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 400,
    italic: false,
  },
  IBMPlexSansCondensed_400_Italic: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 400,
    italic: true,
  },
  IBMPlexSansCondensed_500: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 500,
    italic: false,
  },
  IBMPlexSansCondensed_500_Italic: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 500,
    italic: true,
  },
  IBMPlexSansCondensed_600: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 600,
    italic: false,
  },
  IBMPlexSansCondensed_600_Italic: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 600,
    italic: true,
  },
  IBMPlexSansCondensed_700: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 700,
    italic: false,
  },
  IBMPlexSansCondensed_700_Italic: {
    fontFamily: "'IBM Plex Sans Condensed'",
    weight: 700,
    italic: true,
  },

  // Inter
  Inter_100: {
    fontFamily: "'Inter'",
    weight: 100,
    italic: false,
  },
  Inter_100_Italic: {
    fontFamily: "'Inter'",
    weight: 100,
    italic: true,
  },
  Inter_200: {
    fontFamily: "'Inter'",
    weight: 200,
    italic: false,
  },
  Inter_200_Italic: {
    fontFamily: "'Inter'",
    weight: 200,
    italic: true,
  },
  Inter_300: {
    fontFamily: "'Inter'",
    weight: 300,
    italic: false,
  },
  Inter_300_Italic: {
    fontFamily: "'Inter'",
    weight: 300,
    italic: true,
  },
  Inter_400: {
    fontFamily: "'Inter'",
    weight: 400,
    italic: false,
  },
  Inter_400_Italic: {
    fontFamily: "'Inter'",
    weight: 400,
    italic: true,
  },
  Inter_500: {
    fontFamily: "'Inter'",
    weight: 500,
    italic: false,
  },
  Inter_500_Italic: {
    fontFamily: "'Inter'",
    weight: 500,
    italic: true,
  },
  Inter_600: {
    fontFamily: "'Inter'",
    weight: 600,
    italic: false,
  },
  Inter_600_Italic: {
    fontFamily: "'Inter'",
    weight: 600,
    italic: true,
  },
  Inter_700: {
    fontFamily: "'Inter'",
    weight: 700,
    italic: false,
  },
  Inter_700_Italic: {
    fontFamily: "'Inter'",
    weight: 700,
    italic: true,
  },
  Inter_800: {
    fontFamily: "'Inter'",
    weight: 800,
    italic: false,
  },
  Inter_800_Italic: {
    fontFamily: "'Inter'",
    weight: 800,
    italic: true,
  },
  Inter_900: {
    fontFamily: "'Inter'",
    weight: 900,
    italic: false,
  },
  Inter_900_Italic: {
    fontFamily: "'Inter'",
    weight: 900,
    italic: true,
  },

  // Inter Display
  InterDisplay_100: {
    fontFamily: "'Inter Display'",
    weight: 100,
    italic: false,
  },
  InterDisplay_100_Italic: {
    fontFamily: "'Inter Display'",
    weight: 100,
    italic: true,
  },
  InterDisplay_200: {
    fontFamily: "'Inter Display'",
    weight: 200,
    italic: false,
  },
  InterDisplay_200_Italic: {
    fontFamily: "'Inter Display'",
    weight: 200,
    italic: true,
  },
  InterDisplay_300: {
    fontFamily: "'Inter Display'",
    weight: 300,
    italic: false,
  },
  InterDisplay_300_Italic: {
    fontFamily: "'Inter Display'",
    weight: 300,
    italic: true,
  },
  InterDisplay_400: {
    fontFamily: "'Inter Display'",
    weight: 400,
    italic: false,
  },
  InterDisplay_400_Italic: {
    fontFamily: "'Inter Display'",
    weight: 400,
    italic: true,
  },
  InterDisplay_500: {
    fontFamily: "'Inter Display'",
    weight: 500,
    italic: false,
  },
  InterDisplay_500_Italic: {
    fontFamily: "'Inter Display'",
    weight: 500,
    italic: true,
  },
  InterDisplay_600: {
    fontFamily: "'Inter Display'",
    weight: 600,
    italic: false,
  },
  InterDisplay_600_Italic: {
    fontFamily: "'Inter Display'",
    weight: 600,
    italic: true,
  },
  InterDisplay_700: {
    fontFamily: "'Inter Display'",
    weight: 700,
    italic: false,
  },
  InterDisplay_700_Italic: {
    fontFamily: "'Inter Display'",
    weight: 700,
    italic: true,
  },
  InterDisplay_800: {
    fontFamily: "'Inter Display'",
    weight: 800,
    italic: false,
  },
  InterDisplay_800_Italic: {
    fontFamily: "'Inter Display'",
    weight: 800,
    italic: true,
  },
  InterDisplay_900: {
    fontFamily: "'Inter Display'",
    weight: 900,
    italic: false,
  },
  InterDisplay_900_Italic: {
    fontFamily: "'Inter Display'",
    weight: 900,
    italic: true,
  },

  // Merriweather
  Merriweather_300: {
    fontFamily: "'Merriweather Light'",
    weight: 300,
    italic: false,
  },
  Merriweather_300_Italic: {
    fontFamily: "'Merriweather Light'",
    weight: 300,
    italic: true,
  },
  Merriweather_400: {
    fontFamily: "'Merriweather'",
    weight: 400,
    italic: false,
  },
  Merriweather_400_Italic: {
    fontFamily: "'Merriweather'",
    weight: 400,
    italic: true,
  },
  Merriweather_700: {
    fontFamily: "'Merriweather'",
    weight: 700,
    italic: false,
  },
  Merriweather_700_Italic: {
    fontFamily: "'Merriweather'",
    weight: 700,
    italic: true,
  },
  Merriweather_900: {
    fontFamily: "'Merriweather Black'",
    weight: 900,
    italic: false,
  },
  Merriweather_900_Italic: {
    fontFamily: "'Merriweather Black'",
    weight: 900,
    italic: true,
  },

  // National 2
  National2_400: {
    fontFamily: "'National 2'",
    weight: 400,
    italic: false,
  },
  National2_400_Italic: {
    fontFamily: "'National 2'",
    weight: 400,
    italic: true,
  },
  National2_700: {
    fontFamily: "'National 2'",
    weight: 700,
    italic: false,
  },
  National2_700_Italic: {
    fontFamily: "'National 2'",
    weight: 700,
    italic: true,
  },
  National2_800: {
    fontFamily: "'National 2'",
    weight: 800,
    italic: false,
  },
  National2_900: {
    fontFamily: "'National 2'",
    weight: 900,
    italic: false,
  },
  National2Narrow_400: {
    fontFamily: "'National 2 Narrow'",
    weight: 400,
    italic: false,
  },
  National2Narrow_400_Italic: {
    fontFamily: "'National 2 Narrow'",
    weight: 400,
    italic: true,
  },

  // Noto Sans
  NotoSans_100: {
    fontFamily: "'Noto Sans'",
    weight: 100,
    italic: false,
  },
  NotoSans_100_Italic: {
    fontFamily: "'Noto Sans'",
    weight: 100,
    italic: true,
  },
  NotoSans_200: {
    fontFamily: "'Noto Sans'",
    weight: 200,
    italic: false,
  },
  NotoSans_200_Italic: {
    fontFamily: "'Noto Sans'",
    weight: 200,
    italic: true,
  },
  NotoSans_300: {
    fontFamily: "'Noto Sans'",
    weight: 300,
    italic: false,
  },
  NotoSans_300_Italic: {
    fontFamily: "'Noto Sans'",
    weight: 300,
    italic: true,
  },
  NotoSans_400: {
    fontFamily: "'Noto Sans'",
    weight: 400,
    italic: false,
  },
  NotoSans_400_Italic: {
    fontFamily: "'Noto Sans'",
    weight: 400,
    italic: true,
  },
  NotoSans_500: {
    fontFamily: "'Noto Sans'",
    weight: 500,
    italic: false,
  },
  NotoSans_500_Italic: {
    fontFamily: "'Noto Sans'",
    weight: 500,
    italic: true,
  },
  NotoSans_600: {
    fontFamily: "'Noto Sans'",
    weight: 600,
    italic: false,
  },
  NotoSans_600_Italic: {
    fontFamily: "'Noto Sans'",
    weight: 600,
    italic: true,
  },
  NotoSans_700: {
    fontFamily: "'Noto Sans'",
    weight: 700,
    italic: false,
  },
  NotoSans_700_Italic: {
    fontFamily: "'Noto Sans'",
    weight: 700,
    italic: true,
  },
  NotoSans_800: {
    fontFamily: "'Noto Sans'",
    weight: 800,
    italic: false,
  },
  NotoSans_800_Italic: {
    fontFamily: "'Noto Sans'",
    weight: 800,
    italic: true,
  },
  NotoSans_900: {
    fontFamily: "'Noto Sans'",
    weight: 900,
    italic: false,
  },
  NotoSans_900_Italic: {
    fontFamily: "'Noto Sans'",
    weight: 900,
    italic: true,
  },

  // Noto Sans Ethiopic
  NotoSansEthiopic_100: {
    fontFamily: "'Noto Sans Ethiopic'",
    weight: 100,
    italic: false,
  },
  NotoSansEthiopic_200: {
    fontFamily: "'Noto Sans Ethiopic'",
    weight: 200,
    italic: false,
  },
  NotoSansEthiopic_300: {
    fontFamily: "'Noto Sans Ethiopic'",
    weight: 300,
    italic: false,
  },
  NotoSansEthiopic_400: {
    fontFamily: "'Noto Sans Ethiopic'",
    weight: 400,
    italic: false,
  },
  NotoSansEthiopic_500: {
    fontFamily: "'Noto Sans Ethiopic'",
    weight: 500,
    italic: false,
  },
  NotoSansEthiopic_600: {
    fontFamily: "'Noto Sans Ethiopic'",
    weight: 600,
    italic: false,
  },
  NotoSansEthiopic_700: {
    fontFamily: "'Noto Sans Ethiopic'",
    weight: 700,
    italic: false,
  },
  NotoSansEthiopic_800: {
    fontFamily: "'Noto Sans Ethiopic'",
    weight: 800,
    italic: false,
  },
  NotoSansEthiopic_900: {
    fontFamily: "'Noto Sans Ethiopic'",
    weight: 900,
    italic: false,
  },

  // Poppins
  Poppins_100: {
    fontFamily: "'Poppins'",
    weight: 100,
    italic: false,
  },
  Poppins_100_Italic: {
    fontFamily: "'Poppins'",
    weight: 100,
    italic: true,
  },
  Poppins_200: {
    fontFamily: "'Poppins'",
    weight: 200,
    italic: false,
  },
  Poppins_200_Italic: {
    fontFamily: "'Poppins'",
    weight: 200,
    italic: true,
  },
  Poppins_300: {
    fontFamily: "'Poppins'",
    weight: 300,
    italic: false,
  },
  Poppins_300_Italic: {
    fontFamily: "'Poppins'",
    weight: 300,
    italic: true,
  },
  Poppins_400: {
    fontFamily: "'Poppins'",
    weight: 400,
    italic: false,
  },
  Poppins_400_Italic: {
    fontFamily: "'Poppins'",
    weight: 400,
    italic: true,
  },
  Poppins_500: {
    fontFamily: "'Poppins'",
    weight: 500,
    italic: false,
  },
  Poppins_500_Italic: {
    fontFamily: "'Poppins'",
    weight: 500,
    italic: true,
  },
  Poppins_600: {
    fontFamily: "'Poppins'",
    weight: 600,
    italic: false,
  },
  Poppins_600_Italic: {
    fontFamily: "'Poppins'",
    weight: 600,
    italic: true,
  },
  Poppins_700: {
    fontFamily: "'Poppins'",
    weight: 700,
    italic: false,
  },
  Poppins_700_Italic: {
    fontFamily: "'Poppins'",
    weight: 700,
    italic: true,
  },
  Poppins_800: {
    fontFamily: "'Poppins'",
    weight: 800,
    italic: false,
  },
  Poppins_800_Italic: {
    fontFamily: "'Poppins'",
    weight: 800,
    italic: true,
  },
  Poppins_900: {
    fontFamily: "'Poppins'",
    weight: 900,
    italic: false,
  },
  Poppins_900_Italic: {
    fontFamily: "'Poppins'",
    weight: 900,
    italic: true,
  },

  // Pragati Narrow
  PragatiNarrow_400: {
    fontFamily: "'Pragati Narrow'",
    weight: 400,
    italic: false,
  },
  PragatiNarrow_700: {
    fontFamily: "'Pragati Narrow'",
    weight: 700,
    italic: false,
  },

  // Reddit Sans
  RedditSans_200: {
    fontFamily: "'Reddit Sans ExtraLight'",
    weight: 200,
    italic: false,
  },
  RedditSans_200_Italic: {
    fontFamily: "'Reddit Sans ExtraLight'",
    weight: 200,
    italic: true,
  },
  RedditSans_300: {
    fontFamily: "'Reddit Sans Light'",
    weight: 300,
    italic: false,
  },
  RedditSans_300_Italic: {
    fontFamily: "'Reddit Sans Light'",
    weight: 300,
    italic: true,
  },
  RedditSans_400: {
    fontFamily: "'Reddit Sans'",
    weight: 400,
    italic: false,
  },
  RedditSans_400_Italic: {
    fontFamily: "'Reddit Sans'",
    weight: 400,
    italic: true,
  },
  RedditSans_500: {
    fontFamily: "'Reddit Sans Medium'",
    weight: 500,
    italic: false,
  },
  RedditSans_500_Italic: {
    fontFamily: "'Reddit Sans Medium'",
    weight: 500,
    italic: true,
  },
  RedditSans_600: {
    fontFamily: "'Reddit Sans SemiBold'",
    weight: 600,
    italic: false,
  },
  RedditSans_600_Italic: {
    fontFamily: "'Reddit Sans SemiBold'",
    weight: 600,
    italic: true,
  },
  RedditSans_700: {
    fontFamily: "'Reddit Sans'",
    weight: 700,
    italic: false,
  },
  RedditSans_700_Italic: {
    fontFamily: "'Reddit Sans'",
    weight: 700,
    italic: true,
  },
  RedditSans_800: {
    fontFamily: "'Reddit Sans ExtraBold'",
    weight: 800,
    italic: false,
  },
  RedditSans_800_Italic: {
    fontFamily: "'Reddit Sans ExtraBold'",
    weight: 800,
    italic: true,
  },
  RedditSans_900: {
    fontFamily: "'Reddit Sans Black'",
    weight: 900,
    italic: false,
  },
  RedditSans_900_Italic: {
    fontFamily: "'Reddit Sans Black'",
    weight: 900,
    italic: true,
  },

  // Roboto
  Roboto_100: {
    fontFamily: "'Roboto Thin'",
    weight: 100,
    italic: false,
  },
  Roboto_100_Italic: {
    fontFamily: "'Roboto Thin'",
    weight: 100,
    italic: true,
  },
  Roboto_300: {
    fontFamily: "'Roboto Light'",
    weight: 300,
    italic: false,
  },
  Roboto_300_Italic: {
    fontFamily: "'Roboto Light'",
    weight: 300,
    italic: true,
  },
  Roboto_400: {
    fontFamily: "'Roboto'",
    weight: 400,
    italic: false,
  },
  Roboto_400_Italic: {
    fontFamily: "'Roboto'",
    weight: 400,
    italic: true,
  },
  Roboto_500: {
    fontFamily: "'Roboto Medium'",
    weight: 500,
    italic: false,
  },
  Roboto_500_Italic: {
    fontFamily: "'Roboto Medium'",
    weight: 500,
    italic: true,
  },
  Roboto_700: {
    fontFamily: "'Roboto'",
    weight: 700,
    italic: false,
  },
  Roboto_700_Italic: {
    fontFamily: "'Roboto'",
    weight: 700,
    italic: true,
  },
  Roboto_900: {
    fontFamily: "'Roboto Black'",
    weight: 900,
    italic: false,
  },
  Roboto_900_Italic: {
    fontFamily: "'Roboto Black'",
    weight: 900,
    italic: true,
  },

  // Roboto Condensed
  RobotoCondensed_300: {
    fontFamily: "'Roboto Condensed Light'",
    weight: 300,
    italic: false,
  },
  RobotoCondensed_300_Italic: {
    fontFamily: "'Roboto Condensed Light'",
    weight: 300,
    italic: true,
  },
  RobotoCondensed_400: {
    fontFamily: "'Roboto Condensed'",
    weight: 400,
    italic: false,
  },
  RobotoCondensed_400_Italic: {
    fontFamily: "'Roboto Condensed'",
    weight: 400,
    italic: true,
  },
  RobotoCondensed_700: {
    fontFamily: "'Roboto Condensed'",
    weight: 700,
    italic: false,
  },
  RobotoCondensed_700_Italic: {
    fontFamily: "'Roboto Condensed'",
    weight: 700,
    italic: true,
  },

  // Roboto Mono
  RobotoMono_100: {
    fontFamily: "'Roboto Mono'",
    weight: 100,
    italic: false,
  },
  RobotoMono_100_Italic: {
    fontFamily: "'Roboto Mono'",
    weight: 100,
    italic: true,
  },
  RobotoMono_200: {
    fontFamily: "'Roboto Mono'",
    weight: 200,
    italic: false,
  },
  RobotoMono_200_Italic: {
    fontFamily: "'Roboto Mono'",
    weight: 200,
    italic: true,
  },
  RobotoMono_300: {
    fontFamily: "'Roboto Mono'",
    weight: 300,
    italic: false,
  },
  RobotoMono_300_Italic: {
    fontFamily: "'Roboto Mono'",
    weight: 300,
    italic: true,
  },
  RobotoMono_400: {
    fontFamily: "'Roboto Mono'",
    weight: 400,
    italic: false,
  },
  RobotoMono_400_Italic: {
    fontFamily: "'Roboto Mono'",
    weight: 400,
    italic: true,
  },
  RobotoMono_500: {
    fontFamily: "'Roboto Mono'",
    weight: 500,
    italic: false,
  },
  RobotoMono_500_Italic: {
    fontFamily: "'Roboto Mono'",
    weight: 500,
    italic: true,
  },
  RobotoMono_600: {
    fontFamily: "'Roboto Mono'",
    weight: 600,
    italic: false,
  },
  RobotoMono_600_Italic: {
    fontFamily: "'Roboto Mono'",
    weight: 600,
    italic: true,
  },
  RobotoMono_700: {
    fontFamily: "'Roboto Mono'",
    weight: 700,
    italic: false,
  },
  RobotoMono_700_Italic: {
    fontFamily: "'Roboto Mono'",
    weight: 700,
    italic: true,
  },

  // Sarabun
  Sarabun_100: {
    fontFamily: "'Sarabun'",
    weight: 100,
    italic: false,
  },
  Sarabun_100_Italic: {
    fontFamily: "'Sarabun'",
    weight: 100,
    italic: true,
  },
  Sarabun_200: {
    fontFamily: "'Sarabun'",
    weight: 200,
    italic: false,
  },
  Sarabun_200_Italic: {
    fontFamily: "'Sarabun'",
    weight: 200,
    italic: true,
  },
  Sarabun_300: {
    fontFamily: "'Sarabun'",
    weight: 300,
    italic: false,
  },
  Sarabun_300_Italic: {
    fontFamily: "'Sarabun'",
    weight: 300,
    italic: true,
  },
  Sarabun_400: {
    fontFamily: "'Sarabun'",
    weight: 400,
    italic: false,
  },
  Sarabun_400_Italic: {
    fontFamily: "'Sarabun'",
    weight: 400,
    italic: true,
  },
  Sarabun_500: {
    fontFamily: "'Sarabun'",
    weight: 500,
    italic: false,
  },
  Sarabun_500_Italic: {
    fontFamily: "'Sarabun'",
    weight: 500,
    italic: true,
  },
  Sarabun_600: {
    fontFamily: "'Sarabun'",
    weight: 600,
    italic: false,
  },
  Sarabun_600_Italic: {
    fontFamily: "'Sarabun'",
    weight: 600,
    italic: true,
  },
  Sarabun_700: {
    fontFamily: "'Sarabun'",
    weight: 700,
    italic: false,
  },
  Sarabun_700_Italic: {
    fontFamily: "'Sarabun'",
    weight: 700,
    italic: true,
  },
  Sarabun_800: {
    fontFamily: "'Sarabun'",
    weight: 800,
    italic: false,
  },
  Sarabun_800_Italic: {
    fontFamily: "'Sarabun'",
    weight: 800,
    italic: true,
  },

  // Source Sans 3
  SourceSans3_200: {
    fontFamily: "'Source Sans 3'",
    weight: 200,
    italic: false,
  },
  SourceSans3_200_Italic: {
    fontFamily: "'Source Sans 3'",
    weight: 200,
    italic: true,
  },
  SourceSans3_300: {
    fontFamily: "'Source Sans 3'",
    weight: 300,
    italic: false,
  },
  SourceSans3_300_Italic: {
    fontFamily: "'Source Sans 3'",
    weight: 300,
    italic: true,
  },
  SourceSans3_400: {
    fontFamily: "'Source Sans 3'",
    weight: 400,
    italic: false,
  },
  SourceSans3_400_Italic: {
    fontFamily: "'Source Sans 3'",
    weight: 400,
    italic: true,
  },
  SourceSans3_500: {
    fontFamily: "'Source Sans 3'",
    weight: 500,
    italic: false,
  },
  SourceSans3_500_Italic: {
    fontFamily: "'Source Sans 3'",
    weight: 500,
    italic: true,
  },
  SourceSans3_600: {
    fontFamily: "'Source Sans 3'",
    weight: 600,
    italic: false,
  },
  SourceSans3_600_Italic: {
    fontFamily: "'Source Sans 3'",
    weight: 600,
    italic: true,
  },
  SourceSans3_700: {
    fontFamily: "'Source Sans 3'",
    weight: 700,
    italic: false,
  },
  SourceSans3_700_Italic: {
    fontFamily: "'Source Sans 3'",
    weight: 700,
    italic: true,
  },
  SourceSans3_800: {
    fontFamily: "'Source Sans 3'",
    weight: 800,
    italic: false,
  },
  SourceSans3_800_Italic: {
    fontFamily: "'Source Sans 3'",
    weight: 800,
    italic: true,
  },
  SourceSans3_900: {
    fontFamily: "'Source Sans 3'",
    weight: 900,
    italic: false,
  },
  SourceSans3_900_Italic: {
    fontFamily: "'Source Sans 3'",
    weight: 900,
    italic: true,
  },

  // Source Serif 4
  SourceSerif4_200: {
    fontFamily: "'Source Serif 4'",
    weight: 200,
    italic: false,
  },
  SourceSerif4_200_Italic: {
    fontFamily: "'Source Serif 4'",
    weight: 200,
    italic: true,
  },
  SourceSerif4_300: {
    fontFamily: "'Source Serif 4'",
    weight: 300,
    italic: false,
  },
  SourceSerif4_300_Italic: {
    fontFamily: "'Source Serif 4'",
    weight: 300,
    italic: true,
  },
  SourceSerif4_400: {
    fontFamily: "'Source Serif 4'",
    weight: 400,
    italic: false,
  },
  SourceSerif4_400_Italic: {
    fontFamily: "'Source Serif 4'",
    weight: 400,
    italic: true,
  },
  SourceSerif4_500: {
    fontFamily: "'Source Serif 4'",
    weight: 500,
    italic: false,
  },
  SourceSerif4_500_Italic: {
    fontFamily: "'Source Serif 4'",
    weight: 500,
    italic: true,
  },
  SourceSerif4_600: {
    fontFamily: "'Source Serif 4'",
    weight: 600,
    italic: false,
  },
  SourceSerif4_600_Italic: {
    fontFamily: "'Source Serif 4'",
    weight: 600,
    italic: true,
  },
  SourceSerif4_700: {
    fontFamily: "'Source Serif 4'",
    weight: 700,
    italic: false,
  },
  SourceSerif4_700_Italic: {
    fontFamily: "'Source Serif 4'",
    weight: 700,
    italic: true,
  },
  SourceSerif4_800: {
    fontFamily: "'Source Serif 4'",
    weight: 800,
    italic: false,
  },
  SourceSerif4_800_Italic: {
    fontFamily: "'Source Serif 4'",
    weight: 800,
    italic: true,
  },
  SourceSerif4_900: {
    fontFamily: "'Source Serif 4'",
    weight: 900,
    italic: false,
  },
  SourceSerif4_900_Italic: {
    fontFamily: "'Source Serif 4'",
    weight: 900,
    italic: true,
  },
};

type TimFontSetOption =
  | "Alegreya"
  | "Cambria"
  | "FiraMono"
  | "FiraSans"
  | "FiraSansCondensed"
  | "Gibson"
  | "IBMPlexSansCondensed"
  | "Inter"
  | "InterDisplay"
  | "Merriweather"
  | "National2"
  | "NotoSans"
  | "NotoSansEthiopic"
  | "Poppins"
  | "PragatiNarrow"
  | "RedditSans"
  | "Roboto"
  | "RobotoCondensed"
  | "RobotoMono"
  | "Sarabun"
  | "SourceSans3"
  | "SourceSerif4";

export const TIM_FONT_SETS: Record<TimFontSetOption, KeyFonts> = {
  Alegreya: {
    main400: TIM_FONTS.Alegreya_400,
    main700: TIM_FONTS.Alegreya_700,
  },
  Cambria: {
    main400: TIM_FONTS.Cambria,
    main700: TIM_FONTS.Cambria_Bold,
  },
  FiraMono: {
    main400: TIM_FONTS.FiraMono_400,
    main700: TIM_FONTS.FiraMono_700,
  },
  FiraSans: {
    main400: TIM_FONTS.FiraSans_400,
    main700: TIM_FONTS.FiraSans_700,
  },
  FiraSansCondensed: {
    main400: TIM_FONTS.FiraSansCondensed_400,
    main700: TIM_FONTS.FiraSansCondensed_700,
  },
  Gibson: {
    main400: TIM_FONTS.Gibson_400,
    main700: TIM_FONTS.Gibson_700,
  },
  IBMPlexSansCondensed: {
    main400: TIM_FONTS.IBMPlexSansCondensed_400,
    main700: TIM_FONTS.IBMPlexSansCondensed_700,
  },
  Inter: {
    main400: TIM_FONTS.Inter_400,
    main700: TIM_FONTS.Inter_700,
  },
  InterDisplay: {
    main400: TIM_FONTS.InterDisplay_400,
    main700: TIM_FONTS.InterDisplay_700,
  },
  Merriweather: {
    main400: TIM_FONTS.Merriweather_400,
    main700: TIM_FONTS.Merriweather_700,
  },
  National2: {
    main400: TIM_FONTS.National2_400,
    main700: TIM_FONTS.National2_700,
  },
  NotoSans: {
    main400: TIM_FONTS.NotoSans_400,
    main700: TIM_FONTS.NotoSans_700,
  },
  NotoSansEthiopic: {
    main400: TIM_FONTS.NotoSansEthiopic_400,
    main700: TIM_FONTS.NotoSansEthiopic_700,
  },
  Poppins: {
    main400: TIM_FONTS.Poppins_400,
    main700: TIM_FONTS.Poppins_700,
  },
  PragatiNarrow: {
    main400: TIM_FONTS.PragatiNarrow_400,
    main700: TIM_FONTS.PragatiNarrow_700,
  },
  RedditSans: {
    main400: TIM_FONTS.RedditSans_400,
    main700: TIM_FONTS.RedditSans_700,
  },
  Roboto: {
    main400: TIM_FONTS.Roboto_400,
    main700: TIM_FONTS.Roboto_700,
  },
  RobotoCondensed: {
    main400: TIM_FONTS.RobotoCondensed_400,
    main700: TIM_FONTS.RobotoCondensed_700,
  },
  RobotoMono: {
    main400: TIM_FONTS.RobotoMono_400,
    main700: TIM_FONTS.RobotoMono_700,
  },
  Sarabun: {
    main400: TIM_FONTS.Sarabun_400,
    main700: TIM_FONTS.Sarabun_700,
  },
  SourceSans3: {
    main400: TIM_FONTS.SourceSans3_400,
    main700: TIM_FONTS.SourceSans3_700,
  },
  SourceSerif4: {
    main400: TIM_FONTS.SourceSerif4_400,
    main700: TIM_FONTS.SourceSerif4_700,
  },
};
