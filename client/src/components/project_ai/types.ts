import type {
  AiContentSlideInput,
  InstanceDetail,
  PresentationObjectConfig,
  ResultsValue,
  SlideDeckConfig,
} from "lib";
import type { SetStoreFunction } from "solid-js/store";

// User interactions that should be communicated to AI
export type AIUserInteraction =
  | { type: "added_slide"; slideId: string }
  | { type: "edited_slide"; slideId: string }
  | { type: "deleted_slides"; slideIds: string[] }
  | { type: "duplicated_slides"; slideIds: string[] }
  | { type: "moved_slides"; slideIds: string[] }
  | { type: "selected_slides"; slideIds: string[] }
  | { type: "edited_viz_config"; vizId: string; field: string }
  | { type: "selected_visualizations"; vizIds: string[] }
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
    lastUpdated: string
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

export type AIContextEditingReport = {
  mode: "editing_report";
  reportId: string;
  reportLabel: string;
};

export type AIContext =
  | AIContextViewingVisualizations
  | AIContextViewingSlideDecks
  | AIContextViewingReports
  | AIContextViewingData
  | AIContextViewingMetrics
  | AIContextViewingModules
  | AIContextEditingSlideDeck
  | AIContextEditingVisualization
  | AIContextEditingReport;

export type DraftContent = {
  type: "slide";
  input: AiContentSlideInput;
} | {
  type: "viz";
  input: AiContentSlideInput;
} | null;

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
