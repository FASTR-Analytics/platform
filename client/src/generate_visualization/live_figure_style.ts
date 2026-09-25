import {
  type ChartSeriesInfoFunc,
  type CustomFigureStyleOptions,
  type GenericLineStyleOptions,
} from "panther";

type FigureTextStyleOptions = NonNullable<CustomFigureStyleOptions["text"]>;
type ChartLabelKey = Exclude<keyof FigureTextStyleOptions, "base">;

// The data grid's cell text (`ui-text-small`, 0.75rem) in CSS pixels, which
// is design units on a live figure.
const LIVE_TEXT_SIZE = 12;

// Every chart label reads at the base size: the global style's header and
// legend ratios are for products.
const CHART_LABEL_KEYS: readonly ChartLabelKey[] = [
  "xTextAxisTickLabels",
  "xPeriodAxisTickLabels",
  "xScaleAxisTickLabels",
  "xScaleAxisLabel",
  "yTextAxisTickLabels",
  "yScaleAxisTickLabels",
  "yScaleAxisLabel",
  "dataLabels",
  "legend",
  "laneHeaders",
  "tierHeaders",
  "paneHeaders",
];

// A live figure is one read on screen at one design unit per CSS pixel: the
// Explore views and the HMIS dataset display. Over the figure's own style it
// sets hairline strokes for axes, grid and lines, base-300 grid lines, and
// every chart label at the data grid's text size.
export function liveFigureStyle(
  style: CustomFigureStyleOptions = {},
): CustomFigureStyleOptions {
  return {
    ...style,
    text: liveText(style.text),
    grid: {
      ...style.grid,
      axisStrokeWidth: 1,
      gridStrokeWidth: 1,
      gridColor: { key: "base300" },
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

function liveText(
  text: FigureTextStyleOptions | undefined,
): FigureTextStyleOptions {
  const out: FigureTextStyleOptions = {
    ...text,
    base: { ...text?.base, fontSize: LIVE_TEXT_SIZE },
  };
  for (const key of CHART_LABEL_KEYS) {
    out[key] = { ...text?.[key], relFontSize: 1 };
  }
  return out;
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
