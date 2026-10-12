import type { APIResponseWithData, Slide } from "lib";
import { serverActions } from "~/server_actions";
import { copilotViewController } from "~/components/instance/copilot/mod.ts";

// The card offers Add only in an editable deck on the pair the draft was
// resolved under (draft_slide_preview.tsx), so the slide is written as is.
// The response is the card's to report.
export async function addSlideToDeck(
  slide: Slide,
  deckId: string,
): Promise<APIResponseWithData<{ slideId: string; lastUpdated: string }>> {
  const res = await serverActions.createSlide({
    product_id: deckId,
    position: { toEnd: true },
    slide,
  });
  if (!res.success) return res;
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
  return res;
}
