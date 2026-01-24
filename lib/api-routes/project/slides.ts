import { route } from "../route-utils.ts";
import { Slide, DeckSummary } from "../../types/mod.ts";
import type { SlideWithMeta } from "../../types/slides.ts";

export const slideRouteRegistry = {
  // Get all slides
  getSlides: route({
    path: "/slides/:deck_id",
    method: "GET",
    params: {} as { deck_id: string },
    response: {} as SlideWithMeta[],
    requiresProject: true,
  }),

  // Get single slide
  getSlide: route({
    path: "/slides/slide/:slide_id",
    method: "GET",
    params: {} as { slide_id: string },
    response: {} as SlideWithMeta,
    requiresProject: true,
  }),

  // Create slide
  createSlide: route({
    path: "/slides/:deck_id",
    method: "POST",
    params: {} as { deck_id: string },
    body: {} as {
      afterSlideId: string | null;
      slide: Slide;
    },
    response: {} as {
      slide: SlideWithMeta;
      index: number;
    },
    requiresProject: true,
  }),

  // Update slide (replace entirely)
  updateSlide: route({
    path: "/slides/slide/:slide_id",
    method: "PUT",
    params: {} as { slide_id: string },
    body: {} as { slide: Slide },
    response: {} as {
      slide: SlideWithMeta;
    },
    requiresProject: true,
  }),

  // Delete slides
  deleteSlides: route({
    path: "/slides/:deck_id",
    method: "DELETE",
    params: {} as { deck_id: string },
    body: {} as { slideIds: string[] },
    response: {} as {
      deletedCount: number;
    },
    requiresProject: true,
  }),

  // Move slides
  moveSlides: route({
    path: "/slides/:deck_id/move",
    method: "PUT",
    params: {} as { deck_id: string },
    body: {} as {
      slideIds: string[];
      position:
        | { after: string }
        | { before: string }
        | { toStart: true }
        | { toEnd: true };
    },
    response: {} as {
      slides: SlideWithMeta[];
    },
    requiresProject: true,
  }),
};
