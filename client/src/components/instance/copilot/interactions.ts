import { defineAIInteractions, interaction } from "panther";
import type { ProductType } from "lib";
import type { EditingReportParams, EditingSlideDeckContext } from "./ai_views";

// The copilot's interaction registry: what the USER did since the last
// message. Producers call `copilotViewController.notify(...)`: the deck and
// report editors, each listening to the instance SSE side-channel for its own
// product (`edited_slide` from the deck, `product_updated` from both), and
// the editors and selection UIs. An entry is admitted (relevantIn, then the
// per-entry filter) against the view it happens in and its line names that
// view. The engine owns the transactional drain at turn creation and the
// reduction pipeline (coalesce per id and view), plus a coalesced
// `__navigation` line.
//
// Echo keys close the SSE self-echo loop: every persist-path write tool marks
// the same keys via `copilotViewController.markAIEdit`, so the AI's own server
// writes are dropped at drain instead of coming back as fake user actions.

// One line per distinct slide.
function oncePerSlide<T extends { slideId: string }>(entries: T[]): T[] {
  const seen = new Set<string>();
  return entries.filter((e) =>
    seen.has(e.slideId) ? false : (seen.add(e.slideId), true)
  );
}

export const copilotInteractions = defineAIInteractions({
  // SSE `last_updated("slides")`: any slides-table row change. One line per
  // distinct slide, kept only when that slide is in the deck being edited.
  edited_slide: interaction<{ slideId: string }>({
    relevantIn: ["editing_slide_deck"],
    filter: (p, view) =>
      (view.context as EditingSlideDeckContext).getSlideIds().includes(
        p.slideId,
      ),
    coalesce: oncePerSlide,
    format: (p) => `Edited slide ${p.slideId}`,
    echoKey: (p) => `slide:${p.slideId}`,
  }),
  // SSE `products_upserted` for the open product only (its editor filters).
  // A deck's row bumps on every slide write AND on a rename, reattach or
  // scope change; a report's on every body save. A collaborator can change
  // the product under the user, so it is reported in every view. Never a
  // saved visualization: the copilot sees one only from its own editor, so
  // the type excludes it and a notify for one does not compile.
  product_updated: interaction<{
    productId: string;
    type: Exclude<ProductType, "visualization">;
    label: string;
  }>({
    coalesce: (entries) => entries.slice(0, 1),
    format: (p) =>
      p.type === "slide_deck"
        ? `Slide deck "${p.label}" changed (its slides or its settings)`
        : `Report "${p.label}" changed`,
    echoKey: (p) => `product:${p.productId}`,
  }),
  // The deck editor's slide list. The open deck's CURRENT selection also rides
  // the view state (ai_views.ts); this reports the act of selecting since the
  // last message.
  selected_slides: interaction<{ slideIds: string[] }>({
    relevantIn: ["editing_slide_deck"],
    format: (p) =>
      p.slideIds.length === 0
        ? "Cleared the slide selection"
        : `Selected slides: ${p.slideIds.join(", ")}`,
  }),
  // The editors' own change signals carry the id of what changed and are
  // kept only when it is the slide or report open as they are recorded. No
  // author is named: a collaborator's edit invalidates the AI's read just the
  // same. The slide's line names it, since the deck view's line names only
  // the deck and the user may have opened another slide by the next message.
  edited_slide_locally: interaction<{ slideId: string }>({
    relevantIn: ["editing_slide_deck"],
    filter: (p, view) =>
      (view.context as EditingSlideDeckContext).getOpenSlide()?.slideId ===
        p.slideId,
    coalesce: oncePerSlide,
    format: (p) =>
      `The content of slide ${p.slideId} changed while it was open (re-read it with get_slide before editing it)`,
  }),
  edited_report_locally: interaction<{ reportId: string }>({
    relevantIn: ["editing_report"],
    filter: (p, view) =>
      (view.params as EditingReportParams).reportId === p.reportId,
    format: () =>
      "The report body changed (re-read with get_report_editor before proposing edits)",
  }),
  // App-notified (not SSE): the user accepted an AI draft into the open deck
  // via the preview card. The write's SSE echoes are marked as AI edits (the
  // content is the AI's), so without this line the model would never learn
  // its draft was accepted, or worse would see a generic "deck changed" line
  // misattributed to a collaborator.
  draft_added_to_deck: interaction<{ slideId: string; deckId: string }>({
    format: (p) =>
      `User added the AI-drafted slide to the slide deck (new slide ${p.slideId}, deck ${p.deckId})`,
  }),
});

export type CopilotInteractionDefs = (typeof copilotInteractions)["_defs"];
