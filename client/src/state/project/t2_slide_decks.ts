import { APIResponseWithData, SlideDeckDetail } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

const _SLIDE_DECK_DETAIL_CACHE = createReactiveCache<
  {
    projectId: string;
    deckId: string;
  },
  SlideDeckDetail
>({
  name: "slide_deck_detail",
  uniquenessKeys: (params) => [params.projectId, params.deckId],
  versionKey: (params, pds) =>
    pds.lastUpdated.slide_decks[params.deckId] ?? "unknown",
});

export async function getSlideDeckDetailFromCacheOrFetch(
  projectId: string,
  deckId: string,
): Promise<APIResponseWithData<SlideDeckDetail>> {
  const { data, version } = await _SLIDE_DECK_DETAIL_CACHE.get({
    projectId,
    deckId,
  });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = serverActions.getSlideDeckDetail({
    projectId,
    deck_id: deckId,
  });

  _SLIDE_DECK_DETAIL_CACHE.setPromise(
    newPromise,
    {
      projectId,
      deckId,
    },
    version,
  );

  return await newPromise;
}
