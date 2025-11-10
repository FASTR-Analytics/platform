import {
  CustomFigureStyle,
  getTableDataTransformed,
  type TableDataJson,
  type TableInputs,
} from "@timroberton/panther";
import type { ChartData, ChartDataset } from "../../types.ts";

export function getChartDataFromTableInputs(
  inputs: TableInputs,
  responsiveScale?: number
): ChartData {
  // Create style instance (even though we don't use it much for tables)
  const _customFigureStyle = new CustomFigureStyle(
    inputs.style,
    responsiveScale
  );

  // Transform the data
  const transformedData = getTableDataTransformed(inputs.tableData);

  // For tables, we'll create a bar chart representation
  // Each row becomes a dataset, each column becomes a data point
  const datasets: ChartDataset[] = [];

  // Extract column headers from colGroups
  const colHeaders: string[] = [];
  for (const colGroup of transformedData.colGroups) {
    for (const col of colGroup.cols) {
      colHeaders.push(col.label || `Column ${col.index + 1}`);
    }
  }

  // Extract row headers from rowGroups
  const rowHeaders: string[] = [];
  for (const rowGroup of transformedData.rowGroups) {
    for (const row of rowGroup.rows) {
      rowHeaders.push(row.label || `Row ${row.index + 1}`);
    }
  }

  // Find numeric columns by checking data in aoa
  const numericColIndices: number[] = [];
  const numericColHeaders: string[] = [];

  // Skip first column if it contains row headers
  const startCol =
    rowHeaders.length > 0 && transformedData.aoa[0]?.[0] === rowHeaders[0]
      ? 1
      : 0;

  for (let colIndex = startCol; colIndex < colHeaders.length; colIndex++) {
    // Check if this column contains numeric data
    let hasNumericData = false;
    for (let rowIndex = 0; rowIndex < transformedData.aoa.length; rowIndex++) {
      const cellValue = transformedData.aoa[rowIndex]?.[colIndex];
      // Check if it's a number or a string that can be parsed as a number
      const numValue =
        typeof cellValue === "number" ? cellValue : Number(cellValue);
      if (!isNaN(numValue)) {
        hasNumericData = true;
        break;
      }
    }
    if (hasNumericData) {
      numericColIndices.push(colIndex);
      numericColHeaders.push(colHeaders[colIndex]);
    }
  }

  // Create datasets for each row
  for (let rowIndex = 0; rowIndex < rowHeaders.length; rowIndex++) {
    const data: Array<{ x: string | number; y: number }> = [];

    for (let i = 0; i < numericColIndices.length; i++) {
      const colIndex = numericColIndices[i];
      const cellValue = transformedData.aoa[rowIndex]?.[colIndex];

      // Convert to number if it's a string
      const numValue =
        typeof cellValue === "number" ? cellValue : Number(cellValue);
      if (!isNaN(numValue)) {
        data.push({
          x: numericColHeaders[i],
          y: numValue,
        });
      }
    }

    if (data.length > 0) {
      // Determine color - tables don't have explicit color styling like charts
      // Use a default color scheme
      const defaultColors = [
        "#3b82f6",
        "#10b981",
        "#f59e0b",
        "#ef4444",
        "#8b5cf6",
        "#ec4899",
        "#14b8a6",
        "#f97316",
      ];
      const color = defaultColors[rowIndex % defaultColors.length];

      // Build label including row group if present
      const labelParts: string[] = [];

      // Add row group label if multiple row groups
      if (transformedData.rowGroups.length > 1) {
        // Find which row group this row belongs to
        for (const rowGroup of transformedData.rowGroups) {
          const foundRow = rowGroup.rows.find((r) => r.index === rowIndex);
          if (foundRow && rowGroup.label) {
            labelParts.push(rowGroup.label);
            break;
          }
        }
      }

      labelParts.push(rowHeaders[rowIndex]);

      datasets.push({
        label: labelParts.join(" - "),
        data,
        color,
        type: "bar",
      });
    }
  }

  // Build comprehensive metadata
  const metadata: ChartData["metadata"] = {
    nRows: String(rowHeaders.length),
    nCols: String(colHeaders.length),
    nRowGroups: String(transformedData.rowGroups.length),
    nColGroups: String(transformedData.colGroups.length),
    numericColumns: String(numericColIndices.length),
    dataType: "table",
  };

  // Add data source info if available
  if (inputs.tableData && "jsonDataConfig" in inputs.tableData) {
    const config = (inputs.tableData as TableDataJson).jsonDataConfig;
    if (config.valueProps.length > 0) {
      metadata.valueProperties = config.valueProps.join(", ");
    }
    if (config.rowProp && config.rowProp !== "--v") {
      metadata.rowProperty = config.rowProp;
    }
    if (config.colProp && config.colProp !== "--v") {
      metadata.colProperty = config.colProp;
    }
  }

  // Build descriptive title
  const titleParts: string[] = [];
  if (inputs.caption) {
    titleParts.push(inputs.caption);
  }
  if (inputs.subCaption) {
    titleParts.push(inputs.subCaption);
  }
  const title = titleParts.join(" - ") || "Table Data";

  // For tables converted to charts, we use columns as X-axis
  const xAxisLabel =
    transformedData.colGroups.length > 0 && transformedData.colGroups[0].label
      ? transformedData.colGroups[0].label
      : "Columns";

  const yAxisLabel = "Value";

  return {
    type: "grouped-bar", // Tables are best represented as grouped bars
    title: title || undefined,
    xAxisLabel,
    yAxisLabel,
    datasets,
    metadata,
  };
}
