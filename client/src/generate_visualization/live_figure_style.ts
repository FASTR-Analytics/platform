import {
  type ChartSeriesInfoFunc,
  type CustomFigureStyleOptions,
  type GenericLineStyleOptions,
  toAbbrev0,
} from "panther";

// A live figure is one read on screen at one design unit per CSS pixel: the
// Explore views and the HMIS dataset display. Over the figure's own style it
// sets hairline strokes for axes, grid and lines, base-200 grid lines, 12pt
// text (16 CSS pixels) and abbreviated tick labels (12k, 1.5m) on a numeric
// value axis; a percent or rate axis keeps its own formatter.
export function liveFigureStyle(
  style: CustomFigureStyleOptions = {},
): CustomFigureStyleOptions {
  const tickLabelFormatter = style.yScaleAxis?.tickLabelFormatter;
  return {
    ...style,
    text: { ...style.text, base: { ...style.text?.base, fontSize: 16 } },
    grid: {
      ...style.grid,
      axisStrokeWidth: 1,
      gridStrokeWidth: 1,
      gridColor: { key: "base200" },
    },
    yScaleAxis: {
      ...style.yScaleAxis,
      tickLabelFormatter:
        tickLabelFormatter === undefined || tickLabelFormatter === "auto-number"
          ? toAbbrev0
          : tickLabelFormatter,
    },
    content: {
      ...style.content,
      lines: {
        ...style.content?.lines,
        func: hairline(style.content?.lines?.func),
      },
    },
  };
}

type LineFunc =
  | GenericLineStyleOptions
  | ChartSeriesInfoFunc<GenericLineStyleOptions>
  | "none";

function hairline(func: LineFunc | undefined): LineFunc {
  if (func === "none") return func;
  if (typeof func === "function") {
    return (info) => ({ ...func(info), strokeWidth: 1 });
  }
  return { ...func, strokeWidth: 1 };
}
