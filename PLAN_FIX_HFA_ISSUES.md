# Plan: Fix HFA Indicator Upload/Download Issues

## Issue 1: "Add to existing" replaces indicators instead of adding

### Current Behavior
When uploading a CSV with "Add to existing" mode, the `batchUploadHfaIndicators` function uses `ON CONFLICT (var_name) DO UPDATE`. This means:
- If an uploaded indicator has the same `var_name` as an existing indicator, it UPDATES the existing one
- Users expect "add to existing" to mean "only insert NEW indicators, leave existing ones untouched"

### Location
- `server/db/instance/hfa_indicators.ts` lines 112-154

### Proposed Fix
When `replaceAll=false` (add mode):
1. Query existing var_names before inserting
2. Skip any indicators in the upload that already exist in the database
3. Assign sort_order starting from MAX(existing sort_order) + 1 for new indicators
4. Only process code for indicators that were actually inserted
5. Change `ON CONFLICT DO UPDATE` to `ON CONFLICT DO NOTHING` as a safety net

### Code Changes

```typescript
export async function batchUploadHfaIndicators(
  mainDb: Sql,
  indicators: HfaIndicator[],
  code: HfaIndicatorCode[],
  replaceAll: boolean,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    await mainDb.begin(async (sql) => {
      if (replaceAll) {
        await sql`DELETE FROM hfa_indicators`;
      }

      // In add mode, get existing var_names to skip them
      let existingVarNames = new Set<string>();
      let nextSortOrder = 0;
      if (!replaceAll) {
        const existingRows = await sql<{ var_name: string }[]>`
          SELECT var_name FROM hfa_indicators
        `;
        existingVarNames = new Set(existingRows.map((r) => r.var_name));
        const maxResult = await sql<{ max_order: number | null }[]>`
          SELECT MAX(sort_order) as max_order FROM hfa_indicators
        `;
        nextSortOrder = (maxResult[0]?.max_order ?? -1) + 1;
      }

      const insertedVarNames = new Set<string>();
      for (let i = 0; i < indicators.length; i++) {
        const ind = indicators[i];
        
        // In add mode, skip indicators that already exist
        if (!replaceAll && existingVarNames.has(ind.varName)) {
          continue;
        }
        
        const sortOrder = replaceAll ? i : nextSortOrder++;
        await sql`
          INSERT INTO hfa_indicators (var_name, category, definition, type, aggregation, sort_order, has_syntax_error, code_consistent, updated_at)
          VALUES (${ind.varName}, ${ind.category}, ${ind.definition}, ${ind.type}, ${ind.aggregation}, ${sortOrder}, ${ind.hasSyntaxError}, ${ind.codeConsistent}, CURRENT_TIMESTAMP)
          ON CONFLICT (var_name) DO NOTHING
        `;
        insertedVarNames.add(ind.varName);
      }

      // Only process code for indicators that were actually inserted
      for (const varName of insertedVarNames) {
        await sql`DELETE FROM hfa_indicator_code WHERE var_name = ${varName}`;
      }
      for (const c of code) {
        if (!c.rCode.trim()) continue;
        if (!insertedVarNames.has(c.varName)) continue;
        await sql`
          INSERT INTO hfa_indicator_code (var_name, time_point, r_code, r_filter_code)
          VALUES (${c.varName}, ${c.timePoint}, ${c.rCode}, ${c.rFilterCode ?? null})
        `;
      }
    });
    return { success: true };
  });
}
```

---

## Issue 2: Download CSV applies code across all rounds

### User Report
"When you download the indicator csv, it automatically applies any code and filter code across all three rounds, regardless of if the indicator is actually present in that round/the code has been deleted from that round in the indicator editing tool."

### Current Behavior Analysis
Looking at `handleDownloadCsv` in `client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx`:
- It fetches all indicator code via `getAllHfaIndicatorCode`
- Creates a map keyed by `${varName}__${timePoint}`
- For each indicator, looks up code for each time point, defaulting to empty string if not found

This logic appears correct - it should only output code that exists in the database.

### Possible Causes

**Theory A: Code is being saved to all rounds when it shouldn't be**

When saving via the code editor (`saveHfaIndicatorFull`), ALL time points are sent in the `code` array:
```typescript
code: unwrap(state.code).map((c) => ({
  timePoint: c.timePoint,
  rCode: c.rCode.trim(),
  rFilterCode: c.rFilterCode.trim() || undefined,
})),
```

The server filters by `if (!c.rCode.trim()) continue;` - so empty code entries should NOT be inserted.

BUT: There's an "Apply to other rounds" button that copies code from current round to all rounds. If users accidentally click this, then save, code gets applied to all rounds.

**Theory B: The upload is copying code across rounds**

In `hfa_indicators_csv_upload_form.tsx`, the upload parsing iterates over `sortedTimePoints.length` and looks for `r_code_1`, `r_code_2`, etc. columns. If these columns exist in the CSV with values, they get inserted.

If a user:
1. Downloads CSV (with code only in round 1)
2. Edits CSV (maybe copy-pasting rows or Excel auto-fill?)
3. Re-uploads with "add to existing" (which currently UPDATES existing indicators including their code)

The re-upload would overwrite code for all rounds based on CSV content.

**Theory C: Database has stale data**

The data is already in the database with code for all rounds, and the user doesn't realize it.

### Proposed Investigation Steps

1. Add logging to see what's actually being downloaded vs what's in the database
2. Have user check database directly: `SELECT * FROM hfa_indicator_code WHERE var_name = 'example_indicator'`
3. Confirm whether issue is on download, upload, or the code editor save

### Potential Fix (if Theory B is correct)

After fixing Issue 1, the "add to existing" mode will no longer update existing indicators, which would prevent accidental code overwrites during re-upload.

If users still experience the issue, we may need to:
1. Add a warning in the code editor when "Apply to other rounds" is clicked
2. Show a diff/preview before saving changes in the code editor
3. Add an "audit log" to track code changes

---

## Testing Plan

### Issue 1 Tests
1. Create indicators A, B, C via UI
2. Create CSV with indicators D, E (new var_names)
3. Upload with "Add to existing"
4. Verify: A, B, C, D, E all exist (5 total)
5. Verify: A, B, C are unchanged
6. Verify: D, E have correct sort_order after C

### Issue 2 Tests
1. Create indicator with code only for Round 1
2. Download CSV
3. Verify CSV shows code only in `r_code_1` column, empty for `r_code_2`, `r_code_3`
4. Re-upload with "Replace all"
5. Verify database only has code for Round 1

---

## Files to Modify

1. `server/db/instance/hfa_indicators.ts` - Fix `batchUploadHfaIndicators`

## Optional Enhancements (Future)

1. Return count of added/skipped indicators to show user feedback
2. Add "Update existing" as a third upload mode (current behavior)
3. Show preview of changes before upload commits
