import type { ContentBlock } from "lib";
import {
  createColsNode,
  createItemNode,
  createRowsNode,
  type LayoutNode,
} from "panther";

const TOTAL_COLUMNS = 12;

type ResolvedCell = {
  id: string;
  block: ContentBlock;
  span?: number;
};

export type LayoutStructureCell = {
  blockId: string;
  span: number;
};

export type LayoutStructure = LayoutStructureCell[][];

export function buildLayoutFromSpec(
  rows: ResolvedCell[][],
): LayoutNode<ContentBlock> {
  if (rows.length === 1 && rows[0].length === 1) {
    const cell = rows[0][0];
    return createRowsNode([
      createItemNode(cell.block, { id: cell.id }),
    ]);
  }

  if (rows.length === 1) {
    return buildColsRow(rows[0]);
  }

  const rowNodes = rows.map((row) => {
    if (row.length === 1) {
      const cell = row[0];
      return createRowsNode([
        createItemNode(cell.block, { id: cell.id }),
      ]);
    }
    return buildColsRow(row);
  });

  return createRowsNode(rowNodes);
}

function buildColsRow(cells: ResolvedCell[]): LayoutNode<ContentBlock> {
  const colChildren = cells.map((cell) => {
    const rowWrapper = createRowsNode([
      createItemNode(cell.block, { id: cell.id }),
    ]);
    return { ...rowWrapper, span: cell.span };
  });
  return createColsNode(colChildren);
}

export function normalizeSpans(
  rows: Array<Array<{ span?: number }>>,
): number[][] {
  return rows.map((row) => {
    if (row.length === 1) return [TOTAL_COLUMNS];

    const specified: Array<{ index: number; span: number }> = [];
    const unspecified: number[] = [];

    for (let i = 0; i < row.length; i++) {
      if (row[i].span !== undefined) {
        specified.push({ index: i, span: row[i].span! });
      } else {
        unspecified.push(i);
      }
    }

    if (specified.length === 0) {
      const base = Math.floor(TOTAL_COLUMNS / row.length);
      const remainder = TOTAL_COLUMNS % row.length;
      return row.map((_, i) => base + (i < remainder ? 1 : 0));
    }

    const usedSpan = specified.reduce((sum, s) => sum + s.span, 0);

    if (unspecified.length === 0) {
      if (usedSpan !== TOTAL_COLUMNS) {
        throw new Error(
          `Spans in row sum to ${usedSpan}, must sum to ${TOTAL_COLUMNS}. ` +
            `Got: [${row.map((c) => c.span).join(", ")}]`,
        );
      }
      return row.map((c) => c.span!);
    }

    const remaining = TOTAL_COLUMNS - usedSpan;
    if (remaining <= 0) {
      throw new Error(
        `Specified spans sum to ${usedSpan}, leaving no space for ${unspecified.length} unspecified cell(s). ` +
          `Total must be ${TOTAL_COLUMNS}.`,
      );
    }

    const base = Math.floor(remaining / unspecified.length);
    const rem = remaining % unspecified.length;
    const result = new Array<number>(row.length);
    for (const s of specified) {
      result[s.index] = s.span;
    }
    for (let i = 0; i < unspecified.length; i++) {
      result[unspecified[i]] = base + (i < rem ? 1 : 0);
    }
    return result;
  });
}

export function layoutNodeToStructure(
  layout: LayoutNode<ContentBlock>,
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
        `Row ${i + 1}: ${row.map((c) => `${c.blockId} (span=${c.span})`).join(" | ")}`,
    )
    .join("; ");

  return { description: desc, structure: result };
}

function tryConvert(
  node: LayoutNode<ContentBlock>,
): LayoutStructure | null {
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

function unwrapColsChildren(
  children: LayoutNode<ContentBlock>[],
): LayoutStructureCell[] | null {
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
