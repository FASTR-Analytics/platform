# DHIS2 Integration Module

This module provides comprehensive integration with DHIS2 health information systems, organized by three main goals as defined in the DHIS2_STRATEGY.md document.

## Structure

```
src/dhis2/
├── common/                 # Shared utilities
│   ├── base_fetcher.ts    # Base HTTP client with auth
│   ├── retry_utils.ts     # Retry logic with exponential backoff
│   └── mod.ts            # Common exports
│
├── goal1_org_units/       # GOAL 1: Fetch organizational units (facilities)
│   ├── get_org_units_from_dhis2.ts
│   ├── types.ts          # TypeScript types for org units
│   ├── utils.ts          # Hierarchy validation and tree building
│   ├── examples/         # 7 runnable examples
│   └── mod.ts           # Goal 1 exports
│
├── goal2_indicators/      # GOAL 2: Fetch indicators and data elements
│   ├── get_indicators_from_dhis2.ts (placeholder)
│   └── mod.ts           # Goal 2 exports
│
├── goal3_analytics/       # GOAL 3: Query analytics data
│   ├── get_json_from_dhis2.ts      # Original analytics fetcher
│   ├── get_analytics_from_dhis2.ts # Enhanced analytics with batching
│   └── mod.ts                      # Goal 3 exports
│
└── mod.ts                # Main module exports
```

## Usage

### Import Everything
```typescript
import * from "./dhis2/mod.ts";
```

### Import Specific Goals
```typescript
// GOAL 1: Organization Units
import { getOrgUnitsFromDHIS2, testDHIS2Connection } from "./dhis2/goal1_org_units_v2/mod.ts";

// GOAL 2: Indicators (to be implemented)
import { getIndicatorsFromDHIS2 } from "./dhis2/goal2_indicators/mod.ts";

// GOAL 3: Analytics Data
import { getAnalyticsFromDHIS2 } from "./dhis2/goal3_analytics/mod.ts";

// Common utilities
import { withRetry, fetchFromDHIS2 } from "./dhis2/common/mod.ts";
```

## Goals

### GOAL 1: Organization Units ✅ IMPLEMENTED
Fetch health facilities and administrative hierarchy from DHIS2.

**Key Functions:**
- `getOrgUnitsFromDHIS2()` - Fetch all org units
- `getOrgUnitHierarchyFromDHIS2()` - Build complete hierarchy
- `getOrgUnitsAtLevelFromDHIS2()` - Get facilities at specific level
- `testDHIS2Connection()` - Test connectivity

**Examples:** 7 working examples in `goal1_org_units/examples/`

### GOAL 2: Indicators 🚧 TODO
Discover and map indicators/data elements.

**Planned Functions:**
- `getDataElementsFromDHIS2()` - Fetch data elements
- `getIndicatorsFromDHIS2()` - Fetch indicators
- `searchIndicatorsFromDHIS2()` - Search by name/code

### GOAL 3: Analytics Data ✅ IMPLEMENTED
Query data for specific facilities, indicators, and time periods.

**Key Functions:**
- `getAnalyticsFromDHIS2()` - Enhanced analytics fetcher with retry logic
- `getAnalyticsBatched()` - Handle large requests with automatic batching
- `extractDataValues()` - Helper to parse response data

## Configuration

Set environment variables:
```bash
export DHIS2_URL=https://your.dhis2.instance/dhis
export DHIS2_USERNAME=your_username
export DHIS2_PASSWORD=your_password
```

## Features

- **Automatic retry** with exponential backoff
- **Type-safe** with full TypeScript support
- **Batch processing** for large datasets
- **Hierarchy validation** for org units
- **Progress callbacks** for long operations
- **URL encoding** handled automatically
- **Error categorization** (network vs auth vs data)

## Testing

Run examples for GOAL 1:
```bash
cd goal1_org_units/examples
deno run --allow-net --allow-env --allow-read 01_test_connection.ts
```

Run all tests:
```bash
cd goal1_org_units/examples
DHIS2_URL=... DHIS2_USERNAME=... DHIS2_PASSWORD=... deno run --allow-net --allow-env --allow-read run_all_tests.ts
```

## Read-Only Operations

All functions in this module are **READ-ONLY** and will not modify any data on the DHIS2 instance. They only fetch and read information.