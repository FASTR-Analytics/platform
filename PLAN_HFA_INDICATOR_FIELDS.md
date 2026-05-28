# Plan: Add sub_category and short_label to HFA Indicators

## Summary

Add two new text fields to HFA indicators:
- `sub_category` - finer categorization within a category
- `short_label` - shorter display name for UI contexts

## Current State

**HfaIndicator type** (`lib/types/hfa_types.ts`):
```typescript
type HfaIndicator = {
  varName: string;        // PK
  category: string;
  definition: string;
  type: "binary" | "numeric";
  aggregation: "sum" | "avg";
  sortOrder: number;
  hasSyntaxError: boolean;
  codeConsistent: boolean;
}
```

**Tables affected:**
1. `hfa_indicators` (instance DB) - main table
2. `hfa_indicators_snapshot` (project DB) - point-in-time copy for module execution

## Files to Modify

### 1. Type Definition
- `lib/types/hfa_types.ts` - add `subCategory` and `shortLabel` fields

### 2. Instance DB Layer
- `server/db/instance/hfa_indicators.ts`:
  - Update `DBHfaIndicator` type
  - Update `dbRowToHfaIndicator()` converter
  - Update `createHfaIndicator()` INSERT
  - Update `updateHfaIndicator()` UPDATE
  - Update `saveHfaIndicatorFull()` UPDATE
  - Update `batchUploadHfaIndicators()` INSERT

### 3. SQL Migrations
- `server/db/migrations/instance/024_add_hfa_indicator_sub_category_short_label.sql` - add columns to `hfa_indicators`
- `server/db/migrations/project/011_add_hfa_indicator_snapshot_sub_category_short_label.sql` - add columns to `hfa_indicators_snapshot`

### 4. Live Schema Files
- `server/db/instance/_main_database.sql` - update `hfa_indicators` table
- `server/db/project/_project_database.sql` - update `hfa_indicators_snapshot` table

### 5. Project DB Layer
- `server/db/project/datasets_in_project_hfa.ts`:
  - Update INSERT into `hfa_indicators_snapshot` (line ~266-268)
  - Update SELECT from `hfa_indicators_snapshot` (line ~297-306)

### 6. Client Edit Form
- `client/src/components/forms_editors/edit_hfa_indicator.tsx`:
  - Add signals for `subCategory` and `shortLabel`
  - Add Input fields to form

### 7. Client Manager Table (optional)
- `client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx`:
  - Consider adding columns for new fields (or leave out if table is already wide)

### 8. CSV Upload/Download
- `client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx`:
  - Update `handleDownloadCsv()` to include new fields in headers and rows
- `client/src/components/indicator_manager_hfa/hfa_indicators_csv_upload_form.tsx`:
  - Update required headers list
  - Update indicator construction from CSV row

## Migration Details

**Instance migration** (`024_add_hfa_indicator_sub_category_short_label.sql`):
```sql
ALTER TABLE hfa_indicators ADD COLUMN IF NOT EXISTS sub_category TEXT NOT NULL DEFAULT '';
ALTER TABLE hfa_indicators ADD COLUMN IF NOT EXISTS short_label TEXT NOT NULL DEFAULT '';
```

**Project migration** (`011_add_hfa_indicator_snapshot_sub_category_short_label.sql`):
```sql
ALTER TABLE hfa_indicators_snapshot ADD COLUMN IF NOT EXISTS sub_category TEXT NOT NULL DEFAULT '';
ALTER TABLE hfa_indicators_snapshot ADD COLUMN IF NOT EXISTS short_label TEXT NOT NULL DEFAULT '';
```

## Execution Order

1. Type definition (breaks compilation until DB layer updated)
2. DB types and converter function
3. DB functions (INSERT/UPDATE)
4. SQL migrations
5. Live schema files
6. Project DB snapshot INSERT/SELECT
7. Client edit form
8. CSV upload/download
9. (Optional) Manager table columns

## Notes

- Both fields default to empty string `''` - fully backwards compatible
- No data transform needed - simple column additions with defaults
- Snapshot table mirrors main table structure for these columns
- CSV format will need to be communicated to users if they use bulk upload
