# Plan: Multi-Category HFA Indicators + Project-Level Service-Category Scoping

## Status: IMPLEMENTED (typecheck green, migrations validated, jsonb semantics verified)

> Storage note: `service_category_ids` is a plain `TEXT` column holding a
> **JSON-encoded `string[]`** (the app's convention for list columns — no other
> column uses `TEXT[]`), not a Postgres array. This drops the old single-FK
> `ON DELETE SET NULL`; integrity is preserved in code instead — `delete`
> scrubs the id from every list (`jsonb - id`), `rename` rewrites it
> (`jsonb_agg` rebuild), and writes are validated at the app layer (editor
> options + XLSX import). Scope overlap uses `jsonb_exists_any(...::jsonb, $scope)`.
> A real DB FK would require a join table (deliberately not done).

The feature:

- **Part 1 — Indicator multi-tagging.** One HFA indicator can belong to
  **multiple** service categories (today: only one). Multi-select in the editor;
  stored as an array on the **instance** `hfa_indicators` table.
- **Part 2 — Project scoping.** A per-project setting — just a multi-select of
  service categories plus an "Include all" option. When HFA data is added to a
  project, only indicators tagged with (at least one of) the selected categories
  are imported.

### Core principle

Service category is **instance-level authoring metadata, used only for scoping.**
The scope filter runs inside `addDatasetHfaToProject`, which already reads the
instance `hfa_indicators` table.

### What we keep as-is (the lean call)

The shipped `hfa_service_category` results column / snapshot column / viz
dimension stays — ripping it out is wide (m010 module defs, `.validation/` copy,
the Zod `disaggregationOption` enum, the HMIS snapshot path all reference it). We
**keep the plumbing** and only change the join: the R metadata vector emits the
**primary** category (`serviceCategoryIds[0]`). The snapshot keeps its existing
single `service_category_id` column, populated from the primary — **no snapshot
migration, no rip-out, no third-repo change.**

---

## Storage

- **Tags (instance):** replace `hfa_indicators.service_category_id` (single FK) with
  `service_category_ids TEXT[] NOT NULL DEFAULT '{}'`. Catalog table unchanged.
- **Project scope:** `serviceCategoryScope?: string[]` on `DatasetHfaInfoInProject`.
  Absent/empty = Include all; non-empty = only those categories.
- **Snapshot/results:** the results `hfa_service_category` column shows the
  categories **pipe-joined** (`maternal-health|rmnch`) — display-only in the viz
  editor. The snapshot carries the array.

### Open decision

Untagged indicators (`{}`) under a specific scope → **excluded** (recommended).

---

## PART 1 — Indicator multi-tagging

### 1.1 Instance migration + base schema
New `server/db/migrations/instance/053_*.sql`:

```sql
ALTER TABLE hfa_indicators
  ADD COLUMN IF NOT EXISTS service_category_ids TEXT[] NOT NULL DEFAULT '{}';
UPDATE hfa_indicators
SET service_category_ids =
  CASE WHEN service_category_id IS NOT NULL AND service_category_id != ''
       THEN ARRAY[service_category_id] ELSE '{}' END
WHERE service_category_id IS NOT NULL;
ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS service_category_id;
```
Update base `server/db/instance/_main_database.sql:462`.

### 1.2 Types
`lib/types/hfa_types.ts`: `serviceCategoryId: string | null` →
`serviceCategoryIds: string[]` in `HfaIndicator` ([:24](lib/types/hfa_types.ts#L24)) and `HfaWorkbookImport.indicators` ([:51](lib/types/hfa_types.ts#L51)).

### 1.3 Instance DB access (`server/db/instance/hfa_indicators.ts`)
- `DBHfaIndicator` ~[:38](server/db/instance/hfa_indicators.ts#L38): `service_category_ids: string[]`.
- `dbRowToHfaIndicator` ~[:88](server/db/instance/hfa_indicators.ts#L88): `serviceCategoryIds: row.service_category_ids ?? []`.
- `getHfaIndicators` [:112](server/db/instance/hfa_indicators.ts#L112): `SELECT *` — no change.
- 5 write sites scalar→array: [:356](server/db/instance/hfa_indicators.ts#L356), [:374](server/db/instance/hfa_indicators.ts#L374), [:435](server/db/instance/hfa_indicators.ts#L435), [:604](server/db/instance/hfa_indicators.ts#L604), [:642](server/db/instance/hfa_indicators.ts#L642).
- Integrity (replaces dropped `ON DELETE SET NULL`), atomic + bump `updated_at`:
  `deleteHfaIndicatorServiceCategory` [:316](server/db/instance/hfa_indicators.ts#L316) → `array_remove`; `updateHfaIndicatorServiceCategory` [:299](server/db/instance/hfa_indicators.ts#L299) on id change → `array_replace`.

### 1.4 Snapshot: carry the array (`datasets_in_project_hfa.ts` + project migration)
- New `server/db/migrations/project/028_*.sql`: `hfa_indicators_snapshot.service_category_id` → `service_category_ids TEXT[]` (add, backfill from single, drop). Update base `server/db/project/_project_database.sql:50`.
- Snapshot INSERT [:276-281](server/db/project/datasets_in_project_hfa.ts#L276-L281): `service_category_id` → `service_category_ids`, value `${ind.service_category_ids}`.
- Readback `getAllHfaIndicatorsFromSnapshot` [:340](server/db/project/datasets_in_project_hfa.ts#L340): `i.service_category_id` → `i.service_category_ids` (shared mapper).
- Catalog snapshot + `get_indicator_metadata` untouched.

### 1.5 R metadata vector — hyphen-join (display only)
`get_script_with_parameters_hfa.ts:270` ([:270](server/server_only_funcs/get_script_with_parameters_hfa.ts#L270)): `i.serviceCategoryId ?? ""` → `i.serviceCategoryIds.join("|")`. The results column is display-only in the viz editor; a multi-tag indicator shows as `a|b` (won't resolve to a label — acceptable). `supportsServiceCategory` gate unchanged. No `m010` / module-def change.

### 1.6 Editor multi-select
Panther `MultiSelect` props: **`values`** (plural), `options`, `onChange` ([multi_select.tsx:12-22](panther/_303_components/form_inputs/multi_select.tsx#L12-L22)).
- `edit_hfa_indicator.tsx` [:31](client/src/components/forms_editors/edit_hfa_indicator.tsx#L31)/[:56](client/src/components/forms_editors/edit_hfa_indicator.tsx#L56)/[:128-137](client/src/components/forms_editors/edit_hfa_indicator.tsx#L128-L137).
- `hfa_indicator_code_editor.tsx` [:39](client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx#L39)/[:169](client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx#L169)/[:302](client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx#L302)/[:370](client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx#L370).
- `hfa_indicators_manager.tsx` column [:547-557](client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx#L547-L557): joined labels, `—` when empty.

### 1.7 XLSX round-trip (`_xlsx_workbook.ts`)
Pipe-delimited in the single `serviceCategoryId` column.
- Export [:62-64](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts#L62-L64): `ind.serviceCategoryIds.join("|")`.
- Import/validate [:274-289](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts#L274-L289): split `|`, trim, drop blanks, validate each id.
- Guard `|` out of service-category ids. Hint [hfa_indicators_xlsx_upload_form.tsx:105](client/src/components/indicator_manager_hfa/hfa_indicators_xlsx_upload_form.tsx#L105).

---

## PART 2 — Project scoping (multi-select, or Include all)

### 2.1 Type
`DatasetHfaInfoInProject` ([datasets_in_project.ts:35-46](lib/types/datasets_in_project.ts#L35-L46)) += `serviceCategoryScope?: string[]`.

### 2.2 Route body
Add-dataset body += `serviceCategoryScope?: string[]` ([lib/api-routes/project/projects.ts:110](lib/api-routes/project/projects.ts#L110)).

### 2.3 Route plumbing
`server/routes/project/project.ts` [:268-274](server/routes/project/project.ts#L268-L274) passes `body.serviceCategoryScope` to `addDatasetHfaToProject`. Project-create call site [projects.ts:428](server/db/project/projects.ts#L428) defaults `[]`.

### 2.4 Import filter + persist (`datasets_in_project_hfa.ts`)
`addDatasetHfaToProject` [:41](server/db/project/datasets_in_project_hfa.ts#L41) += `serviceCategoryScope: string[] = []`.
- Filter indicator source read [:132](server/db/project/datasets_in_project_hfa.ts#L132): when non-empty, `WHERE service_category_ids && ${scope}`. Empty → no filter.
- Filter dependents to surviving `var_name` set: code rows [:135](server/db/project/datasets_in_project_hfa.ts#L135), `indicators_hfa` sample insert [:196-215](server/db/project/datasets_in_project_hfa.ts#L196-L215).
- Persist scope into `info` [:169-174](server/db/project/datasets_in_project_hfa.ts#L169-L174).
- Zero-indicator result → clear error.

### 2.5 Client UI
`MultiSelect` of instance service categories (via `getHfaIndicatorServiceCategories`) + "Include all" toggle (sends `[]`). In the HFA dataset settings flow — analog of [settings_for_project_dataset_hmis.tsx](client/src/components/project/settings_for_project_dataset_hmis.tsx) / [WindowingSelector.tsx](client/src/components/WindowingSelector.tsx), from [project_data.tsx](client/src/components/project/project_data.tsx). Default from existing `datasets.info.serviceCategoryScope` on re-add.

### 2.6 Lifecycle
Add-dataset route already calls `setModulesDirtyForDataset` [:291](server/routes/project/project.ts#L291) + `notifyLastUpdated`; scope changes take effect on re-add (note in UI, like windowing).

---

## NOT in scope
Per-viz query-time filtering; removing the `hfa_service_category` dimension/column; `m010`/module-def/panther changes.

---

## Test plan
1. `./validate_migrations` green (053); backfill single→one-element array; `deno task typecheck` green.
2. Tag an indicator with two categories; save/reload persist; XLSX `"sc1|sc2"` round-trips; delete a category in use → removed from arrays; rename id → arrays update.
3. Results column shows the primary category; existing viz dimension unchanged.
4. Add HFA with scope = one category → only its indicators imported; a two-category indicator appears when either is in scope; "Include all" imports everything; existing projects unchanged; re-add reuses persisted scope; changing scope re-snapshots + re-runs; untagged excluded under a specific scope.

---

## Files map
| Part | File |
|---|---|
| 1 | `instance/053_*.sql` (new), `server/db/instance/_main_database.sql` |
| 1 | `lib/types/hfa_types.ts`, `server/db/instance/hfa_indicators.ts` |
| 1 | `server/db/project/datasets_in_project_hfa.ts` (snapshot bridge), `server/server_only_funcs/get_script_with_parameters_hfa.ts` |
| 1 | `edit_hfa_indicator.tsx`, `hfa_indicator_code_editor.tsx`, `hfa_indicators_manager.tsx`, `_xlsx_workbook.ts`, `hfa_indicators_xlsx_upload_form.tsx` |
| 2 | `lib/types/datasets_in_project.ts`, `lib/api-routes/project/projects.ts`, `server/routes/project/project.ts`, `server/db/project/projects.ts` |
| 2 | `server/db/project/datasets_in_project_hfa.ts` (filter+persist), `HfaServiceCategorySelector` (new) + HFA dataset settings + `project_data.tsx` |
