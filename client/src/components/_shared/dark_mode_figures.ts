import type { CustomFigureStyleOptions, FigureInputs } from "panther";
import { darkMode } from "~/state/t4_ui";

// Display-time dark-mode overlay for canvas-rendered figures. Panther's key
// colors are set once at boot (light document values) and exports + stored
// FigureInputs snapshots must stay light, so dark mode is applied here
// instead — merged into a figure's style only where it is handed to an
// on-screen ChartHolder. Slide surfaces (deck canvas, thumbnails, PPTX/PDF
// exports) deliberately do not use this.
//
// Reads the darkMode signal, so call sites inside JSX re-run on theme toggle.
// Values mirror the dark tokens in app.css (canvas can't resolve CSS vars).
const DARK_TEXT = "#fafafa";
const DARK_LINES = "#3f3f46";
const DARK_BG = "#18181b";
const DARK_BG_2 = "#27272a";
// Map data labels sit on chips whose background stays the static light
// base100, so their text must stay the light-theme content color.
const LIGHT_CHIP_TEXT = "#2a2a2a";

type SeriesColorFunc = NonNullable<CustomFigureStyleOptions["seriesColorFunc"]>;
type ContentOptions = NonNullable<CustomFigureStyleOptions["content"]>;
type LinesOptions = NonNullable<ContentOptions["lines"]>;

// Several FASTR encodings draw near-black on purpose (the "Actual"/"Expected"
// lines on disruptions and control charts, the coverage chart's default
// series) — invisible on dark bases. Flip near-black plain-string colors to
// the dark-theme text color; {key} colors and chromatic colors pass through.
function isNearBlack(c: unknown): c is string {
  if (typeof c !== "string" || c[0] !== "#") {
    return false;
  }
  const hex = c.length === 4
    ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`
    : c;
  if (hex.length !== 7) {
    return false;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return false;
  }
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.1;
}

function adaptSeriesColorFunc(
  func: SeriesColorFunc | undefined,
): SeriesColorFunc | undefined {
  if (!func) {
    return undefined;
  }
  return (info) => {
    const c = func(info);
    return isNearBlack(c) ? DARK_TEXT : c;
  };
}

function adaptLines(lines: LinesOptions | undefined): LinesOptions | undefined {
  const func = lines?.func;
  if (!func) {
    return lines;
  }
  const remap = <T,>(s: T): T =>
    typeof s === "object" && s !== null &&
      isNearBlack((s as { color?: unknown }).color)
      ? { ...s, color: DARK_TEXT }
      : s;
  return {
    ...lines,
    func: typeof func === "function"
      ? (...args: Parameters<Extract<typeof func, (...a: never[]) => unknown>>) =>
        remap(func(...args))
      : remap(func),
  } as LinesOptions;
}

function adaptLegend(
  legend: FigureInputs["legend"],
): FigureInputs["legend"] {
  if (!Array.isArray(legend)) {
    return legend;
  }
  return legend.map((item) =>
    typeof item === "object" && item !== null && isNearBlack(item.color)
      ? { ...item, color: DARK_TEXT }
      : item
  ) as FigureInputs["legend"];
}

export function adaptFigureStyleForDarkMode(
  inputs: FigureInputs,
): FigureInputs {
  if (!darkMode()) {
    return inputs;
  }
  const style: CustomFigureStyleOptions = inputs.style ?? {};
  const isMap = "mapData" in inputs;
  return {
    ...inputs,
    legend: adaptLegend(inputs.legend),
    style: {
      ...style,
      seriesColorFunc: adaptSeriesColorFunc(style.seriesColorFunc),
      text: {
        ...style.text,
        base: { ...style.text?.base, color: DARK_TEXT },
        ...(isMap
          ? {
            dataLabels: {
              color: LIGHT_CHIP_TEXT,
              ...style.text?.dataLabels,
            },
          }
          : {}),
      },
      // Axis lines match the (light) text color, as they do in light mode;
      // gridlines stay subtle.
      grid: {
        ...style.grid,
        axisColor: style.grid?.axisColor ?? DARK_TEXT,
        gridColor: style.grid?.gridColor ?? DARK_LINES,
      },
      // Header bands default to static light base100/base200 (invisible on a
      // light page, a white box on a dark one) — re-blend them with the dark
      // bases. Explicit app-set colors are respected (conditional-formatting
      // tables set base100 gridlines between colored cells, which still read
      // on dark).
      table: {
        ...style.table,
        colHeaderBackgroundColor: style.table?.colHeaderBackgroundColor ??
          DARK_BG,
        colGroupHeaderBackgroundColor:
          style.table?.colGroupHeaderBackgroundColor ?? DARK_BG_2,
        headerBorderColor: style.table?.headerBorderColor ?? DARK_TEXT,
        gridLineColor: style.table?.gridLineColor ?? DARK_LINES,
        borderColor: style.table?.borderColor ?? DARK_LINES,
      },
      content: style.content?.lines
        ? { ...style.content, lines: adaptLines(style.content.lines) }
        : style.content,
    },
  } as FigureInputs;
}
