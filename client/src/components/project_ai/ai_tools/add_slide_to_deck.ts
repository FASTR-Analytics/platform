import type { Slide } from "lib";
import { serverActions } from "~/server_actions";
import { projectAIViewController } from "~/components/project_ai/ai_views";

export async function addSlideDirectlyToDeck(
  projectId: string,
  slide: Slide,
  deckId: string,
): Promise<void> {
  const res = await serverActions.createSlide({
    projectId,
    deck_id: deckId,
    position: { toEnd: true },
    slide,
  });
  if (!res.success) throw new Error(res.err);
  reportDraftSlideAdded(res.data.slideId, deckId);
}

// The slide's content is the AI's, so its SSE echoes are marked as AI edits;
// the user's ACCEPT decision is reported explicitly instead (the model would
// otherwise never learn its draft landed, or worse, see a generic "deck
// structure changed" misattributed line).
export function reportDraftSlideAdded(slideId: string, deckId: string): void {
  projectAIViewController.markAIEdit(`slide:${slideId}`);
  projectAIViewController.markAIEdit(`deck:${deckId}`);
  projectAIViewController.notify("draft_added_to_deck", { slideId, deckId });
}
