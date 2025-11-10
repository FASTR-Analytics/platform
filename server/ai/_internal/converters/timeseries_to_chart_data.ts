import type {
  TimeseriesDataJson,
  TimeseriesDataTransformed,
  TimeseriesInputs,
} from "@timroberton/panther";
import {
  CustomFigureStyle,
  getColor,
  getTimeseriesDataTransformed,
} from "@timroberton/panther";
import type { ChartData, ChartDataset } from "../../types.ts";

export function getChartDataFromTimeseriesInputs(
  inputs: TimeseriesInputs,
  responsiveScale?: number
): ChartData {
  // Create style instance to get merged styles
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale
  );
  const mergedTimeseriesStyle = customFigureStyle.getMergedTimeseriesStyle();

  // Transform the data
  const transformedData = getTimeseriesDataTransformed(
    inputs.timeseriesData,
    mergedTimeseriesStyle.content.bars.stacking === "stacked"
  );

  // Determine chart type from style
  const hasBarStyle = hasNonDefaultBarStyle(mergedTimeseriesStyle);
  const hasAreaStyle = hasNonDefaultAreaStyle(mergedTimeseriesStyle);
  const baseChartType = hasBarStyle ? "bar" : hasAreaStyle ? "area" : "line";

  const datasets: ChartDataset[] = [];

  // Include all data - iterate through all dimensions
  for (
    let cellIndex = 0;
    cellIndex < transformedData.paneHeaders.length;
    cellIndex++
  ) {
    for (
      let rowGroupIndex = 0;
      rowGroupIndex < transformedData.yScaleAxisData.tierHeaders.length;
      rowGroupIndex++
    ) {
      for (
        let colGroupIndex = 0;
        colGroupIndex < transformedData.laneHeaders.length;
        colGroupIndex++
      ) {
        const cellData = extractDataForCell(
          transformedData,
          mergedTimeseriesStyle,
          cellIndex,
          rowGroupIndex,
          colGroupIndex,
          baseChartType
        );

        // Create descriptive labels that include all context
        cellData.forEach((ds) => {
          const parts: string[] = [];

          // Add cell header if multiple cells
          if (transformedData.paneHeaders.length > 1) {
            parts.push(transformedData.paneHeaders[cellIndex]);
          }

          // Add row group header if multiple row groups
          if (transformedData.yScaleAxisData.tierHeaders.length > 1) {
            parts.push(
              transformedData.yScaleAxisData.tierHeaders[rowGroupIndex]
            );
          }

          // Add column group header if multiple column groups
          if (transformedData.laneHeaders.length > 1) {
            parts.push(transformedData.laneHeaders[colGroupIndex]);
          }

          // Add series header
          parts.push(ds.label);

          datasets.push({
            ...ds,
            label: parts.join(" - "),
          });
        });
      }
    }
  }

  // Build comprehensive metadata
  const metadata: ChartData["metadata"] = {
    periodType: transformedData.periodType,
    timeRange: `${getPeriodLabel(
      transformedData.timeMin,
      transformedData.periodType
    )} - ${getPeriodLabel(
      transformedData.timeMax,
      transformedData.periodType
    )}`,
    nTimePoints: String(transformedData.nTimePoints),
    nSeries: String(transformedData.seriesHeaders.length),
    nPanes: String(transformedData.paneHeaders.length),
    nLanes: String(transformedData.laneHeaders.length),
    nTiers: String(transformedData.yScaleAxisData.tierHeaders.length),
  };

  // Add data source info if available
  if (inputs.timeseriesData && "jsonDataConfig" in inputs.timeseriesData) {
    const config = (inputs.timeseriesData as TimeseriesDataJson).jsonDataConfig;
    if (config.valueProps.length > 0) {
      metadata.valueProperties = config.valueProps.join(", ");
    }
    if (config.seriesProp && config.seriesProp !== "--v") {
      metadata.seriesProperty = config.seriesProp;
    }
    if (config.paneProp && config.paneProp !== "--v") {
      metadata.cellProperty = config.paneProp;
    }
  }

  // Build descriptive title including all dimensions
  const titleParts: string[] = [];
  if (inputs.caption) {
    titleParts.push(inputs.caption);
  }
  if (inputs.subCaption) {
    titleParts.push(inputs.subCaption);
  }
  const title = titleParts.join(" - ") || "Timeseries Data";

  // Determine y-axis label - use the first one or the general label
  const yAxisLabel =
    transformedData.yScaleAxisData.yScaleAxisLabel ||
    transformedData.yScaleAxisData.tierHeaders[0] ||
    "Value";

  // Determine final chart type based on style
  let finalChartType: ChartData["type"] = baseChartType;
  if (baseChartType === "bar") {
    if (mergedTimeseriesStyle.content.bars.stacking === "stacked") {
      finalChartType = "stacked-bar";
    } else if (mergedTimeseriesStyle.content.bars.stacking === "imposed") {
      finalChartType = "stacked-bar"; // Imposed is a form of stacking
    } else {
      finalChartType = "grouped-bar";
    }
  }

  return {
    type: finalChartType,
    title: title || undefined,
    xAxisLabel: "Period",
    yAxisLabel,
    datasets,
    metadata,
  };
}

// Helper functions to detect chart type from style
function hasNonDefaultBarStyle(
  mergedStyle: ReturnType<CustomFigureStyle["getMergedTimeseriesStyle"]>
): boolean {
  // Check if bar styles are showing
  try {
    const testInfo = {
      i_series: 0,
      seriesHeader: "test",
      nSerieses: 1,
      seriesValArrays: [[1]],
      i_lane: 0,
      nLanes: 1,
      i_tier: 0,
      nTiers: 1,
      i_pane: 0,
      nPanes: 1,
      val: 1,
      i_val: 0,
      nVals: 1,
    };
    const barStyle = mergedStyle.content.bars.getStyle(testInfo);
    return barStyle.show === true;
  } catch {
    return false;
  }
}

function hasNonDefaultAreaStyle(
  mergedStyle: ReturnType<CustomFigureStyle["getMergedTimeseriesStyle"]>
): boolean {
  // Check if area styles are showing
  try {
    const testInfo = {
      i_series: 0,
      seriesHeader: "test",
      nSerieses: 1,
      seriesValArrays: [[1]],
      i_lane: 0,
      nLanes: 1,
      i_tier: 0,
      nTiers: 1,
      i_pane: 0,
      nPanes: 1,
      nVals: 1,
    };
    const areaStyle = mergedStyle.content.areas.getStyle(testInfo);
    return areaStyle.show === true;
  } catch {
    return false;
  }
}

function extractDataForCell(
  transformedData: TimeseriesDataTransformed,
  mergedStyle: ReturnType<CustomFigureStyle["getMergedTimeseriesStyle"]>,
  cellIndex: number,
  rowGroupIndex: number,
  colGroupIndex: number,
  chartType: string
): ChartDataset[] {
  const datasets: ChartDataset[] = [];

  for (
    let seriesIndex = 0;
    seriesIndex < transformedData.seriesHeaders.length;
    seriesIndex++
  ) {
    const data: Array<{ x: string | number; y: number; periodId?: number }> =
      [];

    const seriesValues =
      transformedData.values[cellIndex][rowGroupIndex][colGroupIndex][
        seriesIndex
      ];

    for (let timeIndex = 0; timeIndex < seriesValues.length; timeIndex++) {
      const value = seriesValues[timeIndex];
      if (value !== undefined) {
        const time = transformedData.timeMin + timeIndex;
        const periodLabel = getPeriodLabel(time, transformedData.periodType);

        data.push({
          x: periodLabel,
          y: value,
          periodId: time, // Include raw period ID for additional context
        });
      }
    }

    if (data.length > 0) {
      // Create series info for style functions
      const seriesInfo = {
        i_series: seriesIndex,
        seriesHeader: transformedData.seriesHeaders[seriesIndex],
        nSerieses: transformedData.seriesHeaders.length,
        seriesValArrays: [],
        i_lane: colGroupIndex,
        nLanes: transformedData.laneHeaders.length,
        i_tier: rowGroupIndex,
        nTiers: transformedData.yScaleAxisData.tierHeaders.length,
        i_pane: cellIndex,
        nPanes: transformedData.paneHeaders.length,
        nVals: data.length,
      };

      // Extract color from style system
      let color: string | undefined;
      if (
        chartType === "bar" ||
        chartType === "stacked-bar" ||
        chartType === "grouped-bar"
      ) {
        // For bar styles, we need a value info with a specific value
        const valueInfo = {
          ...seriesInfo,
          val: data[0]?.y || 0, // Use first value as representative
          i_val: 0,
        };
        const barStyle = mergedStyle.content.bars.getStyle(valueInfo);
        color = getColor(barStyle.fillColor);
      } else {
        // Line styles only need series info
        const lineStyle = mergedStyle.content.lines.getStyle(seriesInfo);
        color = getColor(lineStyle.strokeColor);
      }

      datasets.push({
        label: transformedData.seriesHeaders[seriesIndex],
        data,
        color,
        type: chartType === "area" ? "line" : (chartType as "bar" | "line"),
      });
    }
  }

  return datasets;
}

function getPeriodLabel(time: number, periodType: string): string {
  if (periodType === "year") {
    return String(time);
  }

  if (periodType === "year-month") {
    const year = Math.floor(time / 100);
    const month = time % 100;
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${monthNames[month - 1]} ${year}`;
  }

  if (periodType === "year-quarter") {
    const year = Math.floor(time / 10);
    const quarter = time % 10;
    return `Q${quarter} ${year}`;
  }

  return String(time);
}
