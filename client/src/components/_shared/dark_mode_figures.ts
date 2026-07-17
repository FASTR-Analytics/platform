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
// Map data labels sit on chips whose background stays the static light
// base100, so their text must stay the light-theme content color.
const LIGHT_CHIP_TEXT = "#2a2a2a";

export function adaptFigureStyleForDarkMode(
  inputs: FigureInputs,
): FigureInputs {
  if (!darkMode()) return inputs;
  const style: CustomFigureStyleOptions = inputs.style ?? {};
  const isMap = "mapData" in inputs;
  return {
    ...inputs,
    style: {
      ...style,
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
      grid: {
        ...style.grid,
        axisColor: style.grid?.axisColor ?? DARK_LINES,
        gridColor: style.grid?.gridColor ?? DARK_LINES,
      },
      // Respect explicit table line colors (conditional-formatting tables set
      // base100 gridlines between colored cells, which still read on dark).
      table: {
        ...style.table,
        headerBorderColor: style.table?.headerBorderColor ?? DARK_LINES,
        gridLineColor: style.table?.gridLineColor ?? DARK_LINES,
        borderColor: style.table?.borderColor ?? DARK_LINES,
      },
    },
  } as FigureInputs;
}
