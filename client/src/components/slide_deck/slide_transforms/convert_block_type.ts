import type { ContentBlock } from "lib";
import type { LayoutNode } from "panther";

export function convertBlockType(
  layout: LayoutNode<ContentBlock>,
  targetId: string,
  newType: "text" | "figure" | "placeholder" | "image",
): LayoutNode<ContentBlock> {
  function walk(node: LayoutNode<ContentBlock>): LayoutNode<ContentBlock> {
    if (node.id === targetId && node.type === "item") {
      const current = node.data;
      let newBlock: ContentBlock;

      switch (newType) {
        case "text":
          newBlock = {
            type: "text",
            markdown: current.type === "text" ? current.markdown : "",
          };
          break;
        case "figure":
          // Empty figure - user will add via "Replace visualization"
          newBlock = {
            type: "figure",
            figureInputs: { type: "empty" } as any,
          };
          break;
        case "placeholder":
          newBlock = { type: "placeholder" };
          break;
        case "image":
          newBlock = {
            type: "image",
            imgFile: current.type === "image" ? current.imgFile : "",
          };
          break;
      }

      return { ...node, data: newBlock };
    }

    if (node.type === "rows" || node.type === "cols") {
      return { ...node, children: node.children.map(walk) };
    }

    return node;
  }

  return walk(layout);
}
