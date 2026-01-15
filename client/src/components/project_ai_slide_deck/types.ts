// Simplified slide deck types optimized for AI editing
// These are transformed to full ReportItemConfig[] for rendering

export type SlideType = "cover" | "section" | "content";

export type ContentLayout =
  | "single"
  | "two-column"
  | "two-column-wide-left"
  | "two-column-wide-right"
  | "three-column";

export type ContentBlockType = "text" | "figure";

export type ContentBlock = {
  type: ContentBlockType;
  // For text blocks
  markdown?: string;
  // For figure blocks
  figureId?: string;
  replicant?: string;
};

export type SimpleSlide = {
  type: SlideType;

  // Cover slide fields
  title?: string;
  subtitle?: string;
  presenter?: string;
  date?: string;

  // Section slide fields
  sectionTitle?: string;
  sectionSubtitle?: string;

  // Content slide fields
  layout?: ContentLayout;
  heading?: string;
  blocks?: ContentBlock[];
};

export type SimpleSlideDeck = {
  label: string;
  slides: SimpleSlide[];
};

// Default empty deck
export function createEmptySlideDeck(label: string): SimpleSlideDeck {
  return {
    label,
    slides: [
      {
        type: "cover",
        title: label,
        subtitle: "",
        date: new Date().toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        }),
      },
    ],
  };
}
