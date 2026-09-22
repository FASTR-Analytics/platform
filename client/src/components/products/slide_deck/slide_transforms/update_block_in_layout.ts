import type { ContentBlock } from "lib";
import type { LayoutNode } from "panther";

// Structural replace: a fresh node object on the path to the target, so a
// path set of the result always carries a new reference. That is what lets
// the CRDT sync's reference cache see a changed block; reconciling in place
// can merge a new bundle into the old object (same ref), which the sync then
// skips and the edit never reaches the doc. See lib/collab/slide_crdt.ts.
export function updateBlockInLayout(
  layout: LayoutNode<ContentBlock>,
  targetId: string,
  updater: (block: ContentBlock) => ContentBlock,
): LayoutNode<ContentBlock> {
  if (layout.type === "item") {
    if (layout.id === targetId) {
      return { ...layout, data: updater(layout.data) };
    }
    return layout;
  }

  return {
    ...layout,
    children: layout.children.map((child) =>
      updateBlockInLayout(child as LayoutNode<ContentBlock>, targetId, updater),
    ),
  };
}
