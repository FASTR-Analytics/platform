import type {
  AiContentSlideInput,
  FigureBlock,
  ImageBlock,
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
  | { type: "edited_report_locally" }
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

// A staged AI edit the user accepts/rejects via a diff (never silent mutation).
export type ReportEditProposal = {
  newBody: string;
  addFigures?: Record<string, FigureBlock>;
  summary: string;
};

// Live CodeMirror selection, surfaced to the AI so it can act on what the user
// has highlighted (mirrors how slide decks expose getSelectedSlideIds).
export type ReportEditorSelection = {
  empty: boolean; // true when it's just a cursor (no text selected)
  fromLine: number; // 1-based
  toLine: number;
  text: string; // selected text ("" when empty)
};

export type AIContextEditingReport = {
  mode: "editing_report";
  reportId: string;
  reportLabel: string;
  getBody: () => string;
  getFigures: () => Record<string, FigureBlock>;
  getImages: () => Record<string, ImageBlock>;
  // Live CodeMirror selection (undefined if the editor isn't mounted yet).
  getSelection: () => ReportEditorSelection | undefined;
  // Stage an edit as a diff and resolve once the user accepts or rejects it, so
  // the calling AI tool learns the outcome (mirrors panther's ask_user_questions
  // await-resolve pattern). Resolves { accepted: false } if superseded/closed.
  proposeEdit: (proposal: ReportEditProposal) => Promise<{ accepted: boolean }>;
  // Apply a stable-id figure edit straight to the live registry + persist (no
  // body diff — the figure's body token is unchanged). Mirrors the interactive
  // figure-widget editor; used by the update_report_figure AI tool. Resolves
  // true on a successful server save, false if the persist failed (so the tool
  // can report honestly instead of a false "saved").
  applyFigureUpdate: (figureId: string, block: FigureBlock) => Promise<boolean>;
};

export type AIContext =
  | AIContextViewingVisualizations
  | AIContextViewingSlideDecks
  | AIContextViewingReports
  | AIContextEditingReport
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
};
