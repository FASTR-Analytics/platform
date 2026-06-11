# Plan: Multi-Value Service Categories (`hfa_service_category`)

## Status: NOT YET IMPLEMENTED

---

## 1. Goal

Let a single HFA indicator belong to **more than one** service category (e.g. "Antenatal
care coverage" tagged as both *Maternal health* and *RMNCH*), and let users **filter**
visualizations by any one of those tags.

This is a full feature, end-to-end:

1. **Edit** — the indicator editor stores a *set* of service categories per indicator.
2. **Store (instance)** — normalized, with referential integrity.
3. **Snapshot (project)** — the per-project snapshot carries the set.
4. **Produce (results)** — the R results CSV gets a single denormalized
   `hfa_service_category` column holding the tags **pipe-joined** (`"sc1|sc2"`).
5. **Query** — the viz pipeline unnests that column for the filter value list and
   matches with Postgres **array overlap**.
6. **Present** — `hfa_service_category` is offered as a **filter only**, never as a
   GROUP BY / disaggregation axis.

---

## 2. The architecture (read this before touching code)

Two storage layers, deliberately different shapes:

| Layer | Where | Shape | Why |
|-------|-------|-------|-----|
| **Authoring** | instance `hfa_indicators` + project snapshot | normalized set of category ids | editable, integrity-checked, no string parsing |
| **Query/results** | per-project results table column `hfa_service_category` | denormalized pipe-joined string `"sc1\|sc2"` | the results table is a flat, dynamically-created CSV import; the viz pipeline treats every column as scalar TEXT |

The pipe-delimited results column is **not a hack** — it is the denormalized read-model.
Normalize where you edit; flatten to `"a|b"` only in the query-facing column, and unnest
it at query time. No project results-table schema change, no per-type Zod array schema.

**Two corrections to the previous draft of this plan (both load-bearing):**

- **"Filter-only" is a client concern, not `allowedPresentationOptions`.**
  `allowedPresentationOptions` gates the *presentation type* (`timeseries|table|chart|map`)
  and feeds **both** the Filters panel and the Disaggregation panel from the same list
  ([presentation_object_editor_panel_data.tsx:30-45](client/src/components/visualization/presentation_object_editor_panel_data.tsx#L30-L45)).
  There is **no value** of it that means "filter yes, axis no", and no `filterOnly` field
  exists anywhere. Filter-only is achieved by excluding the column from the two
  client-side *disaggregate-by* lists (Step I3), driven by the shared `MULTI_VALUE_COLUMNS`
  set — **not** by editing `metric_enricher.ts`.

- **The constant lives in `lib/`, not server-only.** Both the server (possible-values,
  WHERE) and the client (axis exclusion) import it.

**The R script does not change.** `m010/script.R` `left_join`s a server-built metadata
table onto the data and writes the column verbatim
([m010/script.R:54-69](../wb-fastr-modules/m010/script.R#L54-L69)). The pipe-join is
rendered server-side when the metadata vector is built; R is a pass-through. No
`wb-fastr-modules` change, no panther change.

---

## 3. Decisions made (override here if you disagree)

### Decision A — instance storage: **array column `TEXT[]`** (recommended), not a join table

Add `service_category_ids TEXT[] NOT NULL DEFAULT '{}'` to `hfa_indicators`; drop the old
single FK `service_category_id`.

- **Why array, not a join table:** maps 1:1 to `serviceCategoryIds: string[]`; reads stay
  `SELECT *` with no aggregation; the 5 write sites keep their current shape (pass an array
  instead of a scalar); the snapshot stays a column copy; and `var_name` renames carry the
  set automatically (with a join table, `var_name` is mutable so the FK would need
  `ON UPDATE CASCADE`). A join table would add a new table + a new snapshot table + delete-
  then-insert link logic inside all 5 write transactions + a grouping read — far more
  surface for no real gain here (service categories are a tiny, co-managed catalog).
- **Integrity (the join table's only advantage) is replaced by two one-liners:**
  - on **delete** of a service category: `array_remove(service_category_ids, id)` across all
    indicators (replaces the old `ON DELETE SET NULL`).
  - on **id change** in update: `array_replace(service_category_ids, oldId, newId)`.

### Decision B — XLSX cell format: **pipe-delimited in the single `serviceCategoryId` column**

The bulk indicator workbook keeps one `serviceCategoryId` column; a cell with multiple
tags is `"sc1|sc2"`. Consistent with the app-wide `|` convention and avoids a variable
column count. (Header label stays `serviceCategoryId` for back-compat; a single id with no
pipe still parses.)

If you'd rather a join table (A) or multiple XLSX columns (B), say so — those choices change
Layers D, E, F only; everything else is unaffected.

---

## 4. Files to change (map)

| Layer | File(s) |
|-------|---------|
| A. Shared constant | `lib/multi_value_columns.ts` (new) + `lib/mod.ts` |
| B. Instance schema | `server/db/migrations/instance/053_hfa_indicator_service_categories_multi.sql` (new) |
| C. Types | `lib/types/hfa_types.ts` |
| D. Instance DB access | `server/db/instance/hfa_indicators.ts` |
| E. Project snapshot | `server/db/migrations/project/028_hfa_service_category_ids_snapshot.sql` (new) + `server/db/project/datasets_in_project_hfa.ts` |
| F. XLSX round-trip | `client/src/components/indicator_manager_hfa/_xlsx_workbook.ts` |
| G. Editor UIs | `edit_hfa_indicator.tsx`, `hfa_indicator_code_editor.tsx`, `hfa_indicators_manager.tsx` |
| H. R metadata vector | `server/server_only_funcs/get_script_with_parameters_hfa.ts` |
| I. Results pipeline | `get_possible_values.ts`, `query_helpers.ts`, `presentation_object_editor_panel_data.tsx`, `add_visualization/step_3_configure.tsx` |
| J. Label lookup | `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts` (no-op, documented) |

---

## 5. Detailed steps

### Layer A — shared constant

**A1.** Create `lib/multi_value_columns.ts`:

```ts
import type { DisaggregationOption } from "./types/disaggregation_options.ts";

// Columns whose stored value is a pipe-joined SET of tags rather than a scalar.
// These are FILTER-ONLY in the viz pipeline (never a GROUP BY / disaggregation
// axis — joining tags makes GROUP BY meaningless) and require unnest / array-
// overlap SQL. See PLAN_MULTI_VALUE_FILTER_COLUMNS.md.
export const MULTI_VALUE_COLUMNS: ReadonlySet<DisaggregationOption> = new Set([
  "hfa_service_category",
]);

export const MULTI_VALUE_SEPARATOR = "|";
```

**A2.** Re-export from the lib barrel — add to `lib/mod.ts`:

```ts
export * from "./multi_value_columns.ts";
```

> Verify the separator `|` cannot appear inside a service-category **id**. Ids are
> author-defined; if `|` is ever a legal id character this whole scheme breaks. Add a
> validation guard in the service-category editor + XLSX import that rejects `|` in ids
> (cheap insurance — see F3).

### Layer B — instance schema migration

**B1.** New file `server/db/migrations/instance/053_hfa_indicator_service_categories_multi.sql`
(confirm `053` is unused — note there are already two `051_*` files in the tree from a
parallel workstream; pick the next free number):

```sql
ALTER TABLE hfa_indicators
  ADD COLUMN IF NOT EXISTS service_category_ids TEXT[] NOT NULL DEFAULT '{}';

-- Backfill the array from the existing single FK.
UPDATE hfa_indicators
SET service_category_ids =
  CASE WHEN service_category_id IS NOT NULL AND service_category_id != ''
       THEN ARRAY[service_category_id]
       ELSE '{}' END
WHERE service_category_id IS NOT NULL;

ALTER TABLE hfa_indicators DROP COLUMN IF EXISTS service_category_id;
```

> The catalog table `hfa_indicator_service_categories` (from
> [051](server/db/migrations/instance/051_hfa_indicator_service_categories.sql)) is
> **unchanged** — ids/labels still live there. We only change how indicators *reference* it.
> No FK on array elements; integrity is enforced in code (D4/D5).

> **DOC_MIGRATIONS / base-schema check:** before dropping `service_category_id`, grep older
> migrations for any index or query on that column. None is expected (added in 051, only
> read via `SELECT *`), but confirm — see the "base schema vs drop migration" rule.

### Layer C — types

**C1.** `lib/types/hfa_types.ts:24` — in `HfaIndicator`:

```ts
serviceCategoryIds: string[];      // was: serviceCategoryId: string | null
```

**C2.** `lib/types/hfa_types.ts:51` — same change inside the `HfaWorkbookImport.indicators`
element type.

> No Zod schema guards these (route bodies are type-only `{} as {...}` contracts —
> [lib/api-routes/instance/hfa_indicators.ts:113-122](lib/api-routes/instance/hfa_indicators.ts#L113-L122)),
> so there is **no strip-drop gate to add**. TypeScript propagation surfaces every consumer.

### Layer D — instance DB access (`server/db/instance/hfa_indicators.ts`)

**D1. DB row type** — line ~38, in `DBHfaIndicator`:

```ts
service_category_ids: string[];    // was: service_category_id: string | null
```

**D2. Row mapper** — `dbRowToHfaIndicator` (the `serviceCategoryId: row.service_category_id`
line, ~88):

```ts
serviceCategoryIds: row.service_category_ids ?? [],
```

**D3. Read** — `getHfaIndicators` ([:112](server/db/instance/hfa_indicators.ts#L112)) is
already `SELECT * FROM hfa_indicators`; the array column comes back automatically. **No
query change** (this is the array-column payoff).

**D4. Five write sites** — replace `service_category_id` with `service_category_ids` and
pass the array. postgres.js encodes a JS `string[]` for a `TEXT[]` column directly:

- `createHfaIndicator` INSERT — [:356-357](server/db/instance/hfa_indicators.ts#L356-L357)
- `updateHfaIndicator` UPDATE — [:374](server/db/instance/hfa_indicators.ts#L374)
- `batchUploadHfaIndicators` INSERT — [:435-436](server/db/instance/hfa_indicators.ts#L435-L436)
- `importHfaIndicatorsWorkbook` INSERT — [:604-605](server/db/instance/hfa_indicators.ts#L604-L605)
- `saveHfaIndicatorFull` UPDATE — [:642](server/db/instance/hfa_indicators.ts#L642)

  e.g. INSERT column list `..., service_category_ids, ...` and value
  `${indicator.serviceCategoryIds}`; UPDATE `service_category_ids = ${indicator.serviceCategoryIds}`.

**D5. Integrity on catalog mutation** — replaces the dropped `ON DELETE SET NULL`:

- `deleteHfaIndicatorServiceCategory` ([:316](server/db/instance/hfa_indicators.ts#L316)) —
  add, inside the existing call:
  ```sql
  UPDATE hfa_indicators SET service_category_ids = array_remove(service_category_ids, ${id});
  ```
  (Run before/with the catalog `DELETE`; wrap both in `mainDb.begin` so they're atomic.)
- `updateHfaIndicatorServiceCategory` ([:299](server/db/instance/hfa_indicators.ts#L299)) —
  when the id changes (`oldId !== serviceCategory.id`), add:
  ```sql
  UPDATE hfa_indicators
  SET service_category_ids = array_replace(service_category_ids, ${oldId}, ${serviceCategory.id});
  ```
  (Again atomic with the catalog UPDATE.)

### Layer E — project snapshot

**E1.** New file `server/db/migrations/project/028_hfa_service_category_ids_snapshot.sql`
(mirror of B1 for the snapshot table from
[026](server/db/migrations/project/026_hfa_service_categories_snapshot.sql)):

```sql
ALTER TABLE hfa_indicators_snapshot
  ADD COLUMN IF NOT EXISTS service_category_ids TEXT[] NOT NULL DEFAULT '{}';

UPDATE hfa_indicators_snapshot
SET service_category_ids =
  CASE WHEN service_category_id IS NOT NULL AND service_category_id != ''
       THEN ARRAY[service_category_id] ELSE '{}' END
WHERE service_category_id IS NOT NULL;

ALTER TABLE hfa_indicators_snapshot DROP COLUMN IF EXISTS service_category_id;
```

**E2.** `server/db/project/datasets_in_project_hfa.ts`:

- **Fetch from instance** — the snapshot source read is `SELECT * FROM hfa_indicators`
  ([:132-134](server/db/project/datasets_in_project_hfa.ts#L132-L134)); `service_category_ids`
  comes through `DBHfaIndicator` automatically once D1 lands.
- **Snapshot INSERT** — [:276-281](server/db/project/datasets_in_project_hfa.ts#L276-L281):
  change the column list `service_category_id` → `service_category_ids` and value
  `${ind.service_category_id}` → `${ind.service_category_ids}`.
- **Snapshot readback** — `getAllHfaIndicatorsFromSnapshot`
  [:336-348](server/db/project/datasets_in_project_hfa.ts#L336-L348): change the selected
  column `i.service_category_id` → `i.service_category_ids` (mapped by the shared
  `dbRowToHfaIndicator`, already handled by D2).

> The snapshot **catalog** table `hfa_indicator_service_categories_snapshot` and its copy
> ([:271-275](server/db/project/datasets_in_project_hfa.ts#L271-L275)) are unchanged.

### Layer F — XLSX round-trip (`client/src/components/indicator_manager_hfa/_xlsx_workbook.ts`)

**F1. Export** — row writer [:62-64](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts#L62-L64):
`ind.serviceCategoryId ?? ""` → `ind.serviceCategoryIds.join("|")`. Header list stays as-is
([:51](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts#L51)).

**F2. Import/parse + validate** —
[:274-289](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts#L274-L289):
```ts
const serviceCategoryIds = (row.serviceCategoryId ?? "")
  .split("|").map((s) => s.trim()).filter(Boolean);
for (const scId of serviceCategoryIds) {
  if (!serviceCategoryIdSet.has(scId)) {
    return { ok: false, err: `Indicators sheet, row ${i + 2}: serviceCategoryId "${scId}" not found.` };
  }
}
...
indicators.push({ ..., serviceCategoryIds, ... });
```
(Rename the local `serviceCategoryIds` catalog-id `Set` at
[:189-196](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts#L189-L196) to avoid
the name clash — e.g. `validServiceCategoryIds`.)

**F3. Catalog-id guard** — in the service-categories sheet validation
([:189-196](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts#L189-L196)), reject
any id containing `|` (the A1 separator-collision guard). Mirror in
`EditHfaIndicatorServiceCategory`.

**F4.** Update the on-screen format hint
[hfa_indicators_xlsx_upload_form.tsx:105](client/src/components/indicator_manager_hfa/hfa_indicators_xlsx_upload_form.tsx#L105):
note `serviceCategoryId` accepts pipe-separated ids.

### Layer G — editor UIs

Panther already ships `MultiSelect<T extends string>`
([panther/_303_components/form_inputs/multi_select.tsx:24](panther/_303_components/form_inputs/multi_select.tsx#L24)) — use it; no panther change.

**G1.** `edit_hfa_indicator.tsx`:
- signal [:31](client/src/components/forms_editors/edit_hfa_indicator.tsx#L31):
  `createSignal<string[]>(p.existingIndicator?.serviceCategoryIds ?? [])`
- payload [:56](client/src/components/forms_editors/edit_hfa_indicator.tsx#L56):
  `serviceCategoryIds: serviceCategoryIds()`
- the `Select` [:128-137](client/src/components/forms_editors/edit_hfa_indicator.tsx#L128-L137)
  → `MultiSelect` (options = `p.serviceCategories.map(sc => ({value: sc.id, label: sc.label}))`;
  drop the "— None —" sentinel — empty array is "none").

**G2.** `hfa_indicator_code_editor.tsx`: local state type
[:39](client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx#L39)
`serviceCategoryId: string | null` → `serviceCategoryIds: string[]`; seed
[:169](client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx#L169);
payload [:302](client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx#L302);
the `Select` [:370-372](client/src/components/indicator_manager_hfa/hfa_indicator_code_editor.tsx#L370-L372)
→ `MultiSelect`.

**G3.** `hfa_indicators_manager.tsx` — the table column for service category
[:547-557](client/src/components/indicator_manager_hfa/hfa_indicators_manager.tsx#L547-L557):
render the **set** as joined labels:
```ts
if (ind.serviceCategoryIds.length === 0) return "—";
if (svcCatSt.status !== "ready") return ind.serviceCategoryIds.join(", ");
return ind.serviceCategoryIds
  .map((id) => svcCatSt.data.find((sc) => sc.id === id)?.label ?? id)
  .join(", ");
```

### Layer H — R metadata vector

**H1.** `get_script_with_parameters_hfa.ts:270`
([:270](server/server_only_funcs/get_script_with_parameters_hfa.ts#L270)): the value emitted
per indicator becomes the pipe-joined set:
```ts
`  hfa_service_category = c(${ordered.map((i) => `"${i.serviceCategoryIds.join("|")}"`).join(", ")})`,
```
`ordered` comes from `getAllHfaIndicatorsFromSnapshot`, so `serviceCategoryIds` is populated
by E2. R writes the string verbatim — no `m010` change. Empty set → `""` → ingested as empty
(filtered out downstream by the existing null/blank guard).

### Layer I — results pipeline

**I1. Possible-values unnest** —
`server/server_only_funcs_presentation_objects/get_possible_values.ts`. There are **three**
`SELECT DISTINCT ${columnRef}` branches, not two: facility-join
([:188-193](server/server_only_funcs_presentation_objects/get_possible_values.ts#L188-L193)),
period-CTE ([:222-226](server/server_only_funcs_presentation_objects/get_possible_values.ts#L222-L226)),
and plain ([:228-232](server/server_only_funcs_presentation_objects/get_possible_values.ts#L228-L232)).
Make one change that covers all three:

After `columnRef` is resolved ([~109-132](server/server_only_funcs_presentation_objects/get_possible_values.ts#L109-L132)), derive a select expression:
```ts
const isMultiValue = MULTI_VALUE_COLUMNS.has(disaggregationOption);
const selectExpr = isMultiValue
  ? `unnest(string_to_array(${columnRef}, '${MULTI_VALUE_SEPARATOR}'))`
  : columnRef;
```
Then in all three branches:
- `SELECT DISTINCT ${columnRef} AS disaggregation_value` → `SELECT DISTINCT ${selectExpr} AS disaggregation_value`
- `ORDER BY ${columnRef}` → `ORDER BY disaggregation_value` (order by the **alias** — required
  once the select is an `unnest(...)`; harmless for the scalar case).

Empty `''` segments are already dropped by the JS post-filter
([:239-241](server/server_only_funcs_presentation_objects/get_possible_values.ts#L239-L241)) —
no extra WHERE needed. The `LIMIT` and `labelMap` translation (id→label) are unchanged;
labelMap already maps each catalog id individually (see J).

**I2. WHERE array-overlap** — `query_helpers.ts` `buildWhereClause`
([:208-225](server/server_only_funcs_presentation_objects/query_helpers.ts#L208-L225)). Add a
branch **before** the integer check:
```ts
const isMultiValueColumn = MULTI_VALUE_COLUMNS.has(filter.disOpt);
if (isMultiValueColumn) {
  const pgArray = filter.values
    .map((v) => `'${String(v).replace(/'/g, "''")}'`)
    .join(", ");
  whereStatements.push(
    `string_to_array(${columnName}, '${MULTI_VALUE_SEPARATOR}') && ARRAY[${pgArray}]`,
  );
} else if (isIntegerColumn) {
  ...
```
**Case-sensitivity (deliberate):** do **not** `UPPER()` here. Stored tags are catalog ids and
the filter values sent back are the same ids, so exact match is correct. This is the only
text filter in the pipeline that is case-sensitive — it must be, to stay consistent with the
unnested possible-values (I1), which also preserve case. Leave a one-line comment saying so.

**I3. Filter-only (axis suppression)** — exclude `MULTI_VALUE_COLUMNS` from the two
*disaggregate-by* lists, leaving the Filters panel untouched:

- `presentation_object_editor_panel_data.tsx`
  ([:67-75](client/src/components/visualization/presentation_object_editor_panel_data.tsx#L67-L75)):
  pass a filtered list to `<DisaggregationSection allDisaggregationOptions=...>` only:
  ```tsx
  allDisaggregationOptions={allowedFilterOptions().filter((o) => !MULTI_VALUE_COLUMNS.has(o.value))}
  ```
  `<Filters>` keeps the full `allowedFilterOptions()`.
- `add_visualization/step_3_configure.tsx` `availableDisaggregations()`
  ([:41-49](client/src/components/project/add_visualization/step_3_configure.tsx#L41-L49)): add
  `.filter((disOpt) => !MULTI_VALUE_COLUMNS.has(disOpt.value))`.

> `metric_enricher.ts` is **not** touched. `hfa_service_category` continues to be enriched as
> a normal disaggregation option (so it appears in Filters); the client decides it's
> filter-only.

### Layer J — label lookup (no-op, documented)

`get_indicator_metadata.ts`
([:121-131](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts#L121-L131))
pushes each service-category `id → label` into the metadata map individually. Because I1
unnests **before** the labelMap is applied, each tag is looked up on its own and resolves
correctly. **No change needed** — add a one-line comment noting the unnest dependency so a
future edit doesn't break it.

---

## 6. Explicitly NOT changing

- `m010/script.R` and any other module R script (pure pass-through for the column).
- `wb-fastr-modules` `definition.json` — the `hfa_service_category` results column stays
  `TEXT`; `createTableStatementPossibleColumns` already declares it (gates `supportsServiceCategory`
  at [get_script_with_parameters_hfa.ts:258-262](server/server_only_funcs/get_script_with_parameters_hfa.ts#L258-L262)).
- panther (`MultiSelect` already exists).
- The project **results-table** schema (column stays scalar `TEXT`; multi-value is encoded,
  not typed).
- The service-category **catalog** tables (instance + snapshot) — ids/labels unchanged.
- Valkey cache prefixes — the `po_detail`/figure payload shapes don't change; only filter
  *values* change, which already key on row `last_updated`. (Confirm: no cached payload
  embeds the service-category as an axis.)

---

## 7. Sequencing

Server has no `--watch` — restart after server/lib edits.

1. **A** (constant) — unblocks C/I.
2. **C** (types) — will surface every consumer as a typecheck error; expected.
3. **B, E1** (migrations) — run at startup; verify with `./validate_migrations`.
4. **D, E2** (instance + snapshot DB) — clears the server-side type errors.
5. **F, G** (XLSX + editors) — clears the client-side type errors; multi-tagging is now
   authorable.
6. **H** (metadata vector) — multi-value now reaches the results CSV.
7. **I, J** (query pipeline + filter-only) — multi-value is now queryable & filter-only.

Steps 1–5 alone are a complete, shippable "store multiple categories" increment even before
6–7 (the results column just keeps emitting single values until an indicator is multi-tagged
*and* re-run). 6–7 light up the actual filtering.

> **Cross-repo / working-tree hygiene** (per CLAUDE.md): stage app changes before any panther
> resync; check `git status` for the parallel workstream that already left two `051_*`
> migrations in the tree — don't fix its errors, and don't let it collide with `053`.

---

## 8. Test plan

1. **Migration** — `./validate_migrations` passes (instance 053 + project 028). Confirm an
   existing single-tag indicator backfills to a one-element array.
2. **Typecheck** — `deno task typecheck` green (both server + client).
3. **Author** — in the indicator editor, tag one indicator with two service categories; save;
   reload; both persist. Export the workbook → cell shows `"sc1|sc2"`; re-import round-trips.
4. **Catalog integrity** — delete a service category that's in use → it disappears from the
   tagged indicators' arrays (D5 `array_remove`); rename a category id → tags update
   (`array_replace`).
5. **Produce** — re-run m010; inspect the results table: a multi-tagged indicator's rows hold
   `"sc1|sc2"`; single-tag rows hold `"sc1"`; untagged hold `""`.
6. **Filter list** — open a viz; `hfa_service_category` appears **in Filters** showing the two
   tags as *separate* options (labels resolved), and does **not** appear as a
   disaggregate-by/axis option (editor panel and add-viz wizard).
7. **Filter apply** — filter on one tag; rows tagged with that category (including multi-tag
   rows) are returned; the viz updates.
8. **Direct-SQL edge** — hand-insert a row with `"A|B|A"` / leading-pipe `"|A"`: possible
   values show `A`, `B` once each, no blank; filtering on `A` returns it.

---

## 9. Gotchas

- **Separator collision** — `|` must never appear in a service-category id (A1/F3 guards).
- **Case-sensitivity** — I2 is intentionally case-sensitive; do not "fix" it to match the
  `UPPER()` siblings.
- **Three branches, not two** — I1 must patch all three possible-values paths; `ORDER BY` must
  use the alias.
- **Don't touch `metric_enricher.ts`** for filter-only — that was the previous draft's error.
- **`var_name` is mutable** — the array column rides along on UPDATE automatically; a join
  table (rejected) would not have.
- **No Zod strip-drop gate** — route bodies are type-only, so dropping `service_category_id`
  needs no transform block (unlike stored-JSON field renames).
