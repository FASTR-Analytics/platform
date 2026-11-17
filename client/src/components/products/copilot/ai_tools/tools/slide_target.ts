import type { ContentSlide, Slide } from "lib";
import { AIToolFailure } from "panther";
import { reconcile, type SetStoreFunction, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  copilotViewController,
  type EditingSlideDeckContext,
  type OpenSlide,
} from "~/components/instance/copilot/mod.ts";
import { assertSlidesNotBusy } from "../validators/mod.ts";
import { extractBlocksFromLayout } from "../../slide_ai/mod.ts";
import { updateBlockInLayout } from "~/components/products/slide_deck/slide_transforms/mod.ts";

// The part of a deck view a slide tool reads and writes through.
type DeckView = {
  params: { deckId: string };
  context: EditingSlideDeckContext;
};

// Where a tool read a slide, which is where it writes it back: the open
// slide through the editor's draft, any other slide as stored, with the
// version its write is checked against. The open slide's `slide` is the live
// draft, unwrapped, which a handler reads and never mutates: the nodes its
// update leaves alone stay the store's own, so the reconcile on write keeps
// what the user typed into them while the handler awaited.
export type SlideTarget =
  | { kind: "open"; slideId: string; open: OpenSlide; slide: Slide }
  | { kind: "stored"; slideId: string; slide: Slide; lastUpdated: string };

// A call that names several slides refuses whole when one is not in the deck,
// before anything is read or written.
export function assertSlidesInDeck(view: DeckView, slideIds: string[]): void {
  const deckSlideIds = new Set(view.context.getSlideIds());
  const missingIds = slideIds.filter((id) => !deckSlideIds.has(id));
  if (missingIds.length > 0) {
    throw new AIToolFailure(
      `Slide ID(s) not found in deck: ${
        missingIds.join(", ")
      }. Use get_deck to see current slide IDs.`,
    );
  }
}

// The open slide is read from its draft, so the model sees and builds on the
// edits the canvas shows, saved or not.
export async function readSlideTarget(
  view: DeckView,
  slideId: string,
): Promise<SlideTarget> {
  const open = view.context.getOpenSlide();
  if (open?.slideId === slideId) {
    return {
      kind: "open",
      slideId,
      open,
      slide: unwrap(open.getDraft()),
    };
  }
  const res = await serverActions.getSlide({
    product_id: view.params.deckId,
    slide_id: slideId,
  });
  if (!res.success) throw new AIToolFailure(res.err);
  return {
    kind: "stored",
    slideId,
    slide: res.data.slide,
    lastUpdated: res.data.lastUpdated,
  };
}

// Writes `updated` where `target` was read: into the open slide's draft,
// which the canvas shows at once and the editor saves, or over REST under the
// version the read saw. The collaborator check runs here, at the write, so a
// read is never refused. A target whose open state changed since the read
// (the user switched slides, or opened this one) refuses: the open slide is
// only ever written through its draft. The collab checkpoint of a draft write
// echoes on SSE as a stored write does, so both mark the echo keys.
export async function writeSlideTarget(
  view: DeckView,
  target: SlideTarget,
  updated: Slide,
): Promise<void> {
  assertSlidesNotBusy([target.slideId]);
  const open = view.context.getOpenSlide();
  if (target.kind === "open") {
    if (open !== target.open) {
      throw new AIToolFailure("The user switched slides; nothing was applied.");
    }
    target.open.setDraft(reconcile(updated));
    setBuiltFigures(target, updated);
  } else {
    if (open?.slideId === target.slideId) {
      throw new AIToolFailure(
        "The user opened this slide while the edit was being prepared; nothing was applied. Re-read it with get_slides and retry.",
      );
    }
    const res = await serverActions.updateSlide({
      product_id: view.params.deckId,
      slide_id: target.slideId,
      slide: updated,
      expectedLastUpdated: target.lastUpdated,
    });
    if (!res.success) {
      throw new AIToolFailure(
        res.err === "CONFLICT"
          ? "CONFLICT: The slide was modified by someone else while this edit was in progress. Call get_slides to re-read the latest content, then retry based on the updated state."
          : res.err,
      );
    }
  }
  copilotViewController.markAIEdit(`slide:${target.slideId}`);
  copilotViewController.markAIEdit(`product:${view.params.deckId}`);
}

// The tail of a write's result: where the edit landed, in the user's terms.
export function slideTargetOutcome(target: SlideTarget): string {
  return target.kind === "open"
    ? "It shows on the open slide at once and saves automatically."
    : "The slide is saved.";
}

// The collab push skips a figure whose bundle is the object it last synced,
// and `reconcile` merges a changed bundle into the store's existing object, so
// a figure edit reconciled into the draft changes the canvas and never reaches
// the shared document. Setting the layout by path puts the bundle the tool
// built, an object the draft did not hold, where the push looks for a fresh
// one, as the editor's own figure edits do.
function setBuiltFigures(
  target: Extract<SlideTarget, { kind: "open" }>,
  updated: Slide,
): void {
  if (target.slide.type !== "content" || updated.type !== "content") return;
  const heldBundles = new Map(
    extractBlocksFromLayout(target.slide.layout).flatMap(({ id, block }) =>
      block.type === "figure" ? [[id, block.bundle] as const] : []
    ),
  );
  const built = extractBlocksFromLayout(updated.layout).filter((
    { id, block },
  ) => block.type === "figure" && heldBundles.get(id) !== block.bundle);
  if (built.length === 0) return;
  const draft = unwrap(target.open.getDraft()) as ContentSlide;
  const layout = built.reduce(
    (acc, { id, block }) => updateBlockInLayout(acc, id, () => block),
    draft.layout,
  );
  (target.open.setDraft as SetStoreFunction<ContentSlide>)("layout", layout);
}
