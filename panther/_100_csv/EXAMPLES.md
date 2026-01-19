# CSV Class Examples

## Exploration Methods

### head / tail / limit

```typescript
csv.head(); // First 5 rows (default)
csv.head(10); // First 10 rows
csv.tail(10); // Last 10 rows
csv.limit(100); // Alias for head(100)
```

### slice

```typescript
csv.slice(5, 15); // Rows 5-14 (exclusive end)
csv.slice(10); // Rows 10 to end
```

### sample

```typescript
csv.sample(100); // 100 random rows (without replacement)
```

## Transform Methods

### rename

```typescript
csv.rename({ oldName: "newName", another: "renamed" });
```

### dropCols

```typescript
csv.dropCols(["temp", "unused"]);
csv.dropCols([0, 2]); // By index
```

### addCol

```typescript
csv.addCol("fullName", (row, i) => `${row[0]} ${row[1]}`);
csv.addCol("total", (row) => String(Number(row[1]) + Number(row[2])));
```

### sortBy / sortByMultiple

```typescript
// Single column
csv.sortBy("name");
csv.sortBy("sales", "desc");

// Multiple columns
csv.sortByMultiple([
  { col: "region", dir: "asc" },
  { col: "sales", dir: "desc" },
]);
```

### unique

```typescript
csv.unique(); // Dedupe by all columns
csv.unique(["email"]); // Dedupe by specific columns
csv.unique(["firstName", "lastName"]);
```

## Pivot / Unpivot

### pivot (long → wide)

Transform long format data into wide format:

```typescript
// Input (long format):
// date,       metric,  value
// 2024-01,    sales,   100
// 2024-01,    cost,    80
// 2024-02,    sales,   120
// 2024-02,    cost,    90

csv.pivot({
  index: "date",
  columns: "metric",
  values: "value",
});

// Output (wide format):
// date,       cost,  sales
// 2024-01,    80,    100
// 2024-02,    90,    120
```

With aggregation:

```typescript
csv.pivot({
  index: ["year", "region"],
  columns: "product",
  values: "revenue",
  aggFunc: "sum", // sum, avg, count, min, max, first (default)
});
```

### unpivot (wide → long)

Transform wide format data into long format:

```typescript
// Input (wide format):
// date,       jan,  feb,  mar
// 2024,       100,  120,  90

csv.unpivot({
  index: "date",
  valueColumns: ["jan", "feb", "mar"],
  varName: "month",
  valueName: "amount",
});

// Output (long format):
// date,  month,  amount
// 2024,  jan,    100
// 2024,  feb,    120
// 2024,  mar,    90
```

## Chaining Methods

All methods return a new `Csv`, so you can chain them:

```typescript
csv
  .dropCols(["temp", "unused"])
  .rename({ old_name: "newName" })
  .sortBy("date", "desc")
  .unique(["id"])
  .head(100);
```

## Combined with Query Builder

```typescript
import { Csv, query } from "@timroberton/panther";

const result = query(csv)
  .where({ status: ["active"] })
  .groupBy(["region"])
  .sum("sales", "total")
  .execute()
  .sortBy("total", "desc")
  .head(10);
```
