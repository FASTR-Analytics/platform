import type {
  AiContentSlideInput,
  InstanceDetail,
  PresentationObjectConfig,
  ResultsValue,
  Slide,
  SlideDeckConfig,
  SlideType,
} from "lib";
import type { SetStoreFunction } from "solid-js/store";

export type AIUserInteraction =
  | { type: "edited_slide"; slideId: string }
  | { type: "deck_structure_changed" }
  | { type: "selected_slides"; slideIds: string[] }
  | { type: "selected_visualizations"; vizIds: string[] }
  | { type: "edited_viz_locally" }
  | { type: "edited_slide_locally" }
  | { type: "custom"; message: string };

// Viewing contexts (browsing main project sections)
export type AIContextViewingVisualizations = {
  mode: "viewing_visualizations";
};

export type AIContextViewingSlideDecks = {
  mode: "viewing_slide_decks";
};

export type AIContextViewingReports = {
  mode: "viewing_reports";
};

export type AIContextViewingData = {
  mode: "viewing_data";
};

export type AIContextViewingMetrics = {
  mode: "viewing_metrics";
};

export type AIContextViewingModules = {
  mode: "viewing_modules";
};

export type AIContextViewingSettings = {
  mode: "viewing_settings";
};

// Editing contexts (working on specific items)
export type AIContextEditingSlideDeck = {
  mode: "editing_slide_deck";
  deckId: string;
  deckLabel: string;
  getDeckConfig: () => SlideDeckConfig;
  getSlideIds: () => string[];
  getSelectedSlideIds: () => string[];
  optimisticSetLastUpdated: (
    tableName: "slides" | "slide_decks",
    id: string,
    lastUpdated: string,
  ) => void;
};

export type AIContextEditingVisualization = {
  mode: "editing_visualization";
  vizId: string | null; // null for create/ephemeral modes without persistent ID
  vizLabel: string;
  resultsValue: ResultsValue;
  getTempConfig: () => PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
};

export type AIContextEditingSlide = {
  mode: "editing_slide";
  slideId: string;
  slideLabel: string;
  slideType: SlideType;
  deckId: string;
  deckLabel: string;
  getTempSlide: () => Slide;
  setTempSlide: SetStoreFunction<Slide>;
};

export type AIContextEditingReport = {
  mode: "editing_report";
  reportId: string;
  reportLabel: string;
};

export type AIContext =
  | AIContextViewingVisualizations
  | AIContextViewingSlideDecks
  // | AIContextViewingReports
  // | AIContextEditingReport;
  | AIContextViewingData
  | AIContextViewingMetrics
  | AIContextViewingModules
  | AIContextViewingSettings
  | AIContextEditingSlideDeck
  | AIContextEditingSlide
  | AIContextEditingVisualization;

export type DraftContent =
  | {
      type: "slide";
      input: AiContentSlideInput;
    }
  | {
      type: "viz";
      input: AiContentSlideInput;
    }
  | null;

export type AIProjectContextValue = {
  aiContext: () => AIContext;
  setAIContext: (ctx: AIContext) => void;
  draftContent: () => DraftContent;
  setDraftContent: (content: DraftContent) => void;
  notifyAI: (interaction: AIUserInteraction) => void;
  getPendingInteractionsMessage: () => string | null;
  clearPendingInteractions: () => void;
  instanceDetail: InstanceDetail;
};
