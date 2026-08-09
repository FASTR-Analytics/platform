import {
  ChartValueInfo,
  CustomFigureStyleOptions,
  type CalendarType,
} from "panther";
import {
  type DeckStyleContext,
  type EffectiveFormat,
  PresentationObjectConfig,
  selectCf,
} from "lib";
import { compileCfToValuesColorFunc } from "../conditional_formatting/compile";
import {
  formatIndicatorValue,
  getIndicatorIdsForChartValue,
  getMapRegionsContent,
  getPieSlicesContent,
  getScaleTickLabelFormatter,
  getStandardSeriesColorFunc,
  getTableCellsContent,
  getPieCenterLabel,
  getTableColHeadersContent,
  getTableLayoutStyle,
  getTextStyle,
} from "./_0_common";
import { getAdminAreaLevelFromMapConfig } from "../get_admin_area_level_from_config";

export function buildStandardStyle(
  config: PresentationObjectConfig,
  effectiveFormat: EffectiveFormat,
  calendar: CalendarType,
  deckStyle: DeckStyleContext | undefined,
  allowNegativeScale: boolean,
  effectiveValueProps: string[],
): CustomFigureStyleOptions {
  // Signed metrics (e.g. inequality measures) must let the value axis fit below 0
  // rather than flooring at 0, which draws negative values outside the plot box.
  // "auto-zero" fits them while still anchoring the axis at 0, so an all-positive
  // chart of the same metric is unchanged; "auto" (forceYMinAuto) is the user's
  // deliberate tight-fit, which may start above 0.
  const scaleMin: "auto" | "auto-zero" | undefined = config.s.forceYMinAuto
    ? "auto"
    : allowNegativeScale
    ? "auto-zero"
    : undefined;
  // The shared scale axis and everything derived from it — tick labels, the
  // forceYMax1 clamp, the pie completion envelope. These are the ONLY
  // legitimate uses of the collapsed format; every individual value below goes
  // through formatForValue instead.
  const axisFormat = effectiveFormat.axisFormat;
  // Re-checked against the RESOLVED format, not the stored flag alone (the
  // isPieCompletionMode pattern): an "indicator" metric's format is
  // filter-sensitive, so a stranded forceYMax1 on a now-numeric figure must
  // degrade to auto rather than clamp counts at 1.
  const scaleMax = config.s.forceYMax1 && axisFormat === "percent"
    ? 1
    : undefined;
  const tickLabelFormatter = getScaleTickLabelFormatter(axisFormat);
  const formatChartValue = (info: ChartValueInfo) =>
    formatIndicatorValue(
      info.val,
      effectiveFormat.formatForValue(getIndicatorIdsForChartValue(info)),
      config.s.decimalPlaces ?? 0,
    );
  const cf = selectCf(config.s);
  const cfOn = cf.type !== "none";
  const c = config.s.content;
  const showPoints =
    c === "points" || c === "lines-points" || c === "points-connectors";
  const showLines = c === "lines" || c === "lines-area" || c === "lines-points";
  const showAreas = c === "lines-area";
  const showConnectors = c === "points-connectors";

  return {
    seriesColorFunc: getStandardSeriesColorFunc(config),
    text: getTextStyle(config, deckStyle),
    surrounds: {
      legendPosition: config.s.hideLegend ? "none" : undefined,
    },
    legend: {
      reverseOrder: config.s.content === "bars" && config.s.barsStacked,
    },
    grid: {
      showGrid: config.d.type !== "table" || cf.type === "none",
    },
    panes: {
      nCols: config.s.nColsInCellDisplay,
    },
    xTextAxis: {
      verticalTickLabels: config.s.verticalTickLabels,
      tickPosition:
        c === "points" || c === "points-connectors" ? "center" : undefined,
    },
    yTextAxis: {
      tickPosition:
        c === "points" || c === "points-connectors" ? "center" : undefined,
    },
    xPeriodAxis: {
      forceSideTicksWhenYear: config.s.content === "bars",
      calendar,
    },
    yScaleAxis: {
      allowIndividualTierLimits: config.s.allowIndividualRowLimits,
      max: scaleMax,
      min: scaleMin,
      tickLabelFormatter,
    },
    xScaleAxis: {
      allowIndividualLaneLimits: config.s.allowIndividualRowLimits,
      max: scaleMax,
      min: scaleMin,
      tickLabelFormatter,
    },
    content: {
      points: {
        func: {
          show: showPoints,
          dataLabel: { show: config.s.showDataLabels },
        },
        textFormatter: formatChartValue,
      },
      bars: {
        func:
          c !== "bars"
            ? { show: false }
            : cfOn
              ? {
                  show: true,
                  fillColor: 777 as const,
                  dataLabel: { show: config.s.showDataLabels },
                }
              : { show: true, dataLabel: { show: config.s.showDataLabels } },
        textFormatter: formatChartValue,
        stacking: c === "bars" && config.s.barsStacked ? "stacked" : "none",
      },
      lines: {
        func: {
          show: showLines,
          dataLabel: { show: config.s.showDataLabelsLineCharts },
        },
        textFormatter: formatChartValue,
      },
      areas: {
        func: { show: showAreas },
      },
      connectors: {
        func: { show: showConnectors },
      },
      tableCells: getTableCellsContent(
        config,
        effectiveFormat,
        effectiveValueProps,
        deckStyle,
      ),
      tableColHeaders: getTableColHeadersContent(config),
      mapRegions: getMapRegionsContent(config, effectiveFormat, deckStyle),
      slices: getPieSlicesContent(config),
    },
    table: getTableLayoutStyle(config, deckStyle, cfOn),
    valuesColorFunc: compileCfToValuesColorFunc(cf),
    map:
      config.d.type === "map"
        ? {
            projection: config.s.mapProjection ?? "equirectangular",
            dataLabelMode: config.s.mapDataLabelMode ?? "centroid",
            fit:
              (getAdminAreaLevelFromMapConfig(config) ?? 0) >= 3
                ? "only-regions-in-data"
                : undefined,
          }
        : undefined,
    pie:
      config.d.type === "pie"
        ? {
            innerRadiusRatio: config.s.pieInnerRadiusRatio ?? 0,
            centerLabel: getPieCenterLabel(config, axisFormat),
          }
        : undefined,
  };
}
