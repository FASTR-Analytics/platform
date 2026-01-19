# CSV Query Examples

## Basic Setup

```typescript
import { Csv, query } from "@timroberton/panther";

const csv = Csv.fromString(`
name,region,sales,quantity
Alice,North,100,10
Bob,South,200,20
Carol,North,150,15
Dave,South,300,30
Eve,North,250,25
`);
```

## Filtering with `where()`

### Object filter (match values)

```typescript
const northOnly = query(csv)
  .where({ region: ["North"] })
  .execute();
// Returns rows where region === "North"
```

### Multiple allowed values

```typescript
const northOrSouth = query(csv)
  .where({ region: ["North", "South"] })
  .execute();
```

### Multiple columns

```typescript
const filtered = query(csv)
  .where({ region: ["North"], name: ["Alice", "Carol"] })
  .execute();
// Both conditions must match (AND)
```

### Custom predicate

```typescript
const highSales = query(csv)
  .where((row, i) => Number(row[2]) > 150)
  .execute();
```

### Chained filters (AND)

```typescript
const result = query(csv)
  .where({ region: ["North"] })
  .where((row) => Number(row[2]) > 100)
  .execute();
// region === "North" AND sales > 100
```

## Grouping and Aggregation

Note: `groupBy()` always produces `Csv<string>` results.

### Group with SUM

```typescript
const byRegion = query(csv)
  .groupBy(["region"])
  .sum("sales")
  .execute();
// Result columns: region, sales_sum
```

### Multiple aggregates

```typescript
const stats = query(csv)
  .groupBy(["region"])
  .sum("sales")
  .avg("sales")
  .count("sales")
  .min("sales")
  .max("sales")
  .median("sales")
  .countDistinct("name")
  .first("name")
  .last("name")
  .execute();
// Result columns: region, sales_sum, sales_avg, sales_count, sales_min, sales_max,
//                 sales_median, name_distinct, name_first, name_last
```

### Custom output column names

```typescript
const named = query(csv)
  .groupBy(["region"])
  .sum("sales", "total_sales")
  .avg("sales", "average_sale")
  .execute();
// Result columns: region, total_sales, average_sale
```

### Multi-column groupBy

```typescript
const byRegionAndName = query(csv)
  .groupBy(["region", "name"])
  .sum("sales")
  .execute();
```

## Sorting with `orderBy()`

### Ascending (default)

```typescript
const sorted = query(csv)
  .orderBy("sales")
  .execute();
```

### Descending

```typescript
const sortedDesc = query(csv)
  .orderBy("sales", "desc")
  .execute();
```

### Sort aggregated results

```typescript
const topRegions = query(csv)
  .groupBy(["region"])
  .sum("sales", "total")
  .orderBy("total", "desc")
  .execute();
```

### Multi-column sorting

```typescript
const sorted = query(csv)
  .orderBy([
    { col: "region", dir: "asc" },
    { col: "sales", dir: "desc" },
  ])
  .execute();
// Sorts by region ascending, then by sales descending within each region
```

## Complete Example

```typescript
const report = query(csv)
  .where({ region: ["North", "South"] })
  .where((row) => Number(row[3]) >= 15) // quantity >= 15
  .groupBy(["region"])
  .sum("sales", "total_sales")
  .avg("sales", "avg_sale")
  .count("sales", "num_transactions")
  .orderBy("total_sales", "desc")
  .execute();
```

## Using groupBy as DISTINCT

Without aggregates, `groupBy()` returns unique combinations of the specified
columns:

```typescript
const uniqueRegions = query(csv)
  .groupBy(["region"])
  .execute();
// Returns unique region values
```

## Error Handling

### Empty set aggregates

```typescript
// SUM on empty set returns "0"
// AVG, MIN, MAX, MEDIAN on empty set throw an error:
// Error: Cannot compute AVG on empty set for column "sales"
```

### Aggregates without groupBy

```typescript
// Throws: Error: Aggregate functions require groupBy() to be called first
query(csv).sum("sales").execute();
```

### Multiple groupBy or orderBy calls

```typescript
// Throws: Error: groupBy() can only be called once
query(csv).groupBy(["region"]).groupBy(["name"]).execute();

// Throws: Error: orderBy() can only be called once
query(csv).orderBy("sales").orderBy("name").execute();
```

### Empty groupBy

```typescript
// Throws: Error: groupBy() requires at least one column
query(csv).groupBy([]).execute();
```

### Column not found

```typescript
// Throws: Error: Column not found: nonexistent
query(csv).where({ nonexistent: ["value"] }).execute();

// Throws: Error: Group by column not found: nonexistent
query(csv).groupBy(["nonexistent"]).execute();

// Throws: Error: Order by column not found: nonexistent
query(csv).orderBy("nonexistent").execute();
```
