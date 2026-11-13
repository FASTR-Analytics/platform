import { getSlideTitle, type Slide, type SlideDeckConfig } from "lib";
import type { OpenSlide } from "~/components/instance/copilot/mod.ts";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import { extractBlocksFromLayout } from "./layout_structure.ts";
import {
  describeSlideOverflow,
  measureSlideOverflow,
} from "./measure_slide_overflow.ts";

function getContentSummary(slide: Slide): string {
  if (slide.type !== "content") return "";

  const blocks = extractBlocksFromLayout(slide.layout);
  const blockCounts = new Map<string, number>();

  for (const { block } of blocks) {
    blockCounts.set(block.type, (blockCounts.get(block.type) || 0) + 1);
  }

  const parts: string[] = [];

  const vizCount = blockCounts.get("figure") || 0;
  if (vizCount > 0) parts.push(`${vizCount} viz`);

  const textCount = blockCounts.get("text") || 0;
  if (textCount > 0) parts.push(`${textCount} text`);

  const imageCount = blockCounts.get("image") || 0;
  if (imageCount > 0) parts.push(`${imageCount} image`);

  return parts.length > 0 ? ` [${parts.join(", ")}]` : "";
}

async function slideLines(
  slideId: string,
  marker: string,
  slide: Slide,
  deckConfig: SlideDeckConfig,
): Promise<string> {
  const line = `  ${slideId}${marker} (${slide.type}): "${
    getSlideTitle(slide)
  }"${getContentSummary(slide)}`;
  if (slide.type !== "content") return line;
  // One slide that cannot be measured must not hide the rest of the deck.
  const overflow = await measureSlideOverflow(slide, deckConfig).catch(
    (err: unknown) => err instanceof Error ? err : new Error(String(err)),
  );
  return `${line}\n    ${describeSlideOverflow(slideId, overflow)}`;
}

// The open slide's line is read from its draft, so it matches the canvas,
// and is marked "(open)".
export async function getDeckSummaryForAI(
  productId: string,
  slideIds: string[],
  openSlide: OpenSlide | undefined,
  deckConfig: SlideDeckConfig,
): Promise<string> {
  const lineFor = async (slideId: string): Promise<string> => {
    if (openSlide?.slideId === slideId) {
      return slideLines(slideId, " (open)", openSlide.getDraft(), deckConfig);
    }
    const res = await getSlideFromCacheOrFetch(productId, slideId);
    return res.success
      ? slideLines(slideId, "", res.data.slide, deckConfig)
      : `  ${slideId}: [Failed to load: ${res.err}]`;
  };
  return [
    "CURRENT SLIDES",
    "=".repeat(80),
    "",
    `Total: ${slideIds.length}`,
    "",
    ...(slideIds.length === 0
      ? ["No slides yet"]
      : await Promise.all(slideIds.map(lineFor))),
    "",
  ].join("\n");
}
