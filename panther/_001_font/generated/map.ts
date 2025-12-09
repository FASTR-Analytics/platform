// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Font map with extension-less paths
// At runtime, add the appropriate extension based on context:
//   - Deno/Skia: .woff (works reliably)
//   - jsPDF: .ttf
//   - Browser: .woff2
export const FONT_MAP = {
  "Cambria-400-italic": "cambria/Cambria-Italic",
  "Cambria-400-normal": "cambria/Cambria",
  "Cambria-700-italic": "cambria/Cambria-BoldItalic",
  "Cambria-700-normal": "cambria/Cambria-Bold",
  "FiraMono-400-italic": "fira-mono/FiraMono-Regular",
  "FiraMono-400-normal": "fira-mono/FiraMono-Regular",
  "FiraMono-500-italic": "fira-mono/FiraMono-Medium",
  "FiraMono-500-normal": "fira-mono/FiraMono-Medium",
  "FiraMono-700-italic": "fira-mono/FiraMono-Bold",
  "FiraMono-700-normal": "fira-mono/FiraMono-Bold",
  "FiraSans-100-italic": "fira-sans/FiraSans-ThinItalic",
  "FiraSans-100-normal": "fira-sans/FiraSans-Thin",
  "FiraSans-200-italic": "fira-sans/FiraSans-ExtraLightItalic",
  "FiraSans-200-normal": "fira-sans/FiraSans-ExtraLight",
  "FiraSans-300-italic": "fira-sans/FiraSans-LightItalic",
  "FiraSans-300-normal": "fira-sans/FiraSans-Light",
  "FiraSans-400-italic": "fira-sans/FiraSans-Italic",
  "FiraSans-400-normal": "fira-sans/FiraSans-Regular",
  "FiraSans-500-italic": "fira-sans/FiraSans-MediumItalic",
  "FiraSans-500-normal": "fira-sans/FiraSans-Medium",
  "FiraSans-600-italic": "fira-sans/FiraSans-SemiBoldItalic",
  "FiraSans-600-normal": "fira-sans/FiraSans-SemiBold",
  "FiraSans-700-italic": "fira-sans/FiraSans-BoldItalic",
  "FiraSans-700-normal": "fira-sans/FiraSans-Bold",
  "FiraSans-800-italic": "fira-sans/FiraSans-ExtraBoldItalic",
  "FiraSans-800-normal": "fira-sans/FiraSans-ExtraBold",
  "FiraSans-900-italic": "fira-sans/FiraSans-BlackItalic",
  "FiraSans-900-normal": "fira-sans/FiraSans-Black",
  "FiraSansCondensed-200-italic":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-100italic",
  "FiraSansCondensed-200-normal":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-100",
  "FiraSansCondensed-300-italic":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-200italic",
  "FiraSansCondensed-300-normal":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-200",
  "FiraSansCondensed-400-italic":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-italic",
  "FiraSansCondensed-400-normal":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-regular",
  "FiraSansCondensed-500-italic":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-500italic",
  "FiraSansCondensed-500-normal":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-500",
  "FiraSansCondensed-600-italic":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-600italic",
  "FiraSansCondensed-600-normal":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-600",
  "FiraSansCondensed-700-italic":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-700italic",
  "FiraSansCondensed-700-normal":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-700",
  "FiraSansCondensed-800-italic":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-800italic",
  "FiraSansCondensed-800-normal":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-800",
  "FiraSansCondensed-900-italic":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-900italic",
  "FiraSansCondensed-900-normal":
    "fira-sans-condensed/fira-sans-condensed-v10-latin-900",
  "Gibson-100-italic": "gibson/Gibson-ThinItalic",
  "Gibson-100-normal": "gibson/Gibson-Thin",
  "Gibson-200-italic": "gibson/Gibson-LightItalic",
  "Gibson-200-normal": "gibson/Gibson-Light",
  "Gibson-300-italic": "gibson/Gibson-BookItalic",
  "Gibson-300-normal": "gibson/Gibson-Book",
  "Gibson-400-italic": "gibson/Gibson-Italic",
  "Gibson-400-normal": "gibson/Gibson-Regular",
  "Gibson-500-italic": "gibson/Gibson-MediumItalic",
  "Gibson-500-normal": "gibson/Gibson-Medium",
  "Gibson-600-italic": "gibson/Gibson-SemiBoldItalic",
  "Gibson-600-normal": "gibson/Gibson-SemiBold",
  "Gibson-700-italic": "gibson/Gibson-BoldItalic",
  "Gibson-700-normal": "gibson/Gibson-Bold",
  "Gibson-800-italic": "gibson/Gibson-ExtraBoldItalic",
  "Gibson-800-normal": "gibson/Gibson-ExtraBold",
  "Gibson-900-italic": "gibson/Gibson-HeavyItalic",
  "Gibson-900-normal": "gibson/Gibson-Heavy",
  "GibsonVF-100-italic": "gibson/Gibson-VF/GibsonVF-Italic",
  "GibsonVF-100-normal": "gibson/Gibson-VF/GibsonVF-Regular",
  "IBMPlexSans-100-italic": "ibm-plex-sans/IBMPlexSans-ThinItalic",
  "IBMPlexSans-100-normal": "ibm-plex-sans/IBMPlexSans-Thin",
  "IBMPlexSans-300-italic": "ibm-plex-sans/IBMPlexSans-LightItalic",
  "IBMPlexSans-300-normal": "ibm-plex-sans/IBMPlexSans-Light",
  "IBMPlexSans-400-italic": "ibm-plex-sans/IBMPlexSans-Italic",
  "IBMPlexSans-400-normal": "ibm-plex-sans/IBMPlexSans-Regular",
  "IBMPlexSans-700-italic": "ibm-plex-sans/IBMPlexSans-BoldItalic",
  "IBMPlexSans-700-normal": "ibm-plex-sans/IBMPlexSans-Bold",
  "IBMPlexSansCondensed-100-italic":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-100italic",
  "IBMPlexSansCondensed-100-normal":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-100",
  "IBMPlexSansCondensed-200-italic":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-200italic",
  "IBMPlexSansCondensed-200-normal":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-200",
  "IBMPlexSansCondensed-300-italic":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-300italic",
  "IBMPlexSansCondensed-300-normal":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-300",
  "IBMPlexSansCondensed-400-italic":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-italic",
  "IBMPlexSansCondensed-400-normal":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-regular",
  "IBMPlexSansCondensed-500-italic":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-500italic",
  "IBMPlexSansCondensed-500-normal":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-500",
  "IBMPlexSansCondensed-600-italic":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-600italic",
  "IBMPlexSansCondensed-600-normal":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-600",
  "IBMPlexSansCondensed-700-italic":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-700italic",
  "IBMPlexSansCondensed-700-normal":
    "ibm-plex-sans-condensed/ibm-plex-sans-condensed-v14-latin-700",
  "IBMPlexSansExtLt-200-italic": "ibm-plex-sans/IBMPlexSans-ExtraLightItalic",
  "IBMPlexSansExtLt-200-normal": "ibm-plex-sans/IBMPlexSans-ExtraLight",
  "IBMPlexSansMedm-500-italic": "ibm-plex-sans/IBMPlexSans-MediumItalic",
  "IBMPlexSansMedm-500-normal": "ibm-plex-sans/IBMPlexSans-Medium",
  "IBMPlexSansSmBld-600-italic": "ibm-plex-sans/IBMPlexSans-SemiBoldItalic",
  "IBMPlexSansSmBld-600-normal": "ibm-plex-sans/IBMPlexSans-SemiBold",
  "IBMPlexSansText-400-italic": "ibm-plex-sans/IBMPlexSans-TextItalic",
  "IBMPlexSansText-400-normal": "ibm-plex-sans/IBMPlexSans-Text",
  "Inter-100-italic": "inter/Inter-ThinItalic",
  "Inter-100-normal": "inter/Inter-Thin",
  "Inter-200-italic": "inter/Inter-ExtraLightItalic",
  "Inter-200-normal": "inter/Inter-ExtraLight",
  "Inter-300-italic": "inter/Inter-LightItalic",
  "Inter-300-normal": "inter/Inter-Light",
  "Inter-400-italic": "inter/Inter-Italic",
  "Inter-400-normal": "inter/Inter-Regular",
  "Inter-500-italic": "inter/Inter-MediumItalic",
  "Inter-500-normal": "inter/Inter-Medium",
  "Inter-600-italic": "inter/Inter-SemiBoldItalic",
  "Inter-600-normal": "inter/Inter-SemiBold",
  "Inter-700-italic": "inter/Inter-BoldItalic",
  "Inter-700-normal": "inter/Inter-Bold",
  "Inter-800-italic": "inter/Inter-ExtraBoldItalic",
  "Inter-800-normal": "inter/Inter-ExtraBold",
  "Inter-900-italic": "inter/Inter-BlackItalic",
  "Inter-900-normal": "inter/Inter-Black",
  "InterDisplay-100-italic": "inter/InterDisplay-ThinItalic",
  "InterDisplay-100-normal": "inter/InterDisplay-Thin",
  "InterDisplay-200-italic": "inter/InterDisplay-ExtraLightItalic",
  "InterDisplay-200-normal": "inter/InterDisplay-ExtraLight",
  "InterDisplay-300-italic": "inter/InterDisplay-LightItalic",
  "InterDisplay-300-normal": "inter/InterDisplay-Light",
  "InterDisplay-400-italic": "inter/InterDisplay-Italic",
  "InterDisplay-400-normal": "inter/InterDisplay-Regular",
  "InterDisplay-500-italic": "inter/InterDisplay-MediumItalic",
  "InterDisplay-500-normal": "inter/InterDisplay-Medium",
  "InterDisplay-600-italic": "inter/InterDisplay-SemiBoldItalic",
  "InterDisplay-600-normal": "inter/InterDisplay-SemiBold",
  "InterDisplay-700-italic": "inter/InterDisplay-BoldItalic",
  "InterDisplay-700-normal": "inter/InterDisplay-Bold",
  "InterDisplay-800-italic": "inter/InterDisplay-ExtraBoldItalic",
  "InterDisplay-800-normal": "inter/InterDisplay-ExtraBold",
  "InterDisplay-900-italic": "inter/InterDisplay-BlackItalic",
  "InterDisplay-900-normal": "inter/InterDisplay-Black",
  "Merriweather-300-italic": "merriweather/Merriweather-LightItalic",
  "Merriweather-300-normal": "merriweather/Merriweather-Light",
  "Merriweather-400-italic": "merriweather/Merriweather-Italic",
  "Merriweather-400-normal": "merriweather/Merriweather-Regular",
  "Merriweather-700-italic": "merriweather/Merriweather-BoldItalic",
  "Merriweather-700-normal": "merriweather/Merriweather-Bold",
  "Merriweather-900-italic": "merriweather/merriweather-v30-latin-900italic",
  "Merriweather-900-normal": "merriweather/merriweather-v30-latin-900",
  "National2-400-italic": "national-2/National2-RegularItalic",
  "National2-400-normal": "national-2/National2-Regular",
  "National2-700-italic": "national-2/National2-BoldItalic",
  "National2-700-normal": "national-2/National2-Bold",
  "National2-800-italic": "national-2/National2-Extrabold",
  "National2-800-normal": "national-2/National2-Extrabold",
  "National2-900-italic": "national-2/National2-Black",
  "National2-900-normal": "national-2/National2-Black",
  "National2Narrow-400-italic": "national-2/National2Narrow-RegularItalic",
  "National2Narrow-400-normal": "national-2/National2Narrow-Regular",
  "NotoSans-100-italic": "noto-sans/noto-sans-v28-latin-100italic",
  "NotoSans-100-normal": "noto-sans/noto-sans-v28-latin-100",
  "NotoSans-200-italic": "noto-sans/noto-sans-v28-latin-200italic",
  "NotoSans-200-normal": "noto-sans/noto-sans-v28-latin-200",
  "NotoSans-300-italic": "noto-sans/noto-sans-v28-latin-300italic",
  "NotoSans-300-normal": "noto-sans/noto-sans-v28-latin-300",
  "NotoSans-400-italic": "noto-sans/noto-sans-v28-latin-italic",
  "NotoSans-400-normal": "noto-sans/noto-sans-v28-latin-regular",
  "NotoSans-500-italic": "noto-sans/noto-sans-v28-latin-500italic",
  "NotoSans-500-normal": "noto-sans/noto-sans-v28-latin-500",
  "NotoSans-600-italic": "noto-sans/noto-sans-v28-latin-600italic",
  "NotoSans-600-normal": "noto-sans/noto-sans-v28-latin-600",
  "NotoSans-700-italic": "noto-sans/noto-sans-v28-latin-700italic",
  "NotoSans-700-normal": "noto-sans/noto-sans-v28-latin-700",
  "NotoSans-800-italic": "noto-sans/noto-sans-v28-latin-800italic",
  "NotoSans-800-normal": "noto-sans/noto-sans-v28-latin-800",
  "NotoSans-900-italic": "noto-sans/noto-sans-v28-latin-900italic",
  "NotoSans-900-normal": "noto-sans/noto-sans-v28-latin-900",
  "NotoSansEthiopic-200-italic": "noto-sans-ethiopic/NotoSansEthiopic-Thin",
  "NotoSansEthiopic-200-normal": "noto-sans-ethiopic/NotoSansEthiopic-Thin",
  "NotoSansEthiopic-300-italic": "noto-sans-ethiopic/NotoSansEthiopic-Light",
  "NotoSansEthiopic-300-normal": "noto-sans-ethiopic/NotoSansEthiopic-Light",
  "NotoSansEthiopic-400-italic": "noto-sans-ethiopic/NotoSansEthiopic-Regular",
  "NotoSansEthiopic-400-normal": "noto-sans-ethiopic/NotoSansEthiopic-Regular",
  "NotoSansEthiopic-500-italic": "noto-sans-ethiopic/NotoSansEthiopic-Medium",
  "NotoSansEthiopic-500-normal": "noto-sans-ethiopic/NotoSansEthiopic-Medium",
  "NotoSansEthiopic-600-italic": "noto-sans-ethiopic/NotoSansEthiopic-SemiBold",
  "NotoSansEthiopic-600-normal": "noto-sans-ethiopic/NotoSansEthiopic-SemiBold",
  "NotoSansEthiopic-700-italic": "noto-sans-ethiopic/NotoSansEthiopic-Bold",
  "NotoSansEthiopic-700-normal": "noto-sans-ethiopic/NotoSansEthiopic-Bold",
  "NotoSansEthiopic-800-italic":
    "noto-sans-ethiopic/NotoSansEthiopic-ExtraBold",
  "NotoSansEthiopic-800-normal":
    "noto-sans-ethiopic/NotoSansEthiopic-ExtraBold",
  "NotoSansEthiopic-900-italic": "noto-sans-ethiopic/NotoSansEthiopic-Black",
  "NotoSansEthiopic-900-normal": "noto-sans-ethiopic/NotoSansEthiopic-Black",
  "Poppins-200-italic": "poppins/Poppins-ThinItalic",
  "Poppins-200-normal": "poppins/Poppins-Thin",
  "Poppins-300-italic": "poppins/Poppins-ExtraLightItalic",
  "Poppins-300-normal": "poppins/Poppins-ExtraLight",
  "Poppins-400-italic": "poppins/Poppins-Italic",
  "Poppins-400-normal": "poppins/Poppins-Regular",
  "Poppins-500-italic": "poppins/Poppins-MediumItalic",
  "Poppins-500-normal": "poppins/Poppins-Medium",
  "Poppins-600-italic": "poppins/Poppins-SemiBoldItalic",
  "Poppins-600-normal": "poppins/Poppins-SemiBold",
  "Poppins-700-italic": "poppins/Poppins-BoldItalic",
  "Poppins-700-normal": "poppins/Poppins-Bold",
  "Poppins-800-italic": "poppins/Poppins-ExtraBoldItalic",
  "Poppins-800-normal": "poppins/Poppins-ExtraBold",
  "Poppins-900-italic": "poppins/Poppins-BlackItalic",
  "Poppins-900-normal": "poppins/Poppins-Black",
  "PragatiNarrow-400-italic": "pragati-narrow/pragati-narrow-v13-latin-regular",
  "PragatiNarrow-400-normal": "pragati-narrow/pragati-narrow-v13-latin-regular",
  "PragatiNarrow-700-italic": "pragati-narrow/pragati-narrow-v13-latin-700",
  "PragatiNarrow-700-normal": "pragati-narrow/pragati-narrow-v13-latin-700",
  "Roboto-200-italic": "roboto/Roboto-ThinItalic",
  "Roboto-200-normal": "roboto/Roboto-Thin",
  "Roboto-300-italic": "roboto/Roboto-LightItalic",
  "Roboto-300-normal": "roboto/Roboto-Light",
  "Roboto-400-italic": "roboto/Roboto-Italic",
  "Roboto-400-normal": "roboto/Roboto-Regular",
  "Roboto-500-italic": "roboto/Roboto-MediumItalic",
  "Roboto-500-normal": "roboto/Roboto-Medium",
  "Roboto-700-italic": "roboto/Roboto-BoldItalic",
  "Roboto-700-normal": "roboto/Roboto-Bold",
  "Roboto-900-italic": "roboto/Roboto-BlackItalic",
  "Roboto-900-normal": "roboto/Roboto-Black",
  "RobotoCondensed-300-italic":
    "roboto-condensed/roboto-condensed-v25-latin-300italic",
  "RobotoCondensed-300-normal":
    "roboto-condensed/roboto-condensed-v25-latin-300",
  "RobotoCondensed-400-italic":
    "roboto-condensed/roboto-condensed-v25-latin-italic",
  "RobotoCondensed-400-normal":
    "roboto-condensed/roboto-condensed-v25-latin-regular",
  "RobotoCondensed-700-italic":
    "roboto-condensed/roboto-condensed-v25-latin-700italic",
  "RobotoCondensed-700-normal":
    "roboto-condensed/roboto-condensed-v25-latin-700",
  "RobotoMono-200-italic": "roboto-mono/RobotoMono-ThinItalic",
  "RobotoMono-200-normal": "roboto-mono/RobotoMono-ExtraLight",
  "RobotoMono-300-italic": "roboto-mono/RobotoMono-LightItalic",
  "RobotoMono-300-normal": "roboto-mono/RobotoMono-Light",
  "RobotoMono-400-italic": "roboto-mono/RobotoMono-Italic",
  "RobotoMono-400-normal": "roboto-mono/RobotoMono-Regular",
  "RobotoMono-500-italic": "roboto-mono/RobotoMono-MediumItalic",
  "RobotoMono-500-normal": "roboto-mono/RobotoMono-Medium",
  "RobotoMono-600-italic": "roboto-mono/RobotoMono-SemiBoldItalic",
  "RobotoMono-600-normal": "roboto-mono/RobotoMono-SemiBold",
  "RobotoMono-700-italic": "roboto-mono/RobotoMono-BoldItalic",
  "RobotoMono-700-normal": "roboto-mono/RobotoMono-Bold",
  "Sarabun-200-italic": "sarabun/Sarabun-ThinItalic",
  "Sarabun-200-normal": "sarabun/Sarabun-Thin",
  "Sarabun-300-italic": "sarabun/Sarabun-ExtraLightItalic",
  "Sarabun-300-normal": "sarabun/Sarabun-ExtraLight",
  "Sarabun-400-italic": "sarabun/Sarabun-Italic",
  "Sarabun-400-normal": "sarabun/Sarabun-Regular",
  "Sarabun-500-italic": "sarabun/Sarabun-MediumItalic",
  "Sarabun-500-normal": "sarabun/Sarabun-Medium",
  "Sarabun-600-italic": "sarabun/Sarabun-SemiBoldItalic",
  "Sarabun-600-normal": "sarabun/Sarabun-SemiBold",
  "Sarabun-700-italic": "sarabun/Sarabun-BoldItalic",
  "Sarabun-700-normal": "sarabun/Sarabun-Bold",
  "Sarabun-800-italic": "sarabun/Sarabun-ExtraBoldItalic",
  "Sarabun-800-normal": "sarabun/Sarabun-ExtraBold",
  "SourceSans3-200-italic": "source-sans-3/SourceSans3-ExtraLightItalic",
  "SourceSans3-200-normal": "source-sans-3/SourceSans3-ExtraLight",
  "SourceSans3-300-italic": "source-sans-3/SourceSans3-LightItalic",
  "SourceSans3-300-normal": "source-sans-3/SourceSans3-Light",
  "SourceSans3-400-italic": "source-sans-3/SourceSans3-Italic",
  "SourceSans3-400-normal": "source-sans-3/SourceSans3-Regular",
  "SourceSans3-500-italic": "source-sans-3/SourceSans3-MediumItalic",
  "SourceSans3-500-normal": "source-sans-3/SourceSans3-Medium",
  "SourceSans3-600-italic": "source-sans-3/SourceSans3-SemiBoldItalic",
  "SourceSans3-600-normal": "source-sans-3/SourceSans3-SemiBold",
  "SourceSans3-700-italic": "source-sans-3/SourceSans3-BoldItalic",
  "SourceSans3-700-normal": "source-sans-3/SourceSans3-Bold",
  "SourceSans3-800-italic": "source-sans-3/SourceSans3-ExtraBoldItalic",
  "SourceSans3-800-normal": "source-sans-3/SourceSans3-ExtraBold",
  "SourceSans3-900-italic": "source-sans-3/SourceSans3-BlackItalic",
  "SourceSans3-900-normal": "source-sans-3/SourceSans3-Black",
  "SourceSerif4-200-italic": "source-serif-4/SourceSerif4-ExtraLightItalic",
  "SourceSerif4-200-normal": "source-serif-4/SourceSerif4-ExtraLight",
  "SourceSerif4-300-italic": "source-serif-4/SourceSerif4-LightItalic",
  "SourceSerif4-300-normal": "source-serif-4/SourceSerif4-Light",
  "SourceSerif4-400-italic": "source-serif-4/SourceSerif4-Italic",
  "SourceSerif4-400-normal": "source-serif-4/SourceSerif4-Regular",
  "SourceSerif4-500-italic": "source-serif-4/SourceSerif4-MediumItalic",
  "SourceSerif4-500-normal": "source-serif-4/SourceSerif4-Medium",
  "SourceSerif4-600-italic": "source-serif-4/SourceSerif4-SemiBoldItalic",
  "SourceSerif4-600-normal": "source-serif-4/SourceSerif4-SemiBold",
  "SourceSerif4-700-italic": "source-serif-4/SourceSerif4-BoldItalic",
  "SourceSerif4-700-normal": "source-serif-4/SourceSerif4-Bold",
  "SourceSerif4-800-italic": "source-serif-4/SourceSerif4-ExtraBoldItalic",
  "SourceSerif4-800-normal": "source-serif-4/SourceSerif4-ExtraBold",
  "SourceSerif4-900-italic": "source-serif-4/SourceSerif4-BlackItalic",
  "SourceSerif4-900-normal": "source-serif-4/SourceSerif4-Black",
  "TestDieGroteskA-200-italic":
    "test-klim-die-grotesk/test-die-grotesk-a-thin-italic",
  "TestDieGroteskA-200-normal":
    "test-klim-die-grotesk/test-die-grotesk-a-hairline",
  "TestDieGroteskA-300-italic":
    "test-klim-die-grotesk/test-die-grotesk-a-light-italic",
  "TestDieGroteskA-300-normal":
    "test-klim-die-grotesk/test-die-grotesk-a-light",
  "TestDieGroteskA-400-italic":
    "test-klim-die-grotesk/test-die-grotesk-a-italic",
  "TestDieGroteskA-400-normal":
    "test-klim-die-grotesk/test-die-grotesk-a-regular",
  "TestDieGroteskA-500-italic":
    "test-klim-die-grotesk/test-die-grotesk-a-medium-italic",
  "TestDieGroteskA-500-normal":
    "test-klim-die-grotesk/test-die-grotesk-a-medium",
  "TestDieGroteskA-700-italic":
    "test-klim-die-grotesk/test-die-grotesk-a-bold-italic",
  "TestDieGroteskA-700-normal": "test-klim-die-grotesk/test-die-grotesk-a-bold",
  "TestDieGroteskA-800-italic":
    "test-klim-die-grotesk/test-die-grotesk-a-black-italic",
  "TestDieGroteskA-800-normal":
    "test-klim-die-grotesk/test-die-grotesk-a-black",
  "TestDieGroteskA-900-italic":
    "test-klim-die-grotesk/test-die-grotesk-a-heavy-italic",
  "TestDieGroteskA-900-normal":
    "test-klim-die-grotesk/test-die-grotesk-a-heavy",
  "TestDieGroteskB-200-italic":
    "test-klim-die-grotesk/test-die-grotesk-b-thin-italic",
  "TestDieGroteskB-200-normal": "test-klim-die-grotesk/test-die-grotesk-b-thin",
  "TestDieGroteskB-300-italic":
    "test-klim-die-grotesk/test-die-grotesk-b-light-italic",
  "TestDieGroteskB-300-normal":
    "test-klim-die-grotesk/test-die-grotesk-b-light",
  "TestDieGroteskB-400-italic":
    "test-klim-die-grotesk/test-die-grotesk-b-italic",
  "TestDieGroteskB-400-normal":
    "test-klim-die-grotesk/test-die-grotesk-b-regular",
  "TestDieGroteskB-500-italic":
    "test-klim-die-grotesk/test-die-grotesk-b-medium-italic",
  "TestDieGroteskB-500-normal":
    "test-klim-die-grotesk/test-die-grotesk-b-medium",
  "TestDieGroteskB-700-italic":
    "test-klim-die-grotesk/test-die-grotesk-b-bold-italic",
  "TestDieGroteskB-700-normal": "test-klim-die-grotesk/test-die-grotesk-b-bold",
  "TestDieGroteskB-800-italic":
    "test-klim-die-grotesk/test-die-grotesk-b-black-italic",
  "TestDieGroteskB-800-normal":
    "test-klim-die-grotesk/test-die-grotesk-b-black",
  "TestDieGroteskB-900-italic":
    "test-klim-die-grotesk/test-die-grotesk-b-heavy-italic",
  "TestDieGroteskB-900-normal":
    "test-klim-die-grotesk/test-die-grotesk-b-heavy",
  "TestDieGroteskC-200-italic":
    "test-klim-die-grotesk/test-die-grotesk-c-thin-italic",
  "TestDieGroteskC-200-normal": "test-klim-die-grotesk/test-die-grotesk-c-thin",
  "TestDieGroteskC-300-italic":
    "test-klim-die-grotesk/test-die-grotesk-c-light-italic",
  "TestDieGroteskC-300-normal":
    "test-klim-die-grotesk/test-die-grotesk-c-light",
  "TestDieGroteskC-400-italic":
    "test-klim-die-grotesk/test-die-grotesk-c-italic",
  "TestDieGroteskC-400-normal":
    "test-klim-die-grotesk/test-die-grotesk-c-regular",
  "TestDieGroteskC-500-italic":
    "test-klim-die-grotesk/test-die-grotesk-c-medium-italic",
  "TestDieGroteskC-500-normal":
    "test-klim-die-grotesk/test-die-grotesk-c-medium",
  "TestDieGroteskC-700-italic":
    "test-klim-die-grotesk/test-die-grotesk-c-bold-italic",
  "TestDieGroteskC-700-normal": "test-klim-die-grotesk/test-die-grotesk-c-bold",
  "TestDieGroteskC-800-italic":
    "test-klim-die-grotesk/test-die-grotesk-c-black-italic",
  "TestDieGroteskC-800-normal":
    "test-klim-die-grotesk/test-die-grotesk-c-black",
  "TestDieGroteskC-900-italic":
    "test-klim-die-grotesk/test-die-grotesk-c-heavy-italic",
  "TestDieGroteskC-900-normal":
    "test-klim-die-grotesk/test-die-grotesk-c-heavy",
  "TestDieGroteskD-200-italic":
    "test-klim-die-grotesk/test-die-grotesk-d-thin-italic",
  "TestDieGroteskD-200-normal": "test-klim-die-grotesk/test-die-grotesk-d-thin",
  "TestDieGroteskD-300-italic":
    "test-klim-die-grotesk/test-die-grotesk-d-light-italic",
  "TestDieGroteskD-300-normal":
    "test-klim-die-grotesk/test-die-grotesk-d-light",
  "TestDieGroteskD-400-italic":
    "test-klim-die-grotesk/test-die-grotesk-d-italic",
  "TestDieGroteskD-400-normal":
    "test-klim-die-grotesk/test-die-grotesk-d-regular",
  "TestDieGroteskD-500-italic":
    "test-klim-die-grotesk/test-die-grotesk-d-medium-italic",
  "TestDieGroteskD-500-normal":
    "test-klim-die-grotesk/test-die-grotesk-d-medium",
  "TestDieGroteskD-700-italic":
    "test-klim-die-grotesk/test-die-grotesk-d-bold-italic",
  "TestDieGroteskD-700-normal": "test-klim-die-grotesk/test-die-grotesk-d-bold",
  "TestDieGroteskD-800-italic":
    "test-klim-die-grotesk/test-die-grotesk-d-black-italic",
  "TestDieGroteskD-800-normal":
    "test-klim-die-grotesk/test-die-grotesk-d-black",
  "TestDieGroteskD-900-italic":
    "test-klim-die-grotesk/test-die-grotesk-d-heavy-italic",
  "TestDieGroteskD-900-normal":
    "test-klim-die-grotesk/test-die-grotesk-d-heavy",
  "TestFoundersGrotesk-300-italic":
    "test-klim-founders-grotesk/test-founders-grotesk-light-italic",
  "TestFoundersGrotesk-300-normal":
    "test-klim-founders-grotesk/test-founders-grotesk-light",
  "TestFoundersGrotesk-400-italic":
    "test-klim-founders-grotesk/test-founders-grotesk-regular-italic",
  "TestFoundersGrotesk-400-normal":
    "test-klim-founders-grotesk/test-founders-grotesk-regular",
  "TestFoundersGrotesk-500-italic":
    "test-klim-founders-grotesk/test-founders-grotesk-medium-italic",
  "TestFoundersGrotesk-500-normal":
    "test-klim-founders-grotesk/test-founders-grotesk-medium",
  "TestFoundersGrotesk-600-italic":
    "test-klim-founders-grotesk/test-founders-grotesk-semibold-italic",
  "TestFoundersGrotesk-600-normal":
    "test-klim-founders-grotesk/test-founders-grotesk-semibold",
  "TestFoundersGrotesk-700-italic":
    "test-klim-founders-grotesk/test-founders-grotesk-bold-italic",
  "TestFoundersGrotesk-700-normal":
    "test-klim-founders-grotesk/test-founders-grotesk-bold",
  "TestMartinaPlantijn-300-italic":
    "test-klim-martina-plantijn/test-martina-plantijn-light-italic",
  "TestMartinaPlantijn-300-normal":
    "test-klim-martina-plantijn/test-martina-plantijn-light",
  "TestMartinaPlantijn-400-italic":
    "test-klim-martina-plantijn/test-martina-plantijn-italic",
  "TestMartinaPlantijn-400-normal":
    "test-klim-martina-plantijn/test-martina-plantijn-regular",
  "TestMartinaPlantijn-500-italic":
    "test-klim-martina-plantijn/test-martina-plantijn-medium-italic",
  "TestMartinaPlantijn-500-normal":
    "test-klim-martina-plantijn/test-martina-plantijn-medium",
  "TestMartinaPlantijn-700-italic":
    "test-klim-martina-plantijn/test-martina-plantijn-bold-italic",
  "TestMartinaPlantijn-700-normal":
    "test-klim-martina-plantijn/test-martina-plantijn-bold",
  "TestMartinaPlantijn-900-italic":
    "test-klim-martina-plantijn/test-martina-plantijn-black-italic",
  "TestMartinaPlantijn-900-normal":
    "test-klim-martina-plantijn/test-martina-plantijn-black",
  "TestMetric-200-italic": "test-klim-metric/test-metric-thin-italic",
  "TestMetric-200-normal": "test-klim-metric/test-metric-thin",
  "TestMetric-300-italic": "test-klim-metric/test-metric-light-italic",
  "TestMetric-300-normal": "test-klim-metric/test-metric-light",
  "TestMetric-400-italic": "test-klim-metric/test-metric-regular-italic",
  "TestMetric-400-normal": "test-klim-metric/test-metric-regular",
  "TestMetric-500-italic": "test-klim-metric/test-metric-medium-italic",
  "TestMetric-500-normal": "test-klim-metric/test-metric-medium",
  "TestMetric-600-italic": "test-klim-metric/test-metric-semibold-italic",
  "TestMetric-600-normal": "test-klim-metric/test-metric-semibold",
  "TestMetric-700-italic": "test-klim-metric/test-metric-bold-italic",
  "TestMetric-700-normal": "test-klim-metric/test-metric-bold",
  "TestMetric-900-italic": "test-klim-metric/test-metric-black-italic",
  "TestMetric-900-normal": "test-klim-metric/test-metric-black",
  "TestTheFuture-200-italic":
    "test-klim-the-future/test-the-future-thin-italic",
  "TestTheFuture-200-normal": "test-klim-the-future/test-the-future-thin",
  "TestTheFuture-300-italic":
    "test-klim-the-future/test-the-future-light-italic",
  "TestTheFuture-300-normal": "test-klim-the-future/test-the-future-light",
  "TestTheFuture-400-italic": "test-klim-the-future/test-the-future-italic",
  "TestTheFuture-400-normal": "test-klim-the-future/test-the-future-regular",
  "TestTheFuture-500-italic":
    "test-klim-the-future/test-the-future-medium-italic",
  "TestTheFuture-500-normal": "test-klim-the-future/test-the-future-medium",
  "TestTheFuture-700-italic":
    "test-klim-the-future/test-the-future-bold-italic",
  "TestTheFuture-700-normal": "test-klim-the-future/test-the-future-bold",
  "TestTheFuture-900-italic":
    "test-klim-the-future/test-the-future-black-italic",
  "TestTheFuture-900-normal": "test-klim-the-future/test-the-future-black",
  "TestTheFutureMono-200-italic":
    "test-klim-the-future-mono/test-the-future-mono-thin-italic",
  "TestTheFutureMono-200-normal":
    "test-klim-the-future-mono/test-the-future-mono-thin",
  "TestTheFutureMono-300-italic":
    "test-klim-the-future-mono/test-the-future-mono-light-italic",
  "TestTheFutureMono-300-normal":
    "test-klim-the-future-mono/test-the-future-mono-light",
  "TestTheFutureMono-400-italic":
    "test-klim-the-future-mono/test-the-future-mono-italic",
  "TestTheFutureMono-400-normal":
    "test-klim-the-future-mono/test-the-future-mono-regular",
  "TestTheFutureMono-500-italic":
    "test-klim-the-future-mono/test-the-future-mono-medium-italic",
  "TestTheFutureMono-500-normal":
    "test-klim-the-future-mono/test-the-future-mono-medium",
  "TestTheFutureMono-700-italic":
    "test-klim-the-future-mono/test-the-future-mono-bold-italic",
  "TestTheFutureMono-700-normal":
    "test-klim-the-future-mono/test-the-future-mono-bold",
  "TestTheFutureMono-900-italic":
    "test-klim-the-future-mono/test-the-future-mono-black-italic",
  "TestTheFutureMono-900-normal":
    "test-klim-the-future-mono/test-the-future-mono-black",
  "TestTiemposText-400-italic":
    "test-klim-tiempos/test-tiempos-text-regular-italic",
  "TestTiemposText-400-normal": "test-klim-tiempos/test-tiempos-text-regular",
  "TestTiemposText-500-italic":
    "test-klim-tiempos/test-tiempos-text-medium-italic",
  "TestTiemposText-500-normal": "test-klim-tiempos/test-tiempos-text-medium",
  "TestTiemposText-600-italic":
    "test-klim-tiempos/test-tiempos-text-semibold-italic",
  "TestTiemposText-600-normal": "test-klim-tiempos/test-tiempos-text-semibold",
  "TestTiemposText-700-italic":
    "test-klim-tiempos/test-tiempos-text-bold-italic",
  "TestTiemposText-700-normal": "test-klim-tiempos/test-tiempos-text-bold",
} as const;

export type FontId = keyof typeof FONT_MAP;
