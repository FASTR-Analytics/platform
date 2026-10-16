import { getSlideTitle, type Slide } from "lib";
import type { OpenSlide } from "~/components/instance/copilot/mod.ts";
import { getSlideFromCacheOrFetch } from "~/state/products/t2_slides";
import { extractBlocksFromLayout } from "./extract_blocks_from_layout";

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

  return parts.length > 0 ? ` [${parts.join(", ")}]` : "";
}

function slideLine(slideId: string, marker: string, slide: Slide): string {
  return `  ${slideId}${marker} (${slide.type}): "${getSlideTitle(slide)}"${
    getContentSummary(slide)
  }`;
}

// The open slide's line is read from its draft, so it matches the canvas,
// and is marked "(open)".
export async function getDeckSummaryForAI(
  productId: string,
  slideIds: string[],
  openSlide: OpenSlide | undefined,
): Promise<string> {
  const lineFor = async (slideId: string): Promise<string> => {
    if (openSlide?.slideId === slideId) {
      return slideLine(slideId, " (open)", openSlide.getDraft());
    }
    const res = await getSlideFromCacheOrFetch(productId, slideId);
    return res.success
      ? slideLine(slideId, "", res.data.slide)
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
