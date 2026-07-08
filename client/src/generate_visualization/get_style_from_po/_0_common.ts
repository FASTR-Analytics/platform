import {
  ChartSeriesInfo,
  Color,
  ColorKeyOrString,
  type GlobalStyleOptions,
  type TextInfoOptions,
  type FontInfo,
  MapRegionInfo,
  TableCellInfo,
  getAdjustedColor,
  getFormatterFunc,
  type CustomFigureStyleOptions,
} from "panther";
import {
  _CF_COMPARISON,
  _CF_GREEN,
  _CF_RED,
  _COLOR_WATERMARK_GREY,
  _RANDOM_BLUE,
  getAbcQualScale,
  getAbcQualScale2,
  type DeckStyleContext,
  type IndicatorMetadata,
  getSlideFontInfo,
  isRollupActive,
  ROLLUP_PIN_IDS,
} from "lib";
import { PresentationObjectConfig, selectCf } from "lib";

const _InternationalInter_800: FontInfo = {
  fontFamily: "International Inter",
  weight: 800,
  italic: false,
};

export const BASE_TEXT_OPTIONS: TextInfoOptions = {
  font: { fontFamily: "International Inter", weight: 400, italic: false },
  lineHeight: 1.4,
};

export const GLOBAL_STYLE_OPTIONS: GlobalStyleOptions = {
  figure: {
    text: {
      caption: { font: _InternationalInter_800 },
      subCaption: { color: "#959595" },
      footnote: { color: "#959595" },
      legend: { relFontSize: 0.8 },
      rowGroupHeaders: { relFontSize: 1.1, font: _InternationalInter_800 },
      colGroupHeaders: { relFontSize: 1.1, font: _InternationalInter_800 },
      paneHeaders: { relFontSize: 1.1, font: _InternationalInter_800 },
      tierHeaders: { relFontSize: 1.1, font: _InternationalInter_800 },
      laneHeaders: { relFontSize: 1.1, font: _InternationalInter_800 },
      dataLabels: { lineBreakGap: 0.2 },
    },
    panes: { headerGap: 9, gapX: 30, gapY: 30 },
    lanes: { paddingLeft: 8 },
    tiers: { paddingBottom: 8, headerPosition: "above-axis-if-no-lanes" },
    xTextAxis: { tickLabelGap: 5, tickHeight: 7 },
    content: {
      points: {
        func: { innerColorStrategy: { brighten: 0.5 } },
      },
      // connectors: {
      //   func: {
      //     show: true,
      //     strokeColor: { key: "neutral" },
      //   },
      // },
    },
  },
  page: {
    text: {
      watermark: {
        font: { fontFamily: "International Inter", weight: 800, italic: false },
        color: _COLOR_WATERMARK_GREY,
        relFontSize: 25,
        lineHeight: 1.4,
      },
    },
  },
  markdown: {
    text: {
      code: {
        font: { fontFamily: "Roboto Mono" },
      },
    },
  },
};

function getFigureFont(
  deckStyle: DeckStyleContext | undefined,
  bold: boolean,
): FontInfo {
  const family = deckStyle?.fontFamily ?? "International Inter";
  return getSlideFontInfo(family, bold, false);
}

export function getTextStyle(
  config: PresentationObjectConfig,
  deckStyle?: DeckStyleContext,
): CustomFigureStyleOptions["text"] {
  const baseFont = getFigureFont(deckStyle, false);
  const boldFont = getFigureFont(deckStyle, true);
  return {
    base: { font: baseFont },
    // caption: { relFontSize: config.t.captionRelFontSize ?? 2, font: boldFont },
    // subCaption: { relFontSize: config.t.subCaptionRelFontSize ?? 1.3 },
    // footnote: { relFontSize: config.t.footnoteRelFontSize ?? 0.9 },
    caption: { relFontSize: 1.6, font: boldFont },
    subCaption: { relFontSize: 1.2 },
    footnote: { relFontSize: 0.9 },
    rowGroupHeaders: { font: boldFont },
    colGroupHeaders: { font: boldFont },
    paneHeaders: { font: boldFont },
    tierHeaders: { font: boldFont },
    laneHeaders: { font: boldFont },
  };
}

export function getTableLayoutStyle(config: PresentationObjectConfig) {
  const cfOn = selectCf(config.s).type !== "none";
  return {
    gridLineColor: cfOn ? { key: "base100" as const } : undefined,
    rowHeaderPadding: cfOn
      ? ([5, 10, 5, 0] as [number, number, number, number])
      : undefined,
    borderWidth: cfOn ? 0 : undefined,
    verticalColHeaders: config.s.allowVerticalColHeaders
      ? ("auto" as const)
      : ("never" as const),
  };
}

export function getTableCellsContent(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  indicatorMetadata: IndicatorMetadata[] | undefined,
  obeyMetricFormat: boolean,
) {
  const cfOn = selectCf(config.s).type !== "none";
  const metadataById = indicatorMetadata
    ? new Map(indicatorMetadata.map((m) => [m.id, m]))
    : undefined;

  return {
    func: cfOn
      ? {
          backgroundColor: 777 as const,
          textColorStrategy: {
            ifLight: { key: "baseContent" as const },
            ifDark: { key: "base100" as const },
          },
        }
      : undefined,
    textFormatter: (info: TableCellInfo) => {
      if (!obeyMetricFormat && metadataById && info.valueAsNumber !== undefined) {
        const meta =
          metadataById.get(info.colHeader?.id ?? "") ??
          metadataById.get(info.rowHeader?.id ?? "");
        if (meta?.format_as) {
          return formatIndicatorValue(
            info.valueAsNumber,
            meta.format_as,
            config.s.decimalPlaces ?? 0,
          );
        }
      }
      return getFormatterFunc(
        formatAs,
        config.s.decimalPlaces ?? 0,
      )(info.value);
    },
  };
}

function formatIndicatorValue(
  rawValue: number,
  formatAs: "percent" | "number" | "rate_per_10k",
  decimalPlaces: number,
): string {
  if (formatAs === "rate_per_10k") {
    return getFormatterFunc("number", decimalPlaces)(rawValue * 10000);
  }
  return getFormatterFunc(formatAs, decimalPlaces)(rawValue);
}

export function getMapRegionsContent(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
) {
  if (config.d.type !== "map") return undefined;
  const showRegion = config.s.mapShowRegionLabels ?? false;
  const showData = config.s.showDataLabels;
  return {
    func: {
      show: true,
      fillColor: 777 as const,
      strokeColor: { key: "baseContent" as const },
      strokeWidth: 0.5,
      dataLabel: {
        show: showRegion || showData,
        backgroundColor: { key: "base100" as const },
        rectRadius: 5,
        padding: [4, 6],
        borderColor: { key: "base300" as const },
        borderWidth: 1,
      },
    },
    textFormatter: (info: MapRegionInfo) => {
      const regionText = showRegion ? info.featureId : "";
      const dataText =
        showData && info.value !== undefined
          ? getFormatterFunc(formatAs, config.s.decimalPlaces ?? 0)(info.value)
          : "";
      if (regionText && dataText) return `${regionText}\n${dataText}`;
      return regionText || dataText;
    },
  };
}

// The header whose index drives series coloring (see getIndex below) — the
// sentinel check must look at the same axis the palette indexes.
function getColorPropHeaderId(
  info: ChartSeriesInfo,
  seriesColorFuncPropToUse: "series" | "cell" | "row" | "col" | undefined,
): string {
  const header =
    seriesColorFuncPropToUse === "cell"
      ? info.paneHeader
      : seriesColorFuncPropToUse === "col"
        ? info.laneHeader
        : seriesColorFuncPropToUse === "row"
          ? info.tierHeader
          : info.seriesHeader;
  return header.id;
}

export function getStandardSeriesColorFunc(
  config: PresentationObjectConfig,
): (info: ChartSeriesInfo) => ColorKeyOrString {
  const base = getStandardSeriesColorFuncBase(config);
  if (!isRollupActive(config)) {
    return base;
  }
  // The roll-up (total) series gets a fixed neutral color: pinning it first
  // shifts every other series' palette index, and the total reads as a
  // reference series rather than a member of the palette.
  return (info: ChartSeriesInfo) => {
    const id = getColorPropHeaderId(info, config.s.seriesColorFuncPropToUse);
    return ROLLUP_PIN_IDS.includes(id) ? _CF_COMPARISON : base(info);
  };
}

function getStandardSeriesColorFuncBase(
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
