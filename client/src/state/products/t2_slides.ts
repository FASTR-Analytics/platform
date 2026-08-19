import { createReactiveCache } from "../_infra/reactive_cache";
import type { SlideWithMeta, APIResponseWithData } from "lib";
import { serverActions } from "~/server_actions";

export const _SLIDE_CACHE = createReactiveCache<
  { projectId: string; slideId: string },
  SlideWithMeta
>({
  name: "slide",
  uniquenessKeys: (p) => [p.projectId, p.slideId],
  versionKey: (p, pds) => pds.lastUpdated.slides[p.slideId] ?? "unknown",
});

export async function getSlideFromCacheOrFetch(
  projectId: string,
  slideId: string,
): Promise<APIResponseWithData<SlideWithMeta>> {
  const cached = await _SLIDE_CACHE.get({ projectId, slideId });
  if (cached.data) {
    return { success: true, data: cached.data };
  }
  const promise = serverActions.getSlide({ projectId, slide_id: slideId });
  _SLIDE_CACHE.setPromise(promise, { projectId, slideId }, cached.version);
  return promise;
}
