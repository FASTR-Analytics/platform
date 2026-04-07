# Plan: Add Admin Area 3 Filtering to HMIS Windowing

## Current State

HMIS dataset windowing currently filters by:
- **Time period** (start/end)
- **Indicators** (all or selected common indicators)
- **Admin Area 2** (all or selected AA2s)
- **Facility ownership** (optional, all or selected)
- **Facility types** (optional, all or selected)

The admin area filter is hardcoded to AA2 level only. There's no option to
filter at the AA3 (district) level.

## Design Decision: `adminAreaFilterLevel`

Rather than a generic `filterAdminAreaBy: "aa2" | "aa3" | "none"`, I'd
recommend keeping the existing `takeAllAdminArea2s` / `adminArea2sToInclude`
fields and **adding** AA3 fields alongside them. Reason: when filtering by AA3,
you still implicitly filter by AA2 (AA3 is a subset of AA2). The user might
want to select "Province A" and then drill into specific districts, or they
might want to pick districts across multiple provinces.

**Proposed approach**: Add a toggle that controls whether the admin area
multi-select shows AA2 options or AA3 options. When set to AA3, the filter
applies at the AA3 level (which is more granular and subsumes AA2 filtering).

```
adminAreaFilterLevel: "aa2" | "aa3"   // new field, defaults to "aa2"
takeAllAdminArea3s: boolean           // new field
adminArea3sToInclude: string[]        // new field
```

When `adminAreaFilterLevel === "aa2"`: existing behavior (filter by AA2).
When `adminAreaFilterLevel === "aa3"`: filter by AA3 instead.

The old AA2 fields remain for backward compatibility with existing project
configs. The `adminAreaFilterLevel` defaults to `"aa2"` when absent.

**Alternative considered**: A single unified `adminAreasToInclude` array with a
level selector. Rejected because it would break existing stored configs and
require migration.

### When to show the AA3 option

Only when `maxAdminArea >= 3` (available on `instanceState`). If the instance
only has AA1/AA2 levels, the toggle doesn't appear and behavior is unchanged.

---

## Changes Required

### 1. Type Definition

**File**: `lib/types/dataset_hmis.ts`

Add to `DatasetHmisWindowingBase`:

```typescript
type DatasetHmisWindowingBase = {
  start: number;
  end: number;
  takeAllIndicators: boolean;
  takeAllAdminArea2s: boolean;
  adminArea2sToInclude: string[];
  // NEW
  adminAreaFilterLevel?: "aa2" | "aa3";  // defaults to "aa2" if absent
  takeAllAdminArea3s?: boolean;          // defaults to true if absent
  adminArea3sToInclude?: string[];       // defaults to [] if absent
  //
  takeAllFacilityOwnerships?: boolean;
  takeAllFacilityTypes?: boolean;
  facilityOwnwershipsToInclude?: string[];
  facilityTypesToInclude?: string[];
};
```

All new fields are optional to maintain backward compatibility with existing
stored configs.

### 2. Server: Display Info Endpoint

**File**: `server/db/instance/dataset_hmis.ts`

The `getDatasetHmisItemsForDisplay` function currently queries AA2 list:

```typescript
const adminArea2s = (
  await mainDb<{ admin_area_2: string }[]>`
    SELECT admin_area_2 FROM admin_areas_2 ORDER BY LOWER(admin_area_2)`
).map<string>((aa) => aa.admin_area_2);
```

**Add**: Query AA3 list alongside it:

```typescript
const adminArea3s = (
  await mainDb<{ admin_area_3: string; admin_area_2: string }[]>`
    SELECT admin_area_3, admin_area_2 FROM admin_areas_3
    ORDER BY LOWER(admin_area_2), LOWER(admin_area_3)`
).map((aa) => ({ value: aa.admin_area_3, label: `${aa.admin_area_3} (${aa.admin_area_2})` }));
```

**Update**: `SharedDataForDisplay` type and return objects to include
`adminArea3s`.

**Update**: The API response type (in `lib/api-routes/instance/datasets.ts` or
wherever `DatasetHmisDisplayInfo` is defined) to include `adminArea3s`.

### 3. Server: Data Export (CSV Generation)

**File**: `server/db/project/datasets_in_project_hmis.ts`

#### 3a. `getDatasetHmisExportStatement()`

Currently has:

```typescript
if (!w.takeAllAdminArea2s && w.adminArea2sToInclude.length > 0) {
  whereConditions.push(
    `f.admin_area_2 IN (${w.adminArea2sToInclude.map(...).join(", ")})`
  );
}
```

**Change to**:

```typescript
const filterLevel = w.adminAreaFilterLevel ?? "aa2";

if (filterLevel === "aa3") {
  // Filter by AA3
  const takeAll = w.takeAllAdminArea3s ?? true;
  const items = w.adminArea3sToInclude ?? [];
  if (!takeAll && items.length > 0) {
    whereConditions.push(
      `f.admin_area_3 IN (${items.map((aa) => `'${aa}'`).join(", ")})`
    );
  }
} else {
  // Filter by AA2 (existing behavior)
  if (!w.takeAllAdminArea2s && w.adminArea2sToInclude.length > 0) {
    whereConditions.push(
      `f.admin_area_2 IN (${w.adminArea2sToInclude.map((aa) => `'${aa}'`).join(", ")})`
    );
  }
}
```

#### 3b. Facilities export query (same file, ~line 158)

Same pattern: check `adminAreaFilterLevel` and filter facilities by AA3 when
appropriate. The existing AA2 filter block gets wrapped in the same
`if/else` as above.

### 4. Server: Delete windowing (if applicable)

**File**: `server/db/instance/dataset_hmis.ts`

The `deleteDatasetHmisDataByWindowing` function also filters by AA2. Apply the
same `adminAreaFilterLevel` check there.

### 5. Client: Windowing Selector

**File**: `client/src/components/WindowingSelector.tsx`

Currently renders a `ToggledMultiSelect` for admin areas with AA2 options.

**Changes**:

1. Add a `RadioGroup` or `ButtonGroup` above the admin area section to toggle
   between "Filter by AA2" / "Filter by AA3". Only show this toggle when
   `maxAdminArea >= 3` (pass from parent or read from `instanceState`).

2. When toggle is "aa2": show existing AA2 multi-select (unchanged).

3. When toggle is "aa3": show AA3 multi-select with the new `adminArea3s` data
   from the display info endpoint. The AA3 options should show the parent AA2
   in the label for context (e.g., "District X (Province Y)").

4. When the user switches the toggle, reset the other level's selection to
   "take all" to avoid stale filters.

**Rough JSX**:

```tsx
<Show when={!isDelete}>
  <div class="ui-spy-sm ui-pad border-base-300 max-h-[600px] flex-none overflow-auto rounded border xl:col-span-4">
    <div class="text-md font-700">
      {t3({ en: "Admin areas", fr: "Unités administratives" })}
    </div>
    <Show when={maxAdminArea >= 3}>
      <RadioGroup
        label={t3({ en: "Filter level", fr: "Niveau de filtre" })}
        value={filterLevel()}
        onChange={(v) => {
          setTempWindowing("adminAreaFilterLevel", v);
          // Reset both to "take all" when switching
          setTempWindowing("takeAllAdminArea2s", true);
          setTempWindowing("takeAllAdminArea3s", true);
        }}
        options={[
          { value: "aa2", label: t3({ en: "By province/region", fr: "Par province/région" }) },
          { value: "aa3", label: t3({ en: "By district", fr: "Par district" }) },
        ]}
      />
    </Show>
    <Switch>
      <Match when={filterLevel() === "aa2"}>
        {/* Existing AA2 Checkbox + MultiSelect */}
      </Match>
      <Match when={filterLevel() === "aa3"}>
        {/* New AA3 Checkbox + MultiSelect */}
      </Match>
    </Switch>
  </div>
</Show>
```

### 6. Client: Settings Component

**File**: `client/src/components/project/settings_for_project_dataset_hmis.tsx`

**Update default windowing** to include new fields:

```typescript
const [tempWindowing, setTempWindowing] = createStore<DatasetHmisWindowingCommon>({
  // ... existing fields ...
  adminAreaFilterLevel: "aa2",
  takeAllAdminArea3s: true,
  adminArea3sToInclude: [],
});
```

**Update validation** in the save handler:

```typescript
const filterLevel = newWindowing.adminAreaFilterLevel ?? "aa2";

if (filterLevel === "aa3") {
  if (!(newWindowing.takeAllAdminArea3s ?? true) &&
      (!newWindowing.adminArea3sToInclude || newWindowing.adminArea3sToInclude.length === 0)) {
    return { success: false, err: t3({ en: "You must select at least one admin area", ... }) };
  }
} else {
  if (!newWindowing.takeAllAdminArea2s && newWindowing.adminArea2sToInclude.length === 0) {
    return { success: false, err: t3({ en: "You must select at least one admin area", ... }) };
  }
}
```

### 7. Pass `maxAdminArea` to WindowingSelector

The `WindowingSelector` needs to know whether AA3 exists. Options:

- Read from `instanceState.maxAdminArea` directly (already available on client).
- Or pass as prop from parent.

Simplest: read from `instanceState` inside `WindowingSelector` since it's
already a global signal.

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `lib/types/dataset_hmis.ts` | Add `adminAreaFilterLevel`, `takeAllAdminArea3s`, `adminArea3sToInclude` to `DatasetHmisWindowingBase` |
| `server/db/instance/dataset_hmis.ts` | Query AA3 list in `getDatasetHmisItemsForDisplay`, add to response |
| `server/db/project/datasets_in_project_hmis.ts` | Branch on `adminAreaFilterLevel` in export SQL + facilities query |
| `client/src/components/WindowingSelector.tsx` | Add level toggle, AA3 multi-select |
| `client/src/components/project/settings_for_project_dataset_hmis.tsx` | Default values, validation |
| API response type (wherever `DatasetHmisDisplayInfo` lives) | Add `adminArea3s` field |

## No Migration Needed

All new fields are optional with sensible defaults. Existing stored configs
continue to work — `adminAreaFilterLevel` defaults to `"aa2"`, and the existing
`takeAllAdminArea2s` / `adminArea2sToInclude` fields are used.

## Edge Cases

- **AA3 names are not globally unique**: Two provinces can have districts with
  the same name. The SQL filter uses the `admin_area_3` column value, which in
  the current schema is just a string. If AA3 names collide across AA2s, the
  filter will include all matching AA3s regardless of parent. This matches how
  AA2 filtering works today (no composite key in the filter). If this becomes
  a problem, we'd need to filter on `(admin_area_3, admin_area_2)` pairs
  instead of just AA3 strings. **Check your data to see if this is an issue.**

- **Switching levels clears selection**: When the user toggles between AA2/AA3,
  both selections reset to "take all". This prevents orphaned filters.

- **maxAdminArea < 3**: The toggle simply doesn't appear. No code path reaches
  the AA3 logic.
