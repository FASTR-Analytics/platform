// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { FontInfo } from "../types.ts";

type TimFontOption =
  // Cambria
  | "Cambria_400_Italic"
  | "Cambria_400"
  | "Cambria_700"
  | "Cambria_700_Italic"
  // Fira Mono
  | "FiraMono_400"
  | "FiraMono_700"
  | "FiraMono_500"
  // Fira Sans
  | "FiraSans_700_Italic"
  | "FiraSans_800_Italic"
  | "FiraSans_900_Italic"
  | "FiraSans_100"
  | "FiraSans_200_Italic"
  | "FiraSans_300_Italic"
  | "FiraSans_300"
  | "FiraSans_400"
  | "FiraSans_500"
  | "FiraSans_600_Italic"
  | "FiraSans_700"
  | "FiraSans_200"
  | "FiraSans_600"
  | "FiraSans_100_Italic"
  | "FiraSans_500_Italic"
  | "FiraSans_900"
  | "FiraSans_800"
  | "FiraSans_400_Italic"
  // Fira Sans Condensed
  | "FiraSansCondensed_300"
  | "FiraSansCondensed_400_Italic"
  | "FiraSansCondensed_700"
  | "FiraSansCondensed_300_Italic"
  | "FiraSansCondensed_600"
  | "FiraSansCondensed_700_Italic"
  | "FiraSansCondensed_800_Italic"
  | "FiraSansCondensed_400"
  | "FiraSansCondensed_200"
  | "FiraSansCondensed_600_Italic"
  | "FiraSansCondensed_800"
  | "FiraSansCondensed_200_Italic"
  | "FiraSansCondensed_500"
  | "FiraSansCondensed_500_Italic"
  | "FiraSansCondensed_900"
  | "FiraSansCondensed_900_Italic"
  // Gibson
  | "Gibson_800"
  | "Gibson_600_Italic"
  | "Gibson_400_Italic"
  | "Gibson_300"
  | "Gibson_800_Italic"
  | "Gibson_300_Italic"
  | "Gibson_200"
  | "Gibson_100"
  | "Gibson_500_Italic"
  | "Gibson_400"
  | "Gibson_100_Italic"
  | "Gibson_900_Italic"
  | "Gibson_600"
  | "Gibson_700_Italic"
  | "Gibson_700"
  | "Gibson_900"
  | "Gibson_500"
  | "Gibson_200_Italic"
  // Gibson VF
  | "GibsonVF_100_Italic"
  | "GibsonVF_100"
  // IBM Plex Sans
  | "IBMPlexSans_300"
  | "IBMPlexSans_700_Italic"
  | "IBMPlexSans_100_Italic"
  | "IBMPlexSans_400"
  | "IBMPlexSans_700"
  | "IBMPlexSans_100"
  | "IBMPlexSans_300_Italic"
  | "IBMPlexSans_400_Italic"
  // IBM Plex Sans Condensed
  | "IBMPlexSansCondensed_200_Italic"
  | "IBMPlexSansCondensed_600_Italic"
  | "IBMPlexSansCondensed_200"
  | "IBMPlexSansCondensed_100_Italic"
  | "IBMPlexSansCondensed_300"
  | "IBMPlexSansCondensed_300_Italic"
  | "IBMPlexSansCondensed_500"
  | "IBMPlexSansCondensed_700_Italic"
  | "IBMPlexSansCondensed_400"
  | "IBMPlexSansCondensed_400_Italic"
  | "IBMPlexSansCondensed_600"
  | "IBMPlexSansCondensed_100"
  | "IBMPlexSansCondensed_700"
  | "IBMPlexSansCondensed_500_Italic"
  // IBM Plex Sans ExtLt
  | "IBMPlexSansExtLt_200"
  | "IBMPlexSansExtLt_200_Italic"
  // IBM Plex Sans Medm
  | "IBMPlexSansMedm_500_Italic"
  | "IBMPlexSansMedm_500"
  // IBM Plex Sans SmBld
  | "IBMPlexSansSmBld_600"
  | "IBMPlexSansSmBld_600_Italic"
  // IBM Plex Sans Text
  | "IBMPlexSansText_400"
  | "IBMPlexSansText_400_Italic"
  // Inter
  | "Inter_500"
  | "Inter_800"
  | "Inter_900"
  | "Inter_200_Italic"
  | "Inter_400"
  | "Inter_400_Italic"
  | "Inter_800_Italic"
  | "Inter_300"
  | "Inter_100"
  | "Inter_200"
  | "Inter_600"
  | "Inter_100_Italic"
  | "Inter_600_Italic"
  | "Inter_700"
  | "Inter_500_Italic"
  | "Inter_300_Italic"
  | "Inter_700_Italic"
  | "Inter_900_Italic"
  // Inter Display
  | "InterDisplay_300"
  | "InterDisplay_400_Italic"
  | "InterDisplay_900_Italic"
  | "InterDisplay_800_Italic"
  | "InterDisplay_200_Italic"
  | "InterDisplay_700"
  | "InterDisplay_800"
  | "InterDisplay_600_Italic"
  | "InterDisplay_100"
  | "InterDisplay_500"
  | "InterDisplay_200"
  | "InterDisplay_100_Italic"
  | "InterDisplay_600"
  | "InterDisplay_700_Italic"
  | "InterDisplay_500_Italic"
  | "InterDisplay_400"
  | "InterDisplay_900"
  | "InterDisplay_300_Italic"
  // Inter Variable
  | "InterVariable_400"
  | "InterVariable_400_Italic"
  // Merriweather
  | "Merriweather_700"
  | "Merriweather_400"
  | "Merriweather_700_Italic"
  | "Merriweather_300"
  | "Merriweather_900_Italic"
  | "Merriweather_900"
  | "Merriweather_400_Italic"
  | "Merriweather_300_Italic"
  // National 2
  | "National2_700_Italic"
  | "National2_800"
  | "National2_400_Italic"
  | "National2_900"
  | "National2_700"
  | "National2_400"
  // National 2 Narrow
  | "National2Narrow_400"
  | "National2Narrow_400_Italic"
  // Noto Sans
  | "NotoSans_400_Italic"
  | "NotoSans_400"
  | "NotoSans_700"
  | "NotoSans_900_Italic"
  | "NotoSans_500"
  | "NotoSans_800_Italic"
  | "NotoSans_900"
  | "NotoSans_100_Italic"
  | "NotoSans_100"
  | "NotoSans_200_Italic"
  | "NotoSans_600_Italic"
  | "NotoSans_800"
  | "NotoSans_700_Italic"
  | "NotoSans_300_Italic"
  | "NotoSans_300"
  | "NotoSans_600"
  | "NotoSans_500_Italic"
  | "NotoSans_200"
  // Noto Sans Ethiopic
  | "NotoSansEthiopic_600"
  | "NotoSansEthiopic_500"
  | "NotoSansEthiopic_300"
  | "NotoSansEthiopic_700"
  | "NotoSansEthiopic_200"
  | "NotoSansEthiopic_800"
  | "NotoSansEthiopic_400"
  | "NotoSansEthiopic_900"
  // Poppins
  | "Poppins_300"
  | "Poppins_600"
  | "Poppins_500"
  | "Poppins_500_Italic"
  | "Poppins_200_Italic"
  | "Poppins_400"
  | "Poppins_300_Italic"
  | "Poppins_700_Italic"
  | "Poppins_200"
  | "Poppins_800"
  | "Poppins_800_Italic"
  | "Poppins_700"
  | "Poppins_900_Italic"
  | "Poppins_600_Italic"
  | "Poppins_400_Italic"
  | "Poppins_900"
  // Pragati Narrow
  | "PragatiNarrow_700"
  | "PragatiNarrow_400"
  // Roboto
  | "Roboto_500"
  | "Roboto_300"
  | "Roboto_200"
  | "Roboto_400"
  | "Roboto_500_Italic"
  | "Roboto_900"
  | "Roboto_400_Italic"
  | "Roboto_300_Italic"
  | "Roboto_900_Italic"
  | "Roboto_700"
  | "Roboto_200_Italic"
  | "Roboto_700_Italic"
  // Roboto Condensed
  | "RobotoCondensed_700_Italic"
  | "RobotoCondensed_300"
  | "RobotoCondensed_300_Italic"
  | "RobotoCondensed_400"
  | "RobotoCondensed_400_Italic"
  | "RobotoCondensed_700"
  // Roboto Mono
  | "RobotoMono_500"
  | "RobotoMono_600"
  | "RobotoMono_700"
  | "RobotoMono_600_Italic"
  | "RobotoMono_400_Italic"
  | "RobotoMono_500_Italic"
  | "RobotoMono_200"
  | "RobotoMono_200_Italic"
  | "RobotoMono_400"
  | "RobotoMono_300"
  | "RobotoMono_300_Italic"
  | "RobotoMono_700_Italic"
  // Sarabun
  | "Sarabun_300"
  | "Sarabun_600_Italic"
  | "Sarabun_400_Italic"
  | "Sarabun_300_Italic"
  | "Sarabun_800_Italic"
  | "Sarabun_800"
  | "Sarabun_200"
  | "Sarabun_200_Italic"
  | "Sarabun_700_Italic"
  | "Sarabun_500"
  | "Sarabun_400"
  | "Sarabun_700"
  | "Sarabun_600"
  | "Sarabun_500_Italic"
  // Source Sans 3
  | "SourceSans3_300"
  | "SourceSans3_500_Italic"
  | "SourceSans3_700"
  | "SourceSans3_200_Italic"
  | "SourceSans3_800"
  | "SourceSans3_900_Italic"
  | "SourceSans3_900"
  | "SourceSans3_400"
  | "SourceSans3_600_Italic"
  | "SourceSans3_600"
  | "SourceSans3_800_Italic"
  | "SourceSans3_300_Italic"
  | "SourceSans3_400_Italic"
  | "SourceSans3_500"
  | "SourceSans3_700_Italic"
  | "SourceSans3_200"
  // Source Serif 4
  | "SourceSerif4_600_Italic"
  | "SourceSerif4_700"
  | "SourceSerif4_800"
  | "SourceSerif4_300_Italic"
  | "SourceSerif4_900"
  | "SourceSerif4_700_Italic"
  | "SourceSerif4_500_Italic"
  | "SourceSerif4_600"
  | "SourceSerif4_200"
  | "SourceSerif4_500"
  | "SourceSerif4_200_Italic"
  | "SourceSerif4_400_Italic"
  | "SourceSerif4_900_Italic"
  | "SourceSerif4_300"
  | "SourceSerif4_400"
  | "SourceSerif4_800_Italic"
  // Test Die Grotesk A
  | "TestDieGroteskA_200"
  | "TestDieGroteskA_900_Italic"
  | "TestDieGroteskA_800_Italic"
  | "TestDieGroteskA_700_Italic"
  | "TestDieGroteskA_800"
  | "TestDieGroteskA_300"
  | "TestDieGroteskA_400_Italic"
  | "TestDieGroteskA_900"
  | "TestDieGroteskA_300_Italic"
  | "TestDieGroteskA_500"
  | "TestDieGroteskA_200_Italic"
  | "TestDieGroteskA_500_Italic"
  | "TestDieGroteskA_700"
  | "TestDieGroteskA_400"
  // Test Die Grotesk B
  | "TestDieGroteskB_400"
  | "TestDieGroteskB_700"
  | "TestDieGroteskB_900"
  | "TestDieGroteskB_200"
  | "TestDieGroteskB_700_Italic"
  | "TestDieGroteskB_800"
  | "TestDieGroteskB_500"
  | "TestDieGroteskB_200_Italic"
  | "TestDieGroteskB_300_Italic"
  | "TestDieGroteskB_900_Italic"
  | "TestDieGroteskB_800_Italic"
  | "TestDieGroteskB_300"
  | "TestDieGroteskB_500_Italic"
  | "TestDieGroteskB_400_Italic"
  // Test Die Grotesk C
  | "TestDieGroteskC_500"
  | "TestDieGroteskC_900_Italic"
  | "TestDieGroteskC_700"
  | "TestDieGroteskC_400"
  | "TestDieGroteskC_400_Italic"
  | "TestDieGroteskC_300"
  | "TestDieGroteskC_200"
  | "TestDieGroteskC_800"
  | "TestDieGroteskC_800_Italic"
  | "TestDieGroteskC_700_Italic"
  | "TestDieGroteskC_500_Italic"
  | "TestDieGroteskC_200_Italic"
  | "TestDieGroteskC_300_Italic"
  | "TestDieGroteskC_900"
  // Test Die Grotesk D
  | "TestDieGroteskD_800_Italic"
  | "TestDieGroteskD_500"
  | "TestDieGroteskD_200_Italic"
  | "TestDieGroteskD_300_Italic"
  | "TestDieGroteskD_900_Italic"
  | "TestDieGroteskD_800"
  | "TestDieGroteskD_400"
  | "TestDieGroteskD_900"
  | "TestDieGroteskD_200"
  | "TestDieGroteskD_400_Italic"
  | "TestDieGroteskD_700"
  | "TestDieGroteskD_300"
  | "TestDieGroteskD_500_Italic"
  | "TestDieGroteskD_700_Italic"
  // Test Founders Grotesk
  | "TestFoundersGrotesk_700_Italic"
  | "TestFoundersGrotesk_300_Italic"
  | "TestFoundersGrotesk_500"
  | "TestFoundersGrotesk_700"
  | "TestFoundersGrotesk_400"
  | "TestFoundersGrotesk_600"
  | "TestFoundersGrotesk_600_Italic"
  | "TestFoundersGrotesk_400_Italic"
  | "TestFoundersGrotesk_500_Italic"
  | "TestFoundersGrotesk_300"
  // Test Martina Plantijn
  | "TestMartinaPlantijn_300_Italic"
  | "TestMartinaPlantijn_500_Italic"
  | "TestMartinaPlantijn_700"
  | "TestMartinaPlantijn_300"
  | "TestMartinaPlantijn_900_Italic"
  | "TestMartinaPlantijn_500"
  | "TestMartinaPlantijn_400_Italic"
  | "TestMartinaPlantijn_900"
  | "TestMartinaPlantijn_700_Italic"
  | "TestMartinaPlantijn_400"
  // Test Metric
  | "TestMetric_500_Italic"
  | "TestMetric_600_Italic"
  | "TestMetric_400_Italic"
  | "TestMetric_200_Italic"
  | "TestMetric_500"
  | "TestMetric_600"
  | "TestMetric_300"
  | "TestMetric_700_Italic"
  | "TestMetric_200"
  | "TestMetric_700"
  | "TestMetric_300_Italic"
  | "TestMetric_900"
  | "TestMetric_900_Italic"
  | "TestMetric_400"
  // Test The Future
  | "TestTheFuture_700_Italic"
  | "TestTheFuture_300_Italic"
  | "TestTheFuture_400_Italic"
  | "TestTheFuture_500"
  | "TestTheFuture_300"
  | "TestTheFuture_200"
  | "TestTheFuture_900_Italic"
  | "TestTheFuture_400"
  | "TestTheFuture_200_Italic"
  | "TestTheFuture_900"
  | "TestTheFuture_500_Italic"
  | "TestTheFuture_700"
  // Test The Future Mono
  | "TestTheFutureMono_900_Italic"
  | "TestTheFutureMono_400_Italic"
  | "TestTheFutureMono_900"
  | "TestTheFutureMono_200"
  | "TestTheFutureMono_200_Italic"
  | "TestTheFutureMono_300_Italic"
  | "TestTheFutureMono_700"
  | "TestTheFutureMono_300"
  | "TestTheFutureMono_500"
  | "TestTheFutureMono_700_Italic"
  | "TestTheFutureMono_400"
  | "TestTheFutureMono_500_Italic"
  // Test Tiempos Text
  | "TestTiemposText_500"
  | "TestTiemposText_700_Italic"
  | "TestTiemposText_400"
  | "TestTiemposText_600_Italic"
  | "TestTiemposText_700"
  | "TestTiemposText_400_Italic"
  | "TestTiemposText_500_Italic"
  | "TestTiemposText_600";

export const TIM_FONTS: Record<TimFontOption, FontInfo> = {
  // Cambria
  Cambria_400_Italic: {
    fontFamily: "Cambria",
    weight: 400,
    italic: true,
  },
  Cambria_400: {
    fontFamily: "Cambria",
    weight: 400,
    italic: false,
  },
  Cambria_700: {
    fontFamily: "Cambria",
    weight: 700,
    italic: false,
  },
  Cambria_700_Italic: {
    fontFamily: "Cambria",
    weight: 700,
    italic: true,
  },

  // Fira Mono
  FiraMono_400: {
    fontFamily: "Fira Mono",
    weight: 400,
    italic: false,
  },
  FiraMono_700: {
    fontFamily: "Fira Mono",
    weight: 700,
    italic: false,
  },
  FiraMono_500: {
    fontFamily: "Fira Mono",
    weight: 500,
    italic: false,
  },

  // Fira Sans
  FiraSans_700_Italic: {
    fontFamily: "Fira Sans",
    weight: 700,
    italic: true,
  },
  FiraSans_800_Italic: {
    fontFamily: "Fira Sans",
    weight: 800,
    italic: true,
  },
  FiraSans_900_Italic: {
    fontFamily: "Fira Sans",
    weight: 900,
    italic: true,
  },
  FiraSans_100: {
    fontFamily: "Fira Sans",
    weight: 100,
    italic: false,
  },
  FiraSans_200_Italic: {
    fontFamily: "Fira Sans",
    weight: 200,
    italic: true,
  },
  FiraSans_300_Italic: {
    fontFamily: "Fira Sans",
    weight: 300,
    italic: true,
  },
  FiraSans_300: {
    fontFamily: "Fira Sans",
    weight: 300,
    italic: false,
  },
  FiraSans_400: {
    fontFamily: "Fira Sans",
    weight: 400,
    italic: false,
  },
  FiraSans_500: {
    fontFamily: "Fira Sans",
    weight: 500,
    italic: false,
  },
  FiraSans_600_Italic: {
    fontFamily: "Fira Sans",
    weight: 600,
    italic: true,
  },
  FiraSans_700: {
    fontFamily: "Fira Sans",
    weight: 700,
    italic: false,
  },
  FiraSans_200: {
    fontFamily: "Fira Sans",
    weight: 200,
    italic: false,
  },
  FiraSans_600: {
    fontFamily: "Fira Sans",
    weight: 600,
    italic: false,
  },
  FiraSans_100_Italic: {
    fontFamily: "Fira Sans",
    weight: 100,
    italic: true,
  },
  FiraSans_500_Italic: {
    fontFamily: "Fira Sans",
    weight: 500,
    italic: true,
  },
  FiraSans_900: {
    fontFamily: "Fira Sans",
    weight: 900,
    italic: false,
  },
  FiraSans_800: {
    fontFamily: "Fira Sans",
    weight: 800,
    italic: false,
  },
  FiraSans_400_Italic: {
    fontFamily: "Fira Sans",
    weight: 400,
    italic: true,
  },

  // Fira Sans Condensed
  FiraSansCondensed_300: {
    fontFamily: "Fira Sans Condensed",
    weight: 300,
    italic: false,
  },
  FiraSansCondensed_400_Italic: {
    fontFamily: "Fira Sans Condensed",
    weight: 400,
    italic: true,
  },
  FiraSansCondensed_700: {
    fontFamily: "Fira Sans Condensed",
    weight: 700,
    italic: false,
  },
  FiraSansCondensed_300_Italic: {
    fontFamily: "Fira Sans Condensed",
    weight: 300,
    italic: true,
  },
  FiraSansCondensed_600: {
    fontFamily: "Fira Sans Condensed",
    weight: 600,
    italic: false,
  },
  FiraSansCondensed_700_Italic: {
    fontFamily: "Fira Sans Condensed",
    weight: 700,
    italic: true,
  },
  FiraSansCondensed_800_Italic: {
    fontFamily: "Fira Sans Condensed",
    weight: 800,
    italic: true,
  },
  FiraSansCondensed_400: {
    fontFamily: "Fira Sans Condensed",
    weight: 400,
    italic: false,
  },
  FiraSansCondensed_200: {
    fontFamily: "Fira Sans Condensed",
    weight: 200,
    italic: false,
  },
  FiraSansCondensed_600_Italic: {
    fontFamily: "Fira Sans Condensed",
    weight: 600,
    italic: true,
  },
  FiraSansCondensed_800: {
    fontFamily: "Fira Sans Condensed",
    weight: 800,
    italic: false,
  },
  FiraSansCondensed_200_Italic: {
    fontFamily: "Fira Sans Condensed",
    weight: 200,
    italic: true,
  },
  FiraSansCondensed_500: {
    fontFamily: "Fira Sans Condensed",
    weight: 500,
    italic: false,
  },
  FiraSansCondensed_500_Italic: {
    fontFamily: "Fira Sans Condensed",
    weight: 500,
    italic: true,
  },
  FiraSansCondensed_900: {
    fontFamily: "Fira Sans Condensed",
    weight: 900,
    italic: false,
  },
  FiraSansCondensed_900_Italic: {
    fontFamily: "Fira Sans Condensed",
    weight: 900,
    italic: true,
  },

  // Gibson
  Gibson_800: {
    fontFamily: "Gibson",
    weight: 800,
    italic: false,
  },
  Gibson_600_Italic: {
    fontFamily: "Gibson",
    weight: 600,
    italic: true,
  },
  Gibson_400_Italic: {
    fontFamily: "Gibson",
    weight: 400,
    italic: true,
  },
  Gibson_300: {
    fontFamily: "Gibson",
    weight: 300,
    italic: false,
  },
  Gibson_800_Italic: {
    fontFamily: "Gibson",
    weight: 800,
    italic: true,
  },
  Gibson_300_Italic: {
    fontFamily: "Gibson",
    weight: 300,
    italic: true,
  },
  Gibson_200: {
    fontFamily: "Gibson",
    weight: 200,
    italic: false,
  },
  Gibson_100: {
    fontFamily: "Gibson",
    weight: 100,
    italic: false,
  },
  Gibson_500_Italic: {
    fontFamily: "Gibson",
    weight: 500,
    italic: true,
  },
  Gibson_400: {
    fontFamily: "Gibson",
    weight: 400,
    italic: false,
  },
  Gibson_100_Italic: {
    fontFamily: "Gibson",
    weight: 100,
    italic: true,
  },
  Gibson_900_Italic: {
    fontFamily: "Gibson",
    weight: 900,
    italic: true,
  },
  Gibson_600: {
    fontFamily: "Gibson",
    weight: 600,
    italic: false,
  },
  Gibson_700_Italic: {
    fontFamily: "Gibson",
    weight: 700,
    italic: true,
  },
  Gibson_700: {
    fontFamily: "Gibson",
    weight: 700,
    italic: false,
  },
  Gibson_900: {
    fontFamily: "Gibson",
    weight: 900,
    italic: false,
  },
  Gibson_500: {
    fontFamily: "Gibson",
    weight: 500,
    italic: false,
  },
  Gibson_200_Italic: {
    fontFamily: "Gibson",
    weight: 200,
    italic: true,
  },

  // Gibson VF
  GibsonVF_100_Italic: {
    fontFamily: "Gibson VF",
    weight: 100,
    italic: true,
  },
  GibsonVF_100: {
    fontFamily: "Gibson VF",
    weight: 100,
    italic: false,
  },

  // IBM Plex Sans
  IBMPlexSans_300: {
    fontFamily: "IBM Plex Sans",
    weight: 300,
    italic: false,
  },
  IBMPlexSans_700_Italic: {
    fontFamily: "IBM Plex Sans",
    weight: 700,
    italic: true,
  },
  IBMPlexSans_100_Italic: {
    fontFamily: "IBM Plex Sans",
    weight: 100,
    italic: true,
  },
  IBMPlexSans_400: {
    fontFamily: "IBM Plex Sans",
    weight: 400,
    italic: false,
  },
  IBMPlexSans_700: {
    fontFamily: "IBM Plex Sans",
    weight: 700,
    italic: false,
  },
  IBMPlexSans_100: {
    fontFamily: "IBM Plex Sans",
    weight: 100,
    italic: false,
  },
  IBMPlexSans_300_Italic: {
    fontFamily: "IBM Plex Sans",
    weight: 300,
    italic: true,
  },
  IBMPlexSans_400_Italic: {
    fontFamily: "IBM Plex Sans",
    weight: 400,
    italic: true,
  },

  // IBM Plex Sans Condensed
  IBMPlexSansCondensed_200_Italic: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 200,
    italic: true,
  },
  IBMPlexSansCondensed_600_Italic: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 600,
    italic: true,
  },
  IBMPlexSansCondensed_200: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 200,
    italic: false,
  },
  IBMPlexSansCondensed_100_Italic: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 100,
    italic: true,
  },
  IBMPlexSansCondensed_300: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 300,
    italic: false,
  },
  IBMPlexSansCondensed_300_Italic: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 300,
    italic: true,
  },
  IBMPlexSansCondensed_500: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 500,
    italic: false,
  },
  IBMPlexSansCondensed_700_Italic: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 700,
    italic: true,
  },
  IBMPlexSansCondensed_400: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 400,
    italic: false,
  },
  IBMPlexSansCondensed_400_Italic: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 400,
    italic: true,
  },
  IBMPlexSansCondensed_600: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 600,
    italic: false,
  },
  IBMPlexSansCondensed_100: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 100,
    italic: false,
  },
  IBMPlexSansCondensed_700: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 700,
    italic: false,
  },
  IBMPlexSansCondensed_500_Italic: {
    fontFamily: "IBM Plex Sans Condensed",
    weight: 500,
    italic: true,
  },

  // IBM Plex Sans ExtLt
  IBMPlexSansExtLt_200: {
    fontFamily: "IBM Plex Sans ExtLt",
    weight: 200,
    italic: false,
  },
  IBMPlexSansExtLt_200_Italic: {
    fontFamily: "IBM Plex Sans ExtLt",
    weight: 200,
    italic: true,
  },

  // IBM Plex Sans Medm
  IBMPlexSansMedm_500_Italic: {
    fontFamily: "IBM Plex Sans Medm",
    weight: 500,
    italic: true,
  },
  IBMPlexSansMedm_500: {
    fontFamily: "IBM Plex Sans Medm",
    weight: 500,
    italic: false,
  },

  // IBM Plex Sans SmBld
  IBMPlexSansSmBld_600: {
    fontFamily: "IBM Plex Sans SmBld",
    weight: 600,
    italic: false,
  },
  IBMPlexSansSmBld_600_Italic: {
    fontFamily: "IBM Plex Sans SmBld",
    weight: 600,
    italic: true,
  },

  // IBM Plex Sans Text
  IBMPlexSansText_400: {
    fontFamily: "IBM Plex Sans Text",
    weight: 400,
    italic: false,
  },
  IBMPlexSansText_400_Italic: {
    fontFamily: "IBM Plex Sans Text",
    weight: 400,
    italic: true,
  },

  // Inter
  Inter_500: {
    fontFamily: "Inter",
    weight: 500,
    italic: false,
  },
  Inter_800: {
    fontFamily: "Inter",
    weight: 800,
    italic: false,
  },
  Inter_900: {
    fontFamily: "Inter",
    weight: 900,
    italic: false,
  },
  Inter_200_Italic: {
    fontFamily: "Inter",
    weight: 200,
    italic: true,
  },
  Inter_400: {
    fontFamily: "Inter",
    weight: 400,
    italic: false,
  },
  Inter_400_Italic: {
    fontFamily: "Inter",
    weight: 400,
    italic: true,
  },
  Inter_800_Italic: {
    fontFamily: "Inter",
    weight: 800,
    italic: true,
  },
  Inter_300: {
    fontFamily: "Inter",
    weight: 300,
    italic: false,
  },
  Inter_100: {
    fontFamily: "Inter",
    weight: 100,
    italic: false,
  },
  Inter_200: {
    fontFamily: "Inter",
    weight: 200,
    italic: false,
  },
  Inter_600: {
    fontFamily: "Inter",
    weight: 600,
    italic: false,
  },
  Inter_100_Italic: {
    fontFamily: "Inter",
    weight: 100,
    italic: true,
  },
  Inter_600_Italic: {
    fontFamily: "Inter",
    weight: 600,
    italic: true,
  },
  Inter_700: {
    fontFamily: "Inter",
    weight: 700,
    italic: false,
  },
  Inter_500_Italic: {
    fontFamily: "Inter",
    weight: 500,
    italic: true,
  },
  Inter_300_Italic: {
    fontFamily: "Inter",
    weight: 300,
    italic: true,
  },
  Inter_700_Italic: {
    fontFamily: "Inter",
    weight: 700,
    italic: true,
  },
  Inter_900_Italic: {
    fontFamily: "Inter",
    weight: 900,
    italic: true,
  },

  // Inter Display
  InterDisplay_300: {
    fontFamily: "Inter Display",
    weight: 300,
    italic: false,
  },
  InterDisplay_400_Italic: {
    fontFamily: "Inter Display",
    weight: 400,
    italic: true,
  },
  InterDisplay_900_Italic: {
    fontFamily: "Inter Display",
    weight: 900,
    italic: true,
  },
  InterDisplay_800_Italic: {
    fontFamily: "Inter Display",
    weight: 800,
    italic: true,
  },
  InterDisplay_200_Italic: {
    fontFamily: "Inter Display",
    weight: 200,
    italic: true,
  },
  InterDisplay_700: {
    fontFamily: "Inter Display",
    weight: 700,
    italic: false,
  },
  InterDisplay_800: {
    fontFamily: "Inter Display",
    weight: 800,
    italic: false,
  },
  InterDisplay_600_Italic: {
    fontFamily: "Inter Display",
    weight: 600,
    italic: true,
  },
  InterDisplay_100: {
    fontFamily: "Inter Display",
    weight: 100,
    italic: false,
  },
  InterDisplay_500: {
    fontFamily: "Inter Display",
    weight: 500,
    italic: false,
  },
  InterDisplay_200: {
    fontFamily: "Inter Display",
    weight: 200,
    italic: false,
  },
  InterDisplay_100_Italic: {
    fontFamily: "Inter Display",
    weight: 100,
    italic: true,
  },
  InterDisplay_600: {
    fontFamily: "Inter Display",
    weight: 600,
    italic: false,
  },
  InterDisplay_700_Italic: {
    fontFamily: "Inter Display",
    weight: 700,
    italic: true,
  },
  InterDisplay_500_Italic: {
    fontFamily: "Inter Display",
    weight: 500,
    italic: true,
  },
  InterDisplay_400: {
    fontFamily: "Inter Display",
    weight: 400,
    italic: false,
  },
  InterDisplay_900: {
    fontFamily: "Inter Display",
    weight: 900,
    italic: false,
  },
  InterDisplay_300_Italic: {
    fontFamily: "Inter Display",
    weight: 300,
    italic: true,
  },

  // Inter Variable
  InterVariable_400: {
    fontFamily: "Inter Variable",
    weight: 400,
    italic: false,
  },
  InterVariable_400_Italic: {
    fontFamily: "Inter Variable",
    weight: 400,
    italic: true,
  },

  // Merriweather
  Merriweather_700: {
    fontFamily: "Merriweather",
    weight: 700,
    italic: false,
  },
  Merriweather_400: {
    fontFamily: "Merriweather",
    weight: 400,
    italic: false,
  },
  Merriweather_700_Italic: {
    fontFamily: "Merriweather",
    weight: 700,
    italic: true,
  },
  Merriweather_300: {
    fontFamily: "Merriweather",
    weight: 300,
    italic: false,
  },
  Merriweather_900_Italic: {
    fontFamily: "Merriweather",
    weight: 900,
    italic: true,
  },
  Merriweather_900: {
    fontFamily: "Merriweather",
    weight: 900,
    italic: false,
  },
  Merriweather_400_Italic: {
    fontFamily: "Merriweather",
    weight: 400,
    italic: true,
  },
  Merriweather_300_Italic: {
    fontFamily: "Merriweather",
    weight: 300,
    italic: true,
  },

  // National 2
  National2_700_Italic: {
    fontFamily: "National 2",
    weight: 700,
    italic: true,
  },
  National2_800: {
    fontFamily: "National 2",
    weight: 800,
    italic: false,
  },
  National2_400_Italic: {
    fontFamily: "National 2",
    weight: 400,
    italic: true,
  },
  National2_900: {
    fontFamily: "National 2",
    weight: 900,
    italic: false,
  },
  National2_700: {
    fontFamily: "National 2",
    weight: 700,
    italic: false,
  },
  National2_400: {
    fontFamily: "National 2",
    weight: 400,
    italic: false,
  },

  // National 2 Narrow
  National2Narrow_400: {
    fontFamily: "National 2 Narrow",
    weight: 400,
    italic: false,
  },
  National2Narrow_400_Italic: {
    fontFamily: "National 2 Narrow",
    weight: 400,
    italic: true,
  },

  // Noto Sans
  NotoSans_400_Italic: {
    fontFamily: "Noto Sans",
    weight: 400,
    italic: true,
  },
  NotoSans_400: {
    fontFamily: "Noto Sans",
    weight: 400,
    italic: false,
  },
  NotoSans_700: {
    fontFamily: "Noto Sans",
    weight: 700,
    italic: false,
  },
  NotoSans_900_Italic: {
    fontFamily: "Noto Sans",
    weight: 900,
    italic: true,
  },
  NotoSans_500: {
    fontFamily: "Noto Sans",
    weight: 500,
    italic: false,
  },
  NotoSans_800_Italic: {
    fontFamily: "Noto Sans",
    weight: 800,
    italic: true,
  },
  NotoSans_900: {
    fontFamily: "Noto Sans",
    weight: 900,
    italic: false,
  },
  NotoSans_100_Italic: {
    fontFamily: "Noto Sans",
    weight: 100,
    italic: true,
  },
  NotoSans_100: {
    fontFamily: "Noto Sans",
    weight: 100,
    italic: false,
  },
  NotoSans_200_Italic: {
    fontFamily: "Noto Sans",
    weight: 200,
    italic: true,
  },
  NotoSans_600_Italic: {
    fontFamily: "Noto Sans",
    weight: 600,
    italic: true,
  },
  NotoSans_800: {
    fontFamily: "Noto Sans",
    weight: 800,
    italic: false,
  },
  NotoSans_700_Italic: {
    fontFamily: "Noto Sans",
    weight: 700,
    italic: true,
  },
  NotoSans_300_Italic: {
    fontFamily: "Noto Sans",
    weight: 300,
    italic: true,
  },
  NotoSans_300: {
    fontFamily: "Noto Sans",
    weight: 300,
    italic: false,
  },
  NotoSans_600: {
    fontFamily: "Noto Sans",
    weight: 600,
    italic: false,
  },
  NotoSans_500_Italic: {
    fontFamily: "Noto Sans",
    weight: 500,
    italic: true,
  },
  NotoSans_200: {
    fontFamily: "Noto Sans",
    weight: 200,
    italic: false,
  },

  // Noto Sans Ethiopic
  NotoSansEthiopic_600: {
    fontFamily: "Noto Sans Ethiopic",
    weight: 600,
    italic: false,
  },
  NotoSansEthiopic_500: {
    fontFamily: "Noto Sans Ethiopic",
    weight: 500,
    italic: false,
  },
  NotoSansEthiopic_300: {
    fontFamily: "Noto Sans Ethiopic",
    weight: 300,
    italic: false,
  },
  NotoSansEthiopic_700: {
    fontFamily: "Noto Sans Ethiopic",
    weight: 700,
    italic: false,
  },
  NotoSansEthiopic_200: {
    fontFamily: "Noto Sans Ethiopic",
    weight: 200,
    italic: false,
  },
  NotoSansEthiopic_800: {
    fontFamily: "Noto Sans Ethiopic",
    weight: 800,
    italic: false,
  },
  NotoSansEthiopic_400: {
    fontFamily: "Noto Sans Ethiopic",
    weight: 400,
    italic: false,
  },
  NotoSansEthiopic_900: {
    fontFamily: "Noto Sans Ethiopic",
    weight: 900,
    italic: false,
  },

  // Poppins
  Poppins_300: {
    fontFamily: "Poppins",
    weight: 300,
    italic: false,
  },
  Poppins_600: {
    fontFamily: "Poppins",
    weight: 600,
    italic: false,
  },
  Poppins_500: {
    fontFamily: "Poppins",
    weight: 500,
    italic: false,
  },
  Poppins_500_Italic: {
    fontFamily: "Poppins",
    weight: 500,
    italic: true,
  },
  Poppins_200_Italic: {
    fontFamily: "Poppins",
    weight: 200,
    italic: true,
  },
  Poppins_400: {
    fontFamily: "Poppins",
    weight: 400,
    italic: false,
  },
  Poppins_300_Italic: {
    fontFamily: "Poppins",
    weight: 300,
    italic: true,
  },
  Poppins_700_Italic: {
    fontFamily: "Poppins",
    weight: 700,
    italic: true,
  },
  Poppins_200: {
    fontFamily: "Poppins",
    weight: 200,
    italic: false,
  },
  Poppins_800: {
    fontFamily: "Poppins",
    weight: 800,
    italic: false,
  },
  Poppins_800_Italic: {
    fontFamily: "Poppins",
    weight: 800,
    italic: true,
  },
  Poppins_700: {
    fontFamily: "Poppins",
    weight: 700,
    italic: false,
  },
  Poppins_900_Italic: {
    fontFamily: "Poppins",
    weight: 900,
    italic: true,
  },
  Poppins_600_Italic: {
    fontFamily: "Poppins",
    weight: 600,
    italic: true,
  },
  Poppins_400_Italic: {
    fontFamily: "Poppins",
    weight: 400,
    italic: true,
  },
  Poppins_900: {
    fontFamily: "Poppins",
    weight: 900,
    italic: false,
  },

  // Pragati Narrow
  PragatiNarrow_700: {
    fontFamily: "Pragati Narrow",
    weight: 700,
    italic: false,
  },
  PragatiNarrow_400: {
    fontFamily: "Pragati Narrow",
    weight: 400,
    italic: false,
  },

  // Roboto
  Roboto_500: {
    fontFamily: "Roboto",
    weight: 500,
    italic: false,
  },
  Roboto_300: {
    fontFamily: "Roboto",
    weight: 300,
    italic: false,
  },
  Roboto_200: {
    fontFamily: "Roboto",
    weight: 200,
    italic: false,
  },
  Roboto_400: {
    fontFamily: "Roboto",
    weight: 400,
    italic: false,
  },
  Roboto_500_Italic: {
    fontFamily: "Roboto",
    weight: 500,
    italic: true,
  },
  Roboto_900: {
    fontFamily: "Roboto",
    weight: 900,
    italic: false,
  },
  Roboto_400_Italic: {
    fontFamily: "Roboto",
    weight: 400,
    italic: true,
  },
  Roboto_300_Italic: {
    fontFamily: "Roboto",
    weight: 300,
    italic: true,
  },
  Roboto_900_Italic: {
    fontFamily: "Roboto",
    weight: 900,
    italic: true,
  },
  Roboto_700: {
    fontFamily: "Roboto",
    weight: 700,
    italic: false,
  },
  Roboto_200_Italic: {
    fontFamily: "Roboto",
    weight: 200,
    italic: true,
  },
  Roboto_700_Italic: {
    fontFamily: "Roboto",
    weight: 700,
    italic: true,
  },

  // Roboto Condensed
  RobotoCondensed_700_Italic: {
    fontFamily: "Roboto Condensed",
    weight: 700,
    italic: true,
  },
  RobotoCondensed_300: {
    fontFamily: "Roboto Condensed",
    weight: 300,
    italic: false,
  },
  RobotoCondensed_300_Italic: {
    fontFamily: "Roboto Condensed",
    weight: 300,
    italic: true,
  },
  RobotoCondensed_400: {
    fontFamily: "Roboto Condensed",
    weight: 400,
    italic: false,
  },
  RobotoCondensed_400_Italic: {
    fontFamily: "Roboto Condensed",
    weight: 400,
    italic: true,
  },
  RobotoCondensed_700: {
    fontFamily: "Roboto Condensed",
    weight: 700,
    italic: false,
  },

  // Roboto Mono
  RobotoMono_500: {
    fontFamily: "Roboto Mono",
    weight: 500,
    italic: false,
  },
  RobotoMono_600: {
    fontFamily: "Roboto Mono",
    weight: 600,
    italic: false,
  },
  RobotoMono_700: {
    fontFamily: "Roboto Mono",
    weight: 700,
    italic: false,
  },
  RobotoMono_600_Italic: {
    fontFamily: "Roboto Mono",
    weight: 600,
    italic: true,
  },
  RobotoMono_400_Italic: {
    fontFamily: "Roboto Mono",
    weight: 400,
    italic: true,
  },
  RobotoMono_500_Italic: {
    fontFamily: "Roboto Mono",
    weight: 500,
    italic: true,
  },
  RobotoMono_200: {
    fontFamily: "Roboto Mono",
    weight: 200,
    italic: false,
  },
  RobotoMono_200_Italic: {
    fontFamily: "Roboto Mono",
    weight: 200,
    italic: true,
  },
  RobotoMono_400: {
    fontFamily: "Roboto Mono",
    weight: 400,
    italic: false,
  },
  RobotoMono_300: {
    fontFamily: "Roboto Mono",
    weight: 300,
    italic: false,
  },
  RobotoMono_300_Italic: {
    fontFamily: "Roboto Mono",
    weight: 300,
    italic: true,
  },
  RobotoMono_700_Italic: {
    fontFamily: "Roboto Mono",
    weight: 700,
    italic: true,
  },

  // Sarabun
  Sarabun_300: {
    fontFamily: "Sarabun",
    weight: 300,
    italic: false,
  },
  Sarabun_600_Italic: {
    fontFamily: "Sarabun",
    weight: 600,
    italic: true,
  },
  Sarabun_400_Italic: {
    fontFamily: "Sarabun",
    weight: 400,
    italic: true,
  },
  Sarabun_300_Italic: {
    fontFamily: "Sarabun",
    weight: 300,
    italic: true,
  },
  Sarabun_800_Italic: {
    fontFamily: "Sarabun",
    weight: 800,
    italic: true,
  },
  Sarabun_800: {
    fontFamily: "Sarabun",
    weight: 800,
    italic: false,
  },
  Sarabun_200: {
    fontFamily: "Sarabun",
    weight: 200,
    italic: false,
  },
  Sarabun_200_Italic: {
    fontFamily: "Sarabun",
    weight: 200,
    italic: true,
  },
  Sarabun_700_Italic: {
    fontFamily: "Sarabun",
    weight: 700,
    italic: true,
  },
  Sarabun_500: {
    fontFamily: "Sarabun",
    weight: 500,
    italic: false,
  },
  Sarabun_400: {
    fontFamily: "Sarabun",
    weight: 400,
    italic: false,
  },
  Sarabun_700: {
    fontFamily: "Sarabun",
    weight: 700,
    italic: false,
  },
  Sarabun_600: {
    fontFamily: "Sarabun",
    weight: 600,
    italic: false,
  },
  Sarabun_500_Italic: {
    fontFamily: "Sarabun",
    weight: 500,
    italic: true,
  },

  // Source Sans 3
  SourceSans3_300: {
    fontFamily: "Source Sans 3",
    weight: 300,
    italic: false,
  },
  SourceSans3_500_Italic: {
    fontFamily: "Source Sans 3",
    weight: 500,
    italic: true,
  },
  SourceSans3_700: {
    fontFamily: "Source Sans 3",
    weight: 700,
    italic: false,
  },
  SourceSans3_200_Italic: {
    fontFamily: "Source Sans 3",
    weight: 200,
    italic: true,
  },
  SourceSans3_800: {
    fontFamily: "Source Sans 3",
    weight: 800,
    italic: false,
  },
  SourceSans3_900_Italic: {
    fontFamily: "Source Sans 3",
    weight: 900,
    italic: true,
  },
  SourceSans3_900: {
    fontFamily: "Source Sans 3",
    weight: 900,
    italic: false,
  },
  SourceSans3_400: {
    fontFamily: "Source Sans 3",
    weight: 400,
    italic: false,
  },
  SourceSans3_600_Italic: {
    fontFamily: "Source Sans 3",
    weight: 600,
    italic: true,
  },
  SourceSans3_600: {
    fontFamily: "Source Sans 3",
    weight: 600,
    italic: false,
  },
  SourceSans3_800_Italic: {
    fontFamily: "Source Sans 3",
    weight: 800,
    italic: true,
  },
  SourceSans3_300_Italic: {
    fontFamily: "Source Sans 3",
    weight: 300,
    italic: true,
  },
  SourceSans3_400_Italic: {
    fontFamily: "Source Sans 3",
    weight: 400,
    italic: true,
  },
  SourceSans3_500: {
    fontFamily: "Source Sans 3",
    weight: 500,
    italic: false,
  },
  SourceSans3_700_Italic: {
    fontFamily: "Source Sans 3",
    weight: 700,
    italic: true,
  },
  SourceSans3_200: {
    fontFamily: "Source Sans 3",
    weight: 200,
    italic: false,
  },

  // Source Serif 4
  SourceSerif4_600_Italic: {
    fontFamily: "Source Serif 4",
    weight: 600,
    italic: true,
  },
  SourceSerif4_700: {
    fontFamily: "Source Serif 4",
    weight: 700,
    italic: false,
  },
  SourceSerif4_800: {
    fontFamily: "Source Serif 4",
    weight: 800,
    italic: false,
  },
  SourceSerif4_300_Italic: {
    fontFamily: "Source Serif 4",
    weight: 300,
    italic: true,
  },
  SourceSerif4_900: {
    fontFamily: "Source Serif 4",
    weight: 900,
    italic: false,
  },
  SourceSerif4_700_Italic: {
    fontFamily: "Source Serif 4",
    weight: 700,
    italic: true,
  },
  SourceSerif4_500_Italic: {
    fontFamily: "Source Serif 4",
    weight: 500,
    italic: true,
  },
  SourceSerif4_600: {
    fontFamily: "Source Serif 4",
    weight: 600,
    italic: false,
  },
  SourceSerif4_200: {
    fontFamily: "Source Serif 4",
    weight: 200,
    italic: false,
  },
  SourceSerif4_500: {
    fontFamily: "Source Serif 4",
    weight: 500,
    italic: false,
  },
  SourceSerif4_200_Italic: {
    fontFamily: "Source Serif 4",
    weight: 200,
    italic: true,
  },
  SourceSerif4_400_Italic: {
    fontFamily: "Source Serif 4",
    weight: 400,
    italic: true,
  },
  SourceSerif4_900_Italic: {
    fontFamily: "Source Serif 4",
    weight: 900,
    italic: true,
  },
  SourceSerif4_300: {
    fontFamily: "Source Serif 4",
    weight: 300,
    italic: false,
  },
  SourceSerif4_400: {
    fontFamily: "Source Serif 4",
    weight: 400,
    italic: false,
  },
  SourceSerif4_800_Italic: {
    fontFamily: "Source Serif 4",
    weight: 800,
    italic: true,
  },

  // Test Die Grotesk A
  TestDieGroteskA_200: {
    fontFamily: "Test Die Grotesk A",
    weight: 200,
    italic: false,
  },
  TestDieGroteskA_900_Italic: {
    fontFamily: "Test Die Grotesk A",
    weight: 900,
    italic: true,
  },
  TestDieGroteskA_800_Italic: {
    fontFamily: "Test Die Grotesk A",
    weight: 800,
    italic: true,
  },
  TestDieGroteskA_700_Italic: {
    fontFamily: "Test Die Grotesk A",
    weight: 700,
    italic: true,
  },
  TestDieGroteskA_800: {
    fontFamily: "Test Die Grotesk A",
    weight: 800,
    italic: false,
  },
  TestDieGroteskA_300: {
    fontFamily: "Test Die Grotesk A",
    weight: 300,
    italic: false,
  },
  TestDieGroteskA_400_Italic: {
    fontFamily: "Test Die Grotesk A",
    weight: 400,
    italic: true,
  },
  TestDieGroteskA_900: {
    fontFamily: "Test Die Grotesk A",
    weight: 900,
    italic: false,
  },
  TestDieGroteskA_300_Italic: {
    fontFamily: "Test Die Grotesk A",
    weight: 300,
    italic: true,
  },
  TestDieGroteskA_500: {
    fontFamily: "Test Die Grotesk A",
    weight: 500,
    italic: false,
  },
  TestDieGroteskA_200_Italic: {
    fontFamily: "Test Die Grotesk A",
    weight: 200,
    italic: true,
  },
  TestDieGroteskA_500_Italic: {
    fontFamily: "Test Die Grotesk A",
    weight: 500,
    italic: true,
  },
  TestDieGroteskA_700: {
    fontFamily: "Test Die Grotesk A",
    weight: 700,
    italic: false,
  },
  TestDieGroteskA_400: {
    fontFamily: "Test Die Grotesk A",
    weight: 400,
    italic: false,
  },

  // Test Die Grotesk B
  TestDieGroteskB_400: {
    fontFamily: "Test Die Grotesk B",
    weight: 400,
    italic: false,
  },
  TestDieGroteskB_700: {
    fontFamily: "Test Die Grotesk B",
    weight: 700,
    italic: false,
  },
  TestDieGroteskB_900: {
    fontFamily: "Test Die Grotesk B",
    weight: 900,
    italic: false,
  },
  TestDieGroteskB_200: {
    fontFamily: "Test Die Grotesk B",
    weight: 200,
    italic: false,
  },
  TestDieGroteskB_700_Italic: {
    fontFamily: "Test Die Grotesk B",
    weight: 700,
    italic: true,
  },
  TestDieGroteskB_800: {
    fontFamily: "Test Die Grotesk B",
    weight: 800,
    italic: false,
  },
  TestDieGroteskB_500: {
    fontFamily: "Test Die Grotesk B",
    weight: 500,
    italic: false,
  },
  TestDieGroteskB_200_Italic: {
    fontFamily: "Test Die Grotesk B",
    weight: 200,
    italic: true,
  },
  TestDieGroteskB_300_Italic: {
    fontFamily: "Test Die Grotesk B",
    weight: 300,
    italic: true,
  },
  TestDieGroteskB_900_Italic: {
    fontFamily: "Test Die Grotesk B",
    weight: 900,
    italic: true,
  },
  TestDieGroteskB_800_Italic: {
    fontFamily: "Test Die Grotesk B",
    weight: 800,
    italic: true,
  },
  TestDieGroteskB_300: {
    fontFamily: "Test Die Grotesk B",
    weight: 300,
    italic: false,
  },
  TestDieGroteskB_500_Italic: {
    fontFamily: "Test Die Grotesk B",
    weight: 500,
    italic: true,
  },
  TestDieGroteskB_400_Italic: {
    fontFamily: "Test Die Grotesk B",
    weight: 400,
    italic: true,
  },

  // Test Die Grotesk C
  TestDieGroteskC_500: {
    fontFamily: "Test Die Grotesk C",
    weight: 500,
    italic: false,
  },
  TestDieGroteskC_900_Italic: {
    fontFamily: "Test Die Grotesk C",
    weight: 900,
    italic: true,
  },
  TestDieGroteskC_700: {
    fontFamily: "Test Die Grotesk C",
    weight: 700,
    italic: false,
  },
  TestDieGroteskC_400: {
    fontFamily: "Test Die Grotesk C",
    weight: 400,
    italic: false,
  },
  TestDieGroteskC_400_Italic: {
    fontFamily: "Test Die Grotesk C",
    weight: 400,
    italic: true,
  },
  TestDieGroteskC_300: {
    fontFamily: "Test Die Grotesk C",
    weight: 300,
    italic: false,
  },
  TestDieGroteskC_200: {
    fontFamily: "Test Die Grotesk C",
    weight: 200,
    italic: false,
  },
  TestDieGroteskC_800: {
    fontFamily: "Test Die Grotesk C",
    weight: 800,
    italic: false,
  },
  TestDieGroteskC_800_Italic: {
    fontFamily: "Test Die Grotesk C",
    weight: 800,
    italic: true,
  },
  TestDieGroteskC_700_Italic: {
    fontFamily: "Test Die Grotesk C",
    weight: 700,
    italic: true,
  },
  TestDieGroteskC_500_Italic: {
    fontFamily: "Test Die Grotesk C",
    weight: 500,
    italic: true,
  },
  TestDieGroteskC_200_Italic: {
    fontFamily: "Test Die Grotesk C",
    weight: 200,
    italic: true,
  },
  TestDieGroteskC_300_Italic: {
    fontFamily: "Test Die Grotesk C",
    weight: 300,
    italic: true,
  },
  TestDieGroteskC_900: {
    fontFamily: "Test Die Grotesk C",
    weight: 900,
    italic: false,
  },

  // Test Die Grotesk D
  TestDieGroteskD_800_Italic: {
    fontFamily: "Test Die Grotesk D",
    weight: 800,
    italic: true,
  },
  TestDieGroteskD_500: {
    fontFamily: "Test Die Grotesk D",
    weight: 500,
    italic: false,
  },
  TestDieGroteskD_200_Italic: {
    fontFamily: "Test Die Grotesk D",
    weight: 200,
    italic: true,
  },
  TestDieGroteskD_300_Italic: {
    fontFamily: "Test Die Grotesk D",
    weight: 300,
    italic: true,
  },
  TestDieGroteskD_900_Italic: {
    fontFamily: "Test Die Grotesk D",
    weight: 900,
    italic: true,
  },
  TestDieGroteskD_800: {
    fontFamily: "Test Die Grotesk D",
    weight: 800,
    italic: false,
  },
  TestDieGroteskD_400: {
    fontFamily: "Test Die Grotesk D",
    weight: 400,
    italic: false,
  },
  TestDieGroteskD_900: {
    fontFamily: "Test Die Grotesk D",
    weight: 900,
    italic: false,
  },
  TestDieGroteskD_200: {
    fontFamily: "Test Die Grotesk D",
    weight: 200,
    italic: false,
  },
  TestDieGroteskD_400_Italic: {
    fontFamily: "Test Die Grotesk D",
    weight: 400,
    italic: true,
  },
  TestDieGroteskD_700: {
    fontFamily: "Test Die Grotesk D",
    weight: 700,
    italic: false,
  },
  TestDieGroteskD_300: {
    fontFamily: "Test Die Grotesk D",
    weight: 300,
    italic: false,
  },
  TestDieGroteskD_500_Italic: {
    fontFamily: "Test Die Grotesk D",
    weight: 500,
    italic: true,
  },
  TestDieGroteskD_700_Italic: {
    fontFamily: "Test Die Grotesk D",
    weight: 700,
    italic: true,
  },

  // Test Founders Grotesk
  TestFoundersGrotesk_700_Italic: {
    fontFamily: "Test Founders Grotesk",
    weight: 700,
    italic: true,
  },
  TestFoundersGrotesk_300_Italic: {
    fontFamily: "Test Founders Grotesk",
    weight: 300,
    italic: true,
  },
  TestFoundersGrotesk_500: {
    fontFamily: "Test Founders Grotesk",
    weight: 500,
    italic: false,
  },
  TestFoundersGrotesk_700: {
    fontFamily: "Test Founders Grotesk",
    weight: 700,
    italic: false,
  },
  TestFoundersGrotesk_400: {
    fontFamily: "Test Founders Grotesk",
    weight: 400,
    italic: false,
  },
  TestFoundersGrotesk_600: {
    fontFamily: "Test Founders Grotesk",
    weight: 600,
    italic: false,
  },
  TestFoundersGrotesk_600_Italic: {
    fontFamily: "Test Founders Grotesk",
    weight: 600,
    italic: true,
  },
  TestFoundersGrotesk_400_Italic: {
    fontFamily: "Test Founders Grotesk",
    weight: 400,
    italic: true,
  },
  TestFoundersGrotesk_500_Italic: {
    fontFamily: "Test Founders Grotesk",
    weight: 500,
    italic: true,
  },
  TestFoundersGrotesk_300: {
    fontFamily: "Test Founders Grotesk",
    weight: 300,
    italic: false,
  },

  // Test Martina Plantijn
  TestMartinaPlantijn_300_Italic: {
    fontFamily: "Test Martina Plantijn",
    weight: 300,
    italic: true,
  },
  TestMartinaPlantijn_500_Italic: {
    fontFamily: "Test Martina Plantijn",
    weight: 500,
    italic: true,
  },
  TestMartinaPlantijn_700: {
    fontFamily: "Test Martina Plantijn",
    weight: 700,
    italic: false,
  },
  TestMartinaPlantijn_300: {
    fontFamily: "Test Martina Plantijn",
    weight: 300,
    italic: false,
  },
  TestMartinaPlantijn_900_Italic: {
    fontFamily: "Test Martina Plantijn",
    weight: 900,
    italic: true,
  },
  TestMartinaPlantijn_500: {
    fontFamily: "Test Martina Plantijn",
    weight: 500,
    italic: false,
  },
  TestMartinaPlantijn_400_Italic: {
    fontFamily: "Test Martina Plantijn",
    weight: 400,
    italic: true,
  },
  TestMartinaPlantijn_900: {
    fontFamily: "Test Martina Plantijn",
    weight: 900,
    italic: false,
  },
  TestMartinaPlantijn_700_Italic: {
    fontFamily: "Test Martina Plantijn",
    weight: 700,
    italic: true,
  },
  TestMartinaPlantijn_400: {
    fontFamily: "Test Martina Plantijn",
    weight: 400,
    italic: false,
  },

  // Test Metric
  TestMetric_500_Italic: {
    fontFamily: "Test Metric",
    weight: 500,
    italic: true,
  },
  TestMetric_600_Italic: {
    fontFamily: "Test Metric",
    weight: 600,
    italic: true,
  },
  TestMetric_400_Italic: {
    fontFamily: "Test Metric",
    weight: 400,
    italic: true,
  },
  TestMetric_200_Italic: {
    fontFamily: "Test Metric",
    weight: 200,
    italic: true,
  },
  TestMetric_500: {
    fontFamily: "Test Metric",
    weight: 500,
    italic: false,
  },
  TestMetric_600: {
    fontFamily: "Test Metric",
    weight: 600,
    italic: false,
  },
  TestMetric_300: {
    fontFamily: "Test Metric",
    weight: 300,
    italic: false,
  },
  TestMetric_700_Italic: {
    fontFamily: "Test Metric",
    weight: 700,
    italic: true,
  },
  TestMetric_200: {
    fontFamily: "Test Metric",
    weight: 200,
    italic: false,
  },
  TestMetric_700: {
    fontFamily: "Test Metric",
    weight: 700,
    italic: false,
  },
  TestMetric_300_Italic: {
    fontFamily: "Test Metric",
    weight: 300,
    italic: true,
  },
  TestMetric_900: {
    fontFamily: "Test Metric",
    weight: 900,
    italic: false,
  },
  TestMetric_900_Italic: {
    fontFamily: "Test Metric",
    weight: 900,
    italic: true,
  },
  TestMetric_400: {
    fontFamily: "Test Metric",
    weight: 400,
    italic: false,
  },

  // Test The Future
  TestTheFuture_700_Italic: {
    fontFamily: "Test The Future",
    weight: 700,
    italic: true,
  },
  TestTheFuture_300_Italic: {
    fontFamily: "Test The Future",
    weight: 300,
    italic: true,
  },
  TestTheFuture_400_Italic: {
    fontFamily: "Test The Future",
    weight: 400,
    italic: true,
  },
  TestTheFuture_500: {
    fontFamily: "Test The Future",
    weight: 500,
    italic: false,
  },
  TestTheFuture_300: {
    fontFamily: "Test The Future",
    weight: 300,
    italic: false,
  },
  TestTheFuture_200: {
    fontFamily: "Test The Future",
    weight: 200,
    italic: false,
  },
  TestTheFuture_900_Italic: {
    fontFamily: "Test The Future",
    weight: 900,
    italic: true,
  },
  TestTheFuture_400: {
    fontFamily: "Test The Future",
    weight: 400,
    italic: false,
  },
  TestTheFuture_200_Italic: {
    fontFamily: "Test The Future",
    weight: 200,
    italic: true,
  },
  TestTheFuture_900: {
    fontFamily: "Test The Future",
    weight: 900,
    italic: false,
  },
  TestTheFuture_500_Italic: {
    fontFamily: "Test The Future",
    weight: 500,
    italic: true,
  },
  TestTheFuture_700: {
    fontFamily: "Test The Future",
    weight: 700,
    italic: false,
  },

  // Test The Future Mono
  TestTheFutureMono_900_Italic: {
    fontFamily: "Test The Future Mono",
    weight: 900,
    italic: true,
  },
  TestTheFutureMono_400_Italic: {
    fontFamily: "Test The Future Mono",
    weight: 400,
    italic: true,
  },
  TestTheFutureMono_900: {
    fontFamily: "Test The Future Mono",
    weight: 900,
    italic: false,
  },
  TestTheFutureMono_200: {
    fontFamily: "Test The Future Mono",
    weight: 200,
    italic: false,
  },
  TestTheFutureMono_200_Italic: {
    fontFamily: "Test The Future Mono",
    weight: 200,
    italic: true,
  },
  TestTheFutureMono_300_Italic: {
    fontFamily: "Test The Future Mono",
    weight: 300,
    italic: true,
  },
  TestTheFutureMono_700: {
    fontFamily: "Test The Future Mono",
    weight: 700,
    italic: false,
  },
  TestTheFutureMono_300: {
    fontFamily: "Test The Future Mono",
    weight: 300,
    italic: false,
  },
  TestTheFutureMono_500: {
    fontFamily: "Test The Future Mono",
    weight: 500,
    italic: false,
  },
  TestTheFutureMono_700_Italic: {
    fontFamily: "Test The Future Mono",
    weight: 700,
    italic: true,
  },
  TestTheFutureMono_400: {
    fontFamily: "Test The Future Mono",
    weight: 400,
    italic: false,
  },
  TestTheFutureMono_500_Italic: {
    fontFamily: "Test The Future Mono",
    weight: 500,
    italic: true,
  },

  // Test Tiempos Text
  TestTiemposText_500: {
    fontFamily: "Test Tiempos Text",
    weight: 500,
    italic: false,
  },
  TestTiemposText_700_Italic: {
    fontFamily: "Test Tiempos Text",
    weight: 700,
    italic: true,
  },
  TestTiemposText_400: {
    fontFamily: "Test Tiempos Text",
    weight: 400,
    italic: false,
  },
  TestTiemposText_600_Italic: {
    fontFamily: "Test Tiempos Text",
    weight: 600,
    italic: true,
  },
  TestTiemposText_700: {
    fontFamily: "Test Tiempos Text",
    weight: 700,
    italic: false,
  },
  TestTiemposText_400_Italic: {
    fontFamily: "Test Tiempos Text",
    weight: 400,
    italic: true,
  },
  TestTiemposText_500_Italic: {
    fontFamily: "Test Tiempos Text",
    weight: 500,
    italic: true,
  },
  TestTiemposText_600: {
    fontFamily: "Test Tiempos Text",
    weight: 600,
    italic: false,
  },
};
