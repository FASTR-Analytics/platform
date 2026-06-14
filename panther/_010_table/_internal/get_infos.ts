// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getAdjustedColor } from "../deps.ts";
import type {
  MergedTableStyle,
  RenderContext,
  TableHeaderInfo,
} from "../deps.ts";
import type {
  ColGroupHeaderInfo,
  ColHeaderInfo,
  RowHeaderInfo,
  TableDataTransformed,
} from "../types.ts";

const DEFAULT_NONE_STYLE = {
  backgroundColor: "none" as const,
  textColorStrategy: "none" as const,
};

export function getRowHeaderInfos(
  rc: RenderContext,
  d: TableDataTransformed,
  s: MergedTableStyle,
  maxPossibleWidth: number,
): RowHeaderInfo[] {
  const rowHeaderInfos: RowHeaderInfo[] = [];
  const nRows = d.rowGroups.reduce((sum, rg) => sum + rg.rows.length, 0);

  d.rowGroups.forEach((rowGroup) => {
    if (rowGroup.label) {
      const info: TableHeaderInfo = {
        id: rowGroup.id,
        label: rowGroup.label,
        index: undefined,
        n: nRows,
        isGroupHeader: true,
      };
      const headerStyle = s.tableRowHeaders.getStyle(info);
      let textStyle = s.text.rowGroupHeaders;
      if (
        headerStyle.textColorStrategy !== "none" &&
        headerStyle.backgroundColor !== "none"
      ) {
        textStyle = {
          ...textStyle,
          color: getAdjustedColor(
            headerStyle.backgroundColor,
            headerStyle.textColorStrategy,
          ),
        };
      }
      const mText = rc.mText(rowGroup.label, textStyle, maxPossibleWidth);
      rowHeaderInfos.push({
        mText,
        id: rowGroup.id,
        label: rowGroup.label,
        index: "group-header",
        headerStyle,
      });
    }
    rowGroup.rows.forEach((row) => {
      if (row.label === undefined) {
        rowHeaderInfos.push({
          mText: undefined,
          id: row.id,
          label: row.label,
          index: row.index,
          headerStyle: DEFAULT_NONE_STYLE,
        });
        return;
      }
      const info: TableHeaderInfo = {
        id: row.id,
        label: row.label,
        index: row.index,
        n: nRows,
        isGroupHeader: false,
      };
      const headerStyle = s.tableRowHeaders.getStyle(info);
      let textStyle = s.text.rowHeaders;
      if (
        headerStyle.textColorStrategy !== "none" &&
        headerStyle.backgroundColor !== "none"
      ) {
        textStyle = {
          ...textStyle,
          color: getAdjustedColor(
            headerStyle.backgroundColor,
            headerStyle.textColorStrategy,
          ),
        };
      }
      const mText = rc.mText(row.label, textStyle, maxPossibleWidth);
      rowHeaderInfos.push({
        mText,
        id: row.id,
        label: row.label,
        index: row.index,
        headerStyle,
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
  const nCols = d.colGroups.reduce((sum, cg) => sum + cg.cols.length, 0);
  return d.colGroups.map<ColGroupHeaderInfo>((colGroup) => {
    const nColsInGroup = colGroup.cols.length;
    const colGroupInnerWidth = nColsInGroup * colInnerWidth +
      (nColsInGroup - 1) * s.gridLineWidth;
    const colGroupContentWidth = colGroupInnerWidth - s.colHeaderPadding.pl() -
      s.colHeaderPadding.pr();

    if (colGroup.label === undefined) {
      return {
        mText: undefined,
        colGroupInnerWidth,
        headerStyle: DEFAULT_NONE_STYLE,
      };
    }

    const info: TableHeaderInfo = {
      id: colGroup.id,
      label: colGroup.label,
      index: undefined,
      n: nCols,
      isGroupHeader: true,
    };
    const headerStyle = s.tableColHeaders.getStyle(info);
    let textStyle = s.text.colHeaders;
    if (
      headerStyle.textColorStrategy !== "none" &&
      headerStyle.backgroundColor !== "none"
    ) {
      textStyle = {
        ...textStyle,
        color: getAdjustedColor(
          headerStyle.backgroundColor,
          headerStyle.textColorStrategy,
        ),
      };
    }
    const mText = rc.mText(colGroup.label, textStyle, colGroupContentWidth);
    return { mText, colGroupInnerWidth, headerStyle };
  });
}

export function getColHeaderInfos(
  rc: RenderContext,
  d: TableDataTransformed,
  s: MergedTableStyle,
  colInnerWidth: number,
): ColHeaderInfo[] {
  const nCols = d.colGroups.reduce((sum, cg) => sum + cg.cols.length, 0);

  function buildColHeaderInfo(
    id: string | undefined,
    label: string | undefined,
    index: number | undefined,
    maxWidth: number,
    rotationOpts?: { rotation: "anticlockwise" },
  ): ColHeaderInfo {
    if (label === undefined) {
      return { mText: undefined, index, headerStyle: DEFAULT_NONE_STYLE };
    }
    const info: TableHeaderInfo = {
      id,
      label,
      index,
      n: nCols,
      isGroupHeader: false,
    };
    const headerStyle = s.tableColHeaders.getStyle(info);
    let textStyle = s.text.colHeaders;
    if (
      headerStyle.textColorStrategy !== "none" &&
      headerStyle.backgroundColor !== "none"
    ) {
      textStyle = {
        ...textStyle,
        color: getAdjustedColor(
          headerStyle.backgroundColor,
          headerStyle.textColorStrategy,
        ),
      };
    }
    const mText = rc.mText(label, textStyle, maxWidth, rotationOpts);
    return { mText, index, headerStyle };
  }

  if (s.verticalColHeaders === "never") {
    const colHeaderContentWidth = colInnerWidth - s.colHeaderPadding.pl() -
      s.colHeaderPadding.pr();
    const colHeaderInfos: ColHeaderInfo[] = [];
    for (const colGroup of d.colGroups) {
      for (const col of colGroup.cols) {
        colHeaderInfos.push(
          buildColHeaderInfo(
            col.id,
            col.label,
            col.index,
            colHeaderContentWidth,
          ),
        );
      }
    }
    return colHeaderInfos;
  }

  if (s.verticalColHeaders === "auto") {
    let hasOverflow = false;
    const colHeaderInfos: ColHeaderInfo[] = [];
    const colHeaderContentWidth = colInnerWidth - s.colHeaderPadding.pl() -
      s.colHeaderPadding.pr();
    for (const colGroup of d.colGroups) {
      for (const col of colGroup.cols) {
        const chi = buildColHeaderInfo(
          col.id,
          col.label,
          col.index,
          colHeaderContentWidth,
        );
        if (chi.mText && chi.mText.dims.w() > colHeaderContentWidth) {
          hasOverflow = true;
          break;
        }
        colHeaderInfos.push(chi);
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
    s.maxHeightForVerticalColHeaders * 0.33,
    s.maxHeightForVerticalColHeaders * 0.5,
    s.maxHeightForVerticalColHeaders * 0.67,
    s.maxHeightForVerticalColHeaders * 0.85,
  ];

  for (const maxHeight of maxHeightOptions) {
    let hasOverflow = false;
    const colHeaderInfos: ColHeaderInfo[] = [];
    for (const colGroup of d.colGroups) {
      for (const col of colGroup.cols) {
        const chi = buildColHeaderInfo(
          col.id,
          col.label,
          col.index,
          maxHeight,
          {
            rotation: "anticlockwise",
          },
        );
        if (chi.mText && chi.mText.dims.w() > colInnerWidth) {
          hasOverflow = true;
          break;
        }
        colHeaderInfos.push(chi);
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
      colHeaderInfos.push(
        buildColHeaderInfo(
          col.id,
          col.label,
          col.index,
          s.maxHeightForVerticalColHeaders,
          { rotation: "anticlockwise" },
        ),
      );
    }
  }
  return colHeaderInfos;
}
