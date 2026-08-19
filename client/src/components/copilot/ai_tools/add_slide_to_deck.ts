import type { Slide } from "lib";
import { serverActions } from "~/server_actions";
import { copilotViewController } from "~/components/copilot/ai_views";

// The "Add to this deck" path: the deck editor is open, so the draft was
// already resolved under THAT deck's pair (the env follows the open product)
// and needs no re-resolution. The picker path goes through AddToDeckModal,
// which re-resolves first.
export async function addSlideDirectlyToDeck(
  slide: Slide,
  deckId: string,
): Promise<void> {
  const res = await serverActions.createSlide({
    deck_id: deckId,
    position: { toEnd: true },
    slide,
  });
  if (!res.success) throw new Error(res.err);
  reportDraftSlideAdded(res.data.slideId, deckId);
}

// The slide's content is the AI's, so its SSE echoes are marked as AI edits;
// the user's ACCEPT decision is reported explicitly instead (the model would
// otherwise never learn its draft landed, or worse, see a generic "slide deck
// changed" misattributed line).
export function reportDraftSlideAdded(slideId: string, deckId: string): void {
  copilotViewController.markAIEdit(`slide:${slideId}`);
  copilotViewController.markAIEdit(`product:${deckId}`);
  copilotViewController.notify("draft_added_to_deck", { slideId, deckId });
}
