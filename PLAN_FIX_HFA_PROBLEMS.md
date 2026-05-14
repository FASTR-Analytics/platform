œ# Plan: Fix HFA Indicator Upload/Download Issues

## Bug 1: "Add to existing" replaces indicators instead of adding

### Problem
When uploading new indicators via CSV with "Add to existing" mode, if the CSV rows have blank `varName` fields, the auto-generated names can collide with existing database indicators, causing them to be overwritten instead of adding new ones.

### Root Cause
In `client/src/components/indicator_manager_hfa/hfa_indicators_csv_upload_form.tsx:124-130`:

```typescript
let varName = row.varName?.trim() || "";
if (!varName) {
  while (usedVarNames.has(`ind${String(autoVarCounter).padStart(3, "0")}`)) {
    autoVarCounter++;
  }
  varName = `ind${String(autoVarCounter).padStart(3, "0")}`;
  autoVarCounter++;
}
```

The `usedVarNames` set only contains varNames from the current CSV being uploaded. It does NOT include existing indicator varNames from the database. So if the database has `ind001, ind002, ind003` and the user uploads a CSV with blank varNames, the auto-generator creates `ind001, ind002, ind003` which then overwrites existing indicators via `ON CONFLICT DO UPDATE`.

### Proposed Fix
1. Before processing the CSV, fetch all existing HFA indicator varNames from the database
2. Include those in the collision check when auto-generating varNames

**File changes:**

`client/src/components/indicator_manager_hfa/hfa_indicators_csv_upload_form.tsx`:
- The component already receives `dictionary` prop, but we need existing indicator varNames
- Option A: Add existing varNames to the props passed to the upload form
- Option B: Fetch existing indicators inside the upload handler before processing

**Preferred: Option A** - Pass existing varNames as a prop since the parent already has access to the indicators list.

```typescript
// In hfa_indicators_manager.tsx handleCsvUpload():
async function handleCsvUpload() {
  const dictRes = await serverActions.getHfaDictionaryForValidation({});
  if (!dictRes.success) return;
  const st = indicators();
  const existingVarNames = st.status === "ready" ? st.data.map(i => i.varName) : [];
  await openEditor({
    element: HfaIndicatorsCsvUploadForm,
    props: { dictionary: dictRes.data, existingVarNames },
  });
}

// In hfa_indicators_csv_upload_form.tsx:
// 1. Add existingVarNames to Props type
// 2. Initialize usedVarNames with existing varNames:
const usedVarNames = new Set<string>(p.existingVarNames);
```

---

## Bug 2: Download CSV applies code across all rounds

### Problem Description (from user)
> When you download the indicator CSV, it automatically applies any code and filter code across all three rounds, regardless of if the indicator is actually present in that round/the code has been deleted from that round.

### Investigation
I reviewed the download logic in `hfa_indicators_manager.tsx:224-281` and it appears correct - it only outputs code that exists in the database keyed by `varName__timePoint`.

However, I found a **related bug** in the save logic that could cause unexpected code persistence:

### Related Bug Found: Code deletion uses wrong varName when renaming

In `server/db/instance/hfa_indicators.ts:179`:

```typescript
await sql`DELETE FROM hfa_indicator_code WHERE var_name = ${indicator.varName}`;
```

When renaming an indicator (oldVarName → newVarName), this deletes code for the **new** name (which doesn't exist yet) instead of the **old** name. Result: old code remains orphaned in the database.

### Proposed Fix for Related Bug

```typescript
// Line 179 - change from:
await sql`DELETE FROM hfa_indicator_code WHERE var_name = ${indicator.varName}`;

// To:
await sql`DELETE FROM hfa_indicator_code WHERE var_name = ${oldVarName}`;
```

### Clarification Needed for Bug 2

The download code looks correct. To understand the reported issue better, I need to know:

1. Did you enter code only for specific rounds in the indicator editor?
2. After saving and re-opening the editor, does the code appear in all rounds?
3. When you download the CSV, are all `r_code_X` columns filled with the same code?
4. Is there a possibility you clicked "Apply to other rounds" button at some point?

**Possible explanations:**
- The "Apply to other rounds" button in the editor copies code to all rounds - this might have been clicked inadvertently
- The code deletion bug (when renaming) could leave orphaned data that gets picked up
- There may be a caching issue I haven't identified

---

## Summary of Changes

### File 1: `client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx`
- Modify `handleCsvUpload()` to pass existing indicator varNames to the upload form

### File 2: `client/src/components/indicator_manager_hfa/hfa_indicators_csv_upload_form.tsx`
- Update Props type to include `existingVarNames: string[]`
- Initialize `usedVarNames` set with existing varNames before processing CSV

### File 3: `server/db/instance/hfa_indicators.ts`
- Line 179: Change `indicator.varName` to `oldVarName` in the DELETE statement

---

## Testing Plan

### Bug 1 Test:
1. Create indicators ind001, ind002, ind003
2. Upload CSV with 3 new indicators with blank varNames
3. Verify new indicators get names ind004, ind005, ind006 (not replacing existing)
4. Total count should now be 6

### Related Bug Test:
1. Create indicator "test_ind" with code for round 1
2. Rename to "test_ind_renamed" and save
3. Download CSV
4. Verify code appears only in r_code_1 column for the renamed indicator
5. Check database for orphaned code under old name (should not exist)