import type {
  FigureInputs,
  LayoutNode,
  LayoutPresetId,
  LogosSizingOptions as LogosSizingOptionsImport,
  PatternType,
  TreatmentPresetId,
} from "@timroberton/panther";

type ImageOverlayType = "dots" | "rivers" | "waves" | "world";
type PatternOverlayType = `pattern-${PatternType}`;
export type BackgroundDetailType = "none" | ImageOverlayType | PatternOverlayType;

export type LogosSizingOptions = LogosSizingOptionsImport;
import { Color } from "@timroberton/panther";
import type { PresentationObjectConfig } from "./presentation_objects.ts";
import { _GFF_GREEN } from "../key_colors.ts";
import { t3 } from "../translate/t-func.ts";

// Re-export schemas from underscore-prefixed files (stored data validation)
export { slideDeckConfigSchema } from "./_slide_deck_config.ts";
export { slideConfigSchema } from "./_slide_config.ts";

export type LogoSectionConfig = {
  selected: string[];
  sizing?: LogosSizingOptions;
  showByDefault: boolean;
};

export type LogosConfig = {
  availableCustom: string[];
  cover: LogoSectionConfig;
  header: LogoSectionConfig;
  footer: LogoSectionConfig;
};

export type SlideDeckConfig = {
  label: string;
  selectedReplicantValue: undefined | string;
  logos: LogosConfig;
  figureScale: number;
  globalFooterText: string | undefined;
  showPageNumbers: boolean;
  headerSize: number;
  useWatermark: boolean;
  watermarkText: string;
  primaryColor: string;
  overlay: BackgroundDetailType | undefined;
  layout: LayoutPresetId;
  treatment: TreatmentPresetId;
};

export function getTextColorForBackground(bgColor: string): string {
  return new Color(bgColor).isLight() ? "#1E1E1E" : "#FFFFFF";
}

export function isColorLight(color: string): boolean {
  return new Color(color).isLight();
}

export function getPrimaryColor(primaryColor?: string): string {
  return primaryColor || _GFF_GREEN;
}

export function getStartingConfigForSlideDeck(label: string): SlideDeckConfig {
  return {
    label,
    selectedReplicantValue: undefined,
    logos: {
      availableCustom: [],
      cover: { selected: [], showByDefault: true },
      header: { selected: [], showByDefault: true },
      footer: { selected: [], showByDefault: true },
    },
    figureScale: 2,
    globalFooterText: undefined,
    showPageNumbers: true,
    headerSize: 1,
    useWatermark: false,
    watermarkText: "",
    primaryColor: _GFF_GREEN,
    overlay: "none",
    layout: "default",
    treatment: "default",
  };
}

export function getDefaultCoverSlide(): CoverSlide {
  return {
    type: "cover",
    title: t3({ en: "Title", fr: "Titre" }),
    subtitle: t3({ en: "Subtitle", fr: "Sous-titre" }),
  };
}

export function getDefaultSectionSlide(): SectionSlide {
  return {
    type: "section",
    sectionTitle: t3({ en: "Section", fr: "Section" }),
  };
}

export function getDefaultContentSlide(): ContentSlide {
  return {
    type: "content",
    header: t3({ en: "New slide", fr: "Nouvelle diapositive" }),
    layout: {
      type: "item",
      id: "a1a",
      data: { type: "text", markdown: "" },
    },
  };
}

// Slide types
export type SlideType = "cover" | "section" | "content";

// Text block styling
export type TextBlockStyle = {
  textSize?: number;
  textBackground?: string;
};

// Text block
export type TextBlock = {
  type: "text";
  markdown: string;
  style?: TextBlockStyle;
};

// Figure source - enables refresh
export type FigureSource =
  | {
      type: "from_data";
      metricId: string;
      config: PresentationObjectConfig;
      snapshotAt: string;
    }
  | {
      type: "custom";
      description?: string;
    };

// Figure block - contains rendered data + optional source for refresh
export type FigureBlock = {
  type: "figure";
  figureInputs?: FigureInputs;
  source?: FigureSource;
};

// Image block styling
export type ImageBlockStyle = {
  imgFit?: "cover" | "contain";
  imgAlign?: "center" | "top" | "bottom" | "left" | "right";
};

export type ContentSlideSplitFill =
  | { type: "plain" }
  | { type: "pattern"; patternType: PatternType }
  | { type: "image"; imgFile: string };

export type ContentSlideSplit = {
  placement: "left" | "right";
  sizeAsPct: number;
  fill: ContentSlideSplitFill;
};

// Image block
export type ImageBlock = {
  type: "image";
  imgFile: string;
  style?: ImageBlockStyle;
};

export type ContentBlock = TextBlock | FigureBlock | ImageBlock;

export type LogoVisibility = "show" | "hide" | "inherit";

// Cover slide
export type CoverSlide = {
  type: "cover";
  title: string;
  subtitle?: string;
  presenter?: string;
  date?: string;
  showLogos?: LogoVisibility;
  titleTextRelFontSize?: number;
  titleBold?: boolean;
  titleItalic?: boolean;
  subTitleTextRelFontSize?: number;
  subTitleBold?: boolean;
  subTitleItalic?: boolean;
  presenterTextRelFontSize?: number;
  presenterBold?: boolean;
  presenterItalic?: boolean;
  dateTextRelFontSize?: number;
  dateBold?: boolean;
  dateItalic?: boolean;
};

// Section slide
export type SectionSlide = {
  type: "section";
  sectionTitle: string;
  sectionSubtitle?: string;
  sectionTextRelFontSize?: number;
  sectionTitleBold?: boolean;
  sectionTitleItalic?: boolean;
  smallerSectionTextRelFontSize?: number;
  sectionSubTitleBold?: boolean;
  sectionSubTitleItalic?: boolean;
};

// Content slide - uses explicit layout for user editing
export type ContentSlide = {
  type: "content";
  header?: string;
  subHeader?: string;
  date?: string;
  footer?: string;
  showHeaderLogos?: LogoVisibility;
  showFooterLogos?: LogoVisibility;
  layout: LayoutNode<ContentBlock>;
  split?: ContentSlideSplit;
};

// Union type
export type Slide = CoverSlide | SectionSlide | ContentSlide;

// Position for inserting/moving slides
export type SlidePosition =
  | { after: string }
  | { before: string }
  | { toStart: true }
  | { toEnd: true };

// Slide deck folders
export type SlideDeckFolder = {
  id: string;
  label: string;
  color: string | null;
  description: string | null;
  sortOrder: number;
};

export type SlideDeckGroupingMode = "folders" | "flat";

// Slide deck summary (list view)
export type SlideDeckSummary = {
  id: string;
  label: string;
  folderId: string | null;
  firstSlideId: string | null;
  config: SlideDeckConfig;
};

// Slide deck detail (for rendering)
export type SlideDeckDetail = {
  id: string;
  label: string;
  plan: string;
  config: SlideDeckConfig;
  slideIds: string[];
  lastUpdated: string;
};

// Deck summary (for AI context)
export type DeckSummary = {
  reportId: string;
  label: string;
  plan: string;
  slides: Array<{
    id: string;
    index: number;
    type: SlideType;
    title: string; // Computed display title
  }>;
  lastUpdated: string;
};

// Slide with metadata (from DB)
export type SlideWithMeta = {
  id: string;
  deckId: string;
  index: number;
  slide: Slide;
  lastUpdated: string;
};

// Helper: Get slide display title
export function getSlideTitle(slide: Slide): string {
  switch (slide.type) {
    case "cover":
      return slide.title || "Cover";
    case "section":
      return slide.sectionTitle;
    case "content":
      return slide.header || "Content";
  }
}
