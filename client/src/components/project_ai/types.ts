import type {
  InstanceDetail,
  ProjectDetail,
  PresentationObjectConfig,
  ResultsValue,
  AiContentSlideInput,
} from "lib";
import type { SetStoreFunction } from "solid-js/store";
import type { FigureInputs, StateHolder } from "panther";

// User interactions that should be communicated to AI
export type AIUserInteraction =
  | { type: "switched_to_deck"; deckId: string; deckLabel: string }
  | { type: "switched_to_viz_editor"; vizId: string; vizLabel: string }
  | { type: "switched_to_default" }
  | { type: "navigated_to_tab"; tabName: string }
  | { type: "added_slide"; slideId: string }
  | { type: "edited_slide"; slideId: string }
  | { type: "deleted_slides"; slideIds: string[] }
  | { type: "duplicated_slides"; slideIds: string[] }
  | { type: "moved_slides"; slideIds: string[] }
  | { type: "selected_slides"; slideIds: string[] }
  | { type: "edited_viz_config"; field: string }
  | { type: "selected_visualization"; vizId: string; vizLabel: string }
  | { type: "custom"; message: string };

export type AIContextDefault = {
  mode: "default";
};

export type AIContextDeck = {
  mode: "deck";
  deckId: string;
  deckLabel: string;
  getSlideIds: () => string[];
  getSelectedSlideIds: () => string[];
  optimisticSetLastUpdated: (
    tableName: "slides" | "slide_decks",
    id: string,
    lastUpdated: string
  ) => void;
};

export type AIContextVizEditor = {
  mode: "viz-editor";
  vizId: string;
  vizLabel: string;
  getTempConfig: () => PresentationObjectConfig;
  setTempConfig: SetStoreFunction<PresentationObjectConfig>;
  getResultsValue: () => ResultsValue;
  getFigureInputs: () => StateHolder<FigureInputs>;
};

export type AIContextReport = {
  mode: "report";
  reportId: string;
  reportLabel: string;
};

export type AIContext =
  | AIContextDefault
  | AIContextDeck
  | AIContextVizEditor
  | AIContextReport;

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
  projectDetail: ProjectDetail;
};
