import type { Slide } from "lib";
import { AIToolFailure } from "panther";
import { reconcile, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  copilotViewController,
  type EditingSlideDeckContext,
  type OpenSlide,
} from "~/components/instance/copilot/mod.ts";
import { assertSlidesNotBusy } from "../validators/mod.ts";

// The part of a deck view a slide tool reads and writes through.
type DeckView = {
  params: { deckId: string };
  context: EditingSlideDeckContext;
};

// Where a tool read a slide, which is where it writes it back: the open
// slide through the editor's draft, any other slide as stored, with the
// version its write is checked against. `slide` is the tool's own copy.
export type SlideTarget =
  | { kind: "open"; slideId: string; open: OpenSlide; slide: Slide }
  | { kind: "stored"; slideId: string; slide: Slide; lastUpdated: string };

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
      slide: structuredClone(unwrap(open.getDraft())),
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
  } else {
    if (open?.slideId === target.slideId) {
      throw new AIToolFailure(
        "The user opened this slide while the edit was being prepared; nothing was applied. Re-read it with get_slide and retry.",
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
          ? "CONFLICT: The slide was modified by someone else while this edit was in progress. Call get_slide to re-read the latest content, then retry based on the updated state."
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
