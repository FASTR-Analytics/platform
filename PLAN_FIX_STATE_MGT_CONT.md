# Plan: Fix State Management Tier Adherence

## Summary

After thorough investigation, **9 confirmed issues** to fix. Many initially reported issues were false positives or intentional design patterns.

---

## Real Bugs - Must Fix

### 3.4 HFA `dataset_items_holder.tsx` - No reactive deps in createEffect

- **File:** `client/src/components/instance_dataset_hfa/dataset_items_holder.tsx`
- **Status:** ✅ REAL BUG
- **Problem:** `createEffect` calls async function without synchronous reactive reads. `p.cacheHash` is accessed inside async function, not tracked by Solid.

**Current code:**
```tsx
createEffect(() => {
  attemptGetDatatable();  // p.cacheHash accessed inside, not tracked
});
```

**Fix:**
```tsx
createEffect(() => {
  const hash = p.cacheHash;  // force tracking synchronously
  attemptGetDatatable(hash);
});

async function attemptGetDatatable(cacheHash: string) {
  setItemsHolder({ status: "loading", msg: t3({ en: "Fetching data...", fr: "Récupération des données..." }) });
  const res = await getDatasetHfaDisplayInfoFromCacheOrFetch(cacheHash);
  // ... rest unchanged
}
```

---

### 3.9 `structure/with_csv.tsx` - No reactive deps in createEffect

- **File:** `client/src/components/structure/with_csv.tsx`
- **Status:** ✅ REAL BUG
- **Problem:** Same pattern - `instanceState` reads happen inside async function, not tracked.

**Current code:**
```tsx
createEffect(() => {
  attemptGetStructureItems();  // reads instanceState inside, not tracked
});
```

**Fix:**
```tsx
createEffect(() => {
  const lastUpdated = instanceState.structureLastUpdated;
  const maxAA = instanceState.maxAdminArea;
  const fcHash = Object.values(instanceState.facilityColumns).sort().join("_");
  if (!lastUpdated) {
    seStructureItems({ status: "error", err: "No structure data" });
    return;
  }
  attemptGetStructureItems(lastUpdated, maxAA, fcHash);
});

async function attemptGetStructureItems(lastUpdated: string, maxAA: number, fcHash: string) {
  seStructureItems({ status: "loading", msg: t3(TC.fetchingData) });
  const res = await getStructureItemsFromCacheOrFetch(lastUpdated, maxAA, fcHash);
  // ... rest unchanged
}
```

---

## Unnecessary Manual Refresh - Should Fix

These work but violate the tier system. SSE handles T1 updates automatically.

### 2.2 `geojson_edit_modal.tsx` - silentRefresh

- **File:** `client/src/components/instance_geojson/geojson_edit_modal.tsx:128`
- **Status:** ✅ UNNECESSARY
- **Problem:** `p.silentRefresh()` called after `remapGeoJson` mutation. GeoJSON maps are in T1, SSE broadcasts `geojson_maps_updated`.

**Fix:** Remove `p.silentRefresh()` call. Remove `silentRefresh` prop from component interface and all callers.

---

### 2.3 `geojson_upload_wizard/step_4.tsx` - silentRefresh

- **File:** `client/src/components/instance_geojson/geojson_upload_wizard/step_4.tsx:90,132`
- **Status:** ✅ UNNECESSARY
- **Problem:** `state.silentRefresh()` called after `saveGeoJsonMap` mutations.

**Fix:** Remove `state.silentRefresh()` calls. Remove from wizard state interface.

---

### 2.4 `_time_points.tsx` - onRefresh

- **File:** `client/src/components/instance_dataset_hfa/_time_points.tsx:65,77,90,100`
- **Status:** ✅ UNNECESSARY
- **Problem:** `p.onRefresh()` called after update/delete/reorder mutations. `hfaTimePoints` is in T1 store.

**Fix:** Remove all `p.onRefresh()` calls. Remove `onRefresh` prop from component interface.

---

### 2.5 `_delete_data.tsx` - silentFetch

- **File:** `client/src/components/instance_dataset_hfa/_delete_data.tsx:37`
- **Status:** ✅ UNNECESSARY
- **Problem:** `silentFetch` callback passed to `timActionDelete`.

**Fix:** Remove `silentFetch` callback. Remove prop from component interface.

---

### 3.8 `geojson_manager.tsx` - Manual cache clearing

- **File:** `client/src/components/instance_geojson/geojson_manager.tsx:30,42,80`
- **Status:** ✅ MINOR - Defensive but unnecessary
- **Problem:** `clearGeoJsonMemoryCache()` called manually after upload/edit/delete.

**Fix:** Remove `clearGeoJsonMemoryCache()` calls. T2 cache should auto-invalidate via T1 version key. Low priority since functionally harmless.

---

## Docs/Naming - Low Priority

### 1.1 `disaggregation_label.ts` - No tier prefix

- **File:** `client/src/state/instance/disaggregation_label.ts`
- **Status:** ✅ NAMING ISSUE
- **Fix:** Rename to `_util_disaggregation_label.ts`

---

### 1.2-1.3 Missing T4 files in docs

- **File:** `DOC_STATE_MGT_PROJECT.md`
- **Status:** ✅ DOCS ISSUE
- **Problem:** References `t4_ai_interpretations.ts` and `t4_long_form_editor.ts` which don't exist.
- **Fix:** Remove these two rows from the T4 table:
  ```
  | AI interpretations (per PO) | `project/t4_ai_interpretations.ts` | In-memory Solid store (24h TTL) | ... |
  | Long form editor mode | `project/t4_long_form_editor.ts` | Module-level signals | ... |
  ```

---

## Not Issues - False Positives

| Issue | Verdict | Reason |
|-------|---------|--------|
| 3.3 HMIS dataset_items_holder | ❌ NOT an issue | Parent passes `instanceState.indicatorMappingsVersion` directly - reactive read triggers re-render |
| 3.1 WindowingSelector | ❌ NOT an issue | Only used in modal editors - snapshot behavior is correct |
| 3.2 ReplicateByOptions | ❌ NOT an issue | Editor uses snapshots, so live `moduleLastRun` tracking isn't needed |
| 3.5 PresentationObjectMiniDisplay | ❌ NOT an issue | `void projectState.lastUpdated...` is valid T1 tracking |
| 3.6 visualization_settings | ❌ NOT an issue | Intentional admin "Clear cache" feature |
| 3.7 project_visualizations | ❌ NOT an issue | Event handler T2 usage is fine |
| 3.10 slide_card | ❌ NOT an issue | Non-canonical but correct T1 tracking |
| 4.2 projectState prop drilling | ❌ NOT an issue | Snapshot passing for editor isolation via `snapshotForVizEditor()` |
| 4.3 instanceState prop drilling | ❌ NOT an issue | Same - snapshot for comparison |
| 2.1 project_settings backups | ❌ NOT an issue | Backups are T3 on-demand data |
| 2.6 create_backup_form | ❌ NOT an issue | Same - T3 data |

---

## Debatable - Consider Later

### 4.1 AIProjectContext

- **File:** `client/src/components/project_ai/context.tsx`
- **Status:** 🤔 DEBATABLE
- **Problem:** Uses Context for ephemeral AI UI state. Docs say "No Context" but this state doesn't fit tiers cleanly.
- **Recommendation:** Could extract to `t4_ai_ui.ts` with module-level signals. Low priority - current approach works.

### 5.1 aiContext in T1 Store

- **File:** `client/src/state/project/t1_store.ts:14`
- **Status:** 🤔 TYPE/DOCS INCONSISTENCY
- **Problem:** Comment says "stays T3" but it's in ProjectState. Behaves like T3 (not broadcast on update) but lives in T1.
- **Recommendation:** Either remove from T1 and fetch on-demand, or update docs. Low priority.

---

## Summary

### Must fix (2 items):
1. **3.4** HFA dataset_items_holder - add reactive deps
2. **3.9** structure/with_csv - add reactive deps

### Should fix (5 items):
3. **2.2** geojson_edit_modal - remove silentRefresh
4. **2.3** geojson_upload_wizard/step_4 - remove silentRefresh
5. **2.4** _time_points - remove onRefresh
6. **2.5** _delete_data - remove silentFetch
7. **3.8** geojson_manager - remove clearGeoJsonMemoryCache (optional)

### Docs/naming (2 items):
8. **1.1** Rename disaggregation_label.ts
9. **1.2-1.3** Remove missing T4 refs from docs
