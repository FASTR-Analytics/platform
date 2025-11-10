// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedTableStyle, RenderContext } from "../deps.ts";
import type {
  ColGroupHeaderInfo,
  ColHeaderInfo,
  RowHeaderInfo,
  TableDataTransformed,
} from "../types.ts";

export function getRowHeaderInfos(
  rc: RenderContext,
  d: TableDataTransformed,
  s: MergedTableStyle,
  maxPossibleWidth: number,
): RowHeaderInfo[] {
  const rowHeaderInfos: RowHeaderInfo[] = [];

  d.rowGroups.forEach((rowGroup) => {
    if (rowGroup.label) {
      const mText = rc.mText(
        rowGroup.label,
        s.text.rowGroupHeaders,
        maxPossibleWidth,
      );
      rowHeaderInfos.push({
        mText,
        label: rowGroup.label,
        index: "group-header",
      });
    }
    rowGroup.rows.forEach((row) => {
      const mText = row.label === undefined
        ? undefined
        : rc.mText(row.label, s.text.rowHeaders, maxPossibleWidth);
      rowHeaderInfos.push({
        mText,
        label: row.label,
        index: row.index,
      });
    });
  });

  return rowHeaderInfos;
}

export function getColGroupHeaderInfos(
  rc: RenderContext,
  d: TableDataTransformed,
  s: MergedTableStyle,
  colInnerWidth: number,
): ColGroupHeaderInfo[] {
  return d.colGroups.map<ColGroupHeaderInfo>((colGroup) => {
    const nCols = colGroup.cols.length;
    const colGroupInnerWidth = nCols * colInnerWidth +
      (nCols - 1) * s.grid.gridStrokeWidth;
    const mText = colGroup.label === undefined
      ? undefined
      : rc.mText(colGroup.label, s.text.colHeaders, colGroupInnerWidth);
    return { mText, colGroupInnerWidth };
  });
}

export function getColHeaderInfos(
  rc: RenderContext,
  d: TableDataTransformed,
  s: MergedTableStyle,
  colInnerWidth: number,
): ColHeaderInfo[] {
  if (s.verticalColHeaders === "never") {
    const colHeaderInfos: ColHeaderInfo[] = [];
    for (const colGroup of d.colGroups) {
      for (const col of colGroup.cols) {
        const mText = col.label === undefined
          ? undefined
          : rc.mText(col.label, s.text.colHeaders, colInnerWidth);
        colHeaderInfos.push({
          mText,
          index: col.index,
        });
      }
    }
    return colHeaderInfos;
  }

  if (s.verticalColHeaders === "auto") {
    let hasOverflow = false;
    const colHeaderInfos: ColHeaderInfo[] = [];
    for (const colGroup of d.colGroups) {
      for (const col of colGroup.cols) {
        const mText = col.label === undefined
          ? undefined
          : rc.mText(col.label, s.text.colHeaders, colInnerWidth);
        if (mText && mText.dims.w() > colInnerWidth) {
          hasOverflow = true;
          break;
        }
        colHeaderInfos.push({
          mText,
          index: col.index,
        });
      }
      if (hasOverflow) {
        break;
      }
    }
    if (!hasOverflow) {
      return colHeaderInfos;
    }
  }

  // Now we know that it must be VERTICAL

  const maxHeightOptions = [
    s.maxHeightForVerticalColHeaders * 0.5,
    s.maxHeightForVerticalColHeaders * 0.75,
  ];

  for (const maxHeight of maxHeightOptions) {
    let hasOverflow = false;
    const colHeaderInfos: ColHeaderInfo[] = [];
    for (const colGroup of d.colGroups) {
      for (const col of colGroup.cols) {
        const mText = col.label === undefined
          ? undefined
          : rc.mText(col.label, s.text.colHeaders, maxHeight, {
            rotation: "anticlockwise",
          });
        if (mText && mText.dims.w() > colInnerWidth) {
          hasOverflow = true;
          break;
        }
        colHeaderInfos.push({
          mText,
          index: col.index,
        });
      }
      if (hasOverflow) {
        break;
      }
    }
    if (!hasOverflow) {
      return colHeaderInfos;
    }
  }

  const colHeaderInfos: ColHeaderInfo[] = [];
  for (const colGroup of d.colGroups) {
    for (const col of colGroup.cols) {
      const mText = col.label === undefined ? undefined : rc.mText(
        col.label,
        s.text.colHeaders,
        s.maxHeightForVerticalColHeaders,
        {
          rotation: "anticlockwise",
        },
      );
      colHeaderInfos.push({
        mText,
        index: col.index,
      });
    }
  }
  return colHeaderInfos;
}
