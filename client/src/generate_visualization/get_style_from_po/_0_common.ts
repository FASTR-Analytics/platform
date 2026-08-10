import {
  ChartSeriesInfo,
  Color,
  ColorKeyOrString,
  type GlobalStyleOptions,
  type TextInfoOptions,
  type FontInfo,
  type HeaderItem,
  MapRegionInfo,
  NO_DISAGGREGATION_HEADER_ID,
  PieSliceInfo,
  TableCellInfo,
  TableHeaderInfo,
  getAdjustedColor,
  getFormatterFunc,
  toNum0,
  type CustomFigureStyleOptions,
  type TickLabelFormatterOption,
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
  type EffectiveFormat,
  type IndicatorFormat,
  type IndicatorMetadata,
  getSlideFontInfo,
  isPieCompletionMode,
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

// Text colour for CF-coloured cells, shared by standard CF and the scorecard
// so both respect a deck's colour preset.
export function getCfCellTextColorStrategy(
  deckStyle: DeckStyleContext | undefined,
) {
  return {
    ifLight: structuralColor("baseContent", deckStyle),
    ifDark: structuralColor("base100", deckStyle),
  };
}

// The CF table look — white gridlines, no outer border, tightened header
// padding — applies whenever cells carry conditional-formatting backgrounds.
// `cfOn` is passed in because config.s alone cannot answer that: standard
// tables colour cells via user CF (selectCf), scorecards via per-indicator
// metadata thresholds. The two are the same look and must not drift apart.
export function getTableLayoutStyle(
  config: PresentationObjectConfig,
  deckStyle: DeckStyleContext | undefined,
  cfOn: boolean,
) {
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

// The ids that could identify a table cell's indicator, most specific first.
// An indicator reaches a cell either as the value prop (wide-format metrics)
// or as one of its four headers (long-format metrics, where the indicator sits
// on a disaggregation axis and the lone value prop is "value"). All four are
// required, not just the item headers: getStartingConfigForPresentationObject
// assigns display options in order, so a three-dimension table lands its
// indicator dimension on rowGroup.
//
// The LIST is shared with the scorecard; the stopping rule is not.
// formatForValue stops at the first id declaring `format_as`,
// getThresholdMetaForCell at the first declaring `threshold_direction`, so the
// two could in principle resolve different indicators for the same cell. No
// per-module catalog mixes entries where the two declarations diverge, so this
// is unreachable today.
export function getIndicatorIdsForCell(
  effectiveValueProps: string[],
  info: Pick<
    TableCellInfo,
    "colHeader" | "rowHeader" | "colGroupHeader" | "rowGroupHeader"
  >,
): (string | undefined)[] {
  return [
    effectiveValueProps.length === 1 ? effectiveValueProps[0] : undefined,
    info.colHeader?.id,
    info.rowHeader?.id,
    info.colGroupHeader?.id,
    info.rowGroupHeader?.id,
  ];
}

// The metadata entry a cell takes its threshold colouring from: the first id
// along the chain whose entry actually DECLARES a threshold direction. Not the
// first entry found — the catalog deliberately carries label-only entries (HFA
// categories and variant items, ICEH strat codes, raw common indicators), so a
// bare column header would otherwise mask the row indicator beside it.
export function getThresholdMetaForCell(
  metadataById: Map<string, IndicatorMetadata>,
  effectiveValueProps: string[],
  info: Pick<
    TableCellInfo,
    "colHeader" | "rowHeader" | "colGroupHeader" | "rowGroupHeader"
  >,
): IndicatorMetadata | undefined {
  for (const id of getIndicatorIdsForCell(effectiveValueProps, info)) {
    if (id === undefined) continue;
    const meta = metadataById.get(id);
    if (meta?.threshold_direction !== undefined) return meta;
  }
  return undefined;
}

export function getTableCellsContent(
  config: PresentationObjectConfig,
  effectiveFormat: EffectiveFormat,
  effectiveValueProps: string[],
  deckStyle: DeckStyleContext | undefined,
) {
  const cfOn = selectCf(config.s).type !== "none";

  return {
    func: cfOn
      ? {
          backgroundColor: 777 as const,
          textColorStrategy: getCfCellTextColorStrategy(deckStyle),
        }
      : undefined,
    // Unconditional per-value resolution. A "percent"/"number" metric owns its
    // format and formatForValue returns the declaration whatever the ids say;
    // an "indicator" metric's table legitimately mixes percent and count
    // indicators, and each cell must print in its own.
    textFormatter: (info: TableCellInfo) =>
      formatIndicatorValue(
        info.value,
        effectiveFormat.formatForValue(
          getIndicatorIdsForCell(effectiveValueProps, info),
        ),
        config.s.decimalPlaces ?? 0,
      ),
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

// THE displayed magnitude of a stored value. Percent values are stored as
// fractions and rates as bare rates, but everything a reader sees — and every
// threshold a user types — is in the scaled units. Panther's percent formatter
// applies the ×100 itself; it has no per-10,000 format at all, which is why
// the rate scaling lives on this side. One site for both conventions.
export function scaleValueForFormat(
  value: number,
  formatAs: IndicatorFormat,
): number {
  if (formatAs === "percent") return value * 100;
  if (formatAs === "rate_per_10k") return value * 10000;
  return value;
}

// THE 3-way value formatter. "rate_per_10k" formats as a number after scaling.
export function formatIndicatorValue(
  value: number | string | null | undefined,
  formatAs: IndicatorFormat,
  decimalPlaces: 0 | 1 | 2 | 3,
): string {
  if (formatAs !== "rate_per_10k") {
    return getFormatterFunc(formatAs, decimalPlaces)(value);
  }
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || isNaN(n)) {
    return getFormatterFunc("number", decimalPlaces)(value);
  }
  return formatRateAuto(n);
}

// THE rate_per_10k label rule, for every rate label anywhere: the fewest
// decimals (≤3) that print the scaled value EXACTLY, decided per value.
//
// One rule because a rate carries three properties none of the alternatives
// respect together. The decimals knob cannot apply: it defaults to 0, and a
// bare rate of 0.00012 is 1.2 per 10,000 — printing "1" beside an axis tick
// reading 1.2 is the same number twice with different answers. A list-wide
// auto count cannot apply either: it sizes to keep a list DISTINCT, so a
// boundary of 0.25 rounds to "0.3" while the axis prints "0.25". Per value and
// exact is the only rule the axis, the data labels, the scale legend, the
// threshold legend and the CF editor preview can all follow, so they cannot
// disagree about the same number.
export function formatRateAuto(v: number): string {
  const scaled = scaleValueForFormat(v, "rate_per_10k");
  for (const dp of [0, 1, 2] as const) {
    const factor = Math.pow(10, dp);
    const rounded = Math.round(scaled * factor) / factor;
    if (Math.abs(rounded - scaled) <= Math.abs(scaled) * 1e-9) {
      return getFormatterFunc("number", dp)(scaled);
    }
  }
  return getFormatterFunc("number", 3)(scaled);
}

// Scale-axis tick labels for the same three formats. percent/number keep
// panther's auto-decimal modes (sized from the resolved tick list);
// rate_per_10k has no auto mode, so it goes through the formatter function
// escape — which sees one tick at a time, exactly what formatRateAuto wants.
export function getScaleTickLabelFormatter(
  formatAs: IndicatorFormat,
): TickLabelFormatterOption {
  if (formatAs === "rate_per_10k") {
    return formatRateAuto;
  }
  return formatAs === "percent" ? "auto-percent" : "auto-number";
}

// The ids that could identify a plotted value's indicator, most specific
// first. A wide-format metric carries the indicator as the sole value prop
// (same rule as getIndicatorIdsForCell). Category charts carry it at i_val;
// timeseries leave indicatorHeader undefined and identify by series; a pie
// slice always has one. Any of the four layout axes can carry the indicator
// dimension instead, and none of them is ever an admin area on a chart.
export function getIndicatorIdsForChartValue(
  effectiveValueProps: string[],
  info: Pick<
    ChartSeriesInfo,
    "seriesHeader" | "laneHeader" | "tierHeader" | "paneHeader"
  > & { indicatorHeader: HeaderItem | undefined },
): (string | undefined)[] {
  return [
    effectiveValueProps.length === 1 ? effectiveValueProps[0] : undefined,
    info.indicatorHeader?.id,
    info.seriesHeader.id,
    info.laneHeader.id,
    info.tierHeader.id,
    info.paneHeader.id,
  ];
}

// A map region's own key is an admin area, never an indicator, so only the
// sole value prop (wide-format metrics) or the three layout axes (or a filter
// pin, which formatForValue falls back to) can say which indicator the value
// belongs to.
export function getIndicatorIdsForMapRegion(
  effectiveValueProps: string[],
  info: MapRegionInfo,
): (string | undefined)[] {
  return [
    effectiveValueProps.length === 1 ? effectiveValueProps[0] : undefined,
    info.paneHeader.id,
    info.tierHeader.id,
    info.laneHeader.id,
  ];
}

export function getMapRegionsContent(
  config: PresentationObjectConfig,
  effectiveFormat: EffectiveFormat,
  effectiveValueProps: string[],
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
          ? formatIndicatorValue(
              info.value,
              effectiveFormat.formatForValue(
                getIndicatorIdsForMapRegion(effectiveValueProps, info),
              ),
              config.s.decimalPlaces ?? 0,
            )
          : "";
      if (regionText && dataText) return `${regionText}\n${dataText}`;
      return regionText || dataText;
    },
  };
}

// Slice labels are always "label share%" regardless of the metric's formatAs —
// a share is a fraction of the pie's denominator, never a raw value. The custom
// textFormatter (only when labels are on) exists to honor s.decimalPlaces;
// panther's built-in formatter auto-picks decimals.
//
// The name is dropped when the slice axis carries no disaggregation: panther
// yields its NO_DISAGGREGATION_HEADER_ID sentinel there, whose label is the
// literal "default". That is every completion pie (the whole point is one
// filled arc per indicator, named by the indicator header panther draws beside
// it) and any pie left with an empty Slices slot.
export function getPieSlicesContent(config: PresentationObjectConfig) {
  if (config.d.type !== "pie") return undefined;
  return {
    func: { dataLabel: { show: config.s.showDataLabels } },
    textFormatter: config.s.showDataLabels
      ? (info: PieSliceInfo) => {
          const share = getFormatterFunc(
            "percent",
            config.s.decimalPlaces ?? 0,
          )(info.share);
          return info.seriesHeader.id === NO_DISAGGREGATION_HEADER_ID
            ? share
            : `${info.seriesHeader.label} ${share}`;
        }
      : undefined,
  };
}

// The doughnut hole's KPI number. "share" reads the value against the
// completion pie's fixed envelope; "total" sums the slices, which is the only
// meaningful reading when the denominator IS that sum. Gated on the same
// isPieCompletionMode as the data config's `total` — disagreeing would report a
// share against a denominator the geometry never used. Panther suppresses it on
// a pie with no hole, so no shape check is needed here.
export function getPieCenterLabel(
  config: PresentationObjectConfig,
  formatAs: IndicatorFormat,
): "none" | "total" | "share" {
  if (config.d.type !== "pie" || !config.s.pieShowCenterValue) return "none";
  return isPieCompletionMode(config, formatAs) ? "share" : "total";
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
