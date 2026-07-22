import type { AiContentSlideInput, FigureBlock } from "lib";
import type { ProposalPreview } from "panther";
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

// A staged AI edit the user accepts/rejects via a diff (never silent mutation).
export type ReportEditProposal = {
  newBody: string;
  addFigures?: Record<string, FigureBlock>;
  summary: string;
};

// Result of EditingReportContext.proposeEdit (ai_views.ts) — the report-editing tools'
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

// View state now lives on projectAIViewController (ai_views.ts), a module-
// level singleton — not on this Solid context. Import projectAIViewController
// directly for current()/setView()/clearView() instead of reading it here.
export type AIProjectContextValue = {
  draftContent: () => DraftContent;
  setDraftContent: (content: DraftContent) => void;
  notifyAI: (interaction: AIUserInteraction) => void;
  getPendingInteractionsMessage: () => string | null;
  clearPendingInteractions: () => void;
};
