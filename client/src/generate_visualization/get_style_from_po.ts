import {
  AspectRatio,
  ChartSeriesInfo,
  ChartValueInfo,
  Color,
  ColorKeyOrString,
  CustomFigureStyleOptions,
  FontInfo,
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
    idealAspectRatio: config.s.idealAspectRatio as
      | "none"
      | AspectRatio
      | undefined,
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
        color: getAdjustedColor(
          { key: "baseContentLessVisible" },
          { opacity: 0.5 },
        ),
      },
      footnote: {
        relFontSize: config.t.footnoteRelFontSize ?? 0.9,
        color: getAdjustedColor(
          { key: "baseContentLessVisible" },
          { opacity: 0.5 },
        ),
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
      legendPosition: config.s.hideLegend ? "none" : undefined,
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
        defaults: {
          show:
            config.s.content === "points" ||
            (config.d.type === "timeseries" && config.s.specialCoverageChart),
          innerColorStrategy: { brighten: 0.5 },
        },
      },
      bars: {
        defaults: {
          show: config.s.content === "bars",
        },
        func:
          config.s.content !== "bars"
            ? undefined
            : config.s.specialBarChart
              ? (info) => {
                  const diff = getSpecialBarChartDiff(info);
                  const threshold =
                    config.s.specialBarChartDiffThreshold ?? 0.1;
                  if (diff === undefined) {
                    return { show: true, fillColor: _CF_COMPARISON };
                  }
                  if (diff > threshold) {
                    return { show: true, fillColor: config.s.specialBarChartInverted ? _CF_RED :_CF_GREEN };
                  }
                  if (diff < -1 * threshold) {
                    return { show: true, fillColor: config.s.specialBarChartInverted ? _CF_GREEN : _CF_RED };
                  }
                  return { show: true, fillColor: _CF_COMPARISON };
                }
              : !colorFuncGivenCF
                ? undefined
                : (info) => ({
                    show: true,
                    color: colorFuncGivenCF(info.val),
                  }),
        stacking:
          config.s.content === "bars" && config.s.barsStacked
            ? "stacked"
            : "none",
      },
      lines: {
        defaults: {
          show: config.s.content === "lines" || config.s.content === "areas",
        },
        func: goodDiffAreas
          ? (info) => {
              return {
                show: true,
                color: "#000000",
                lineDash: info.i_series === 0 ? "solid" : "dashed",
                strokeWidth: info.i_series === 0 ? 3 : 1.5,
              };
            }
          : undefined,
      },
      areas: {
        defaults: {
          show: config.s.content === "areas",
        },
        diff: {
          enabled: goodDiffAreas,
          // order: config.s.diffAreasOrder,
        },
      },
      withDataLabels: (
        (config.s.content === "bars" || config.s.content === "points") 
      && !!config.s.showDataLabels
    ) || 
      (
        (config.s.content === "lines" || config.s.content === "areas") 
      && !!config.s.showDataLabelsLineCharts
    ),
      dataLabelFormatter: config.s.specialCoverageChart
        ? (info) => {
            const thisSeries = info.seriesValArrays.at(info.i_series);
            if (!thisSeries) {
              return undefined;
            }
            let lastGoodIndex = 0;
            for (let i = 0; i < thisSeries.length; i++) {
              if (thisSeries[i] !== undefined) {
                lastGoodIndex = i;
              }
            }
            if (info.i_val === lastGoodIndex) {
              return toPct0(info.val);
            }
            return undefined;
            // }
            // const lastIndex = thisSeries.length - 1;
            // if (info.i_val === lastIndex) {
            //   return toPct0(info.val);
            // }
            // return undefined;
          }
        : config.s.specialBarChart
          ? (info) => {
              const diff = getSpecialBarChartDiff(info);
              const threshold = config.s.specialBarChartDiffThreshold ?? 0.1;
              const formatter = getFormatterFunc(
                "percent",
                config.s.decimalPlaces ?? 0,
              );
              if (diff === undefined) {
                return undefined;
              }
              if (diff < -1 * threshold) {
                return formatter(diff);
              }
              if (diff > threshold) {
                return "+" + formatter(diff);
              }
              if (config.s.specialBarChartDataLabels === "all-values") {
                return formatter(diff);
              }
              return undefined;
            }
          : (info) =>
              getFormatterFunc(
                dataFormat,
                config.s.decimalPlaces ?? 0,
              )(info.val),
    },
    /////////////////
    //             //
    //    Table    //
    //             //
    /////////////////
    table: {
      colHeaderBackgroundColor: {key: "base100"},
      gridLineColor: {key: "base300"},
      cellBackgroundColorFormatter: colorFuncGivenCF,
      cellValueFormatter: getFormatterFunc(
        dataFormat,
        config.s.decimalPlaces ?? 0,
      ),
      verticalColHeaders: config.s.allowVerticalColHeaders ? "auto" : "never",
    },
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
