import { defineAIInteractions, interaction } from "panther";
import type { ProductType } from "lib";
import type { EditingSlideDeckContext, EditingSlideParams } from "./ai_views";

// The copilot's interaction registry: what the USER did since the last
// message. Producers call `copilotViewController.notify(...)` — the instance
// SSE side-channel (index.tsx) and the editors/selection UIs. The engine owns
// the transactional drain at turn creation and the reduction pipeline
// (relevantIn / per-entry filter / coalesce per id), plus a coalesced
// `__navigation` line.
//
// Echo keys close the SSE self-echo loop: every persist-path write tool marks
// the same keys via `copilotViewController.markAIEdit`, so the AI's own server
// writes are dropped at drain instead of coming back as fake user actions.
export const copilotInteractions = defineAIInteractions({
  // SSE `last_updated("slides")`: any slides-table row change. One line per
  // distinct slide, kept only when that slide is in the deck being edited (or
  // IS the open slide).
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
  // SSE `products_upserted`: ONE message for every product change, so ONE
  // interaction — a deck's row bumps on every slide write AND on a rename,
  // reattach or scope change, and a report's on every body save. Reported in
  // every view (a product the user is not looking at can still change under a
  // collaborator), one line per distinct product.
  product_updated: interaction<{
    productId: string;
    type: ProductType;
    label: string;
  }>({
    coalesce: (entries) => {
      const seen = new Set<string>();
      return entries.filter((e) =>
        seen.has(e.productId) ? false : (seen.add(e.productId), true),
      );
    },
    format: (p) =>
      p.type === "slide_deck"
        ? `Slide deck "${p.label}" changed (slides added, removed or reordered, or its settings changed)`
        : `Report "${p.label}" changed`,
    echoKey: (p) => `product:${p.productId}`,
  }),
  selected_products: interaction<{ productIds: string[] }>({
    relevantIn: ["viewing_products"],
    format: (p) => `Selected products: ${p.productIds.join(", ")}`,
  }),
  // The deck editor's slide list. The open deck's CURRENT selection also rides
  // the view instructions; this reports the act of selecting since the last
  // message.
  selected_slides: interaction<{ slideIds: string[] }>({
    relevantIn: ["editing_slide_deck"],
    format: (p) => `Selected slides: ${p.slideIds.join(", ")}`,
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
  // App-notified (not SSE): the user accepted an AI draft into a deck via the
  // preview card / AddToDeckModal. The write's SSE echoes are marked as AI
  // edits (the content is the AI's), so without this line the model would
  // never learn its draft was accepted.
  draft_added_to_deck: interaction<{ slideId: string; deckId: string }>({
    format: (p) =>
      `User added the AI-drafted slide to a slide deck (new slide ${p.slideId}, deck ${p.deckId})`,
  }),
});

export type CopilotInteractionDefs = (typeof copilotInteractions)["_defs"];
