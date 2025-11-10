# DHIS2 Organization Units to HMIS Structure Mapping

## Overview

This document describes how DHIS2 organization units are mapped to the FASTR platform's structure format. The FASTR platform uses a standardized structure with admin areas (1-4) and facilities, while DHIS2 uses a flexible hierarchy with arbitrary levels.

## Core Principles

1. **Last path element is always facility_id**: The final element in any DHIS2 org unit path becomes the facility identifier
2. **Automatic admin area mapping**: Parent elements in the path are automatically mapped to admin_area_1 through admin_area_4 based on a simple heuristic
3. **No manual level mapping required**: The system automatically determines how to map DHIS2 levels to FASTR structure

## FASTR Structure Format

The FASTR platform expects this structure:

```typescript
{
  facility_id: string;        // Unique facility identifier
  admin_area_1: string;       // Highest level admin (e.g., Country)
  admin_area_2: string;       // Second level admin (e.g., Region)
  admin_area_3: string;       // Third level admin (e.g., District)
  admin_area_4: string;       // Fourth level admin (e.g., Sub-district)
  facility_name?: string;     // Optional facility name
  // ... other optional fields
}
```

## DHIS2 Input Format

DHIS2 provides organization units like this:

```typescript
{
  id: "abc123";
  name: "Health Center Name";
  displayName: "Health Center Display Name";
  level: 3;                   // DHIS2 level number
  path: "/countryId/regionId/abc123";  // Hierarchical path from root
  parent: {
    id: "regionId";
    name: "Region Name";
  };
  // ... other fields
}
```

## Mapping Algorithm

The mapping uses the platform's `maxAdminArea` configuration to determine how many admin area levels are available.

### Step 1: Parse Path

Extract elements from the DHIS2 path:

- Split by `/` and remove empty elements
- Last element = facility_id
- Remaining elements = parent hierarchy (admin areas)

### Step 2: Apply Mapping Heuristic

The algorithm depends on the relationship between path length and `maxAdminArea`:

#### Case 1: Path Length ≤ maxAdminArea

**Simple mapping** - Fill admin areas directly from path elements.

**Example**: maxAdminArea=3, path="/countryId/regionId/districtId/facilityId"

- Parent elements: [countryId, regionId, districtId] (length=3)
- admin_area_1 = countryId
- admin_area_2 = regionId  
- admin_area_3 = districtId
- facility_id = facilityId

#### Case 2: Path Length > maxAdminArea

**Truncate mapping** - Take first maxAdminArea elements, ignore middle ones.

**Example**: maxAdminArea=2, path="/countryId/regionId/districtId/subDistrictId/facilityId"

- Parent elements: [countryId, regionId, districtId, subDistrictId] (length=4)
- admin_area_1 = countryId
- admin_area_2 = regionId
- facility_id = facilityId
- *(districtId and subDistrictId are ignored)*

#### Case 3: Path Length < maxAdminArea  

**Prefix mapping** - Use available elements, then prefix remaining slots with penultimate element.

**Example**: maxAdminArea=4, path="/countryId/regionId/facilityId"

- Parent elements: [countryId, regionId] (length=2)
- admin_area_1 = countryId
- admin_area_2 = regionId
- admin_area_3 = "FACILITY AT LEVEL 3: regionId"
- admin_area_4 = "FACILITY AT LEVEL 3: regionId"
- facility_id = facilityId

The prefix format is: `"FACILITY AT LEVEL {facility_level}: {penultimate_name}"`

## Implementation Details

### Name Resolution

For each path element (parent ID), the system attempts to resolve the human-readable name:

1. **First**: Look up the org unit in the current batch
2. **Use**: `displayName` if available, otherwise `name`
3. **Fallback**: Use the raw ID if no name is found

### Selected Levels

The system only processes org units at explicitly selected DHIS2 levels:

```typescript
type StructureDhis2OrgUnitSelection = {
  selectedLevels: number[]; // e.g., [1, 2, 5] - only import these levels
}
```

All org units at the selected levels are treated as facilities, regardless of their position in the hierarchy.

### Batch Processing

The import processes DHIS2 data in batches for efficiency:

- Builds lookup maps for name resolution within each batch
- Handles large datasets without memory issues
- Provides progress tracking

## Examples

### Example 1: Standard 3-Level Hierarchy

**Configuration**: maxAdminArea=3  
**DHIS2 Data**:

- Level 1: Countries
- Level 2: Regions  
- Level 3: Health Centers

**Selection**: `selectedLevels: [3]`

**Input**: path="/ethiopia/amhara/healthcenter123"
**Output**:

```json
{
  "facility_id": "healthcenter123",
  "admin_area_1": "Ethiopia",
  "admin_area_2": "Amhara",
  "admin_area_3": "HealthCenter123",
  "admin_area_4": ""
}
```

### Example 2: Deep Hierarchy with Truncation

**Configuration**: maxAdminArea=2  
**DHIS2 Data**:

- Level 1: Country
- Level 2: Region
- Level 3: District  
- Level 4: Sub-district
- Level 5: Clinics

**Selection**: `selectedLevels: [5]`

**Input**: path="/ethiopia/amhara/northshewa/debrebirhan/clinic456"
**Output**:

```json
{
  "facility_id": "clinic456",
  "admin_area_1": "Ethiopia",
  "admin_area_2": "Amhara",
  "admin_area_3": "",
  "admin_area_4": ""
}
```

*(District and sub-district are ignored due to maxAdminArea=2)*

### Example 3: Shallow Hierarchy with Prefixing

**Configuration**: maxAdminArea=4  
**DHIS2 Data**:

- Level 1: Country
- Level 2: Health Centers (directly under country)

**Selection**: `selectedLevels: [2]`

**Input**: path="/rwanda/healthcenter789"
**Output**:

```json
{
  "facility_id": "healthcenter789",
  "admin_area_1": "Rwanda",
  "admin_area_2": "FACILITY AT LEVEL 2: Rwanda",
  "admin_area_3": "FACILITY AT LEVEL 2: Rwanda", 
  "admin_area_4": "FACILITY AT LEVEL 2: Rwanda"
}
```

## Benefits of This Approach

1. **Automatic**: No manual level-to-column mapping required
2. **Flexible**: Handles any DHIS2 hierarchy structure
3. **Predictable**: Simple rules that are easy to understand and debug
4. **Configurable**: Respects platform's maxAdminArea setting
5. **Informative**: Prefix labels clearly indicate when facilities are at unexpected levels

## Integration Points

### Database Schema

The staging table uses fixed columns regardless of DHIS2 structure:

```sql
CREATE TABLE temp_structure_staging (
  facility_id TEXT NOT NULL,
  admin_area_1 TEXT NOT NULL,
  admin_area_2 TEXT NOT NULL, 
  admin_area_3 TEXT NOT NULL,
  admin_area_4 TEXT NOT NULL,
  facility_name TEXT,
  -- ... other optional columns
);
```

### Configuration Dependencies

- `maxAdminArea`: Retrieved from platform config, determines admin area depth
- `selectedLevels`: User choice, determines which DHIS2 levels to import
- `enabledOptionalColumns`: Platform config for additional facility metadata

### Error Handling

- Empty paths are skipped
- Missing org unit names fallback to IDs
- Invalid path structures are logged but don't halt the import
- Progress tracking provides visibility into import status
