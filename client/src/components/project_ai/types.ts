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
import type { ProposalPreview } from "panther";
import type { SetStoreFunction } from "solid-js/store";
import type { SkippedRange } from "~/components/report/rebase_edits";

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

export type AIContextViewingDashboards = {
  mode: "viewing_dashboards";
};

export type AIContextViewingCache = {
  mode: "viewing_cache";
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

// Result of AIContextEditingReport.proposeEdit — the report-editing tools'
// approval.propose wraps this: an identical-body proposal short-circuits to
// panther's {skip} (a normal, no-decision tool result); otherwise
// `customProposalUI` stages the CodeMirror diff and resolves the user's
// accept/reject decision,
// `stillValid` guards a stale accept (editor unmounted, or the AI context
// mode has left "editing_report") from committing against a torn-down
// editor, and `commit` — called ONLY after an accepted, still-valid decision
// — rebases the proposal over concurrent collaborator edits and persists it
// (mirrors the pre-approval applyProposal unchanged; `skipped` lists hunks
// NOT applied because a collaborator edited that text while the proposal was
// open, same 1-based line-range contract as before).
export type ReportEditProposalResult =
  | { skip: string }
  | {
      preview: ProposalPreview;
      customProposalUI: (signal: AbortSignal) => Promise<boolean>;
      stillValid: () => boolean;
      commit: () => Promise<{ skipped: SkippedRange[] }>;
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
  // Prepare a staged edit for panther's approval lifecycle (each report-
  // editing tool's approval.propose calls this after its own validation).
  // See ReportEditProposalResult for the shape and the accept/decline/stale
  // semantics.
  proposeEdit: (proposal: ReportEditProposal) => ReportEditProposalResult;
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
  | AIContextViewingDashboards
  | AIContextViewingCache
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
