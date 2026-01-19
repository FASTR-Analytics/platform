# CSV Query Builder Guide

A fluent query builder for filtering, grouping, and aggregating CSV data.

## Overview

The query builder provides a SQL-like interface for working with `Csv` objects:

```typescript
import { Csv, query } from "@timroberton/panther";

const result = query(csv)
  .where({ status: ["active"] })
  .groupBy(["region"])
  .sum("revenue", "total_revenue")
  .orderBy("total_revenue", "desc")
  .execute();
```

## Query Pipeline

Queries execute in a fixed order regardless of method call order:

1. **where** - Filter rows
2. **groupBy** - Group and aggregate
3. **orderBy** - Sort results

This means `.orderBy()` always operates on the final result, even if called
before `.groupBy()`.

## Methods

### `where(filter)`

Filters rows. Can be called multiple times (conditions are ANDed).

**Object filter** - Match column values:

```typescript
.where({ region: ["North", "South"] })  // region IN ("North", "South")
.where({ status: ["active"], type: ["premium"] })  // AND across columns
```

**Predicate filter** - Custom function:

```typescript
.where((row, index) => Number(row[2]) > 100)
```

### `groupBy(columns)`

Groups rows by specified columns. Can only be called once.

- Returns `Csv<string>` (all values stringified)
- Without aggregates, acts like `SELECT DISTINCT`
- With aggregates, computes values per group

### Aggregates

Must be used with `groupBy()`. Each takes a column name and optional output
column name.

| Method                        | Behavior on empty set           |
| ----------------------------- | ------------------------------- |
| `sum(col, output?)`           | Returns `"0"`                   |
| `avg(col, output?)`           | Throws error                    |
| `count(col, output?)`         | Returns row count (never empty) |
| `min(col, output?)`           | Throws error                    |
| `max(col, output?)`           | Throws error                    |
| `median(col, output?)`        | Throws error                    |
| `countDistinct(col, output?)` | Returns `"0"`                   |
| `first(col, output?)`         | Returns `""`                    |
| `last(col, output?)`          | Returns `""`                    |

Default output column names: `{col}_sum`, `{col}_avg`, `{col}_median`,
`{col}_distinct`, `{col}_first`, `{col}_last`, etc.

### `orderBy(column, direction?)` or `orderBy(specs[])`

Sorts results. Can only be called once.

**Single column:**

```typescript
.orderBy("sales", "desc")
```

**Multi-column:**

```typescript
.orderBy([
  { col: "region", dir: "asc" },
  { col: "sales", dir: "desc" }
])
```

- `direction`/`dir`: `"asc"` (default) or `"desc"`
- Numeric values sorted numerically
- String values sorted with `localeCompare`

### `execute()`

Runs the query and returns a new `Csv`.

## Type Handling

- Input can be `Csv<T>` of any type
- `where()` preserves the input type
- `groupBy()` always produces `Csv<string>` (keys and aggregates are
  stringified)
- Numeric comparisons in `where()` handle string-to-number conversion
  automatically

## Common Patterns

### Filter and sort (no grouping)

```typescript
query(csv)
  .where({ active: ["true"] })
  .orderBy("created_at", "desc")
  .execute();
```

### Aggregate entire dataset

Group by a constant or use a single-value column:

```typescript
// Add a constant column first, or group by existing single-value column
const withConst = csv.mapCells((v, r, c) => c === 0 ? "all" : v);
query(withConst).groupBy(["constant"]).sum("amount").execute();
```

### Get distinct values

```typescript
query(csv).groupBy(["category"]).execute();
```

### Top N by aggregate

```typescript
query(csv)
  .groupBy(["product"])
  .sum("sales", "total")
  .orderBy("total", "desc")
  .execute()
  .selectRows([0, 1, 2, 3, 4]); // top 5
```

## Limitations

- No `having` clause (filter after aggregation)
- No `limit`/`offset` in query (use `.head()` or `.slice()` on result)
- No joins (combine CSVs with `appendCols()` before querying)

See [EXAMPLES.md](./EXAMPLES.md) for more code samples.
