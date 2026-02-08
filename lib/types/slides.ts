import type { FigureInputs, LayoutNode } from "@timroberton/panther";
import type { PresentationObjectConfig } from "./presentation_objects.ts";
import type { ReportConfig } from "./reports.ts";

export type SlideDeckConfig = ReportConfig;

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
  imgHeight?: number;
  imgFit?: "cover" | "contain";
  imgAlign?: "center" | "top" | "bottom" | "left" | "right";
};

// Image block
export type ImageBlock = {
  type: "image";
  imgFile: string;
  style?: ImageBlockStyle;
};

export type ContentBlock = TextBlock | FigureBlock | ImageBlock;

// Cover slide
export type CoverSlide = {
  type: "cover";
  title: string;
  subtitle?: string;
  presenter?: string;
  date?: string;
  logos?: string[];
  titleTextRelFontSize?: number;
  subTitleTextRelFontSize?: number;
  presenterTextRelFontSize?: number;
  dateTextRelFontSize?: number;
};

// Section slide
export type SectionSlide = {
  type: "section";
  sectionTitle: string;
  sectionSubtitle?: string;
  sectionTextRelFontSize?: number;
  smallerSectionTextRelFontSize?: number;
};

// Content slide - uses explicit layout for user editing
export type ContentSlide = {
  type: "content";
  header?: string;
  subHeader?: string;
  date?: string;
  headerLogos?: string[];
  footer?: string;
  footerLogos?: string[];
  layout: LayoutNode<ContentBlock>;
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
