import type { FigureInputs, LayoutNode } from "@timroberton/panther";
import type { PresentationObjectConfig } from "./presentation_objects.ts";

// Slide types
export type SlideType = "cover" | "section" | "content";

// Text block
export type TextBlock = {
  type: "text";
  markdown: string;
};

// Figure source - enables refresh
export type FigureSource =
  | {
      type: "from_metric";
      metricId: string;
      config: PresentationObjectConfig;
      snapshotAt: string;
      clonedFromVisualizationId?: string; // Provenance
    }
  | {
      type: "custom";
      description?: string;
    };

// Figure block - contains rendered data + optional source for refresh
export type FigureBlock = {
  type: "figure";
  figureInputs: FigureInputs;
  source?: FigureSource;
};

// Placeholder block - empty space for user to fill
export type PlaceholderBlock = {
  type: "placeholder";
};

export type ContentBlock = TextBlock | FigureBlock | PlaceholderBlock;

// Cover slide
export type CoverSlide = {
  type: "cover";
  title?: string;
  subtitle?: string;
  presenter?: string;
  date?: string;
};

// Section slide
export type SectionSlide = {
  type: "section";
  sectionTitle: string;
  sectionSubtitle?: string;
};

// Content slide - uses explicit layout for user editing
export type ContentSlide = {
  type: "content";
  heading: string;
  layout: LayoutNode<ContentBlock>;
};

// Union type
export type Slide = CoverSlide | SectionSlide | ContentSlide;

// Slide deck summary (list view)
export type SlideDeckSummary = {
  id: string;
  label: string;
};

// Slide deck detail (for rendering)
export type SlideDeckDetail = {
  id: string;
  label: string;
  plan: string;
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
      return slide.heading;
  }
}
