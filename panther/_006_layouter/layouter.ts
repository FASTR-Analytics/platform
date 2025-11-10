// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  anyTrue,
  asyncForEach,
  asyncMap,
  Padding,
  RectCoordsDims,
  sum,
} from "./deps.ts";
import { getColWidths } from "./get_col_widths.ts";
import { LayoutError } from "./layout_error.ts";
import {
  isColContainerForLayout,
  isMeasurableItem,
  isRowContainerForLayout,
  type ItemHeightMeasurer,
  type ItemIdealHeightInfo,
  type ItemOrContainerForLayout,
  type ItemOrContainerWithLayout,
  type LayoutWarning,
  type MeasureLayoutResult,
} from "./types.ts";

const _DEFAULT_N_COL_SPAN = 12;

// Collect all warnings during layout measurement
let _layoutWarnings: LayoutWarning[] = [];

// New version that returns warnings
export async function measureLayoutWithWarnings<T, U>(
  renderingContext: T,
  root: ItemOrContainerForLayout<U>,
  rpd: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemHeightMeasurer: ItemHeightMeasurer<T, U>,
): Promise<MeasureLayoutResult<U>> {
  // Reset warnings for this measurement
  _layoutWarnings = [];

  // Temporarily override console.warn to capture warnings
  const originalWarn = console.warn;
  console.warn = (message: string, warnings?: LayoutWarning[]) => {
    if (
      typeof message === "string" &&
      (message.includes("Column width warnings:") ||
        message.includes("Layout height warning:")) &&
      Array.isArray(warnings)
    ) {
      _layoutWarnings.push(...warnings);
    } else {
      originalWarn(message, warnings);
    }
  };

  try {
    const layout = await measureLayout(
      renderingContext,
      root,
      rpd,
      gapX,
      gapY,
      itemHeightMeasurer,
    );

    return { layout, warnings: _layoutWarnings };
  } finally {
    // Restore original console.warn
    console.warn = originalWarn;
  }
}

export async function measureLayout<T, U>(
  renderingContext: T,
  root: ItemOrContainerForLayout<U>,
  rpd: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemHeightMeasurer: ItemHeightMeasurer<T, U>,
): Promise<ItemOrContainerWithLayout<U>> {
  if (isRowContainerForLayout(root)) {
    const pad = new Padding(root.s?.padding ?? 0);
    const innerRpd = rpd.getPadded(pad);
    const rows = await getRowsWithLayout(
      renderingContext,
      root.rows,
      innerRpd,
      gapX,
      gapY,
      itemHeightMeasurer,
    );
    const rowsH = root.height ??
      sum(rows.map((inf) => inf.rpd.h())) +
        (rows.length - 1) * gapY +
        pad.totalPy();
    // Note: We don't need to check overflow here since getRowsWithLayout already handles it
    return {
      rows,
      rpd: root.stretch ? rpd : rpd.getAdjusted({ h: rowsH }),
      s: root.s,
    };
  }
  if (isColContainerForLayout(root)) {
    const pad = new Padding(root.s?.padding ?? 0);
    const innerRpd = rpd.getPadded(pad);
    const cols = await getColsWithLayout(
      renderingContext,
      root.cols,
      innerRpd,
      gapX,
      gapY,
      itemHeightMeasurer,
    );
    const colsH = root.height ??
      Math.max(...cols.map((inf) => inf.rpd.h())) + pad.totalPy();
    // Note: Column items already handle their own height overflow
    return {
      cols,
      rpd: root.stretch ? rpd : rpd.getAdjusted({ h: colsH }),
      s: root.s,
    };
  }
  if (isMeasurableItem(root)) {
    const itemInfo = await itemHeightMeasurer(renderingContext, root, rpd.w());
    const itemRpd = rpd.getAdjusted({
      h: itemInfo.couldStretch ? rpd.h() : itemInfo.idealH,
    });
    if (itemRpd.h() > rpd.h()) {
      throw new LayoutError({
        type: "HEIGHT_OVERFLOW",
        message: "Item height exceeds available space",
        availableSpace: { width: rpd.w(), height: rpd.h() },
        requiredSpace: { width: rpd.w(), height: itemRpd.h() },
      });
    }
    return {
      item: root,
      rpd: itemRpd,
    };
  }
  throw new LayoutError({
    type: "MEASUREMENT_FAILED",
    message:
      "Unknown item type - not a row container, column container, or measurable item",
  });
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

async function getRowsWithLayout<T, U>(
  renderingContext: T,
  rows: ItemOrContainerForLayout<U>[],
  rpd: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemHeightMeasurer: ItemHeightMeasurer<T, U>,
): Promise<ItemOrContainerWithLayout<U>[]> {
  const rowInfos = await getProposedHeightsOfRows(
    renderingContext,
    rows,
    rpd.w(),
    gapX,
    gapY,
    itemHeightMeasurer,
  );
  const totalProposedRowHeights = sum(rowInfos.map((inf) => inf.idealH));
  const totalGapH = (rows.length - 1) * gapY;
  const totalRequiredHeight = totalProposedRowHeights + totalGapH;
  const remainingHeight = rpd.h() - totalRequiredHeight;

  let scaleFactor = 1;
  let extraHeightToAddToCouldStretchRows = 0;

  if (remainingHeight < 0) {
    // Height overflow - scale everything proportionally
    scaleFactor = rpd.h() / totalRequiredHeight;

    console.warn("Layout height warning:", [{
      type: "HEIGHT_OVERFLOW" as const,
      message:
        `Total row heights (${totalRequiredHeight}px) exceed container height (${rpd.h()}px), scaling to ${
          (scaleFactor * 100).toFixed(1)
        }%`,
      path: "rows",
    }]);
  } else {
    // Normal case - distribute extra space to stretchable rows
    const nCouldStretchRows = rowInfos.filter((inf) => inf.couldStretch).length;
    extraHeightToAddToCouldStretchRows = nCouldStretchRows > 0
      ? remainingHeight / nCouldStretchRows
      : 0;
  }
  const rowsWithLayout: ItemOrContainerWithLayout<U>[] = [];
  let currentY = rpd.y();
  await asyncForEach(rows, async (itemOrContainer, i_itemOrContainer) => {
    const rowInfo = rowInfos[i_itemOrContainer];
    let rowH: number;

    if (scaleFactor < 1) {
      // Apply proportional scaling for overflow
      rowH = rowInfo.idealH * scaleFactor;
    } else {
      // Normal case - add extra height for stretchable rows
      rowH = rowInfo.idealH +
        (rowInfo.couldStretch ? extraHeightToAddToCouldStretchRows : 0);
    }
    const rowRpd = new RectCoordsDims({
      x: rpd.x(),
      y: currentY,
      w: rpd.w(),
      h: rowH,
    });
    if (isColContainerForLayout(itemOrContainer)) {
      const pad = new Padding(itemOrContainer.s?.padding ?? 0);
      const innerRowRpd = rowRpd.getPadded(pad);
      const cols = await getColsWithLayout(
        renderingContext,
        itemOrContainer.cols,
        innerRowRpd,
        gapX,
        gapY,
        itemHeightMeasurer,
      );
      const colsH = itemOrContainer.height ??
        Math.max(...cols.map((inf) => inf.rpd.h())) + pad.totalPy();
      // Note: Column items already handle their own height overflow
      rowsWithLayout.push({
        cols,
        rpd: itemOrContainer.stretch
          ? rowRpd
          : rowRpd.getAdjusted({ h: colsH }),
        s: itemOrContainer.s,
      });
    } else if (isRowContainerForLayout(itemOrContainer)) {
      const pad = new Padding(itemOrContainer.s?.padding ?? 0);
      const innerRowRpd = rowRpd.getPadded(pad);
      const rows = await getRowsWithLayout(
        renderingContext,
        itemOrContainer.rows,
        innerRowRpd,
        gapX,
        gapY,
        itemHeightMeasurer,
      );
      const rowsH = itemOrContainer.height ??
        sum(rows.map((inf) => inf.rpd.h())) +
          (rows.length - 1) * gapY +
          pad.totalPy();
      // Note: Nested rows already handle their own height overflow via scaling
      rowsWithLayout.push({
        rows,
        rpd: itemOrContainer.stretch
          ? rowRpd
          : rowRpd.getAdjusted({ h: rowsH }),
        s: itemOrContainer.s,
      });
    } else {
      rowsWithLayout.push({
        item: itemOrContainer,
        rpd: rowRpd,
      });
    }
    currentY += rowH + (scaleFactor < 1 ? gapY * scaleFactor : gapY);
  });
  return rowsWithLayout;
}

async function getColsWithLayout<T, U>(
  renderingContext: T,
  cols: (ItemOrContainerForLayout<U> & {
    span?: number;
  })[],
  rpd: RectCoordsDims,
  gapX: number,
  gapY: number,
  itemHeightMeasurer: ItemHeightMeasurer<T, U>,
): Promise<ItemOrContainerWithLayout<U>[]> {
  const colsWithLayout: ItemOrContainerWithLayout<U>[] = [];
  let currentX = rpd.x();
  const colWidthResult = getColWidths(cols, rpd.w(), _DEFAULT_N_COL_SPAN, gapX);
  const colWidths = colWidthResult.widths;

  // Log warnings if any
  if (colWidthResult.warnings.length > 0) {
    console.warn("Column width warnings:", colWidthResult.warnings);
  }

  await asyncForEach(cols, async (itemOrContainer, i_itemOrContainer) => {
    const colWidthInfo = colWidths[i_itemOrContainer];
    if (isRowContainerForLayout(itemOrContainer)) {
      const colRpd = new RectCoordsDims({
        x: currentX,
        y: rpd.y(),
        w: colWidthInfo.w,
        h: rpd.h(),
      });
      const pad = new Padding(itemOrContainer.s?.padding ?? 0);
      const innerColRpd = colRpd.getPadded(pad);
      const rows = await getRowsWithLayout(
        renderingContext,
        itemOrContainer.rows,
        innerColRpd,
        gapX,
        gapY,
        itemHeightMeasurer,
      );
      const rowsH = itemOrContainer.height ??
        sum(rows.map((inf) => inf.rpd.h())) +
          (rows.length - 1) * gapY +
          pad.totalPy();
      // Note: Nested rows already handle their own height overflow via scaling
      colsWithLayout.push({
        rows,
        rpd: itemOrContainer.stretch
          ? colRpd
          : colRpd.getAdjusted({ h: rowsH }),
        s: itemOrContainer.s,
      });
    } else if (isColContainerForLayout(itemOrContainer)) {
      const colRpd = new RectCoordsDims({
        x: currentX,
        y: rpd.y(),
        w: colWidthInfo.w,
        h: rpd.h(),
      });
      const pad = new Padding(itemOrContainer.s?.padding ?? 0);
      const innerColRpd = colRpd.getPadded(pad);
      const cols = await getColsWithLayout(
        renderingContext,
        itemOrContainer.cols,
        innerColRpd,
        gapX,
        gapY,
        itemHeightMeasurer,
      );
      const colsH = itemOrContainer.height ??
        Math.max(...cols.map((inf) => inf.rpd.h())) + pad.totalPy();
      // Note: Nested columns already handle their own height overflow
      colsWithLayout.push({
        cols,
        rpd: itemOrContainer.stretch
          ? colRpd
          : colRpd.getAdjusted({ h: colsH }),
        s: itemOrContainer.s,
      });
    } else {
      const colInfo = await itemHeightMeasurer(
        renderingContext,
        itemOrContainer,
        colWidthInfo.w,
      );
      let itemHeight = colInfo.couldStretch || colInfo.fillToAreaHeight
        ? rpd.h()
        : colInfo.idealH;

      // Handle height overflow gracefully
      if (
        itemHeight > rpd.h() &&
        !(colInfo.couldStretch || colInfo.fillToAreaHeight)
      ) {
        const scaleFactor = rpd.h() / itemHeight;
        itemHeight = rpd.h();

        console.warn("Layout height warning:", [{
          type: "HEIGHT_OVERFLOW" as const,
          message:
            `Column item height (${colInfo.idealH}px) exceeds available space (${rpd.h()}px), scaling to ${
              (scaleFactor * 100).toFixed(1)
            }%`,
          path: `cols[${i_itemOrContainer}]`,
        }]);
      }

      const colRpd = new RectCoordsDims({
        x: currentX,
        y: rpd.y(),
        w: colWidthInfo.w,
        h: itemHeight,
      });
      colsWithLayout.push({
        item: itemOrContainer,
        rpd: colRpd,
      });
    }
    currentX += colWidthInfo.w + gapX;
  });
  return colsWithLayout;
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

export async function getProposedHeightsOfRows<T, U>(
  renderingContext: T,
  rows: ItemOrContainerForLayout<U>[],
  width: number,
  gapX: number,
  gapY: number,
  itemHeightMeasurer: ItemHeightMeasurer<T, U>,
): Promise<ItemIdealHeightInfo[]> {
  return await asyncMap(rows, async (itemOrContainer) => {
    if (isColContainerForLayout(itemOrContainer)) {
      const containerPad = new Padding(itemOrContainer.s?.padding ?? 0);
      const innerW = width - containerPad.totalPx();
      const infos = await getProposedHeightsOfCols(
        renderingContext,
        itemOrContainer.cols,
        innerW,
        gapX,
        gapY,
        itemHeightMeasurer,
      );
      return {
        idealH: (itemOrContainer.height ??
          Math.max(...infos.map((inf) => inf.idealH))) +
          containerPad.totalPy(),
        couldStretch: !!itemOrContainer.stretch ||
          anyTrue(infos.map((inf) => !!inf.couldStretch)),
      };
    } else if (isRowContainerForLayout(itemOrContainer)) {
      const containerPad = new Padding(itemOrContainer.s?.padding ?? 0);
      const innerW = width - containerPad.totalPx();
      const infos = await getProposedHeightsOfRows(
        renderingContext,
        itemOrContainer.rows,
        innerW,
        gapX,
        gapY,
        itemHeightMeasurer,
      );
      return {
        idealH: (itemOrContainer.height ??
          sum(infos.map((inf) => inf.idealH)) + (infos.length - 1) * gapY) +
          containerPad.totalPy(),
        couldStretch: !!itemOrContainer.stretch ||
          anyTrue(infos.map((inf) => !!inf.couldStretch)),
      };
    } else {
      return await itemHeightMeasurer(renderingContext, itemOrContainer, width);
    }
  });
}

async function getProposedHeightsOfCols<T, U>(
  renderingContext: T,
  cols: (ItemOrContainerForLayout<U> & {
    span?: number;
  })[],
  width: number,
  gapX: number,
  gapY: number,
  itemHeightMeasurer: ItemHeightMeasurer<T, U>,
): Promise<ItemIdealHeightInfo[]> {
  const colWidthResult = getColWidths(cols, width, _DEFAULT_N_COL_SPAN, gapX);
  const colWidths = colWidthResult.widths;

  // Log warnings if any
  if (colWidthResult.warnings.length > 0) {
    console.warn("Column width warnings:", colWidthResult.warnings);
  }

  return await asyncMap(cols, async (itemOrContainer, i_itemOrContainer) => {
    const colWidthInfo = colWidths[i_itemOrContainer];
    if (isRowContainerForLayout(itemOrContainer)) {
      const containerPad = new Padding(itemOrContainer.s?.padding ?? 0);
      const innerW = colWidthInfo.w - containerPad.totalPx();
      const infos = await getProposedHeightsOfRows(
        renderingContext,
        itemOrContainer.rows,
        innerW,
        gapX,
        gapY,
        itemHeightMeasurer,
      );
      return {
        idealH: (itemOrContainer.height ??
          sum(infos.map((inf) => inf.idealH)) + (infos.length - 1) * gapY) +
          containerPad.totalPy(),
        couldStretch: !!itemOrContainer.stretch ||
          anyTrue(infos.map((inf) => !!inf.couldStretch)),
      };
    } else if (isColContainerForLayout(itemOrContainer)) {
      const containerPad = new Padding(itemOrContainer.s?.padding ?? 0);
      const innerW = colWidthInfo.w - containerPad.totalPx();
      const infos = await getProposedHeightsOfCols(
        renderingContext,
        itemOrContainer.cols,
        innerW,
        gapX,
        gapY,
        itemHeightMeasurer,
      );
      return {
        idealH: (itemOrContainer.height ??
          Math.max(...infos.map((inf) => inf.idealH))) +
          containerPad.totalPy(),
        couldStretch: !!itemOrContainer.stretch ||
          anyTrue(infos.map((inf) => !!inf.couldStretch)),
      };
    } else {
      return await itemHeightMeasurer(
        renderingContext,
        itemOrContainer,
        colWidthInfo.w,
      );
    }
  });
}
