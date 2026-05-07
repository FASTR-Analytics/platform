# Plan: DHIS2 Disaggregated Indicators (Data Element Operands)

## Background & Research Summary

### DHIS2 Terminology

| Term | Definition | Example |
|------|------------|---------|
| **Data Element** | A base metric collected in DHIS2 | `fbfJHSPpUQD` (ANC 1st visit) |
| **Category** | A dimension for disaggregation | Age Group, Sex |
| **Category Option** | A value within a category | `<5 years`, `Male` |
| **Category Combo** | A combination of categories assigned to a data element | Age + Sex |
| **Category Option Combo (COC)** | A specific combination of category options | `<5 years + Male` |
| **Data Element Operand** | A data element combined with a specific COC | `fbfJHSPpUQD.pq2XI5kz2BY` |
| **Attribute Option Combo (AOC)** | Extra dimensions at the dataset level (e.g., implementing partner) | Optional third part of operand |

### Data Element Operand Format

```
<dataElement-id>.<categoryOptionCombo-id>.<attributeOptionCombo-id>
```

- First part: Required (data element UID)
- Second part: Optional (category option combo UID, or `*` for wildcard)
- Third part: Optional (attribute option combo UID)

**Examples:**
- `fbfJHSPpUQD` — Total/aggregate for data element
- `fbfJHSPpUQD.pq2XI5kz2BY` — Specific disaggregation
- `fbfJHSPpUQD.*` — All disaggregations (wildcard)
- `Uvn6LCg7dVU.*.j8vBiBqGf6O` — All COCs with specific AOC

### How Disaggregation Works in DHIS2

1. **Category Option Combos are shared** — The same COC ID can apply to multiple data elements if they use the same category combo
2. **Auto-generated** — COCs are created automatically from the cartesian product of category options
3. **Not all data elements have disaggregation** — Some use the "default" category combo (no disaggregation)

### Relevant DHIS2 API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/dataElements?fields=id,name,categoryCombo[id,name,categoryOptionCombos[id,name]]` | Get data elements with their disaggregation options |
| `/api/categoryOptionCombos` | List all category option combos |
| `/api/categoryCombos/{id}` | Get details of a specific category combo |
| `/api/analytics?dimension=dx:DE.COC&dimension=pe:...&dimension=ou:...` | Fetch disaggregated analytics data |
| `/api/analytics?dimension=dx:DE&dimension=co&dimension=pe:...` | Fetch data with COC as separate dimension |

### Analytics API Options for Disaggregation

**Option A: Data Element Operand in dx dimension**
```
/api/analytics?dimension=dx:fbfJHSPpUQD.pq2XI5kz2BY;fbfJHSPpUQD.PT59n8BQbqM&dimension=pe:202401&dimension=ou:...
```

**Option B: Category dimension (co) as separate dimension**
```
/api/analytics?dimension=dx:fbfJHSPpUQD&dimension=co&dimension=pe:202401&dimension=ou:...
```

Option A is more explicit; Option B returns all COCs dynamically.

---

## Important: Data Elements vs DHIS2 Indicators

**Disaggregation only applies to Data Elements, NOT DHIS2 Indicators.**

| Type | Has Disaggregation? | Notes |
|------|---------------------|-------|
| **Data Element** | Yes | Has `categoryCombo` with `categoryOptionCombos` |
| **DHIS2 Indicator** | No | Calculated ratio (numerator/denominator formula). The formula may *reference* operands internally, but the indicator itself has no COCs. |

The current code fetches both types via `searchDataElementsFromDHIS2()` and `searchIndicatorsFromDHIS2()`. The UI should only show disaggregation options when the user selects a **data element**, not a DHIS2 indicator.

---

## Current State in wb-fastr

### What Works Now

1. **Search DHIS2 data elements** — Via `/api/dataElements` with basic fields
2. **Store raw indicators** — `indicators_raw` table with `indicator_raw_id` (expects a simple ID)
3. **Fetch analytics data** — Uses `indicator_raw_id` directly in the dx dimension
4. **Store HMIS data** — `dataset_hmis` table with `indicator_raw_id` column

### Current Limitations

1. **No COC discovery** — When searching data elements, we fetch `categoryCombo[id,name]` but NOT the actual `categoryOptionCombos`
2. **No operand storage** — `indicators_raw` table only stores a single ID, not the `dataElement.categoryOptionCombo` format
3. **No UI for disaggregation** — Users cannot see or select specific COCs when mapping indicators
4. **Analytics fetch assumes totals** — The DHIS2 data import worker only fetches aggregate totals, not disaggregated values

### Files That Need Changes

| File | Current Role | Changes Needed |
|------|--------------|----------------|
| `lib/types/indicators.ts` | Type definitions for DHIS2 entities | Add `categoryOptionCombos` to `DHIS2DataElement`, add `DHIS2CategoryOptionCombo` type |
| `server/dhis2/goal2_indicators/get_indicators_from_dhis2.ts` | Fetches data elements/indicators | Expand fields to include COCs, add function to fetch COCs for a data element |
| `server/db/instance/_main_database.sql` | Database schema | Consider if `indicator_raw_id` can store operand format, or add new column |
| `server/worker_routines/stage_hmis_data_dhis2/worker.ts` | DHIS2 data import | Handle operand IDs in analytics requests |
| `client/.../indicator_search/` | UI for searching DHIS2 indicators | Show COCs when selecting data elements, allow operand selection |

---

## Implementation Plan

### Phase 1: Type Definitions & API Layer

**Goal:** Enable fetching and representing disaggregated data elements

#### 1.1 Update Type Definitions

**File:** `lib/types/indicators.ts`

```typescript
// Add new type
export interface DHIS2CategoryOptionCombo {
  id: string;
  name: string;
  displayName?: string;
  code?: string;
}

// Update existing type
export interface DHIS2DataElement {
  id: string;
  name: string;
  displayName: string;
  code?: string;
  shortName?: string;
  aggregationType?: string;
  domainType?: string;
  valueType?: string;
  categoryCombo?: {
    id: string;
    name: string;
    isDefault?: boolean;  // ADD THIS — true if no disaggregation
    categoryOptionCombos?: DHIS2CategoryOptionCombo[];  // ADD THIS
  };
  dataElementGroups?: Array<{ id: string; name: string }>;
  created?: string;
  lastUpdated?: string;
}
```

#### 1.2 Update DHIS2 Fetcher

**File:** `server/dhis2/goal2_indicators/get_indicators_from_dhis2.ts`

```typescript
const DEFAULT_DATA_ELEMENT_FIELDS = [
  "id",
  "name",
  "displayName",
  "code",
  "shortName",
  "aggregationType",
  "domainType",
  "valueType",
  "categoryCombo[id,name,isDefault,categoryOptionCombos[id,name,displayName]]",  // UPDATED
  "dataElementGroups[id,name]",
  "created",
  "lastUpdated",
];
```

**Note on `isDefault`:** Use the `isDefault` property from the API to detect data elements without disaggregation. Do NOT check `name === "default"` — the name can vary by instance/language. The `isDefault` boolean is reliable.

Add new function:
```typescript
export async function getCategoryOptionCombosForDataElement(
  options: FetchOptions,
  dataElementId: string
): Promise<DHIS2CategoryOptionCombo[]> {
  // Fetch single data element with full COC details
  const de = await getDHIS2<DHIS2DataElement>(
    `/api/dataElements/${dataElementId}.json`,
    options,
    new URLSearchParams({
      fields: "categoryCombo[categoryOptionCombos[id,name,displayName,code]]"
    })
  );
  return de.categoryCombo?.categoryOptionCombos ?? [];
}
```

### Phase 2: Storage Model Decision

**Key Question:** How should we store disaggregated indicator references?

#### Option A: Store operand format in existing column

Store `dataElement.categoryOptionCombo` as `indicator_raw_id`:
- **Pros:** Minimal schema change, backward compatible
- **Cons:** Need to handle parsing, existing data uses simple IDs

#### Option B: Add new columns to `indicators_raw`

```sql
ALTER TABLE indicators_raw ADD COLUMN category_option_combo_id TEXT;
ALTER TABLE indicators_raw ADD COLUMN is_disaggregated BOOLEAN DEFAULT FALSE;
```

- **Pros:** Explicit, queryable, cleaner
- **Cons:** More schema changes, migration needed

#### Option C: Create separate table for operands

```sql
CREATE TABLE indicator_operands (
  operand_id TEXT PRIMARY KEY,  -- dataElement.categoryOptionCombo
  data_element_id TEXT NOT NULL,
  category_option_combo_id TEXT,
  operand_label TEXT NOT NULL,
  FOREIGN KEY (data_element_id) REFERENCES indicators_raw(indicator_raw_id)
);
```

- **Pros:** Clean separation, explicit relationships
- **Cons:** More complexity, need to update all queries

**Recommendation:** Start with **Option A** (operand format in `indicator_raw_id`). The `indicator_raw_id` is already treated as an opaque string passed to DHIS2. Storing `DE.COC` format works seamlessly with the analytics API. Add a label field update to store a human-readable name like "ANC 1st visit (Female, <15 years)".

### Phase 3: Update DHIS2 Data Import Worker

**File:** `server/worker_routines/stage_hmis_data_dhis2/worker.ts`

The current implementation passes `rawIndicatorId` directly to the analytics API. This already works for operand format because the analytics API accepts:
- `dimension=dx:fbfJHSPpUQD` (data element)
- `dimension=dx:fbfJHSPpUQD.pq2XI5kz2BY` (operand)

**Minimal changes needed:**
1. Validate that operand IDs are properly URL-encoded
2. Update progress logging to show operand labels

### Phase 4: Client UI Updates

#### 4.1 Data Element Search Results

When displaying search results, show:
- Data element name
- Whether it has disaggregation (badge: "Has disaggregation" or "Total only")
- If disaggregated, expand to show available COCs

```
[Search Results]
├─ ANC 1st visit (fbfJHSPpUQD)
│  └─ Total (no disaggregation)
├─ Malaria cases (xyz123abc)
│  ├─ Has 6 disaggregations ▼
│  │  ├─ Male, <5 years (xyz123abc.coc1)
│  │  ├─ Male, 5-14 years (xyz123abc.coc2)
│  │  ├─ Male, 15+ years (xyz123abc.coc3)
│  │  ├─ Female, <5 years (xyz123abc.coc4)
│  │  ├─ Female, 5-14 years (xyz123abc.coc5)
│  │  └─ Female, 15+ years (xyz123abc.coc6)
```

#### 4.2 Indicator Selection

Allow users to select:
- Entire data element (total/aggregate)
- Specific disaggregation (operand)
- Multiple disaggregations

**Each selected operand becomes a separate row in `indicators_raw`:**

| indicator_raw_id | indicator_raw_label |
|------------------|---------------------|
| `xyz123abc.coc1` | Malaria cases (Male, <5 years) |
| `xyz123abc.coc3` | Malaria cases (Male, 15+ years) |

This means:
- Users can pick 2 of 5 COCs — each stored independently
- Each can be mapped to different common indicators
- Each can be selected independently for DHIS2 data imports
- No special parsing — the operand ID is passed directly to DHIS2 analytics API

#### 4.3 Raw Indicator Display

Update indicator tables to show:
- If an indicator is an operand (disaggregated)
- The parent data element
- The specific COC name

### Phase 5: Testing & Validation

1. **Unit tests** for operand ID parsing/formatting
2. **Integration tests** against DHIS2 demo instance
3. **Verify analytics data** matches expected disaggregation
4. **UI testing** for operand selection workflow

---

## Implementation Order

| Step | Description | Effort | Dependencies |
|------|-------------|--------|--------------|
| 1 | Update type definitions | Small | None |
| 2 | Update DHIS2 data element fetcher to include COCs | Small | Step 1 |
| 3 | Add API route to fetch COCs for a data element | Small | Step 2 |
| 4 | Update client search UI to show COCs | Medium | Steps 2-3 |
| 5 | Update raw indicator creation to support operand format | Medium | Step 4 |
| 6 | Test DHIS2 data import with operand IDs | Small | Step 5 |
| 7 | Update indicator display to show disaggregation info | Small | Step 5 |

**Estimated total effort:** 2-3 days

---

## Resolved Questions

1. **Default COC handling?** — **RESOLVED:** Use `categoryCombo.isDefault` property from the API. If `isDefault === true`, show "No disaggregation (total only)" in UI. Do not show expandable COC options for these data elements.

2. **Use /api/dataElementOperands endpoint?** — **RESOLVED:** No. Stick with nested `categoryCombo[categoryOptionCombos]` approach. The dedicated endpoint returns ALL operands system-wide (could be thousands), requires a separate API call, and offers no label advantage (COC names are generated on the fly either way).

## Open Questions

1. **Should we support the `*` wildcard?** — Fetching all COCs at once via `DE.*` could be useful but adds complexity
2. **Attribute option combos?** — Do your colleagues need AOC support (the third part of the operand)? This is less common.
3. **Backward compatibility?** — Are there existing indicator mappings that use simple data element IDs that would break?

---

## Sources

- [DHIS2 Analytics API Documentation](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-240/analytics.html)
- [DHIS2 Metadata API Documentation](https://docs.dhis2.org/en/develop/using-the-api/dhis-core-version-master/metadata.html)
- [DHIS2 Community: Category Option Combo IDs](https://community.dhis2.org/t/web-api-data-element-category-combination-option-ids/1228)
- [DHIS2 Community: Attribute Option Combos](https://community.dhis2.org/t/whats-mean-of-attribute-option-combos/4766)
- [DHIS2 Data Elements and Custom Dimensions](https://docs.dhis2.org/en/implement/database-design/aggregate-system-design/data-elements-and-custom-dimensions.html)
