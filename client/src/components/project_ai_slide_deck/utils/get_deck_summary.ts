import { getSlideTitle } from "lib";
import { _SLIDE_CACHE } from "~/state/caches/slides";

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
      const cached = await _SLIDE_CACHE.get({ projectId, slideId });

      if (!cached.data) {
        lines.push(`  ${slideId}: [Loading...]`);
      } else {
        const title = getSlideTitle(cached.data.slide);
        lines.push(`  ${slideId} (${cached.data.slide.type}): "${title}"`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}
