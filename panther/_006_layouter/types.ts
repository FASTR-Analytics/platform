// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  PaddingOptions,
  RectCoordsDims,
} from "./deps.ts";

export type LayoutWarning = {
  type:
    | "INVALID_SPAN"
    | "SPAN_OVERFLOW"
    | "SPAN_MISMATCH"
    | "NO_SPACE_FOR_FLEX"
    | "HEIGHT_OVERFLOW";
  message: string;
  path?: string; // Path to the element (e.g., "rows[0].cols[2]")
};

export type MeasureLayoutResult<U> = {
  layout: ItemOrContainerWithLayout<U>;
  warnings: LayoutWarning[];
};

// interface NewRenderableItem<T> {
//   render: (ctx: T, coords: Coordinates) => void;
// }
// interface NewMeasureableItem<T> {
//   measure: (
//     ctx: T,
//     width: number,
//     height: number | undefined
//   ) => NewRenderableItem<T>;
// }

export type MeasurableItem<U> = U & {
  height?: number;
  stretch?: boolean;
  fillArea?: boolean;
};

export type ContainerLayoutStyleOptions = LayoutStyleOptions & {
  verticalAlignContents?: "top" | "middle" | "bottom";
};

// For layout

export type ItemOrContainerForLayout<U> =
  | MeasurableItem<U>
  | ColContainerForLayout<U>
  | RowContainerForLayout<U>;

export type ColContainerForLayout<U> = {
  cols: (ItemOrContainerForLayout<U> & {
    span?: number;
  })[];
  height?: number;
  stretch?: boolean;
  fillArea?: boolean;
  s?: ContainerLayoutStyleOptions;
};

export type RowContainerForLayout<U> = {
  rows: ItemOrContainerForLayout<U>[];
  height?: number;
  stretch?: boolean;
  fillArea?: boolean;
  s?: ContainerLayoutStyleOptions;
};

// With layout

export type ItemOrContainerWithLayout<U> =
  | {
    item: MeasurableItem<U>;
    rpd: RectCoordsDims;
  }
  | RowContainerWithLayout<U>
  | ColContainerWithLayout<U>;

export type ColContainerWithLayout<U> = {
  cols: ItemOrContainerWithLayout<U>[];
  rpd: RectCoordsDims;
  s?: ContainerLayoutStyleOptions;
};

export type RowContainerWithLayout<U> = {
  rows: ItemOrContainerWithLayout<U>[];
  rpd: RectCoordsDims;
  s?: ContainerLayoutStyleOptions;
};

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

export function isColContainerForLayout<U>(
  item: ItemOrContainerForLayout<U>,
): item is ColContainerForLayout<U> {
  return (item as ColContainerForLayout<U>).cols !== undefined;
}

export function isRowContainerForLayout<U>(
  item: ItemOrContainerForLayout<U>,
): item is RowContainerForLayout<U> {
  return (item as RowContainerForLayout<U>).rows !== undefined;
}

export function isMeasurableItem<U>(
  item: ItemOrContainerForLayout<U>,
): item is MeasurableItem<U> {
  return (
    (item as RowContainerForLayout<U>).rows === undefined &&
    (item as ColContainerForLayout<U>).cols === undefined
  );
}

export function isColContainerWithLayout<U>(
  item: ItemOrContainerWithLayout<U>,
): item is ColContainerWithLayout<U> {
  return (item as ColContainerWithLayout<U>).cols !== undefined;
}

export function isRowContainerWithLayout<U>(
  item: ItemOrContainerWithLayout<U>,
): item is RowContainerWithLayout<U> {
  return (item as RowContainerWithLayout<U>).rows !== undefined;
}

export function isContainerInMeasurerFunc<U>(
  item:
    | MeasurableItem<U>
    | ColContainerWithLayout<U>
    | RowContainerWithLayout<U>,
): item is ColContainerWithLayout<U> | RowContainerWithLayout<U> {
  return (
    (item as ColContainerWithLayout<U>).cols !== undefined ||
    (item as RowContainerWithLayout<U>).rows !== undefined
  );
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

export type ItemIdealHeightInfo = {
  idealH: number;
  couldStretch: boolean;
  fillToAreaHeight?: boolean;
};

export type ItemHeightMeasurer<T, U> = (
  renderingContext: T,
  item: U & MeasurableItem<U>,
  width: number,
) => Promise<ItemIdealHeightInfo>;

export type ItemRenderer<T, U> = (
  renderingContext: T,
  item:
    | (U & MeasurableItem<U>)
    | ColContainerWithLayout<U>
    | RowContainerWithLayout<U>,
  rpd: RectCoordsDims,
) => Promise<void>;

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

export type LayoutStyleOptions = {
  padding?: PaddingOptions;
  backgroundColor?: ColorKeyOrString;
  backgroundImg?: BackgroundImgStyleOptions;
  rectRadius?: number;
};

export type BackgroundImgStyleOptions = {
  imgAbsoluteFilePath: string;
  position?: "center" | "top" | "bottom" | "left" | "right";
  tint?: ColorKeyOrString;
  greyscale?: boolean;
};
