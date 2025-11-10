# GOAL 2: Indicators and Data Elements

This module will provide functions for discovering and managing indicators and data elements from DHIS2 instances.

## Overview

DHIS2 uses two main concepts for data:
- **Data Elements**: Basic units of data collection (e.g., "Number of malaria cases")
- **Indicators**: Calculated values from data elements (e.g., "Malaria incidence rate per 1000")

## Status

🚧 **NOT YET IMPLEMENTED** - This module is a placeholder for future development.

## Planned Features

### Data Elements
- Fetch all data elements with metadata
- Search data elements by name or code
- Get data element groups and categories
- Filter by domain type (aggregate, tracker)
- Map to internal common indicators

### Indicators
- Fetch all indicators with formulas
- Get indicator types and factors
- Search indicators by name or code
- Get indicator groups and group sets
- Understand numerator/denominator expressions

### Mapping
- Map DHIS2 data elements to internal indicators
- Handle category combinations
- Support disaggregations
- Manage indicator versioning

## Planned Functions

```typescript
// Data Elements
getDataElementsFromDHIS2(): Promise<DHIS2DataElement[]>
getDataElementByIdFromDHIS2(id: string): Promise<DHIS2DataElement>
searchDataElementsFromDHIS2(query: string): Promise<DHIS2DataElement[]>
getDataElementGroupsFromDHIS2(): Promise<DHIS2DataElementGroup[]>

// Indicators
getIndicatorsFromDHIS2(): Promise<DHIS2Indicator[]>
getIndicatorByIdFromDHIS2(id: string): Promise<DHIS2Indicator>
searchIndicatorsFromDHIS2(query: string): Promise<DHIS2Indicator[]>
getIndicatorGroupsFromDHIS2(): Promise<DHIS2IndicatorGroup[]>

// Categories
getCategoriesFromDHIS2(): Promise<DHIS2Category[]>
getCategoryCombosFromDHIS2(): Promise<DHIS2CategoryCombo[]>
```

## Planned Data Structures

### DHIS2DataElement
```typescript
interface DHIS2DataElement {
  id: string;
  name: string;
  displayName: string;
  code?: string;
  shortName?: string;
  aggregationType?: string;      // SUM, AVERAGE, COUNT, etc.
  domainType?: string;          // AGGREGATE, TRACKER
  valueType?: string;           // NUMBER, TEXT, BOOLEAN, etc.
  categoryCombo?: {
    id: string;
    name: string;
    categories: DHIS2Category[];
  };
  dataElementGroups?: Array<{
    id: string;
    name: string;
  }>;
}
```

### DHIS2Indicator
```typescript
interface DHIS2Indicator {
  id: string;
  name: string;
  displayName: string;
  code?: string;
  numerator: string;           // Expression
  numeratorDescription?: string;
  denominator: string;         // Expression
  denominatorDescription?: string;
  annualized: boolean;
  indicatorType: {
    id: string;
    name: string;
    factor: number;           // Multiplication factor
  };
  indicatorGroups?: Array<{
    id: string;
    name: string;
  }>;
}
```

## Implementation Plan

1. **Phase 1**: Basic fetching
   - Implement data element fetching
   - Add search functionality
   - Support pagination

2. **Phase 2**: Indicators
   - Fetch indicators with formulas
   - Parse expressions
   - Handle indicator types

3. **Phase 3**: Mapping
   - Create mapping interface
   - Store mappings in database
   - Support bulk mapping

4. **Phase 4**: Categories
   - Handle disaggregations
   - Support category combinations
   - Manage category options

## Integration with App

Once implemented, this module will integrate with:
- `src/db/instance/indicators.ts` - Store indicator mappings
- `src/lib/types/indicators.ts` - Type definitions
- GOAL 3 analytics - Use discovered indicators for data queries

## API Endpoints

Will use these DHIS2 API endpoints:
- `/api/dataElements.json` - Data elements
- `/api/indicators.json` - Indicators
- `/api/dataElementGroups.json` - Data element groups
- `/api/indicatorGroups.json` - Indicator groups
- `/api/categories.json` - Categories
- `/api/categoryCombos.json` - Category combinations

## Examples

Examples will be added when implementation is complete.

## Files

- **get_indicators_from_dhis2.ts** - Main implementation (placeholder)
- **mod.ts** - Module exports

## Next Steps

To implement this module:
1. Review DHIS2 API documentation for data elements and indicators
2. Create type definitions based on actual API responses
3. Implement basic fetching functions
4. Add search and filtering capabilities
5. Create mapping utilities
6. Add examples and tests