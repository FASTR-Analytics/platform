import type { ContentBlock, ContentSlide } from "lib";

// The read-only half of the layout helpers: what a stored layout holds, as
// the model is told it. The layout is typed through lib and nothing here
// imports the client's panther, so a Deno test loads this file as it is.
type Layout = ContentSlide["layout"];

export const TOTAL_COLUMNS = 12;

export type BlockWithId = {
  id: string;
  block: ContentBlock;
};

export function extractBlocksFromLayout(layout: Layout): BlockWithId[] {
  const blocks: BlockWithId[] = [];

  function traverse(node: Layout) {
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

export type LayoutStructureCell = {
  blockId: string;
  span: number;
};

export type LayoutStructure = LayoutStructureCell[][];

export function layoutNodeToStructure(
  layout: Layout,
): { description: string; structure: LayoutStructure | null } {
  const result = tryConvert(layout);
  if (!result) {
    return {
      description: "Complex layout — use replace_slide to restructure",
      structure: null,
    };
  }

  const desc = result
    .map(
      (row, i) =>
        `Row ${i + 1}: ${
          row.map((c) => `${c.blockId} (span=${c.span})`).join(" | ")
        }`,
    )
    .join("; ");

  return { description: desc, structure: result };
}

function tryConvert(node: Layout): LayoutStructure | null {
  if (node.type === "item") {
    return [[{ blockId: node.id, span: TOTAL_COLUMNS }]];
  }

  if (node.type === "cols") {
    const row = unwrapColsChildren(node.children);
    if (!row) return null;
    return [row];
  }

  const rows: LayoutStructureCell[][] = [];
  for (const child of node.children) {
    if (child.type === "item") {
      rows.push([{ blockId: child.id, span: TOTAL_COLUMNS }]);
    } else if (child.type === "rows") {
      if (
        child.children.length === 1 &&
        child.children[0].type === "item"
      ) {
        rows.push([
          {
            blockId: child.children[0].id,
            span: child.span ?? TOTAL_COLUMNS,
          },
        ]);
      } else {
        return null;
      }
    } else if (child.type === "cols") {
      const row = unwrapColsChildren(child.children);
      if (!row) return null;
      rows.push(row);
    }
  }

  return rows;
}

function unwrapColsChildren(children: Layout[]): LayoutStructureCell[] | null {
  const cells: LayoutStructureCell[] = [];

  for (const child of children) {
    if (child.type === "item") {
      cells.push({
        blockId: child.id,
        span: child.span ?? TOTAL_COLUMNS,
      });
    } else if (child.type === "rows") {
      if (
        child.children.length === 1 &&
        child.children[0].type === "item"
      ) {
        cells.push({
          blockId: child.children[0].id,
          span: child.span ?? TOTAL_COLUMNS,
        });
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  return cells;
}

// The two lines a write's result gives the model for a content slide: every
// block by id and type, then the layout as rows of spans.
export function describeSlideBlocks(layout: Layout): string[] {
  const blocks = extractBlocksFromLayout(layout)
    .map(({ id, block }) => `${id} (${block.type})`)
    .join(", ");
  return [
    `Blocks: ${blocks}`,
    `Layout: ${layoutNodeToStructure(layout).description}`,
  ];
}
