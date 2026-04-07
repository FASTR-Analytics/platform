import {
  ChartSeriesInfo,
  ChartValueInfo,
  Color,
  ColorKeyOrString,
  CustomFigureStyleOptions,
  FontInfo,
  MapRegionInfo,
  getAdjustedColor,
  getFormatterFunc,
  toPct0,
} from "panther";
import {
  _CF_COMPARISON,
  _CF_GREEN,
  _CF_RED,
  _RANDOM_BLUE,
  getAbcQualScale,
  getAbcQualScale2,
} from "lib";
import { getCalendar } from "lib";
import { PresentationObjectConfig } from "lib";
import { getColorFuncGivenConditionalFormatting } from "./conditional_formatting";

const _Inter_800: FontInfo = {
  fontFamily: "Inter",
  weight: 800,
  italic: false,
};

function getSpecialBarChartDiff(info: ChartValueInfo) {
  const currentV = info.val;
  if (currentV === undefined) {
    return undefined;
  }
  const prevV = info.seriesValArrays.at(info.i_series)?.[
    // Must use square brackets here (otherwise negative 1 issue)
    info.i_val - 1
  ];
  if (prevV !== undefined && prevV !== 0) {
    return currentV / prevV - 1;
  }
  return undefined;
}

export function getStyleFromPresentationObject(
  config: PresentationObjectConfig,
  formatAs: "percent" | "number",
) {
  const dataFormat = formatAs;
  const colorFuncGivenCF = getColorFuncGivenConditionalFormatting(config);
  const goodDiffAreas = config.s.content === "areas" && config.s.diffAreas;
  const style: CustomFigureStyleOptions = {
    scale: config.s.scale,
    seriesColorFunc: getSeriesColorFunc(config),
    text: {
      base: {
        fontSize: 14,
      },
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
      legend: {
        relFontSize: 0.8,
      },
      cells: {
        // color:
        //   config.s.conditionalFormatting === "none"
        //     ? undefined
        //     : { key: "base100" },
      },
      rowGroupHeaders: {
        relFontSize: 1.1,
        font: _Inter_800,
      },
      colGroupHeaders: {
        relFontSize: 1.1,
        font: _Inter_800,
      },
      paneHeaders: {
        relFontSize: 1.1,
        font: _Inter_800,
      },
      tierHeaders: {
        relFontSize: 1.1,
        font: _Inter_800,
      },
      laneHeaders: {
        relFontSize: 1.1,
        font: _Inter_800,
      },
    },
    /////////////////////
    //                 //
    //    Surrounds    //
    //                 //
    /////////////////////
    surrounds: {
      backgroundColor: "none",
      legendPosition: config.s.hideLegend
        ? "none"
        : config.d.type === "map"
          ? undefined
          : undefined,
    },
    //////////////////
    //              //
    //    Legend    //
    //              //
    //////////////////
    legend: {
      reverseOrder: config.s.content === "bars" && config.s.barsStacked,
    },

    ////////////////
    //            //
    //    Grid    //
    //            //
    ////////////////
    grid: {
      showGrid:
        config.d.type !== "table" || config.s.conditionalFormatting === "none",
    },
    /////////////////
    //             //
    //    Cells    //
    //             //
    /////////////////
    panes: {
      nCols: config.s.nColsInCellDisplay,
      // backgroundColor: { key: "base200" },
      // padding: 20,
      headerGap: 9,
      gapX: 30,
      gapY: 30,
    },
    //////////////////
    //              //
    //    X axis    //
    //              //
    //////////////////
    xTextAxis: {
      tickLabelGap: 5,
      tickHeight: 7,
      verticalTickLabels: config.s.verticalTickLabels,
      tickPosition: config.s.content === "points" ? "center" : undefined,
    },
    xPeriodAxis: {
      forceSideTicksWhenYear: config.s.content === "bars",
      calendar: getCalendar(),
    },
    //////////////////
    //              //
    //    Y axis    //
    //              //
    //////////////////
    yScaleAxis: {
      allowIndividualTierLimits: config.s.allowIndividualRowLimits,
      max: config.s.forceYMax1 ? 1 : undefined,
      min: config.s.forceYMinAuto ? "auto" : undefined,
      tickLabelFormatter: getFormatterFunc(
        dataFormat,
        config.s.decimalPlaces ?? 0,
      ),
    },

    ///////////////////
    //               //
    //    Content    //
    //               //
    ///////////////////
    content: {
      points: {
        func: {
          show:
            config.s.content === "points" ||
            (config.d.type === "timeseries" && config.s.specialCoverageChart),
          innerColorStrategy: { brighten: 0.5 },
          dataLabel: {
            show: config.s.showDataLabels || config.s.specialCoverageChart,
          },
        },
        textFormatter: config.s.specialCoverageChart
          ? (info: ChartValueInfo) => {
              const thisSeries = info.seriesValArrays.at(info.i_series);
              if (!thisSeries) return "";
              let lastGoodIndex = 0;
              for (let i = 0; i < thisSeries.length; i++) {
                if (thisSeries[i] !== undefined) lastGoodIndex = i;
              }
              return info.i_val === lastGoodIndex ? toPct0(info.val) : "";
            }
          : (info: ChartValueInfo) =>
              getFormatterFunc(
                dataFormat,
                config.s.decimalPlaces ?? 0,
              )(info.val),
      },
      bars: {
        func:
          config.s.content !== "bars"
            ? { show: false }
            : config.s.specialBarChart
              ? (info) => {
                  const diff = getSpecialBarChartDiff(info);
                  const threshold =
                    config.s.specialBarChartDiffThreshold ?? 0.1;
                  if (diff === undefined) {
                    return {
                      show: true,
                      fillColor: _CF_COMPARISON,
                      dataLabel: { show: config.s.showDataLabels },
                    };
                  }
                  if (diff > threshold) {
                    return {
                      show: true,
                      fillColor: config.s.specialBarChartInverted
                        ? _CF_RED
                        : _CF_GREEN,
                      dataLabel: { show: config.s.showDataLabels },
                    };
                  }
                  if (diff < -1 * threshold) {
                    return {
                      show: true,
                      fillColor: config.s.specialBarChartInverted
                        ? _CF_GREEN
                        : _CF_RED,
                      dataLabel: { show: config.s.showDataLabels },
                    };
                  }
                  return {
                    show: true,
                    fillColor: _CF_COMPARISON,
                    dataLabel: { show: config.s.showDataLabels },
                  };
                }
              : colorFuncGivenCF
                ? (info) => ({
                    show: true,
                    color: colorFuncGivenCF(info.val),
                    dataLabel: { show: config.s.showDataLabels },
                  })
                : { show: true, dataLabel: { show: config.s.showDataLabels } },
        textFormatter: config.s.specialBarChart
          ? (info: ChartValueInfo) => {
              const diff = getSpecialBarChartDiff(info);
              const threshold = config.s.specialBarChartDiffThreshold ?? 0.1;
              const formatter = getFormatterFunc(
                "percent",
                config.s.decimalPlaces ?? 0,
              );
              if (diff === undefined) return "";
              if (diff < -1 * threshold) return formatter(diff);
              if (diff > threshold) return "+" + formatter(diff);
              if (config.s.specialBarChartDataLabels === "all-values")
                return formatter(diff);
              return "";
            }
          : (info: ChartValueInfo) =>
              getFormatterFunc(
                dataFormat,
                config.s.decimalPlaces ?? 0,
              )(info.val),
        stacking:
          config.s.content === "bars" && config.s.barsStacked
            ? "stacked"
            : "none",
      },
      lines: {
        func: goodDiffAreas
          ? (info) => {
              return {
                show: true,
                color: "#000000",
                lineDash: info.i_series === 0 ? "solid" : "dashed",
                strokeWidth: info.i_series === 0 ? 3 : 1.5,
                dataLabel: { show: config.s.showDataLabelsLineCharts },
              };
            }
          : {
              show:
                config.s.content === "lines" || config.s.content === "areas",
              dataLabel: { show: config.s.showDataLabelsLineCharts },
            },
        textFormatter: (info: ChartValueInfo) =>
          getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0)(info.val),
      },
      areas: {
        func: {
          show: config.s.content === "areas",
        },
        diff: {
          enabled: goodDiffAreas,
          // order: config.s.diffAreasOrder,
        },
      },
      tableCells: {
        func: colorFuncGivenCF
          ? (info) => ({
              backgroundColor: colorFuncGivenCF(info.valueAsNumber),
            })
          : undefined,
        textFormatter: (info) =>
          getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0)(info.value),
      },
      mapRegions:
        config.d.type === "map"
          ? {
              func: {
                show: true,
                fillColor: 777,
                strokeColor: "#666",
                strokeWidth: 0.5,
                dataLabel: {
                  show: config.s.showDataLabels,
                  backgroundColor: { key: "base100" },
                  rectRadius: 5,
                  padding: 4,
                },
              },
              textFormatter: (info: MapRegionInfo) => {
                if (info.value === undefined) return "";
                return getFormatterFunc(
                  dataFormat,
                  config.s.decimalPlaces ?? 0,
                )(info.value);
              },
            }
          : undefined,
    },
    /////////////////
    //             //
    //    Table    //
    //             //
    /////////////////
    table: {
      gridLineColor:
        config.s.conditionalFormatting === "none"
          ? undefined
          : { key: "base100" },
      rowHeaderPadding:
        config.s.conditionalFormatting === "none" ? undefined : [5, 10, 5, 0],
      borderWidth: config.s.conditionalFormatting === "none" ? undefined : 0,
      verticalColHeaders: config.s.allowVerticalColHeaders ? "auto" : "never",
    },
    valuesColorFunc:
      config.d.type === "map" ? getMapValuesColorFunc(config) : undefined,
    map:
      config.d.type === "map"
        ? {
            projection: config.s.mapProjection ?? "equirectangular",
            dataLabelMode: "centroid",
          }
        : undefined,
  };

  return style;
}

function getSeriesColorFunc(
  config: PresentationObjectConfig,
): (info: ChartSeriesInfo) => ColorKeyOrString {
  if (config.s.specialCoverageChart) {
    return (info) => {
      if (info.seriesHeader.startsWith("default")) {
        return "#000000";
      }
      if (
        info.seriesHeader.startsWith("Survey") ||
        info.seriesHeader.startsWith("Estimation basée")
      ) {
        return "#000000";
      }
      if (
        info.seriesHeader.startsWith("Projected") ||
        info.seriesHeader.startsWith("Estimation projetée")
      ) {
        return "#F04D44";
      }
      return "#CED4DB";
    };
    // return (info) =>
    //   ["#CED4DB", "#F04D44", "#000000"][
    //     getIndex(info, config.s.seriesColorFuncPropToUse)
    //   ];
  }
  const goodDiffAreas = config.s.content === "areas" && config.s.diffAreas;

  if (goodDiffAreas) {
    return (info) => {
      if (config.s.diffInverted) {
        return [_CF_RED, _CF_GREEN][
          getIndex(info, config.s.seriesColorFuncPropToUse)
        ];
      }
      return [_CF_GREEN, _CF_RED][
        getIndex(info, config.s.seriesColorFuncPropToUse)
      ];
    };
  }
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

const MAP_COLOR_PRESETS: Record<string, [string, string]> = {
  "red-green": ["#de2d26", "#31a354"],
  red: ["#fee0d2", "#de2d26"],
  blue: ["#deebf7", "#3182bd"],
  green: ["#e5f5e0", "#31a354"],
};

function getMapValuesColorFunc(
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
