import { createReactiveCache } from "../_infra/reactive_cache";
import type { SlideWithMeta, APIResponseWithData } from "lib";
import { serverActions } from "~/server_actions";

// One slide's content, versioned by its own optimistic-lock stamp — the
// per-entity (Variant B) shape: a flip means one incremental change to the
// slide the user is looking at, so consumers leave stale content visible while
// the refetch runs.
export const _SLIDE_CACHE = createReactiveCache<
  { slideId: string },
  SlideWithMeta
>({
  name: "slide",
  uniquenessKeys: (p) => [p.slideId],
  versionKey: (p, ins) => ins.lastUpdated.slides[p.slideId] ?? "unknown",
});

export async function getSlideFromCacheOrFetch(
  slideId: string,
): Promise<APIResponseWithData<SlideWithMeta>> {
  const cached = await _SLIDE_CACHE.get({ slideId });
  if (cached.data) {
    return { success: true, data: cached.data };
  }
  const promise = serverActions.getSlide({ slide_id: slideId });
  _SLIDE_CACHE.setPromise(promise, { slideId }, cached.version);
  return promise;
}
