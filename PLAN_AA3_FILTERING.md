# Plan: Add Admin Area 3 Filtering to HMIS Windowing

## Current State

HMIS dataset windowing currently filters by:
- **Time period** (start/end)
- **Indicators** (all or selected common indicators)
- **Admin Area 2** (all or selected AA2s)
- **Facility ownership** (optional, all or selected)
- **Facility types** (optional, all or selected)

The admin area filter is hardcoded to AA2 level only, using a flat `MultiSelect`.
There's no option to filter at the AA3 (district) level.

## Design Decision: NestedMultiSelect

**Depends on**: `NestedMultiSelect` component in panther — **implemented** at
`panther/_303_components/form_inputs/nested_multi_select.tsx`.

The actual node types are a discriminated union (not optional fields):

```typescript
type NestedSelectBranchNode<T extends string> = {
  key: string;
  label: string | JSX.Element;
  children: NestedSelectNode<T>[];
};

type NestedSelectLeafNode<T extends string> = {
  key: string;
  label: string | JSX.Element;
  value: T;
};

type NestedSelectNode<T extends string> =
  | NestedSelectLeafNode<T>
  | NestedSelectBranchNode<T>;
```

When `maxAdminArea >= 3`, replace the flat AA2 `MultiSelect` with a
`NestedMultiSelect` tree:

```
[▶] [☐] Province A          (branch — tri-state, no value)
      [☐] District 1        (leaf — selectable)
      [☐] District 2        (leaf — selectable)
[▶] [☐] Province B
      [☐] District 3
```

Branches are AA2s (derived tri-state). Leaves are AA3s (selectable). Checking a
province checks all its districts. The component only returns leaf (AA3) values.

When `maxAdminArea < 3`, the existing flat AA2 `MultiSelect` is unchanged.

### Composite Keys for AA3 Values

AA3 names are **not globally unique** — two provinces can have districts with the
same name. The `admin_areas_3` PK is `(admin_area_3, admin_area_2, admin_area_1)`.

To disambiguate, leaf values use composite keys: `"aa3_name|||aa2_name"`.

The server parses these into `(admin_area_3, admin_area_2)` pairs for SQL
filtering, using a `VALUES` clause instead of a simple `IN`:

```sql
(f.admin_area_3, f.admin_area_2) IN (VALUES ('District Central','Province A'), ('District North','Province B'))
```

### SQL Safety

The existing AA2 filtering code uses string interpolation with single quotes:
`'${aa}'`. This is vulnerable if admin area names contain `'` (e.g. N'Djamena).

All SQL string interpolation for admin area and facility filter values must
escape single quotes by doubling them: `aa.replace(/'/g, "''")`. This applies
to both the new AA3 code and the existing AA2/facility ownership/facility type
code. The plan's code samples include this escaping.

### Backward Compatibility

- Old configs have `takeAllAdminArea2s` / `adminArea2sToInclude` — these
  continue to work. The server checks AA3 fields first, falls back to AA2.
- When a user opens settings on an instance with `maxAdminArea >= 3`, the UI
  shows the nested tree. On save, AA3 fields are populated and AA2 fields are
  reset to "take all" so only one filter path is active.
- No `adminAreaFilterLevel` toggle is needed — the nested tree subsumes AA2
  filtering (selecting all districts of a province = filtering by that province).

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
  // NEW — used when maxAdminArea >= 3
  takeAllAdminArea3s?: boolean;          // defaults to true if absent
  adminArea3sToInclude?: string[];       // composite "aa3|||aa2" keys, defaults to [] if absent
  //
  takeAllFacilityOwnerships?: boolean;
  takeAllFacilityTypes?: boolean;
  facilityOwnwershipsToInclude?: string[];
  facilityTypesToInclude?: string[];
};
```

All new fields are optional to maintain backward compatibility with existing
stored configs.

### 2. Shared Constant: Composite Key Separator

**File**: `lib/types/dataset_hmis.ts`

```typescript
export const AA3_SEPARATOR = "|||";

export function makeAa3CompositeKey(aa3: string, aa2: string): string {
  return `${aa3}${AA3_SEPARATOR}${aa2}`;
}

export function parseAa3CompositeKey(key: string): { aa3: string; aa2: string } {
  const i = key.indexOf(AA3_SEPARATOR);
  if (i === -1) {
    throw new Error(`Invalid AA3 composite key (missing separator): ${key}`);
  }
  return { aa3: key.slice(0, i), aa2: key.slice(i + AA3_SEPARATOR.length) };
}
```

Used by both server (SQL building) and client (tree node construction).
`parseAa3CompositeKey` throws on malformed input rather than silently producing
garbage.

### 3. SQL Escape Helper

**File**: `server/db/shared/sql_utils.ts` (or inline where used)

```typescript
function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}
```

Apply to **all 10 existing string interpolation sites** plus new AA3 code:

**`server/db/instance/dataset_hmis.ts`** (3 sites):
- Line 159: indicator raw IDs — `'${escapeSqlString(ind)}'`
- Line 171: AA2 names (count query) — `'${escapeSqlString(aa)}'`
- Line 208: AA2 names (delete query) — `'${escapeSqlString(aa)}'`

**`server/db/project/datasets_in_project_hmis.ts`** (7 sites):
- Line 168: AA2 names (facilities query) — `'${escapeSqlString(aa)}'`
- Line 182: facility ownership (facilities query) — `'${escapeSqlString(fo)}'`
- Line 196: facility types (facilities query) — `'${escapeSqlString(ft)}'`
- Line 322: AA2 names (export statement) — `'${escapeSqlString(aa)}'`
- Line 336: facility ownership (export statement) — `'${escapeSqlString(fo)}'`
- Line 350: facility types (export statement) — `'${escapeSqlString(ft)}'`
- Line 391: indicator common IDs — `'${escapeSqlString(ite)}'`

This fixes the pre-existing vulnerability for names with `'` (e.g. N'Djamena)
and prevents it for new AA3 code.

All code samples below use this helper.

### 4. Server: Display Info Endpoint

**File**: `server/db/instance/dataset_hmis.ts`

The `getDatasetHmisItemsForDisplay` function (line 289) currently queries AA2
list (line 303-307). It does not have `maxAdminArea` — call
`getMaxAdminAreaConfig(mainDb)` inside the function. This function is exported
from `server/db/instance/config.ts` (line 71), which is already imported in
`dataset_hmis.ts` (line 45 imports `getFacilityColumnsConfig` from the same
file). Just add `getMaxAdminAreaConfig` to the existing import.

Add an AA3 query conditionally:

```typescript
const resMaxAdminArea = await getMaxAdminAreaConfig(mainDb);
throwIfErrWithData(resMaxAdminArea);
const maxAdminArea = resMaxAdminArea.data.maxAdminArea;

let adminArea3s: { admin_area_3: string; admin_area_2: string }[] | undefined;
if (maxAdminArea >= 3) {
  adminArea3s = await mainDb<{ admin_area_3: string; admin_area_2: string }[]>`
    SELECT admin_area_3, admin_area_2 FROM admin_areas_3
    ORDER BY LOWER(admin_area_2), LOWER(admin_area_3)`;
}
```

Note: the query omits `admin_area_1`. This is safe because the app is
single-country (one AA1). If multiple AA1 values existed, AA3 names could
collide across AA1 boundaries — not a concern here.

**Update `SharedDataForDisplay`** (line 282-287):

```typescript
type SharedDataForDisplay = {
  facilityColumns: InstanceConfigFacilityColumns;
  adminArea2s: string[];
  adminArea3s?: { admin_area_3: string; admin_area_2: string }[];  // NEW
  facilityTypes?: string[];
  facilityOwnership?: string[];
};
```

**Update `ItemsHolderDatasetHmisDisplay`** in `lib/types/instance.ts` (line
348-361):

```typescript
export type ItemsHolderDatasetHmisDisplay = {
  // ... existing fields ...
  adminArea2s: string[];
  adminArea3s?: { admin_area_3: string; admin_area_2: string }[];  // NEW
  // ...
};
```

**Update both** `getDatasetHmisItemsForDisplayRaw` (line 425) and
`getDatasetHmisItemsForDisplayCommon` (line 511) to include
`adminArea3s: sharedData.adminArea3s` in the returned object.

### 5. Server: Data Export (CSV Generation)

**File**: `server/db/project/datasets_in_project_hmis.ts`

#### 5a. `getDatasetHmisExportStatement()` (line 308)

Currently has (line 319-325):

```typescript
if (!w.takeAllAdminArea2s && w.adminArea2sToInclude.length > 0) {
  whereConditions.push(
    `f.admin_area_2 IN (${w.adminArea2sToInclude.map(...).join(", ")})`
  );
}
```

**Replace with** (AA3 takes priority, if/else — not both):

```typescript
const aa3Items = w.adminArea3sToInclude ?? [];
if (!(w.takeAllAdminArea3s ?? true) && aa3Items.length > 0) {
  // AA3 filtering — parse composite keys into (aa3, aa2) pairs
  const pairs = aa3Items.map((key) => parseAa3CompositeKey(key));
  whereConditions.push(
    `(f.admin_area_3, f.admin_area_2) IN (VALUES ${pairs
      .map((p) => `('${escapeSqlString(p.aa3)}', '${escapeSqlString(p.aa2)}')`)
      .join(", ")})`
  );
} else if (!w.takeAllAdminArea2s && w.adminArea2sToInclude.length > 0) {
  // Fallback to AA2 for old configs
  whereConditions.push(
    `f.admin_area_2 IN (${w.adminArea2sToInclude
      .map((aa) => `'${escapeSqlString(aa)}'`)
      .join(", ")})`
  );
}
```

#### 5b. Facilities export query (line 157-203)

Same if/else pattern. Note: this query uses **unaliased** column names (no `f.`
prefix — the query is `SELECT * FROM facilities` without an alias):

```typescript
const aa3Items = startingWindowing.adminArea3sToInclude ?? [];
if (!(startingWindowing.takeAllAdminArea3s ?? true) && aa3Items.length > 0) {
  const pairs = aa3Items.map((key) => parseAa3CompositeKey(key));
  facilityWhereConditions.push(
    `(admin_area_3, admin_area_2) IN (VALUES ${pairs
      .map((p) => `('${escapeSqlString(p.aa3)}', '${escapeSqlString(p.aa2)}')`)
      .join(", ")})`
  );
} else if (
  !startingWindowing.takeAllAdminArea2s &&
  startingWindowing.adminArea2sToInclude.length > 0
) {
  facilityWhereConditions.push(
    `admin_area_2 IN (${startingWindowing.adminArea2sToInclude
      .map((aa) => `'${escapeSqlString(aa)}'`)
      .join(", ")})`
  );
}
```

#### 5c. Default windowing fallback (line 101-108)

No change needed — the fallback creates a windowing without AA3 fields, and
`takeAllAdminArea3s ?? true` defaults correctly.

### 6. Server: Delete Windowing

**File**: `server/db/instance/dataset_hmis.ts`

The `deleteAllDatasetHmisData` function (line 141-260) filters by AA2 in both
the count query (line 166-183) and delete query (line 203-226).

**Note**: Admin area filtering is currently hidden in the delete UI
(`WindowingSelector` wraps it in `<Show when={!isDelete}>`), so the delete
windowing always sends `takeAllAdminArea2s: true` and the AA2 filter path is
dead code. Apply the same AA3-first/AA2-fallback pattern here for
defensiveness, but this is low priority — it only matters if delete UI later
exposes admin area filtering.

### 7. Client: WindowingSelector

**File**: `client/src/components/WindowingSelector.tsx`

Currently renders a flat `ToggledMultiSelect` for admin areas (line 272-286).

**Changes**:

1. Import `NestedMultiSelect` and types from panther, and helpers from lib:

   ```typescript
   import {
     NestedMultiSelect,
     type NestedSelectNode,
     type NestedSelectBranchNode,
     type NestedSelectLeafNode,
   } from "panther";
   import { makeAa3CompositeKey } from "lib";
   ```

   No need to import `instanceState` — the decision is driven by server data
   (presence of `adminArea3s` in the response), not by reading `maxAdminArea`
   directly.

2. Build tree nodes from `keyedItemsHolder.adminArea3s` (inside the
   `StateHolderWrapper` callback, alongside other memos):

   ```typescript
   const adminAreaTree = createMemo(() => {
     const aa3s = keyedItemsHolder.adminArea3s;
     if (!aa3s || aa3s.length === 0) return undefined;
     const grouped = new Map<string, { admin_area_3: string; admin_area_2: string }[]>();
     for (const item of aa3s) {
       const list = grouped.get(item.admin_area_2) ?? [];
       list.push(item);
       grouped.set(item.admin_area_2, list);
     }
     const nodes: NestedSelectNode<string>[] = [];
     for (const [aa2, districts] of grouped) {
       nodes.push({
         key: aa2,
         label: aa2,
         children: districts.map((d): NestedSelectLeafNode<string> => ({
           key: makeAa3CompositeKey(d.admin_area_3, d.admin_area_2),
           label: d.admin_area_3,
           value: makeAa3CompositeKey(d.admin_area_3, d.admin_area_2),
         })),
       });
     }
     return nodes;
   });
   ```

   Returns `undefined` when AA3 data is absent or empty — this ensures the
   fallback to flat AA2 renders correctly (empty array is truthy, `undefined`
   is not).

3. Replace the admin areas section (line 272-286):

   ```tsx
   <Show when={!isDelete}>
     <Show when={adminAreaTree()} fallback={
       <ToggledMultiSelect
         heading={{ en: "Admin areas", fr: "Unites administratives" }}
         toggleAllLabel={{ en: "Include all admin areas", fr: "Inclure toutes les unites administratives" }}
         takeAll={p.tempWindowing.takeAllAdminArea2s}
         setTakeAll={(v) => (p.setTempWindowing as any)("takeAllAdminArea2s", v)}
         itemOptions={getSelectOptions(keyedItemsHolder.adminArea2s)}
         itemsToTake={p.tempWindowing.adminArea2sToInclude}
         setItemsToTake={(v) => (p.setTempWindowing as any)("adminArea2sToInclude", v)}
         isDelete={isDelete}
       />
     }>
       {(tree) => (
         <ToggledNestedMultiSelect
           heading={{ en: "Admin areas", fr: "Unites administratives" }}
           toggleAllLabel={{ en: "Include all admin areas", fr: "Inclure toutes les unites administratives" }}
           takeAll={p.tempWindowing.takeAllAdminArea3s ?? true}
           setTakeAll={(v) => (p.setTempWindowing as any)("takeAllAdminArea3s", v)}
           nodes={tree()}
           itemsToTake={p.tempWindowing.adminArea3sToInclude ?? []}
           setItemsToTake={(v) => (p.setTempWindowing as any)("adminArea3sToInclude", v)}
         />
       )}
     </Show>
   </Show>
   ```

4. Add a `ToggledNestedMultiSelect` wrapper (same file, alongside existing
   `ToggledMultiSelect`):

   ```tsx
   function ToggledNestedMultiSelect(p: {
     heading: TranslatableString;
     toggleAllLabel: TranslatableString;
     takeAll: boolean;
     setTakeAll: (v: boolean) => void;
     nodes: NestedSelectNode<string>[];
     itemsToTake: string[];
     setItemsToTake: (v: string[]) => void;
   }) {
     return (
       <div class="ui-spy-sm ui-pad border-base-300 max-h-[600px] flex-none overflow-auto rounded border xl:col-span-4">
         <div class="text-md font-700">{t3(p.heading)}</div>
         <Checkbox
           label={t3(p.toggleAllLabel)}
           checked={p.takeAll}
           onChange={p.setTakeAll}
         />
         <Show when={!p.takeAll}>
           <div class="pl-4">
             <NestedMultiSelect
               nodes={p.nodes}
               values={p.itemsToTake}
               onChange={p.setItemsToTake}
             />
           </div>
         </Show>
       </div>
     );
   }
   ```

### 8. Client: Settings Component

**File**: `client/src/components/project/settings_for_project_dataset_hmis.tsx`

**Update default windowing** (line 59-67) to include new fields:

```typescript
{
  indicatorType: "common",
  start: DEFAULT_PERIOD_START,
  end: DEFAULT_PERIOD_END,
  takeAllIndicators: true,
  takeAllAdminArea2s: true,
  adminArea2sToInclude: [],
  commonIndicatorsToInclude: [],
  // NEW
  takeAllAdminArea3s: true,
  adminArea3sToInclude: [],
}
```

**Update validation** in the save handler (line 116-123). Use if/else — AA3
check takes priority, skip AA2 check when AA3 is active:

```typescript
const aa3Active = !(newWindowing.takeAllAdminArea3s ?? true);
const aa3Items = newWindowing.adminArea3sToInclude ?? [];

if (aa3Active) {
  if (aa3Items.length === 0) {
    return { success: false, err: t3({ en: "You must select at least one admin area", fr: "..." }) };
  }
} else if (!newWindowing.takeAllAdminArea2s && newWindowing.adminArea2sToInclude.length === 0) {
  return { success: false, err: t3({ en: "You must select at least one admin area", fr: "..." }) };
}
```

**Reset AA2 fields in the submission spread** (line 163-176), not by mutating
`newWindowing`. The existing code already uses a spread to override facility
fields before sending to the server. Follow the same pattern:

```typescript
return await serverActions.addDatasetToProject(
  {
    projectId: p.projectDetail.id,
    datasetType: "hmis",
    windowing: {
      ...newWindowing,
      // Reset AA2 when AA3 is active, so server uses AA3 path only
      ...(aa3Active
        ? { takeAllAdminArea2s: true, adminArea2sToInclude: [] }
        : {}),
      takeAllFacilityOwnerships,
      facilityOwnwershipsToInclude,
      takeAllFacilityTypes,
      facilityTypesToInclude,
    },
  },
  onProgress,
);
```

Note: `newWindowing` comes from `unwrap(tempWindowing)` — it's a plain object,
but direct mutation would work. However, the spread pattern is consistent with
how the existing code handles facility field overrides at submission time.

### 9. Client: Delete Data Component

**File**: `client/src/components/instance_dataset_hmis/_delete_data.tsx`

**Update default windowing** (line 33-44) to include AA3 defaults:

```typescript
{
  indicatorType: "raw",
  start: DEFAULT_PERIOD_START,
  end: DEFAULT_PERIOD_END,
  takeAllIndicators: true,
  takeAllAdminArea2s: true,
  rawIndicatorsToInclude: [],
  adminArea2sToInclude: [],
  // NEW
  takeAllAdminArea3s: true,
  adminArea3sToInclude: [],
}
```

Admin area filtering is hidden in delete mode (`<Show when={!isDelete}>`), so
these defaults just ensure type compatibility. No validation changes needed.

### 10. Cache Key Update

**File**: `client/src/state/dataset_cache.ts`

The HMIS display cache (line 24-41) uses a `createReactiveCache` with:
- `uniquenessKeys`: `[rawOrCommonIndicators, facilityColumnsHash]`
- `versionKey`: `` `${versionId}_${indicatorMappingsVersion}` ``

If `maxAdminArea` changes (e.g., structure re-imported to add AA3), neither key
changes, so the cache serves stale data without the AA3 list.

**Fix**: Add `maxAdminArea` to the cache params and `versionKey`:

```typescript
const _DATASET_HMIS_DISPLAY_INFO_CACHE = createReactiveCache<
  {
    rawOrCommonIndicators: IndicatorType;
    facilityColumns: InstanceConfigFacilityColumns;
    versionId: number;
    indicatorMappingsVersion: string;
    maxAdminArea: number;  // NEW
  },
  ItemsHolderDatasetHmisDisplay
>({
  name: "dataset_hmis_display_info",
  uniquenessKeys: (params) => {
    const fcHash = Object.values(params.facilityColumns).sort().join("_");
    return [params.rawOrCommonIndicators, fcHash];
  },
  versionKey: (params, _pds) =>
    `${params.versionId}_${params.indicatorMappingsVersion}_${params.maxAdminArea}`,
  pdsNotRequired: true,
});
```

Then update `getDatasetHmisDisplayInfoFromCacheOrFetch` to accept a new
`maxAdminArea: number` parameter (5th argument) and pass it into the cache
params and the server action call. Both callers need updating:

- **`client/src/components/WindowingSelector.tsx`** (line 65): add
  `instanceState.maxAdminArea` as the 5th argument. Requires adding
  `import { instanceState } from "~/state/instance_state";` (not currently
  imported).
- **`client/src/components/instance_dataset_hmis/dataset_items_holder.tsx`**
  (line 61): same — add `instanceState.maxAdminArea` as the 5th argument.
  Requires adding `import { instanceState } from "~/state/instance_state";`
  (not currently imported).

---

## Files Changed (Summary)

| File | Change |
|------|--------|
| `lib/types/dataset_hmis.ts` | Add `takeAllAdminArea3s`, `adminArea3sToInclude` to base type; add `AA3_SEPARATOR`, `makeAa3CompositeKey`, `parseAa3CompositeKey` |
| `lib/types/instance.ts` | Add `adminArea3s?` field to `ItemsHolderDatasetHmisDisplay` |
| `server/db/instance/dataset_hmis.ts` | Query AA3 list via `getMaxAdminAreaConfig` in `getDatasetHmisItemsForDisplay`; update `SharedDataForDisplay`; add to both display response builders; update delete function |
| `server/db/project/datasets_in_project_hmis.ts` | AA3-first/AA2-fallback in export SQL (section 5a) + facilities query (section 5b); add `escapeSqlString` to all string-interpolated SQL values |
| `client/src/components/WindowingSelector.tsx` | Build tree from AA3 data; show `NestedMultiSelect` when tree is present and non-empty, flat `MultiSelect` otherwise; add `ToggledNestedMultiSelect` wrapper |
| `client/src/components/project/settings_for_project_dataset_hmis.tsx` | Default values; if/else validation (AA3 priority, skip AA2 when AA3 active); reset AA2 before sending |
| `client/src/components/instance_dataset_hmis/_delete_data.tsx` | Add AA3 defaults for type compatibility |
| `client/src/state/dataset_cache.ts` | Add `maxAdminArea` to cache params and `versionKey`; update `getDatasetHmisDisplayInfoFromCacheOrFetch` signature |
| `client/src/components/instance_dataset_hmis/dataset_items_holder.tsx` | Import `instanceState`; pass `maxAdminArea` to cache fetch (line 61) |

## No Migration Needed

All new fields are optional with sensible defaults. Existing stored configs
continue to work — `takeAllAdminArea3s` defaults to `true` (no filter), and the
server falls back to the existing AA2 fields.

## Edge Cases

- **AA3 name collisions across AA2s**: Solved by composite keys
  (`"aa3|||aa2"`). SQL uses tuple `IN` with `VALUES` clause. The
  `parseAa3CompositeKey` function throws on malformed input.

- **Single quotes in admin area names** (e.g. N'Djamena): All SQL string
  interpolation uses `escapeSqlString` to double single quotes. This fixes a
  pre-existing vulnerability in the AA2 code as well.

- **Existing configs with AA2 filters**: Continue to work. Server checks AA3
  first, falls back to AA2. When user re-opens settings and saves, AA3 fields
  take over and AA2 fields are reset.

- **maxAdminArea < 3**: No AA3 data returned from server. `adminAreaTree()`
  returns `undefined`. Fallback renders existing flat AA2 multi-select. No code
  path reaches AA3 logic.

- **maxAdminArea >= 3 but admin_areas_3 table is empty**: Server returns empty
  array. `adminAreaTree()` memo checks `aa3s.length === 0` and returns
  `undefined`, so the flat AA2 multi-select renders as fallback.

- **Delete mode**: Admin area filtering remains hidden. AA3 defaults ensure
  type compatibility. Server-side AA3 support in delete is defensive only.

- **admin_area_1 not included in AA3 query**: Safe because the app is
  single-country (one AA1 value). If multiple AA1s existed, AA3 names could
  collide across AA1 boundaries — not a concern for this deployment.
