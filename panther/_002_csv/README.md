# _002_csv

CSV data structure and manipulation utilities. Browser-compatible, zero external
dependencies.

## Purpose

Provides a powerful CSV data class and utilities for:

- Parsing and stringifying CSV data
- Combining multiple CSV files
- Comparing CSV data for differences
- Exporting data structures as CSV
- Type-safe CSV operations

## Key Exports

### CSV Class (`csv_class.ts`)

```typescript
class Csv {
  // Access data
  get rows(): string[][];
  get headers(): string[];
  get numRows(): number;
  get numCols(): number;

  // Query data
  getRow(index: number): string[];
  getColumn(header: string): string[];
  getValue(rowIndex: number, header: string): string;

  // Transform data
  filterRows(predicate: (row: string[]) => boolean): Csv;
  mapRows<T>(fn: (row: string[]) => T): T[];
  sortBy(header: string, order?: "asc" | "desc"): Csv;

  // Add/modify data
  addColumn(header: string, values: string[]): Csv;
  removeColumn(header: string): Csv;
  renameColumn(oldHeader: string, newHeader: string): Csv;
}
```

### Combining CSVs (`combine_csvs.ts`)

```typescript
combineCsvs(csvs: Csv[], options?: CombineOptions): Csv
```

Merge multiple CSV files with configurable join strategies.

### Comparing CSVs (`compare_csvs.ts`)

```typescript
compareCsvs(csv1: Csv, csv2: Csv): CsvComparisonResult
```

Find differences between two CSV files.

### Exporting Data (`export_data_as_csv.ts`)

```typescript
exportDataAsCsv(params: ExportDataAsCsvParams): string
```

Convert JavaScript data structures to CSV format.

### Stringifying (`stringify_csv.ts`)

```typescript
stringifyCsv(csv: Csv, options?: StringifyOptions): string
```

Convert CSV object to string with customizable formatting.

## Usage Example

```typescript
import { combineCsvs, Csv, exportDataAsCsv } from "@timroberton/panther";

// Create from data
const csv = new Csv({
  headers: ["name", "age", "city"],
  rows: [
    ["Alice", "30", "NYC"],
    ["Bob", "25", "LA"],
  ],
});

// Query data
const names = csv.getColumn("name");
const firstRow = csv.getRow(0);

// Filter and transform
const adults = csv.filterRows((row) =>
  parseInt(csv.getValue(row, "age")) >= 18
);

// Combine multiple CSVs
const combined = combineCsvs([csv1, csv2, csv3]);

// Export data structure
const csvString = exportDataAsCsv({
  data: users,
  columns: ["id", "name", "email"],
});
```

## Module Dependencies

Depends on `_000_utils` for array and assertion utilities.
