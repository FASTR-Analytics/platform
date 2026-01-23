import type { ContentBlock, Slide } from "lib";
import type { LayoutNode } from "panther";

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

export type SimplifiedSlide =
  | { type: "cover"; title?: string; subtitle?: string; presenter?: string; date?: string }
  | { type: "section"; sectionTitle: string; sectionSubtitle?: string }
  | { type: "content"; heading: string; blocks: Array<{ id: string; summary: string }> };

export function simplifySlideForAI(slide: Slide): SimplifiedSlide {
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

  // Content slide - extract blocks with IDs
  const blocks = extractBlocksFromLayout(slide.layout);
  return {
    type: "content",
    heading: slide.heading,
    blocks: blocks.map(({ id, block }) => {
      if (block.type === "text") {
        const preview = block.markdown.length > 150
          ? block.markdown.substring(0, 150) + "..."
          : block.markdown;
        return {
          id,
          summary: `Text: ${preview}`,
        };
      } else {
        let summary = "Figure";
        if (block.source?.type === "from_metric") {
          summary += ` (metric: ${block.source.metricId})`;
          if (block.source.clonedFromVisualizationId) {
            summary += ` [cloned from viz: ${block.source.clonedFromVisualizationId}]`;
          }
        } else if (block.source?.type === "custom") {
          summary += " (custom data)";
          if (block.source.description) {
            summary += ` - ${block.source.description}`;
          }
        }
        return { id, summary };
      }
    }),
  };
}
