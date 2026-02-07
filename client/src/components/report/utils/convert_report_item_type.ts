import { ReportItemContentItem, getStartingReportItemPlaceholder } from "lib";
import type { LayoutNode } from "panther";

export function convertReportItemType(
  layout: LayoutNode<ReportItemContentItem>,
  targetId: string,
  newType: "text" | "figure" | "placeholder" | "image",
): LayoutNode<ReportItemContentItem> {
  function walk(
    node: LayoutNode<ReportItemContentItem>,
  ): LayoutNode<ReportItemContentItem> {
    if (node.id === targetId && node.type === "item") {
      const current = node.data;
      const base = getStartingReportItemPlaceholder();

      const newItem: ReportItemContentItem = {
        ...base,
        type: newType,
        span: current.span,
        // Preserve relevant data
        markdown: newType === "text" ? current.markdown : undefined,
        imgFile: newType === "image" ? current.imgFile : undefined,
        presentationObjectInReportInfo:
          newType === "figure"
            ? current.presentationObjectInReportInfo
            : undefined,
      };

      return { ...node, data: newItem };
    }

    if (node.type === "rows" || node.type === "cols") {
      return { ...node, children: node.children.map(walk) };
    }

    return node;
  }

  return walk(layout);
}
