// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// PapaParse-compatible CSV stringifier
// Implements smart quoting and configurable options matching PapaParse behavior

export interface StringifyOptions {
  delimiter?: string; // Field delimiter (default: ",")
  newline?: string; // Line terminator (default: "\n")
  quoteChar?: string; // Character used to quote fields (default: '"')
  escapeChar?: string; // Character used to escape quotes (default: '"')
  header?: boolean; // Include header row (default: true if data has headers)
  columns?: string[]; // Specify which columns to include
  bom?: boolean; // Add UTF-8 BOM (default: false)
}

const DEFAULT_OPTIONS: Required<Omit<StringifyOptions, "header" | "columns">> =
  {
    delimiter: ",",
    newline: "\n",
    quoteChar: '"',
    escapeChar: '"',
    bom: false,
  };

// Cache for compiled regex patterns
const regexCache = new Map<string, RegExp>();

/**
 * Converts a 2D array to CSV string format, matching PapaParse behavior
 *
 * Key behaviors:
 * - Only quotes fields when necessary (contains delimiter, quote, or newline)
 * - Preserves whitespace (no trimming)
 * - Handles null/undefined as empty strings
 * - Escapes quotes by doubling them
 * - Optionally adds UTF-8 BOM for Excel compatibility
 *
 * @param data - 2D array of data to stringify
 * @param options - Configuration options
 * @returns CSV formatted string
 */
export function stringifyCsv(
  data: unknown[][],
  options: StringifyOptions = {},
): string {
  if (!data || data.length === 0) {
    return "";
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { delimiter, newline, quoteChar, escapeChar, bom } = opts;

  let result: string;

  // Optimize for small datasets with functional approach
  if (data.length < 1000) {
    result = stringifyCsvFunctional(
      data,
      delimiter,
      newline,
      quoteChar,
      escapeChar,
    );
  } else {
    // Use optimized string builder for large datasets
    result = stringifyCsvOptimized(
      data,
      delimiter,
      newline,
      quoteChar,
      escapeChar,
    );
  }

  // Add BOM if requested
  return bom ? "\ufeff" + result : result;
}

/**
 * Functional approach for smaller datasets (clean and readable)
 */
function stringifyCsvFunctional(
  data: unknown[][],
  delimiter: string,
  newline: string,
  quoteChar: string,
  escapeChar: string,
): string {
  // Pre-compile regex for quote replacement
  const quoteRegexKey = `quote_${quoteChar}_${escapeChar}`;
  let quoteRegex = regexCache.get(quoteRegexKey);
  if (!quoteRegex) {
    quoteRegex = new RegExp(escapeRegExp(quoteChar), "g");
    regexCache.set(quoteRegexKey, quoteRegex);
  }

  const stringifier = createOptimizedStringifier(
    delimiter,
    newline,
    quoteChar,
    escapeChar,
    quoteRegex,
  );

  return data.map((row) => row.map(stringifier).join(delimiter)).join(newline);
}

/**
 * Optimized string builder approach for large datasets
 */
function stringifyCsvOptimized(
  data: unknown[][],
  delimiter: string,
  newline: string,
  quoteChar: string,
  escapeChar: string,
): string {
  // Pre-compile regex for quote replacement
  const quoteRegexKey = `quote_${quoteChar}_${escapeChar}`;
  let quoteRegex = regexCache.get(quoteRegexKey);
  if (!quoteRegex) {
    quoteRegex = new RegExp(escapeRegExp(quoteChar), "g");
    regexCache.set(quoteRegexKey, quoteRegex);
  }

  const stringifier = createOptimizedStringifier(
    delimiter,
    newline,
    quoteChar,
    escapeChar,
    quoteRegex,
  );

  const parts: string[] = [];
  let currentSize = 0;

  for (let i = 0; i < data.length; i++) {
    if (i > 0) {
      parts.push(newline);
      currentSize += newline.length;
    }

    const row = data[i];
    for (let j = 0; j < row.length; j++) {
      if (j > 0) {
        parts.push(delimiter);
        currentSize += delimiter.length;
      }

      const cell = stringifier(row[j]);
      parts.push(cell);
      currentSize += cell.length;

      // Consolidate parts periodically to avoid too many small strings
      if (currentSize > 100000 && parts.length > 1000) {
        const consolidated = parts.join("");
        parts.length = 0;
        parts.push(consolidated);
        currentSize = consolidated.length;
      }
    }
  }

  return parts.join("");
}

/**
 * Creates an optimized stringifier function with pre-computed values
 */
function createOptimizedStringifier(
  delimiter: string,
  newline: string,
  quoteChar: string,
  escapeChar: string,
  quoteRegex: RegExp,
): (value: unknown) => string {
  // Pre-compute doubles for common case
  const doubleQuote = escapeChar + quoteChar;

  return function stringifyCell(value: unknown): string {
    // Fast null/undefined check
    if (value == null) {
      return "";
    }

    // Convert to string
    const strValue = String(value);

    // Fast path for empty strings
    if (strValue === "") {
      return "";
    }

    // Optimized check for special characters
    let needsQuote = false;
    let hasQuote = false;

    for (let i = 0; i < strValue.length; i++) {
      const char = strValue[i];
      if (char === delimiter || char === newline) {
        needsQuote = true;
        if (hasQuote) break; // Already know we need both
      } else if (char === quoteChar) {
        needsQuote = true;
        hasQuote = true;
      }
    }

    // Fast path: no special characters
    if (!needsQuote) {
      return strValue;
    }

    // Quote the field and escape any quotes within
    const escaped = hasQuote
      ? strValue.replace(quoteRegex, doubleQuote)
      : strValue;

    return quoteChar + escaped + quoteChar;
  };
}

/**
 * Escape special regex characters
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Converts data with headers to CSV string format
 * This is a convenience function that handles the common case of data with column headers
 *
 * @param data - Array of objects or 2D array with headers in first row
 * @param options - Configuration options
 * @returns CSV formatted string
 */
export function stringifyCsvWithHeaders(
  data: Record<string, unknown>[] | unknown[][],
  options: StringifyOptions = {},
): string {
  if (!data || data.length === 0) {
    return options.bom ? "\ufeff" : "";
  }

  // Handle array of objects
  if (!Array.isArray(data[0])) {
    const records = data as Record<string, unknown>[];
    const columns = options.columns || Object.keys(records[0]);

    const rows: unknown[][] = [
      columns, // Header row
      ...records.map((record) => columns.map((col) => record[col])),
    ];

    return stringifyCsv(rows, options);
  }

  // Handle 2D array (assume first row is headers)
  return stringifyCsv(data as unknown[][], options);
}
