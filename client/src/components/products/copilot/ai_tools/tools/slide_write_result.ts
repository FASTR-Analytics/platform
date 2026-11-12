import type { ContentSlide, Slide } from "lib";
import { extractBlocksFromLayout } from "../../slide_ai/mod.ts";

// Text blocks autofit, so a page that overflows overflows on its figures: they
// are both the cause named and the fix offered. A fit is said as plainly, so a
// model that just applied the fix is told it worked.
function describePageFit(slide: ContentSlide, overflow: boolean): string {
  if (!overflow) return "Page: the layout fits the page.";
  const sentence = "Page: the layout overflows the page.";
  const figureIds = extractBlocksFromLayout(slide.layout)
    .filter(({ block }) => block.type === "figure")
    .map(({ id }) => id);
  if (figureIds.length === 0) return sentence;
  return `${sentence} Figure block(s) ${
    figureIds.join(", ")
  }: filter the indicator dimension to the indicators this slide names, or choose a preset with fewer rows, then update_figure.`;
}

// The result of a slide write: `done`, the sentence saying what was done, and
// for a content slide its page fit. Cover and section results are `done`
// alone.
export function slideWriteResult(
  done: string,
  slide: Slide,
  overflow: boolean,
): string {
  if (slide.type !== "content") return done;
  return [done, describePageFit(slide, overflow)].join("\n");
}
