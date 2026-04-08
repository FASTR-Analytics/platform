import {
  ChartSeriesInfo,
  Color,
  ColorKeyOrString,
  FontInfo,
  MapRegionInfo,
  TableCellInfo,
  getAdjustedColor,
  getFormatterFunc,
} from "panther";
import {
  _CF_COMPARISON,
  _CF_GREEN,
  _CF_RED,
  _RANDOM_BLUE,
  getAbcQualScale,
  getAbcQualScale2,
} from "lib";
import { PresentationObjectConfig } from "lib";
import { getColorFuncGivenConditionalFormatting } from "../conditional_formatting";

const _Inter_800: FontInfo = {
  fontFamily: "Inter",
  weight: 800,
  italic: false,
};

export function getTextStyle(config: PresentationObjectConfig) {
  return {
    base: { fontSize: 14 },
    caption: {
      relFontSize: config.t.captionRelFontSize ?? 2,
      font: _Inter_800,
    },
    subCaption: {
      relFontSize: config.t.subCaptionRelFontSize ?? 1.3,
      color: getAdjustedColor({ key: "baseContent" }, { brighten: 0.5 }),
    },
    footnote: {
      relFontSize: config.t.footnoteRelFontSize ?? 0.9,
      color: getAdjustedColor({ key: "baseContent" }, { brighten: 0.5 }),
    },
    legend: { relFontSize: 0.8 },
    cells: {},
    rowGroupHeaders: { relFontSize: 1.1, font: _Inter_800 },
    colGroupHeaders: { relFontSize: 1.1, font: _Inter_800 },
    paneHeaders: { relFontSize: 1.1, font: _Inter_800 },
    tierHeaders: { relFontSize: 1.1, font: _Inter_800 },
    laneHeaders: { relFontSize: 1.1, font: _Inter_800 },
  };
}

export function getTableLayoutStyle(config: PresentationObjectConfig) {
  return {
    gridLineColor:
      config.s.conditionalFormatting === "none"
        ? undefined
        : { key: "base100" as const },
    rowHeaderPadding:
      config.s.conditionalFormatting === "none"
        ? undefined
        : ([5, 10, 5, 0] as [number, number, number, number]),
    borderWidth: config.s.conditionalFormatting === "none" ? undefined : 0,
    verticalColHeaders: config.s.allowVerticalColHeaders
      ? ("auto" as const)
      : ("never" as const),
  };
}

export function getTableCellsContent(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
) {
  const colorFuncGivenCF = getColorFuncGivenConditionalFormatting(config);
  return {
    func: colorFuncGivenCF
      ? (info: TableCellInfo) => ({
          backgroundColor: colorFuncGivenCF(info.valueAsNumber),
        })
      : undefined,
    textFormatter: (info: TableCellInfo) =>
      getFormatterFunc(formatAs, config.s.decimalPlaces ?? 0)(info.value),
  };
}

export function getMapRegionsContent(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
) {
  if (config.d.type !== "map") return undefined;
  return {
    func: {
      show: true,
      fillColor: 777 as const,
      strokeColor: "#666",
      strokeWidth: 0.5,
      dataLabel: {
        show: config.s.showDataLabels,
        backgroundColor: { key: "base100" as const },
        rectRadius: 5,
        padding: 4,
      },
    },
    textFormatter: (info: MapRegionInfo) => {
      if (info.value === undefined) return "";
      return getFormatterFunc(
        formatAs,
        config.s.decimalPlaces ?? 0,
      )(info.value);
    },
  };
}

export function getStandardSeriesColorFunc(
  config: PresentationObjectConfig,
): (info: ChartSeriesInfo) => ColorKeyOrString {
  if (config.s.colorScale === "single-grey") {
    return () => _CF_COMPARISON;
  }
  if (config.s.colorScale === "pastel-discrete") {
    return (info: ChartSeriesInfo) =>
      getAbcQualScale(getIndex(info, config.s.seriesColorFuncPropToUse));
  }
  if (config.s.colorScale === "alt-discrete") {
    return (info: ChartSeriesInfo) =>
      getAbcQualScale2(getIndex(info, config.s.seriesColorFuncPropToUse));
  }
  if (config.s.colorScale === "blue-green") {
    return (info: ChartSeriesInfo) =>
      Color.scale(
        _RANDOM_BLUE,
        _CF_GREEN,
        getN(info, config.s.seriesColorFuncPropToUse),
      )[getIndex(info, config.s.seriesColorFuncPropToUse)];
  }
  if (config.s.colorScale === "red-green") {
    return (info: ChartSeriesInfo) =>
      Color.scale(
        _CF_RED,
        _CF_GREEN,
        getN(info, config.s.seriesColorFuncPropToUse),
      )[getIndex(info, config.s.seriesColorFuncPropToUse)];
  }
  const customSeriesStyles = structuredClone(config.s.customSeriesStyles);
  return (info: ChartSeriesInfo) => {
    const nStyles = customSeriesStyles.length;
    const _i = getIndex(info, config.s.seriesColorFuncPropToUse) % nStyles;
    const styles = customSeriesStyles.at(_i) ?? {
      color: "#000000",
      strokeWidth: 5,
      lineStyle: "solid",
    };
    return styles.color;
  };
}

function getIndex(
  info: ChartSeriesInfo,
  seriesColorFuncPropToUse: "series" | "cell" | "row" | "col" | undefined,
): number {
  if (seriesColorFuncPropToUse === undefined) {
    return info.i_series;
  }
  const indexProp: keyof ChartSeriesInfo =
    seriesColorFuncPropToUse === "series"
      ? "i_series"
      : seriesColorFuncPropToUse === "cell"
        ? "i_pane"
        : seriesColorFuncPropToUse === "col"
          ? "i_lane"
          : "i_tier";
  return info[indexProp] ?? info.i_series;
}

function getN(
  info: ChartSeriesInfo,
  seriesColorFuncPropToUse: "series" | "cell" | "row" | "col" | undefined,
): number {
  if (seriesColorFuncPropToUse === undefined) {
    return info.nSerieses;
  }
  const nProp: keyof ChartSeriesInfo =
    seriesColorFuncPropToUse === "series"
      ? "nSerieses"
      : seriesColorFuncPropToUse === "cell"
        ? "nPanes"
        : seriesColorFuncPropToUse === "col"
          ? "nLanes"
          : "nTiers";
  return info[nProp] ?? info.nSerieses;
}

export const MAP_COLOR_PRESETS: Record<string, [string, string]> = {
  "red-green": ["#de2d26", "#31a354"],
  red: ["#fee0d2", "#de2d26"],
  blue: ["#deebf7", "#3182bd"],
  green: ["#e5f5e0", "#31a354"],
};

export function getMapValuesColorFunc(
  config: PresentationObjectConfig,
): (value: number | undefined, min: number, max: number) => ColorKeyOrString {
  const preset = config.s.mapColorPreset ?? "red-green";
  const [rawFrom, rawTo] =
    preset === "custom"
      ? [config.s.mapColorFrom ?? "#fee0d2", config.s.mapColorTo ?? "#de2d26"]
      : (MAP_COLOR_PRESETS[preset] ?? MAP_COLOR_PRESETS["red-green"]);
  const [fromColor, toColor] = config.s.mapColorReverse
    ? [rawTo, rawFrom]
    : [rawFrom, rawTo];

  const fixedMin =
    config.s.mapDomainType === "fixed" ? config.s.mapDomainMin : undefined;
  const fixedMax =
    config.s.mapDomainType === "fixed" ? config.s.mapDomainMax : undefined;

  if (config.s.mapScaleType === "discrete") {
    const nSteps = config.s.mapDiscreteSteps ?? 5;
    return (value, min, max) => {
      if (value === undefined) return "#f0f0f0";
      const lo = fixedMin ?? min;
      const hi = fixedMax ?? max;
      if (hi === lo) return fromColor;
      const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
      const stepIndex = Math.min(nSteps - 1, Math.floor(t * nSteps));
      const stepT = nSteps === 1 ? 0.5 : stepIndex / (nSteps - 1);
      return Color.scaledPct(fromColor, toColor, stepT);
    };
  }

  return (value, min, max) => {
    if (value === undefined) return "#f0f0f0";
    const lo = fixedMin ?? min;
    const hi = fixedMax ?? max;
    const t =
      hi === lo ? 0 : Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return Color.scaledPct(fromColor, toColor, t);
  };
}
