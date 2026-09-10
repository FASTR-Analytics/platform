import type { Slide } from "lib";
import { serverActions } from "~/server_actions";
import { copilotViewController } from "~/components/copilot/ai_views";

// The draft was resolved under the open product's pair, which is the open
// deck's, so it is written as is.
export async function addSlideToDeck(
  slide: Slide,
  deckId: string,
): Promise<void> {
  const res = await serverActions.createSlide({
    product_id: deckId,
    position: { toEnd: true },
    slide,
  });
  if (!res.success) throw new Error(res.err);
  // The slide's content is the AI's, so its SSE echoes are marked as AI
  // edits; the user's ACCEPT decision is reported explicitly instead (the
  // model would otherwise never learn its draft landed, or worse, see a
  // generic "deck structure changed" misattributed line).
  copilotViewController.markAIEdit(`slide:${res.data.slideId}`);
  copilotViewController.markAIEdit(`product:${deckId}`);
  copilotViewController.notify("draft_added_to_deck", {
    slideId: res.data.slideId,
    deckId,
  });
}
