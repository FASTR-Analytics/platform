import {
  ChartValueInfo,
  CustomFigureStyleOptions,
  getFormatterFunc,
  type CalendarType,
  type TickLabelFormatterOption,
} from "panther";
import {
  type DeckStyleContext,
  type IndicatorMetadata,
  PresentationObjectConfig,
  selectCf,
} from "lib";
import { compileCfToValuesColorFunc } from "../conditional_formatting/compile";
import {
  getMapRegionsContent,
  getStandardSeriesColorFunc,
  getTableCellsContent,
  getTableLayoutStyle,
  getTextStyle,
} from "./_0_common";
import { getAdminAreaLevelFromMapConfig } from "../get_admin_area_level_from_config";

export function buildStandardStyle(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
  calendar: CalendarType,
  deckStyle: DeckStyleContext | undefined,
  indicatorMetadata: IndicatorMetadata[] | undefined,
  allowNegativeScale: boolean,
  obeyMetricFormat: boolean,
): CustomFigureStyleOptions {
  // Signed metrics (e.g. inequality measures) must let the value axis fit below 0
  // rather than flooring at 0, which clips negative bars.
  const scaleMin: "auto" | undefined =
    config.s.forceYMinAuto || allowNegativeScale ? "auto" : undefined;
  const dataFormat = formatAs;
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
      max: config.s.forceYMax1 ? 1 : undefined,
      min: scaleMin,
      tickLabelFormatter: (dataFormat === "percent"
        ? "auto-percent"
        : "auto-number") as TickLabelFormatterOption,
    },
    xScaleAxis: {
      allowIndividualLaneLimits: config.s.allowIndividualRowLimits,
      max: config.s.forceYMax1 ? 1 : undefined,
      min: scaleMin,
      tickLabelFormatter: (dataFormat === "percent"
        ? "auto-percent"
        : "auto-number") as TickLabelFormatterOption,
    },
    content: {
      points: {
        func: {
          show: showPoints,
          dataLabel: { show: config.s.showDataLabels },
        },
        textFormatter: (info: ChartValueInfo) =>
          getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0)(info.val),
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
        textFormatter: (info: ChartValueInfo) =>
          getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0)(info.val),
        stacking: c === "bars" && config.s.barsStacked ? "stacked" : "none",
      },
      lines: {
        func: {
          show: showLines,
          dataLabel: { show: config.s.showDataLabelsLineCharts },
        },
        textFormatter: (info: ChartValueInfo) =>
          getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0)(info.val),
      },
      areas: {
        func: { show: showAreas },
      },
      connectors: {
        func: { show: showConnectors },
      },
      tableCells: getTableCellsContent(
        config,
        formatAs,
        indicatorMetadata,
        obeyMetricFormat,
      ),
      mapRegions: getMapRegionsContent(config, formatAs),
    },
    table: getTableLayoutStyle(config),
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
  };
}
