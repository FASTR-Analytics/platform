import { getSlideTitle, type Slide } from "lib";
import { getSlideFromCacheOrFetch } from "~/state/project/t2_slides";
import { extractBlocksFromLayout } from "./extract_blocks_from_layout";

function getContentSummary(slide: Slide): string {
  if (slide.type !== "content") return "";

  const blocks = extractBlocksFromLayout(slide.layout);
  const blockCounts = new Map<string, number>();

  for (const { block } of blocks) {
    blockCounts.set(block.type, (blockCounts.get(block.type) || 0) + 1);
  }

  const parts: string[] = [];

  const vizCount = (blockCounts.get("figure") || 0);
  if (vizCount > 0) parts.push(`${vizCount} viz`);

  const textCount = blockCounts.get("text") || 0;
  if (textCount > 0) parts.push(`${textCount} text`);

  return parts.length > 0 ? ` [${parts.join(", ")}]` : "";
}

export async function getDeckSummaryForAI(
  projectId: string,
  slideIds: string[]
): Promise<string> {
  const lines: string[] = [
    "CURRENT SLIDES",
    "=".repeat(80),
    "",
    `Total: ${slideIds.length}`,
    "",
  ];

  if (slideIds.length === 0) {
    lines.push("No slides yet");
  } else {
    for (let i = 0; i < slideIds.length; i++) {
      const slideId = slideIds[i];
      const res = await getSlideFromCacheOrFetch(projectId, slideId);

      if (!res.success) {
        lines.push(`  ${slideId}: [Failed to load: ${res.err}]`);
      } else {
        const title = getSlideTitle(res.data.slide);
        const contentSummary = getContentSummary(res.data.slide);
        lines.push(`  ${slideId} (${res.data.slide.type}): "${title}"${contentSummary}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}
