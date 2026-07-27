import {
  ChartSeriesInfo,
  Color,
  ColorKeyOrString,
  type GlobalStyleOptions,
  type TextInfoOptions,
  type FontInfo,
  MapRegionInfo,
  TableCellInfo,
  TableHeaderInfo,
  getAdjustedColor,
  getFormatterFunc,
  toNum0,
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

// Structural figure colors — grid lines, borders, label backgrounds, strokes.
// Inside a deck they resolve against that deck's color preset so a figure obeys
// the deck's theme; outside one they stay `{ key }` and resolve against
// panther's global palette exactly as before. The no-deck branch is
// byte-identical to the pre-theming output, which is the property that keeps
// standalone visualizations, editor previews and exports visually unchanged.
// Semantic colors (good/bad/neutral, survey/projected) are deliberately NOT
// routed through here — they carry meaning, not theme.
type StructuralColorSlot = "base100" | "base300" | "baseContent";

function structuralColor(
  slot: StructuralColorSlot,
  deckStyle: DeckStyleContext | undefined,
): ColorKeyOrString {
  return deckStyle ? deckStyle.colorPreset[slot] : { key: slot };
}

export function getTableLayoutStyle(
  config: PresentationObjectConfig,
  deckStyle: DeckStyleContext | undefined,
) {
  const cfOn = selectCf(config.s).type !== "none";
  return {
    gridLineColor: cfOn ? structuralColor("base100", deckStyle) : undefined,
    rowHeaderPadding: cfOn
      ? ([5, 10, 5, 0] as [number, number, number, number])
      : undefined,
    colHeaderPadding: cfOn
      ? ([0, 5, 8, 5] as [number, number, number, number])
      : undefined,
    borderWidth: cfOn ? 0 : undefined,
    verticalColHeaders: config.s.allowVerticalColHeaders
      ? ("auto" as const)
      : ("never" as const),
  };
}

// Resolves which indicator a table cell belongs to. Metadata is keyed by
// indicator id, which reaches the cell either as the value prop (wide-format
// metrics) or as the col/row header (long-format metrics, where the indicator
// sits on a disaggregation axis and the lone value prop is "value").
export function getIndicatorMetaForCell(
  metadataById: Map<string, IndicatorMetadata>,
  effectiveValueProps: string[],
  info: Pick<TableCellInfo, "colHeader" | "rowHeader">,
): IndicatorMetadata | undefined {
  const soleValueProp =
    effectiveValueProps.length === 1 ? effectiveValueProps[0]! : undefined;
  return (
    (soleValueProp === undefined
      ? undefined
      : metadataById.get(soleValueProp)) ??
    metadataById.get(info.colHeader?.id ?? "") ??
    metadataById.get(info.rowHeader?.id ?? "")
  );
}

export function getTableCellsContent(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  indicatorMetadata: IndicatorMetadata[] | undefined,
  obeyMetricFormat: boolean,
  effectiveValueProps: string[],
  deckStyle: DeckStyleContext | undefined,
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
            ifLight: structuralColor("baseContent", deckStyle),
            ifDark: structuralColor("base100", deckStyle),
          },
        }
      : undefined,
    textFormatter: (info: TableCellInfo) => {
      if (
        !obeyMetricFormat &&
        metadataById &&
        info.valueAsNumber !== undefined
      ) {
        const meta = getIndicatorMetaForCell(metadataById, effectiveValueProps, info);
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

/**
 * Appends the sample size to each column header: "Northern (n=55)".
 *
 * v1 policy is item headers only. The formatter also fires for col-GROUP
 * headers, whose digest spans several columns, so the group gate is required —
 * without it a group label reports the largest n under it as if it were its
 * own. Rows and cells are deliberately undecorated (panther supports both).
 *
 * `max` over the header's slice, per the wb-client product manager: a column
 * whose n is constant shows exactly that n, since max equals it. A missing
 * `sampleN` (items carry no __n_*, or roll-up exclusion left no numeric cell)
 * leaves the label untouched, which is what makes historical figures render
 * unchanged. Zero is suppressed too: it is a real finite number to panther, but
 * "(n=0)" tells a reader nothing.
 *
 * Must be pure and deterministic — panther caches header widths by label.
 */
export function getTableColHeadersContent(config: PresentationObjectConfig) {
  if (!config.s.showNValues) {
    return undefined;
  }
  return {
    textFormatter: (info: TableHeaderInfo) => {
      if (
        info.isGroupHeader ||
        info.sampleN === undefined ||
        info.sampleN.max <= 0
      ) {
        return info.label;
      }
      return `${info.label} (n=${toNum0(info.sampleN.max)})`;
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
  deckStyle: DeckStyleContext | undefined,
) {
  if (config.d.type !== "map") return undefined;
  const showRegion = config.s.mapShowRegionLabels ?? false;
  const showData = config.s.showDataLabels;
  return {
    func: {
      show: true,
      fillColor: 777 as const,
      strokeColor: structuralColor("baseContent", deckStyle),
      strokeWidth: 0.5,
      dataLabel: {
        show: showRegion || showData,
        backgroundColor: structuralColor("base100", deckStyle),
        rectRadius: 5,
        padding: [4, 6],
        borderColor: structuralColor("base300", deckStyle),
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
