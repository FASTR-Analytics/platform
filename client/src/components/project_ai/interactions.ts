import { defineAIInteractions, interaction } from "panther";
import type {
  EditingSlideDeckContext,
  EditingSlideParams,
} from "./ai_views";

// The copilot's interaction registry (rung 4, PLAN_FUTURE_AI_ADOPTIONS.md
// feature 3) — replaces the hand-rolled pendingInteractions queue +
// reduceInteractions/formatInteraction pipeline. Reduction semantics are
// preserved from the pre-rung-4 reducer: per-view relevance via relevantIn,
// payload×view reductions via filter, and the same digest wording (the
// engine renders each format return as one "- " bullet under the
// "User actions since last message:" prefix). Echo keys close the SSE
// self-echo loop: persist-path AI write tools mark the same keys via
// projectAIViewController.markAIEdit, so the AI's own server writes no
// longer come back as fake user actions.
export const projectAIInteractions = defineAIInteractions({
  // SSE: any slides-table row change. One line per distinct slide, kept only
  // when that slide is in the deck being edited (or IS the open slide).
  edited_slide: interaction<{ slideId: string }>({
    relevantIn: ["editing_slide_deck", "editing_slide"],
    filter: (p, view) => {
      if (view.id === "editing_slide_deck") {
        const ctx = view.context as EditingSlideDeckContext;
        return ctx.getSlideIds().includes(p.slideId);
      }
      const params = view.params as EditingSlideParams;
      return params.slideId === p.slideId;
    },
    coalesce: (entries) => {
      const seen = new Set<string>();
      return entries.filter((e) =>
        seen.has(e.slideId) ? false : (seen.add(e.slideId), true),
      );
    },
    format: (p) => `Edited slide ${p.slideId}`,
    echoKey: (p) => `slide:${p.slideId}`,
  }),
  // SSE: any slide_decks-table row change (create/delete/duplicate/move all
  // bump the deck row). The deckId payload exists for echo suppression; the
  // digest line is deliberately unchanged from the pre-rung-4 wording.
  deck_structure_changed: interaction<{ deckId: string }>({
    relevantIn: ["editing_slide_deck"],
    format: () =>
      "Slide deck structure changed (slides added, removed, or reordered)",
    echoKey: (p) => `deck:${p.deckId}`,
  }),
  selected_slides: interaction<{ slideIds: string[] }>({
    relevantIn: ["viewing_slide_decks"],
    format: (p) => `Selected slides: ${p.slideIds.join(", ")}`,
  }),
  selected_visualizations: interaction<{ vizIds: string[] }>({
    relevantIn: ["viewing_visualizations"],
    format: (p) => `Selected visualizations: ${p.vizIds.join(", ")}`,
  }),
  edited_viz_locally: interaction({
    relevantIn: ["editing_visualization"],
    format: () =>
      "User made local changes to the visualization config (unsaved)",
  }),
  edited_slide_locally: interaction({
    relevantIn: ["editing_slide"],
    format: () => "User made local changes to the slide content (unsaved)",
  }),
  edited_report_locally: interaction({
    relevantIn: ["editing_report"],
    format: () =>
      "User edited the report body (re-read with get_report_editor before proposing edits)",
  }),
  // SSE: presentation_objects-table row change (was a "custom" free-text
  // message pre-rung-4; typed so it can carry an echo key). Reported in
  // every view, one line per distinct visualization.
  visualization_updated: interaction<{ vizId: string; label: string }>({
    coalesce: (entries) => {
      const seen = new Set<string>();
      return entries.filter((e) =>
        seen.has(e.vizId) ? false : (seen.add(e.vizId), true),
      );
    },
    format: (p) => `Visualization "${p.label}" updated`,
    echoKey: (p) => `viz:${p.vizId}`,
  }),
  // App-notified (not SSE): the user accepted an AI draft into a deck via
  // the preview card / AddToDeckModal. The write's SSE echoes are marked as
  // AI edits (the content is the AI's), so without this line the model would
  // never learn its draft was accepted — notify carries the true signal
  // instead of letting a generic "deck structure changed" misreport it.
  draft_added_to_deck: interaction<{ slideId: string; deckId: string }>({
    format: (p) =>
      `User added the AI-drafted slide to a slide deck (new slide ${p.slideId}, deck ${p.deckId})`,
  }),
});

export type ProjectAIInteractionDefs =
  (typeof projectAIInteractions)["_defs"];
