import { LayoutNode } from "@timroberton/panther";
import { T, t2 } from "../translate/mod.ts";
import { PresentationObjectInReportInfo } from "./presentation_objects.ts";

// ============================================================================
// Report Core Types
// ============================================================================

export type ReportType =
  | "slide_deck"
  | "policy_brief";
// | "long_form";  // TODO: Re-enable later

export type ReportSummary = {
  id: string;
  label: string;
  reportType: ReportType;
};

export type ReportDetail = {
  id: string;
  projectId: string;
  reportType: ReportType;
  config: ReportConfig; // | LongFormReportConfig - disabled for now
  itemIdsInOrder: string[];
  // anyModuleLastRun: string;
  lastUpdated: string;
};

export type ReportItem = {
  id: string;
  projectId: string;
  reportId: string;
  config: ReportItemConfig;
  lastUpdated: string;
};

// ============================================================================
// Report Type Utilities
// ============================================================================

export function get_REPORT_TYPE_SELECT_OPTIONS(): {
  value: ReportType;
  label: string;
}[] {
  return [
    { value: "slide_deck", label: t2(T.FRENCH_UI_STRINGS.slide_deck) },
    { value: "policy_brief", label: t2(T.FRENCH_UI_STRINGS.policy_brief) },
    // { value: "long_form", label: "Long-form report" },  // TODO: Re-enable
  ];
}

export function get_REPORT_TYPE_MAP(): Record<ReportType, string> {
  return {
    slide_deck: t2(T.FRENCH_UI_STRINGS.slide_deck),
    policy_brief: t2(T.FRENCH_UI_STRINGS.policy_brief),
    // long_form: "Long-form report",  // TODO: Re-enable
  };
}

// ============================================================================
// Report Configuration Types
// ============================================================================

export type LongFormReportConfig = {
  label: string;
  markdown: string;
};

export function getStartingConfigForLongFormReport(
  label: string,
): LongFormReportConfig {
  return { label, markdown: "" };
}

export type ReportConfig = {
  label: string;
  // aspectRatio: "slide" | "portrait";
  selectedReplicantValue: undefined | string;
  logos: string[] | undefined;
  // logo: string | undefined;
  logoSize: number;
  figureScale: number;
  footer: string;
  showPageNumbers: boolean;
  headerSize: number;
  useWatermark: boolean;
  watermarkText: string;
  colorTheme: ColorTheme;
  overlay: "dots" | "none" | undefined;
  //
  // primaryBackgroundColor: string;
  // primaryTextColor: string;
  // baseBackgroundColor: string;
  // baseTextColor: string;
};

export function getStartingConfigForReport(label: string) {
  const startingConfig: ReportConfig = {
    label,
    selectedReplicantValue: undefined,
    logos: [],
    // logo: undefined,
    logoSize: 300,
    figureScale: 2,
    footer: "",
    showPageNumbers: true,
    headerSize: 1,
    useWatermark: false,
    watermarkText: "",
    colorTheme: "white",
    overlay: "none",
    //
    // primaryBackgroundColor: "#F7F7F7",
    // primaryTextColor: "#1E1E1E",
    // baseBackgroundColor: "#ffffff",
    // baseTextColor: "#1E1E1E",
  };
  return startingConfig;
}

// ============================================================================
// Color Theme Types
// ============================================================================

export type ColorTheme =
  | "dark_green"
  | "alt_green"
  | "ghana_green_dots"
  | "ghana_green"
  | "guinea_green"
  | "blue"
  | "white";

export const _COLOR_THEMES: ColorTheme[] = [
  "dark_green",
  "alt_green",
  "ghana_green",
  "guinea_green",
  "blue",
  "white",
];

export type ColorDetails = {
  label: string;
  lightOrDark: "light" | "dark";
  primaryBackgroundColor: string;
  primaryTextColor: string;
  baseBackgroundColor: string;
  baseTextColor: string;
};

const _COLOR_THEME_MAP: Record<ColorTheme, ColorDetails> = {
  dark_green: {
    label: "Green ~ GFF",
    lightOrDark: "dark",
    primaryBackgroundColor: "#09544F",
    primaryTextColor: "#FFFFFF",
    baseBackgroundColor: "#FFFFFF",
    baseTextColor: "#1E1E1E",
  },
  alt_green: {
    label: "Green ~ Nigeria",
    lightOrDark: "dark",
    primaryBackgroundColor: "#027D53",
    primaryTextColor: "#FFFFFF",
    baseBackgroundColor: "#FFFFFF",
    baseTextColor: "#1E1E1E",
  },
  guinea_green: {
    label: "Green ~ Guinée",
    lightOrDark: "dark",
    primaryBackgroundColor: "#03935F",
    primaryTextColor: "#FFFFFF",
    baseBackgroundColor: "#FFFFFF",
    baseTextColor: "#1E1E1E",
  },
  ghana_green_dots: {
    label: "Green ~ Ghana",
    lightOrDark: "dark",
    primaryBackgroundColor: "#1CB963",
    primaryTextColor: "#FFFFFF",
    baseBackgroundColor: "#FFFFFF",
    baseTextColor: "#1E1E1E",
  },
  ghana_green: {
    label: "Green ~ Ghana",
    lightOrDark: "dark",
    primaryBackgroundColor: "#1CB963",
    primaryTextColor: "#FFFFFF",
    baseBackgroundColor: "#FFFFFF",
    baseTextColor: "#1E1E1E",
  },
  blue: {
    label: "Blue ~ Somalia",
    lightOrDark: "dark",
    primaryBackgroundColor: "#4189DD",
    primaryTextColor: "#FFFFFF",
    baseBackgroundColor: "#FFFFFF",
    baseTextColor: "#1E1E1E",
  },
  white: {
    label: "Light grey",
    lightOrDark: "light",
    primaryBackgroundColor: "#F7F7F7",
    primaryTextColor: "#1E1E1E",
    baseBackgroundColor: "#FFFFFF",
    baseTextColor: "#1E1E1E",
  },
};

export function getColorDetailsForColorTheme(theme: ColorTheme): ColorDetails {
  return _COLOR_THEME_MAP[theme];
}

// ============================================================================
// Report Item Types
// ============================================================================

export type ReportItemType = "cover" | "section" | "freeform";

export function get_REPORT_ITEM_TYPE_SELECT_OPTIONS(): {
  value: ReportItemType;
  label: string;
}[] {
  return [
    { value: "cover", label: t2(T.FRENCH_UI_STRINGS.cover) },
    { value: "section", label: t2(T.FRENCH_UI_STRINGS.section) },
    { value: "freeform", label: t2(T.FRENCH_UI_STRINGS.freeform) },
  ];
}

export type ReportItemConfig = {
  type: ReportItemType;
  cover: {
    titleText?: string;
    titleTextRelFontSize: number;
    subTitleText?: string;
    subTitleTextRelFontSize: number;
    presenterText?: string;
    presenterTextRelFontSize: number;
    dateText?: string;
    dateTextRelFontSize: number;
    logos?: string[];
  };
  section: {
    sectionText?: string;
    sectionTextRelFontSize: number;
    smallerSectionText?: string;
    smallerSectionTextRelFontSize: number;
  };
  freeform: {
    useHeader?: boolean;
    headerText?: string;
    subHeaderText?: string;
    dateText?: string;
    headerLogos?: string[];
    //
    useFooter?: boolean;
    footerText?: string;
    footerLogos?: string[];
    //
    content: LayoutNode<ReportItemContentItem>;
  };
};

export function getStartingConfigForReportItem() {
  const startingConfig: ReportItemConfig = {
    type: "freeform",
    cover: {
      titleText: "",
      titleTextRelFontSize: 6,
      subTitleText: "",
      subTitleTextRelFontSize: 4,
      presenterText: "",
      presenterTextRelFontSize: 3,
      dateText: "",
      dateTextRelFontSize: 2,
      logos: [],
    },
    section: {
      sectionText: "",
      sectionTextRelFontSize: 4,
      smallerSectionText: "",
      smallerSectionTextRelFontSize: 2,
    },
    freeform: {
      content: {
        type: "item",
        id: crypto.randomUUID(),
        data: getStartingReportItemPlaceholder(),
      },
    },
  };
  return startingConfig;
}

// ============================================================================
// Report Item Content Types
// ============================================================================

export type ReportItemContentItemType =
  | "placeholder"
  | "text"
  | "figure"
  | "image";

export type ReportItemContentItem = {
  type: ReportItemContentItemType;
  span: number | undefined;
  presentationObjectInReportInfo: PresentationObjectInReportInfo | undefined;
  markdown: string | undefined;
  stretch: boolean;
  fillArea: boolean;
  textSize: number;
  textBackground: string;
  placeholderInvisible: boolean;
  placeholderStretch: boolean;
  placeholderHeight: number | undefined;
  useFigureAdditionalScale: boolean;
  figureAdditionalScale: number | undefined;
  imgFile: string | undefined;
  imgHeight: number | undefined;
  imgFit: "cover" | "inside";
  imgStretch: boolean;
  hideFigureCaption: boolean;
  hideFigureSubCaption: boolean;
  hideFigureFootnote: boolean;
};

export function getStartingReportItemPlaceholder() {
  const startingPlaceholder: ReportItemContentItem = {
    type: "placeholder",
    span: undefined,
    presentationObjectInReportInfo: undefined,
    markdown: undefined,
    stretch: true,
    fillArea: false,
    textSize: 1,
    textBackground: "none",
    placeholderInvisible: false,
    placeholderStretch: true,
    placeholderHeight: 50,
    useFigureAdditionalScale: false,
    figureAdditionalScale: 1,
    imgFile: undefined,
    imgHeight: 300,
    imgFit: "inside",
    imgStretch: true,
    hideFigureCaption: false,
    hideFigureSubCaption: false,
    hideFigureFootnote: false,
  };
  return startingPlaceholder;
}
