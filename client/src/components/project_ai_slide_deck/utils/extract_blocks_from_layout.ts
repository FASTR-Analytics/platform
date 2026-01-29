import type { ContentBlock, Slide } from "lib";
import type { LayoutNode } from "panther";
import { getDataFromConfig } from "~/components/ai_tools/tools/visualization_reading";

export type BlockWithId = {
  id: string;
  block: ContentBlock;
};

export function extractBlocksFromLayout(
  layout: LayoutNode<ContentBlock>
): BlockWithId[] {
  const blocks: BlockWithId[] = [];

  function traverse(node: LayoutNode<ContentBlock>) {
    if (node.type === "item") {
      blocks.push({
        id: node.id,
        block: node.data,
      });
    } else {
      // Rows or cols - recurse
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(layout);
  return blocks;
}

function describeLayout(layout: LayoutNode<ContentBlock>): string {
  if (layout.type === "item") {
    return "Single block";
  }

  const childCount = layout.children.length;
  const direction = layout.type === "cols" ? "side by side" : "stacked vertically";

  // Check if all children are items (simple layout)
  const allItems = layout.children.every(child => child.type === "item");
  if (allItems) {
    return `${childCount} blocks ${direction}`;
  }

  // Nested layout
  return `${childCount} sections ${direction}`;
}

export type SimplifiedSlide =
  | { type: "cover"; title?: string; subtitle?: string; presenter?: string; date?: string }
  | { type: "section"; sectionTitle: string; sectionSubtitle?: string }
  | { type: "content"; heading: string; blocks: Array<{ id: string; summary: string }>; _layout_info: string };

export async function simplifySlideForAI(projectId: string, slide: Slide): Promise<SimplifiedSlide> {
  if (slide.type === "cover") {
    return {
      type: "cover",
      title: slide.title,
      subtitle: slide.subtitle,
      presenter: slide.presenter,
      date: slide.date,
    };
  }

  if (slide.type === "section") {
    return {
      type: "section",
      sectionTitle: slide.sectionTitle,
      sectionSubtitle: slide.sectionSubtitle,
    };
  }

  // Content slide - extract blocks with IDs and fetch data for figures
  const blocks = extractBlocksFromLayout(slide.layout);
  const simplifiedBlocks = await Promise.all(
    blocks.map(async ({ id, block }) => {
      if (block.type === "text") {
        return {
          id,
          summary: `Text: ${block.markdown}`,
        };
      } else if (block.type === "placeholder") {
        return { id, summary: "Placeholder" };
      } else {
        // Figure block
        if (block.source?.type === "from_data") {
          try {
            const dataOutput = await getDataFromConfig(
              projectId,
              block.source.metricId,
              block.source.config
            );

            const header = [
              `Figure (metric: ${block.source.metricId}, type: ${block.source.config.d.type})`,
              "",
            ].join("\n");

            return {
              id,
              summary: header + dataOutput,
            };
          } catch (err) {
            return {
              id,
              summary: `Figure (metric: ${block.source.metricId}) - Error loading data: ${err}`,
            };
          }
        } else if (block.source?.type === "custom") {
          return {
            id,
            summary: `Figure (custom data${block.source.description ? ` - ${block.source.description}` : ""})`,
          };
        } else {
          return { id, summary: "Figure (no source data)" };
        }
      }
    })
  );

  return {
    type: "content",
    heading: slide.heading,
    blocks: simplifiedBlocks,
    _layout_info: describeLayout(slide.layout),
  };
}
