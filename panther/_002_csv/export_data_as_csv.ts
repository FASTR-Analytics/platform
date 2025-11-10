// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Csv } from "./csv_class.ts";

// Simplified GenericValueInfo for CSV export
// This avoids importing from higher-level modules
export interface GenericValueInfo {
  i_series: number;
  seriesHeader: string;
  nSerieses: number;
  seriesValArrays: (number | undefined)[][];
  nVals: number;
  i_lane: number;
  nLanes: number;
  i_tier: number;
  nTiers: number;
  i_pane: number;
  nPanes: number;
  val: number | undefined;
  i_val: number;
}

export interface ExportDataAsCsvParams {
  // Core data
  values: (number | undefined)[][][][][];
  paneHeaders: string[];
  laneHeaders: string[];
  seriesHeaders: string[];
  dimensionHeaders: string[]; // indicators for ChartOV, formatted time periods for Timeseries

  // Formatting
  dataLabelFormatter: (info: GenericValueInfo) => string | undefined;

  // Options
  includeSeriesAsColumns?: boolean;
  includeCellsAsRows?: boolean;
  paneIndex?: number;

  // Context for ValueInfo (usually constant)
  nTiers?: number;
  nDimensions: number; // number of indicators or time points
}

export function exportDataAsCsv(params: ExportDataAsCsvParams): Csv<string> {
  const {
    values,
    paneHeaders,
    laneHeaders,
    seriesHeaders,
    dimensionHeaders,
    dataLabelFormatter,
    includeSeriesAsColumns = true,
    includeCellsAsRows = false,
    paneIndex = 0,
    nTiers = 1,
    nDimensions,
  } = params;

  // Validate cell index
  if (paneIndex < 0 || paneIndex >= paneHeaders.length) {
    throw new Error(
      `Invalid cell index: ${paneIndex}. Must be between 0 and ${
        paneHeaders.length - 1
      }`,
    );
  }

  // If only one cell or specific cell requested, export that cell
  if (paneHeaders.length === 1 || !includeCellsAsRows) {
    return exportSingleCellAsCsv({
      ...params,
      paneIndex,
      includeSeriesAsColumns,
      nTiers,
      nDimensions,
    });
  }

  // Export all cells with cell names as grouping rows
  return exportAllCellsAsCsv({
    ...params,
    includeSeriesAsColumns,
    nTiers,
    nDimensions,
  });
}

function exportSingleCellAsCsv(params: {
  values: (number | undefined)[][][][][];
  paneHeaders: string[];
  laneHeaders: string[];
  seriesHeaders: string[];
  dimensionHeaders: string[];
  dataLabelFormatter: (info: GenericValueInfo) => string | undefined;
  includeSeriesAsColumns: boolean;
  paneIndex: number;
  nTiers: number;
  nDimensions: number;
}): Csv<string> {
  const {
    values,
    paneHeaders,
    laneHeaders,
    seriesHeaders,
    dimensionHeaders,
    dataLabelFormatter,
    includeSeriesAsColumns,
    paneIndex,
    nTiers,
    nDimensions,
  } = params;

  const hasMultipleColGroups = laneHeaders.length > 1;

  if (includeSeriesAsColumns) {
    // Standard format: series as columns
    // Add dimension header as first column
    const colHeaders = ["", ...seriesHeaders];
    const aoa: string[][] = [];

    if (hasMultipleColGroups) {
      for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
        if (i_lane > 0) {
          aoa.push(new Array(seriesHeaders.length + 1).fill("")); // Empty row for spacing
        }
        aoa.push([
          laneHeaders[i_lane],
          ...new Array(seriesHeaders.length).fill(""),
        ]); // ColGroup header row

        for (
          let i_dimension = 0;
          i_dimension < dimensionHeaders.length;
          i_dimension++
        ) {
          const row: string[] = [dimensionHeaders[i_dimension]]; // Dimension header as first column
          for (let i_series = 0; i_series < seriesHeaders.length; i_series++) {
            const value = values[paneIndex]?.[0]?.[i_lane]?.[i_series]
              ?.[i_dimension];

            if (value !== undefined) {
              const valueInfo: GenericValueInfo = {
                i_series,
                seriesHeader: seriesHeaders[i_series],
                nSerieses: seriesHeaders.length,
                seriesValArrays: [], // Not needed for formatting
                nVals: nDimensions,
                i_lane,
                nLanes: laneHeaders.length,
                i_tier: 0,
                nTiers,
                i_pane: paneIndex,
                nPanes: paneHeaders.length,
                val: value,
                i_val: i_dimension,
              };
              const formattedValue = dataLabelFormatter(valueInfo);
              row.push(formattedValue || "");
            } else {
              row.push("");
            }
          }
          aoa.push(row);
        }
      }
    } else {
      // Single lane
      for (
        let i_dimension = 0;
        i_dimension < dimensionHeaders.length;
        i_dimension++
      ) {
        const row: string[] = [dimensionHeaders[i_dimension]]; // Dimension header as first column
        for (let i_series = 0; i_series < seriesHeaders.length; i_series++) {
          const value = values[paneIndex]?.[0]?.[0]?.[i_series]?.[i_dimension];

          if (value !== undefined) {
            const valueInfo: GenericValueInfo = {
              i_series,
              seriesHeader: seriesHeaders[i_series],
              nSerieses: seriesHeaders.length,
              seriesValArrays: [], // Not needed for formatting
              nVals: nDimensions,
              i_lane: 0,
              nLanes: laneHeaders.length,
              i_tier: 0,
              nTiers,
              i_pane: paneIndex,
              nPanes: paneHeaders.length,
              val: value,
              i_val: i_dimension,
            };
            const formattedValue = dataLabelFormatter(valueInfo);
            row.push(formattedValue || "");
          } else {
            row.push("");
          }
        }
        aoa.push(row);
      }
    }

    return new Csv<string>({
      colHeaders,
      aoa,
    });
  } else {
    // Transposed format: dimensions as columns
    if (hasMultipleColGroups) {
      // Create column headers with lane prefixes
      const colHeaders: string[] = [];
      for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
        for (
          let i_dimension = 0;
          i_dimension < dimensionHeaders.length;
          i_dimension++
        ) {
          colHeaders.push(
            `${laneHeaders[i_lane]} - ${dimensionHeaders[i_dimension]}`,
          );
        }
      }

      const seriesRows: string[][] = [];
      for (let i_series = 0; i_series < seriesHeaders.length; i_series++) {
        const row: string[] = [];
        for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
          for (
            let i_dimension = 0;
            i_dimension < dimensionHeaders.length;
            i_dimension++
          ) {
            const value = values[paneIndex]?.[0]?.[i_lane]?.[i_series]
              ?.[i_dimension];

            if (value !== undefined) {
              const valueInfo: GenericValueInfo = {
                i_series,
                seriesHeader: seriesHeaders[i_series],
                nSerieses: seriesHeaders.length,
                seriesValArrays: [], // Not needed for formatting
                nVals: nDimensions,
                i_lane,
                nLanes: laneHeaders.length,
                i_tier: 0,
                nTiers,
                i_pane: paneIndex,
                nPanes: paneHeaders.length,
                val: value,
                i_val: i_dimension,
              };
              const formattedValue = dataLabelFormatter(valueInfo);
              row.push(formattedValue || "");
            } else {
              row.push("");
            }
          }
        }
        seriesRows.push(row);
      }

      return new Csv<string>({
        rowHeaders: seriesHeaders,
        colHeaders,
        aoa: seriesRows,
      });
    } else {
      // Single lane - use dimensions as column headers
      const colHeaders = [...dimensionHeaders];
      const seriesRows: string[][] = [];

      for (let i_series = 0; i_series < seriesHeaders.length; i_series++) {
        const row: string[] = [];
        for (
          let i_dimension = 0;
          i_dimension < dimensionHeaders.length;
          i_dimension++
        ) {
          const value = values[paneIndex]?.[0]?.[0]?.[i_series]?.[i_dimension];

          if (value !== undefined) {
            const valueInfo: GenericValueInfo = {
              i_series,
              seriesHeader: seriesHeaders[i_series],
              nSerieses: seriesHeaders.length,
              seriesValArrays: [], // Not needed for formatting
              nVals: nDimensions,
              i_lane: 0,
              nLanes: laneHeaders.length,
              i_tier: 0,
              nTiers,
              i_pane: paneIndex,
              nPanes: paneHeaders.length,
              val: value,
              i_val: i_dimension,
            };
            const formattedValue = dataLabelFormatter(valueInfo);
            row.push(formattedValue || "");
          } else {
            row.push("");
          }
        }
        seriesRows.push(row);
      }

      return new Csv<string>({
        rowHeaders: seriesHeaders,
        colHeaders,
        aoa: seriesRows,
      });
    }
  }
}

function exportAllCellsAsCsv(params: {
  values: (number | undefined)[][][][][];
  paneHeaders: string[];
  laneHeaders: string[];
  seriesHeaders: string[];
  dimensionHeaders: string[];
  dataLabelFormatter: (info: GenericValueInfo) => string | undefined;
  includeSeriesAsColumns: boolean;
  nTiers: number;
  nDimensions: number;
}): Csv<string> {
  const {
    values,
    paneHeaders,
    laneHeaders,
    seriesHeaders,
    dimensionHeaders,
    dataLabelFormatter,
    includeSeriesAsColumns,
    nTiers,
    nDimensions,
  } = params;

  const hasMultipleColGroups = laneHeaders.length > 1;

  // Add empty first column header for the dimension column
  const colHeaders = ["", ...seriesHeaders];
  const aoa: string[][] = [];

  for (let i_pane = 0; i_pane < paneHeaders.length; i_pane++) {
    // Add cell header as a grouping row
    if (i_pane > 0) {
      aoa.push(new Array(seriesHeaders.length + 1).fill("")); // Empty row for spacing
    }

    aoa.push([
      paneHeaders[i_pane],
      ...new Array(seriesHeaders.length).fill(""),
    ]); // Cell header row

    if (hasMultipleColGroups) {
      // Multiple colGroups - create hierarchical structure
      for (let i_lane = 0; i_lane < laneHeaders.length; i_lane++) {
        if (i_lane > 0) {
          aoa.push(new Array(seriesHeaders.length + 1).fill("")); // Empty row for spacing
        }

        aoa.push([
          `  ${laneHeaders[i_lane]}`,
          ...new Array(seriesHeaders.length).fill(""),
        ]); // Indent for lane

        // Add dimension rows for this lane
        for (
          let i_dimension = 0;
          i_dimension < dimensionHeaders.length;
          i_dimension++
        ) {
          const row: string[] = [`    ${dimensionHeaders[i_dimension]}`]; // Double indent for dimensions

          for (let i_series = 0; i_series < seriesHeaders.length; i_series++) {
            const value = values[i_pane]?.[0]?.[i_lane]?.[i_series]
              ?.[i_dimension];

            if (value !== undefined) {
              const valueInfo: GenericValueInfo = {
                i_series,
                seriesHeader: seriesHeaders[i_series],
                nSerieses: seriesHeaders.length,
                seriesValArrays: [], // Not needed for formatting
                nVals: nDimensions,
                i_lane,
                nLanes: laneHeaders.length,
                i_tier: 0,
                nTiers,
                i_pane,
                nPanes: paneHeaders.length,
                val: value,
                i_val: i_dimension,
              };
              const formattedValue = dataLabelFormatter(valueInfo);
              row.push(formattedValue || "");
            } else {
              row.push("");
            }
          }
          aoa.push(row);
        }
      }
    } else {
      // Single lane - original logic
      for (
        let i_dimension = 0;
        i_dimension < dimensionHeaders.length;
        i_dimension++
      ) {
        const row: string[] = [`  ${dimensionHeaders[i_dimension]}`]; // Indent for hierarchy

        for (let i_series = 0; i_series < seriesHeaders.length; i_series++) {
          const value = values[i_pane]?.[0]?.[0]?.[i_series]?.[i_dimension];

          if (value !== undefined) {
            const valueInfo: GenericValueInfo = {
              i_series,
              seriesHeader: seriesHeaders[i_series],
              nSerieses: seriesHeaders.length,
              seriesValArrays: [], // Not needed for formatting
              nVals: nDimensions,
              i_lane: 0,
              nLanes: laneHeaders.length,
              i_tier: 0,
              nTiers,
              i_pane,
              nPanes: paneHeaders.length,
              val: value,
              i_val: i_dimension,
            };
            const formattedValue = dataLabelFormatter(valueInfo);
            row.push(formattedValue || "");
          } else {
            row.push("");
          }
        }
        aoa.push(row);
      }
    }
  }

  return new Csv<string>({
    colHeaders,
    aoa,
  });
}
