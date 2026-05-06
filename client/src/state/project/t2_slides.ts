import { createReactiveCache } from "../_infra/reactive_cache";
import type { SlideWithMeta } from "lib";

export const _SLIDE_CACHE = createReactiveCache<
  { projectId: string; slideId: string },
  SlideWithMeta
>({
  name: "slide",
  uniquenessKeys: (p) => [p.projectId, p.slideId],
  versionKey: (p, pds) => pds.lastUpdated.slides[p.slideId] ?? "unknown",
});
