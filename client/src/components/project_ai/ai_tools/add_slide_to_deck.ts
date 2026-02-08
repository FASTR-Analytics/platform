import type { Slide } from "lib";
import type { AIContextEditingSlideDeck } from "~/components/project_ai/types";
import { serverActions } from "~/server_actions";

export async function addSlideDirectlyToDeck(
  projectId: string,
  slide: Slide,
  ctx: AIContextEditingSlideDeck,
): Promise<void> {
  const res = await serverActions.createSlide({
    projectId,
    deck_id: ctx.deckId,
    position: { toEnd: true },
    slide,
  });
  if (!res.success) throw new Error(res.err);
  ctx.optimisticSetLastUpdated("slides", res.data.slideId, res.data.lastUpdated);
  ctx.optimisticSetLastUpdated("slide_decks", ctx.deckId, res.data.lastUpdated);
}
