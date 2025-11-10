# GOAL 3: Analytics Data

This module provides functions for querying analytics data from DHIS2 instances for specific facilities, indicators, and time periods.

## Overview

The analytics API is DHIS2's primary interface for retrieving aggregated data. It supports:
- Multiple dimensions (data, period, organization unit)
- Aggregation across hierarchies
- Various output formats
- Filtering and disaggregation

## Status

✅ **FULLY IMPLEMENTED** - Two implementations available for different use cases.

## Key Features

- ✅ Query data by data elements, org units, and periods
- ✅ Support for both indicators and data elements
- ✅ Automatic URL encoding
- ✅ Batch processing for large requests
- ✅ Retry logic with exponential backoff
- ✅ Backward compatibility with existing code
- ✅ Enhanced error reporting
- ✅ Generic type support

## Available Functions

### Legacy Implementation (Deprecated)
**get_json_from_dhis2.ts** - ⚠️ **DEPRECATED** - Use getAnalyticsFromDHIS2 instead
- `getJsonFromDHIS2()` - ⚠️ Deprecated: Use getAnalyticsFromDHIS2
- `getJsonFromDHIS2WithRetry()` - ⚠️ Deprecated: Use getAnalyticsFromDHIS2

### Enhanced Implementation  
**get_analytics_from_dhis2.ts** - More features and flexibility
- `getAnalyticsFromDHIS2()` - Enhanced fetcher with more options
- `getAnalyticsBatched()` - Automatic batching for large requests
- `getAnalyticsWithRetry()` - Combined retry and batching
- `extractDataValues()` - Helper to parse response data

## Usage Examples

### Basic Usage
```typescript
import { getAnalyticsFromDHIS2 } from "./mod.ts";

const data = await getAnalyticsFromDHIS2({
  dataElements: ["BCG_GIVEN", "MEASLES_GIVEN"],
  orgUnits: ["OU123", "OU456"],
  periods: ["202301", "202302", "202303"]
});

console.log(`Fetched ${data.rows.length} data rows`);
```

### Enhanced Usage
```typescript
import { getAnalyticsFromDHIS2 } from "./mod.ts";

const data = await getAnalyticsFromDHIS2({
  dataElements: ["BCG_GIVEN", "MEASLES_GIVEN"],
  indicators: ["ANC_COVERAGE"],  // Can mix indicators and data elements
  orgUnits: ["OU123", "OU456"],
  periods: ["202301", "202302"],
  aggregationType: "SUM",
  displayProperty: "NAME",
  skipMeta: false
});
```

### Batched Requests
```typescript
import { getAnalyticsBatched } from "./mod.ts";

// Automatically splits into batches if too many org units
const data = await getAnalyticsBatched({
  dataElements: ["BCG_GIVEN"],
  orgUnits: largeArrayOfOrgUnits, // Will batch if > 50
  periods: ["2023"]
}, 50); // Batch size
```

### Extract Data Values
```typescript
import { getAnalyticsFromDHIS2, extractDataValues } from "./mod.ts";

const response = await getAnalyticsFromDHIS2({...});
const values = extractDataValues(response);

// Returns array of:
// { dataElement: "id", orgUnit: "id", period: "202301", value: "123" }
```

## API Parameters

### Analytics Dimensions
- **dx** (Data): Data elements OR indicators
- **pe** (Period): Time periods (relative or fixed)
- **ou** (Organization Unit): Facility or admin unit IDs

### Period Formats
- Fixed: `202301` (January 2023)
- Relative: `LAST_MONTH`, `LAST_3_MONTHS`, `THIS_YEAR`
- Ranges: `202301:202312` (full year 2023)

### Additional Options
```typescript
interface AnalyticsParams {
  dataElements?: string[];      // Data element IDs
  indicators?: string[];         // Indicator IDs
  orgUnits?: string[];          // Organization unit IDs
  periods?: string[];           // Period specifications
  filter?: string[];            // Additional filters
  aggregationType?: string;     // SUM, AVERAGE, etc.
  skipMeta?: boolean;          // Skip metadata in response
  skipData?: boolean;          // Skip data rows (meta only)
  hierarchyMeta?: boolean;     // Include hierarchy metadata
  showHierarchy?: boolean;     // Show full org unit hierarchy
  displayProperty?: "NAME" | "SHORTNAME";
  outputIdScheme?: "UID" | "CODE" | "NAME";
}
```

## Response Structure

### DHIS2 Analytics Response
```typescript
interface DHIS2AnalyticsResponse {
  headers: Array<{
    name: string;        // Column identifier (dx, pe, ou, value)
    column: string;      // Display name
    type: string;        // Data type
    meta?: boolean;      // Is metadata column
  }>;
  metaData: {
    dimensions: Record<string, string[]>;  // Dimension items
    items: Record<string, {                // Item metadata
      name: string;
    }>;
  };
  rows: string[][];     // Data rows
}
```

### Example Response
```json
{
  "headers": [
    { "name": "dx", "column": "Data", "type": "java.lang.String" },
    { "name": "pe", "column": "Period", "type": "java.lang.String" },
    { "name": "ou", "column": "Organisation unit", "type": "java.lang.String" },
    { "name": "value", "column": "Value", "type": "java.lang.Double" }
  ],
  "rows": [
    ["BCG_GIVEN", "202301", "OU123", "456"],
    ["BCG_GIVEN", "202301", "OU456", "789"]
  ],
  "metaData": {
    "dimensions": {
      "dx": ["BCG_GIVEN"],
      "pe": ["202301"],
      "ou": ["OU123", "OU456"]
    },
    "items": {
      "BCG_GIVEN": { "name": "BCG doses given" },
      "202301": { "name": "January 2023" },
      "OU123": { "name": "Health Center A" }
    }
  }
}
```

## Differences Between Implementations

| Feature | get_json_from_dhis2 | get_analytics_from_dhis2 |
|---------|-------------------|------------------------|
| Parameters | Fixed (3 only) | Flexible (many options) |
| Indicators | ❌ No | ✅ Yes |
| Batching | ❌ No | ✅ Yes |
| URL Encoding | ❌ Manual | ✅ Automatic |
| Type Safety | Fixed types | Generic types |
| Backward Compatible | ✅ Yes | New interface |
| Error Detail | Basic | Enhanced |

## Performance Considerations

### URL Length Limits
- Most servers support ~2048 characters
- Use batching for large requests
- Consider POST requests for very large queries (future feature)

### Batching Strategy
- Default batch size: 50 org units
- Adjust based on URL length and server capacity
- Automatic delay between batches to avoid rate limiting

### Optimization Tips
- Use specific periods instead of relative (faster)
- Filter at source using DHIS2 filters
- Use skipMeta=true if metadata not needed
- Cache frequently accessed data

## Error Handling

Both implementations include:
- Automatic retry (up to 10 attempts for analytics)
- Exponential backoff with jitter
- Detailed error messages with context
- Request parameter logging on failure
- 4xx errors not retried (except 429)

## Examples

The `examples/` folder contains:
- **test_analytics.ts** - Basic analytics fetch test
- **compare_analytics_requests.ts** - Compare URL building between implementations

## Files

- **get_json_from_dhis2.ts** - Original implementation (backward compatible)
- **get_analytics_from_dhis2.ts** - Enhanced implementation with more features
- **mod.ts** - Module exports
- **examples/** - Working examples

## Integration with App

This module is already integrated with:
- Data fetching workflows in the app
- Module execution that queries DHIS2 data
- Caching layer for performance

## Migration Guide

To migrate from `getJsonFromDHIS2` to `getAnalyticsFromDHIS2`:

```typescript
// Old
getJsonFromDHIS2({
  dataElementIds: ["id1", "id2"],
  orgUnitIds: ["ou1"],
  periods: ["202301"]
})

// New (equivalent)
getAnalyticsFromDHIS2({
  dataElements: ["id1", "id2"],  // Note: renamed
  orgUnits: ["ou1"],              // Note: renamed
  periods: ["202301"]             // Same
})
```

The new implementation is backward compatible - both produce functionally identical requests.