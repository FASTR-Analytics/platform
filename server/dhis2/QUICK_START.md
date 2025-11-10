# DHIS2 Integration - Quick Start Guide

## Setup

1. **Set environment variables:**
```bash
export DHIS2_URL=https://your.dhis2.org/dhis
export DHIS2_USERNAME=your_username  
export DHIS2_PASSWORD=your_password
```

2. **Import the module:**
```typescript
import * as dhis2 from "./dhis2/mod.ts";
```

## Quick Examples

### Test Connection
```typescript
const test = await dhis2.testDHIS2Connection();
if (test.success) {
  console.log(`Connected to DHIS2 v${test.details.version}`);
}
```

### Get Health Facilities
```typescript
// Get all facilities at the lowest level
const levels = await dhis2.getOrgUnitLevelsFromDHIS2();
const facilityLevel = levels.length;
const facilities = await dhis2.getOrgUnitsAtLevelFromDHIS2(facilityLevel);
console.log(`Found ${facilities.length} health facilities`);
```

### Query Analytics Data
```typescript
const data = await dhis2.getAnalyticsFromDHIS2({
  dataElements: ["BCG_DOSES"],
  orgUnits: ["FACILITY_ID"],
  periods: ["202301"]
});
console.log(`Retrieved ${data.rows.length} data points`);
```

## Module Structure

```
dhis2/
├── common/          → Shared utilities (retry, auth, fetcher)
├── goal1_org_units/ → ✅ Fetch facilities and hierarchy
├── goal2_indicators/→ 🚧 Discover indicators (TODO)
├── goal3_analytics/ → ✅ Query data
└── mod.ts          → Main exports
```

## Status by Goal

| Goal | Status | Description | Key Functions |
|------|--------|-------------|---------------|
| **GOAL 1** | ✅ Complete | Fetch org units & facilities | `getOrgUnitsFromDHIS2()`, `getOrgUnitHierarchyFromDHIS2()` |
| **GOAL 2** | 🚧 TODO | Discover indicators | `getIndicatorsFromDHIS2()` (planned) |
| **GOAL 3** | ✅ Complete | Query analytics data | `getAnalyticsFromDHIS2()` |

## Running Examples

```bash
# Test connection to DHIS2
cd goal1_org_units/examples
deno run --allow-net --allow-env --allow-read 01_test_connection.ts

# Run all org unit tests
deno run --allow-net --allow-env --allow-read run_all_tests.ts

# Test analytics
cd ../../goal3_analytics/examples
deno run --allow-net --allow-env --allow-read test_analytics.ts
```

## Key Features

- 🔄 **Automatic retry** with exponential backoff
- 📊 **Pagination support** for large datasets
- 🏗️ **Hierarchy validation** for org units
- 📦 **Batch processing** for analytics
- 🔒 **Type-safe** with TypeScript
- 📖 **Well documented** with examples
- ✅ **Tested** against real DHIS2 instances

## Common Patterns

### With Retry
```typescript
import { withRetry } from "./dhis2/common/mod.ts";

const data = await withRetry(
  () => fetchData(),
  { maxAttempts: 5 }
);
```

### With Progress
```typescript
const hierarchy = await dhis2.getOrgUnitHierarchyFromDHIS2({
  onProgress: (msg) => console.log(msg)
});
```

### With Batching
```typescript
const data = await dhis2.getAnalyticsBatched({
  dataElements: ["DE1"],
  orgUnits: manyOrgUnits, // Auto-batches if > 50
  periods: ["2023"]
}, 50);
```

## Error Handling

All functions handle:
- Network failures (retry automatically)
- Authentication errors (throw immediately)
- Rate limiting (retry with backoff)
- Invalid data (throw with details)

## Documentation

- **[README.md](./README.md)** - Main documentation
- **[DHIS2_STRATEGY.md](./DHIS2_STRATEGY.md)** - Original requirements
- **[goal1_org_units/README.md](./goal1_org_units/README.md)** - Org units guide
- **[goal3_analytics/README.md](./goal3_analytics/README.md)** - Analytics guide
- **[common/README.md](./common/README.md)** - Utilities guide

## Support

For issues or questions:
1. Check the examples in each goal's `examples/` folder
2. Review the README files for detailed documentation
3. Test with `testDHIS2Connection()` to verify credentials
4. Use `logRequest: true` option for debugging

## Next Steps

1. ✅ Use GOAL 1 to fetch and import facility lists
2. 🚧 Implement GOAL 2 when indicator discovery is needed
3. ✅ Use GOAL 3 to query data for reports and analytics