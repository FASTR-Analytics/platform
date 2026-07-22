import type { Slide } from "lib";
import { serverActions } from "~/server_actions";

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
}
