import type {
  ChartOVDataJson,
  ChartOVDataTransformed,
  ChartOVInputs,
} from "@timroberton/panther";
import {
  CustomFigureStyle,
  getChartOVDataTransformed,
  getColor,
} from "@timroberton/panther";
import type { ChartData, ChartDataset } from "../../types.ts";

export function getChartDataFromChartOVInputs(
  inputs: ChartOVInputs,
  responsiveScale?: number
): ChartData {
  // Create style instance to get merged styles
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale
  );
  const mergedChartOVStyle = customFigureStyle.getMergedChartOVStyle();

  // Transform the data
  const transformedData = getChartOVDataTransformed(
    inputs.chartData,
    mergedChartOVStyle.content.bars.stacking === "stacked"
  );

  // Determine chart type from style
  const hasBarStyle = hasNonDefaultBarStyle(mergedChartOVStyle);
  const hasPointStyle = hasNonDefaultPointStyle(mergedChartOVStyle);
  const hasLineStyle = hasNonDefaultLineStyle(mergedChartOVStyle);
  const hasAreaStyle = hasNonDefaultAreaStyle(mergedChartOVStyle);

  let baseChartType = "bar"; // Default for chartov
  if (hasPointStyle && !hasBarStyle) {
    baseChartType = "scatter";
  } else if (hasLineStyle && !hasBarStyle) {
    baseChartType = "line";
  } else if (hasAreaStyle && !hasBarStyle) {
    baseChartType = "area";
  }

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
          mergedChartOVStyle,
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
    nIndicators: String(transformedData.indicatorHeaders.length),
    nSeries: String(transformedData.seriesHeaders.length),
    nPanes: String(transformedData.paneHeaders.length),
    nLanes: String(transformedData.laneHeaders.length),
    nTiers: String(transformedData.yScaleAxisData.tierHeaders.length),
  };

  // Add data source info if available
  if (inputs.chartData && "jsonDataConfig" in inputs.chartData) {
    const config = (inputs.chartData as ChartOVDataJson).jsonDataConfig;
    if (config.valueProps.length > 0) {
      metadata.valueProperties = config.valueProps.join(", ");
    }
    if (config.indicatorProp && config.indicatorProp !== "--v") {
      metadata.indicatorProperty = config.indicatorProp;
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
  const title = titleParts.join(" - ") || "Chart Data";

  // Determine y-axis label
  const yAxisLabel =
    transformedData.yScaleAxisData.yScaleAxisLabel ||
    transformedData.yScaleAxisData.tierHeaders[0] ||
    "Value";

  // Determine final chart type based on style
  let finalChartType: ChartData["type"] = "bar"; // Default
  if (baseChartType === "bar") {
    if (mergedChartOVStyle.content.bars.stacking === "stacked") {
      finalChartType = "stacked-bar";
    } else if (mergedChartOVStyle.content.bars.stacking === "imposed") {
      finalChartType = "stacked-bar";
    } else {
      finalChartType = "grouped-bar";
    }
  } else if (baseChartType === "scatter") {
    finalChartType = "scatter";
  } else if (baseChartType === "line") {
    finalChartType = "line";
  } else if (baseChartType === "area") {
    finalChartType = "area";
  }

  // X-axis label - use indicators
  const xAxisLabel =
    transformedData.indicatorHeaders.length > 1 ? "Categories" : "Value";

  return {
    type: finalChartType,
    title: title || undefined,
    xAxisLabel,
    yAxisLabel,
    datasets,
    metadata,
  };
}

// Helper functions
function hasNonDefaultBarStyle(
  mergedStyle: ReturnType<CustomFigureStyle["getMergedChartOVStyle"]>
): boolean {
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
    return true; // Default for ChartOV
  }
}

function hasNonDefaultPointStyle(
  mergedStyle: ReturnType<CustomFigureStyle["getMergedChartOVStyle"]>
): boolean {
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
    const pointStyle = mergedStyle.content.points.getStyle(testInfo);
    return pointStyle.show === true;
  } catch {
    return false;
  }
}

function hasNonDefaultLineStyle(
  mergedStyle: ReturnType<CustomFigureStyle["getMergedChartOVStyle"]>
): boolean {
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
    const lineStyle = mergedStyle.content.lines.getStyle(testInfo);
    return lineStyle.show === true;
  } catch {
    return false;
  }
}

function hasNonDefaultAreaStyle(
  mergedStyle: ReturnType<CustomFigureStyle["getMergedChartOVStyle"]>
): boolean {
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
  transformedData: ChartOVDataTransformed,
  mergedStyle: ReturnType<CustomFigureStyle["getMergedChartOVStyle"]>,
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
    const data: Array<{
      x: string | number;
      y: number;
      indicatorIndex?: number;
    }> = [];

    const seriesValues =
      transformedData.values[cellIndex][rowGroupIndex][colGroupIndex][
        seriesIndex
      ];

    for (
      let indicatorIndex = 0;
      indicatorIndex < seriesValues.length;
      indicatorIndex++
    ) {
      const value = seriesValues[indicatorIndex];
      if (value !== undefined) {
        data.push({
          x: transformedData.indicatorHeaders[indicatorIndex],
          y: value,
          indicatorIndex,
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
        const valueInfo = {
          ...seriesInfo,
          val: data[0]?.y || 0,
          i_val: 0,
        };
        const barStyle = mergedStyle.content.bars.getStyle(valueInfo);
        color = getColor(barStyle.fillColor);
      } else if (chartType === "scatter") {
        const valueInfo = {
          ...seriesInfo,
          val: data[0]?.y || 0,
          i_val: 0,
        };
        const pointStyle = mergedStyle.content.points.getStyle(valueInfo);
        color = getColor(pointStyle.color);
      } else {
        const lineStyle = mergedStyle.content.lines.getStyle(seriesInfo);
        color = getColor(lineStyle.strokeColor);
      }

      datasets.push({
        label: transformedData.seriesHeaders[seriesIndex],
        data,
        color,
        type:
          chartType === "area"
            ? "line"
            : (chartType as "bar" | "line" | "scatter"),
      });
    }
  }

  return datasets;
}
