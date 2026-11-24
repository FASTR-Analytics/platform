import type { ContentBlock, LayoutSpec } from "lib";
import {
  _GLOBAL_LAYOUT_COLUMNS,
  createColsNode,
  createItemNode,
  createRowsNode,
  type LayoutNode,
} from "panther";

type ResolvedCell = {
  id: string;
  block: ContentBlock;
  span?: number;
};

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

// Shares each row's columns left by its given spans among its cells without
// one, the first taking any remainder. LayoutSpecSchema's row rule leaves
// each such cell at least one column.
export function normalizeSpans(spec: LayoutSpec): number[][] {
  return spec.map((row) => {
    const without = row.flatMap((c, i) => c.span === undefined ? [i] : []);
    const free = _GLOBAL_LAYOUT_COLUMNS -
      row.reduce((sum, c) => sum + (c.span ?? 0), 0);
    return row.map((c, i) => {
      if (c.span !== undefined) return c.span;
      const k = without.indexOf(i);
      return Math.floor(free / without.length) +
        (k < free % without.length ? 1 : 0);
    });
  });
}
