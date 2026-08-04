# PLAN: Structure import value-recode step ("other" facility types)

Status: READY FOR IMPLEMENTATION. Design agreed with Tim 2026-08-04, all
mechanics verified against code, and a 2-agent adversarial review's findings
are folded in. This document is self-contained: implement exactly what it
says, in phase order. Update the checkboxes in "Phases" as you complete them.

## Instructions for the implementing agent

- Read first: `SYSTEM_02_persistence.md` (SQL-safety rule),
  `PROTOCOL_APP_ROUTES.md` (add-a-route recipe),
  `PROTOCOL_APP_MIGRATIONS.md`, `panther/protocols/PROTOCOL_ALL_TYPESCRIPT.md`,
  `panther/protocols/PROTOCOL_UI_SOLIDJS.md`, `PROTOCOL_APP_UI_CONVENTIONS.md`.
- **"Settled rulings" below are non-negotiable.** Several look like they have
  simpler alternatives; the simpler alternatives are known-broken (each ruling
  says why). Do not "improve" them back.
- All user-facing strings are inline `t3({ en, fr, pt })` literals — all
  three languages, matching the surrounding files.
- Never edit anything under `panther/` — it is an external synced library.
- Do NOT commit, do not create branches, do not deploy, do not edit
  `SYSTEM_*.md` docs. Leave the changes in the working tree and report.
- Check `git status` before you start; the tree may contain unrelated
  parallel work. Touch only the files this plan names (plus obvious
  ripple-through like import lines). If typecheck errors appear in files
  outside your scope, they are not yours to fix — flag them.
- Gate: `deno task typecheck` must pass (it checks server + client + system
  lint). Additionally run the Zod harness described in "Verification".

## What you are building

The facilities structure import wizard (client
`client/src/components/structure_import/`, entered from the Structure page
for the HMIS or HFA facility registry) currently has these steps: source
type (HMIS only) → file upload → column mapping → staging → import. Staging
copies the CSV into a per-family Postgres table
`temp_structure_staging_{hmis|hfa}`; the import step picks a strategy
(replace_all / add_and_update / update_existing_only) and integrates staging
into the backbone tables `facilities_hmis` / `facilities_hfa`.

`facility_type` (and the other optional facility columns) are free text with
no canonical list. Real HFA facility files classify many facilities as
"Other". This feature inserts a **review step between staging and import**
where the user:

1. picks one of the staged recodable columns (default `facility_type`),
2. sees that column's distinct values with facility counts and checks the
   values to reassign ("Other" is auto-suggested),
3. gets a table of the affected facilities and assigns each one a target
   value — per row, or in bulk for selected rows, with the option to type a
   brand-new category,
4. saves. At integrate time the assignments are applied, so the backbone
   gets e.g. `facility_type = 'Health Post'` where the file said "Other".

Assignments are **per-facility** (`facility_id → newValue`), sparse
(unassigned rows keep their file value), scoped to the current upload
attempt, and cleared whenever staging is redone. Recoding is generic over
seven columns: `facility_type`, `facility_ownership`,
`facility_custom_1`..`facility_custom_5`. `facility_name` is deliberately
excluded (its distinct values ≈ row count; renaming is not recoding).
DHIS2-sourced imports stage only `facility_name`, so for them the review
step never applies and the wizard skips straight to import.

## Settled rulings — do not revisit

1. **Row-level, not value-level.** A value→value remap would collapse every
   "Other" row into ONE target type — useless. The payload is
   `column → facility_id → newValue`.
2. **Zod schema must use `z.partialRecord`, not `z.record`.** This repo is
   on Zod 4 (deno.lock `zod@4.1.13`), where
   `z.record(z.enum([...]), V)` is EXHAUSTIVE — it rejects sparse and empty
   records (verified by execution). `z.record` would make every save fail.
3. **Recodes are applied at integrate as a projection overlay
   (LEFT JOIN VALUES + COALESCE), never as UPDATEs to the staging table.**
   Integrate keeps one row per facility_id, ranked by a completeness score
   over the mapped columns. Survey files routinely have duplicate rows per
   facility where only one carries metadata. Mutating the staging table
   fills blanks on ALL duplicates, changes the completeness ranking, and a
   DIFFERENT row can win dedup than the one the review UI showed — silently
   changing the facility's admin placement. The overlay ranks on ORIGINAL
   values, so the reviewed winner is exactly the integrated row, and since
   assignments are facility-keyed the winner always carries the new value.
4. **The save route is a single conditional UPDATE guarded by a staging
   nonce — never read-then-check-then-write.** Restaging from step 4 is
   always possible (`structureStep3Csv_StageDataStreaming` doesn't check
   `step`), the staging table name is deterministic, so every
   read-then-write guard passes mid-restage. The nonce (a UUID minted at
   each staging run, stored in `step_3_result`, echoed by the client)
   makes a save racing a restage fail loudly instead of silently attaching
   stale facility_ids to a new row set.
5. **The import handler must use the recodes returned by its claim UPDATE,
   not a pre-claim read.** `structureStep4_ImportData` reads the attempt row
   before atomically claiming the import slot; recodes carried from that
   stale snapshot could differ from what the DB holds at claim time.
6. **Client review-step working state is hoisted above the
   StateHolderWrapper.** The wrapper's ready branch is keyed on the fetched
   attempt object, so the ENTIRE step subtree remounts on every attempt
   refetch — including the refetch the review step's own save triggers, and
   the header refresh button. Un-hoisted, every save would wipe the user's
   column choice, checkboxes, page, and unsaved assignments.
7. **Bulk assign uses our own selection signal, not panther Table's
   `bulkActions`.** Table's selection machinery is per-current-page
   (`selectedItems` filters against the current `data`; select-all compares
   set size to page size; bulk actions clear the whole key set) — cross-page
   selections are silently dropped. Our selection is cleared on every page
   change so it is honestly per-page.
8. **Row/value queries use `createEffect` + `createSignal<StateHolder<T>>`
   (the `with_csv.tsx` pattern), not `createQuery`.** `createQuery` is
   one-shot/non-reactive by design (its own doc comment says so); these
   queries react to column/values/offset.
9. **Scope is this import only.** No durable override table, no backbone
   editor. Re-importing the raw file resurfaces "Other"; accepted. (In-place
   backbone recode is still achievable: upload a two-column id+type file,
   `update_existing_only`, recode through this step.)
10. **`''` (blank) is a recodable SOURCE value but never a TARGET option** —
    it collides with the "keep as is" select sentinel (`value: ""`) and is
    semantically un-assignable-to.
11. **DB step state machine unchanged.** `step = 4` still means "staged,
    ready"; review (client step 4) and import (client step 5) are both
    reachable at DB step 4. No new DB step values.

## Verified code map (all citations checked 2026-08-04)

Server:

- `server/db/instance/structure.ts` — the wizard state machine.
  `getRawUA` :36 does `SELECT *`. Six sites null `step_3_result` (:308,
  :488, :518, :547, :597, :657). `claimImportSlot` :674 (its comment :672
  documents the conditional-claim convention). `computeFacilityMatch` :694.
  `getStep3ResultWithFreshMatch` :716 (the `to_regclass` liveness pattern,
  :726-731). `handleStagingSuccess` :742 (writes `step_3_result`, sets
  step=4). `structureStep3Csv_StageDataStreaming` :795 (no `step` check —
  restage from 4 possible). `structureStep4_ImportData` :915 (reads rawUA
  :920, claim UPDATE :935-944, integrate call :955, error write :963,
  staging drop + attempt delete :983-992). `getStructureUploadAttempt` :337
  (builds the detail union; both csv and dhis2 branches :367-400).
- `server/server_only_funcs_importing/stage_structure_from_csv.ts` —
  staging table build :193-219 (`rowid SERIAL PRIMARY KEY`,
  `facility_id TEXT NOT NULL`, mapped columns only), blank optional cells
  staged as `''` never NULL :296-300, `StructureStagingResult` built
  :391-409 (`stagedOptionalColumns` :398).
- `server/server_only_funcs_importing/stage_structure_from_dhis2.ts` —
  stages only `facility_name` among optionals :192-196; blanks also `''`
  :123-129.
- `server/server_only_funcs_importing/integrate_structure_from_staging.ts`
  — `getStagedColumns` :178 (information_schema; NOTE: includes `rowid`),
  writeColumns assembly :41-45 + :76-79, `buildDedupOrderClause` :274-284
  (completeness DESC, rowid), the three strategy writers
  `insertAllFacilities` :291, `upsertFacilities` :319,
  `updateExistingFacilities` :358, all inside one `mainDb.begin` :85-146
  which also stamps `structure_last_updated` :140-145.
- `server/db/instance/_main_database_types.ts:130` —
  `DBStructureUploadAttempt`.
- `server/db/instance/_main_database.sql:292-305` — base
  `structure_upload_attempts` schema.
- `server/db/migrations/instance/` — latest is
  `067_run_generation_attempt_by_user.sql`; runner auto-discovers via
  `Deno.readDir` (no registration file).
- `server/db/utils.ts:34-36` — `escapeSqlString` (quote doubling; the one
  sanctioned manual escaper). VALUES-tuple batching precedent:
  `server/worker_routines/stage_hfa_data_csv/worker.ts:326`.
- `server/routes/instance/structure.ts` — every wizard route is
  `requireGlobalPermission("can_configure_data")` + `log("<key>")` (e.g.
  :190-199). Handlers pair with registry keys; boot's
  `validateAllRoutesDefined()` enforces it.

Lib:

- `lib/types/structure.ts` — `StructureStagingResult` :29
  (`stagedOptionalColumns?` :43 — OPTIONAL, pre-existing attempts lack it),
  detail union :83-133, `StructureColumnMappings` :135,
  `StructureIntegrateStrategy` :212.
- `lib/types/instance.ts` — `OptionalFacilityColumn` +
  `_OPTIONAL_FACILITY_COLUMNS` + `getEnabledOptionalFacilityColumns`
  (:146-210 region).
- `lib/api-routes/instance/structure.ts` — registry;
  `facilityFamilySchema` :14; steps :97-158.
- `lib/hfa_sentinel_classification.ts` — the "other" label regex heuristic
  this feature's auto-suggest mirrors (inline, do not import).

Client:

- `client/src/components/structure_import/index.tsx` —
  `StructureUploadAttemptForm`. createQuery + `setCurrentStep(res.data.step)`
  :51-58; `minStep = hfa ? 1 : 0` :66; `getStepper` with `maxStep: 3` +
  `getValidation` :69-102; `StepperNavigationVisual` + label formatter :136-139;
  refresh button :140; the step `Switch` :195-332 (import Match at
  `currentStep() === 4` :214, ordered most-specific-first — fallthrough
  Matches `>= 2` :257 and `>= 1` :295).
- `client/src/components/structure_import/step_2_csv.tsx` — the canonical
  save shape: `createFormAction` returning the serverActions call with
  `p.silentFetch` callback :86-152; footer
  `StateHolderFormError` + save Button + saved `Switch` :265-292; Select /
  Checkbox usage :168-200, :235-262.
- `client/src/components/structure_import/step_4.tsx` — today's import
  screen (strategy radio, facilityMatch preview, columnsNotice; uses
  `p.step3Result.stagedOptionalColumns ?? []` at :156).
- `client/src/components/structure_import/_column_labels.ts:7` —
  `getStructureColumnLabel(column, facilityColumns)` (honors instance
  custom labels).
- `client/src/components/structure/with_csv.tsx:13-58` — the
  `createEffect` + `createSignal<StateHolder<T>>` + run-id-guard fetch
  pattern to copy for reactive queries.
- Panther (read-only): `_303_components/layout/stepper/get_stepper.ts`
  (`setCurrentStep` is an UNCLAMPED raw setter — how DB step 4 exceeds
  maxStep 3 today; `goNext` requires `currentStep < maxStep`; `getAllSteps`
  renders minStep..maxStep circles only),
  `stepper_navigation_visual.tsx` (circle clicks allowed on
  completed/available), `form_inputs/select.tsx` (`value/options/onChange/
  fullWidth/size="sm"/placeholder`; helper `getSelectOptions(string[])`),
  `form_inputs/checkbox.tsx` (`checked/onChange/label/indeterminate`),
  `form_inputs/input.tsx` (`Input` — there is no `TextInput`),
  `tables/display_table/table.tsx` (`TableColumn.render` for embedded
  controls), `special_state/state_holder_wrapper.tsx` (keyed ready branch —
  the remount hazard). There is NO pagination component anywhere in panther
  or the app; the pager below is hand-rolled.

## Implementation spec

### Phase 1 — types, migration, attempt plumbing

**`lib/types/structure.ts`**

```ts
export type StructureRecodableColumn = Exclude<
  OptionalFacilityColumn,
  "facility_name"
>;
export const _RECODABLE_FACILITY_COLUMNS: StructureRecodableColumn[] = [
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
];
// column → facility_id → new value. Sparse: unassigned rows keep their
// staged value. Scoped to one upload attempt; cleared on restage.
export type StructureRecodes = Partial<
  Record<StructureRecodableColumn, Record<string, string>>
>;
export type StructureStagedColumnValues = {
  values: { value: string; count: number }[];
  truncated: boolean;
};
export type StructureStagedRecodeRows = {
  columns: string[];
  rows: Record<string, string>[];
  total: number;
};
```

(`OptionalFacilityColumn` comes from `lib/types/instance.ts` — import it.)

- `StructureStagingResult` gains `stagingNonce?: string` (optional: stored
  results from before this deploy lack it).
- `StructureUploadAttemptDetailCsv` AND `...Dhis2` gain
  `recodes: StructureRecodes | undefined`.

**Migration** — new file
`server/db/migrations/instance/068_structure_upload_attempts_recodes.sql`:

```sql
-- Per-attempt value recodes (column → facility_id → new value), authored in
-- the review step between staging and import. Cleared with step_3_result.
ALTER TABLE structure_upload_attempts ADD COLUMN recodes text;
```

Add the same column (with the same comment style as neighbors) to the base
schema block in `server/db/instance/_main_database.sql:292-305`.

**`server/db/instance/_main_database_types.ts`** —
`DBStructureUploadAttempt` gains `recodes: string | null`.

**`server/db/instance/structure.ts`**

- Add `recodes = NULL,` to all six UPDATEs that set `step_3_result = NULL`
  (:308, :488, :518, :547, :597, :657 — the reset-attempt, step-1 csv,
  step-1 dhis2, step-2 dhis2, step-1 csv re-save, step-2 csv sites) AND to
  the `handleStagingSuccess` UPDATE (:757-765). Seven sites total.
- In `getStructureUploadAttempt`, add
  `recodes: parseJsonOrUndefined(rawUA.recodes) as StructureRecodes | undefined,`
  to BOTH the dhis2 and csv return objects.

**Both stagers** (`stage_structure_from_csv.ts`,
`stage_structure_from_dhis2.ts`): set `stagingNonce: crypto.randomUUID()`
when building the `StructureStagingResult`.

### Phase 2 — routes

**Registry** (`lib/api-routes/instance/structure.ts`):

```ts
const structureRecodableColumnSchema = z.enum([
  "facility_type",
  "facility_ownership",
  "facility_custom_1",
  "facility_custom_2",
  "facility_custom_3",
  "facility_custom_4",
  "facility_custom_5",
]);
// z.partialRecord, NOT z.record: Zod 4 z.record with an enum key schema is
// exhaustive and rejects sparse/empty payloads.
const structureRecodesSchema = z.partialRecord(
  structureRecodableColumnSchema,
  z.record(z.string(), z.string().trim().min(1)),
);
```

Three entries (place after the step-3 entries):

```ts
getStructureStagedColumnValues: route({
  path: "/structure/staged_column_values/:family/:column",
  method: "GET",
  params: z.object({
    family: facilityFamilySchema,
    column: structureRecodableColumnSchema,
  }),
  response: {} as StructureStagedColumnValues,
}),
getStructureStagedRecodeRows: route({
  path: "/structure/staged_recode_rows/:family",
  method: "POST",
  params: z.object({ family: facilityFamilySchema }),
  body: z.object({
    column: structureRecodableColumnSchema,
    values: z.array(z.string()),
    offset: z.number().int().min(0),
    limit: z.number().int().min(1).max(200),
  }),
  response: {} as StructureStagedRecodeRows,
}),
setStructureRecodes: route({
  path: "/structure/set_recodes/:family",
  method: "POST",
  params: z.object({ family: facilityFamilySchema }),
  body: z.object({
    recodes: structureRecodesSchema,
    stagingNonce: z.string(),
  }),
}),
```

**DB functions** (`server/db/instance/structure.ts`). First, in
`integrate_structure_from_staging.ts`, `export` the existing
`getStagedColumns` and `buildDedupOrderClause` helpers (no logic change).

Shared read-gate helper for the two reads: load `rawUA`; require
`rawUA.step === 4`, `rawUA.status_type !== 'importing'` (the staging table
exists but is half-populated during a restage), a parsed
`step_3_result.stagingTableName`, and `to_regclass` liveness (:726-731
pattern); on failure return a clean err ("Staging is not ready — complete
the staging step first."). Then compute, exactly as integrate does:

```ts
const stagedColumns = await getStagedColumns(mainDb, stagingTableName);
const stagedAdminAreas = stagedColumns.includes("admin_area_1");
const stagedOptionalColumns = _OPTIONAL_FACILITY_COLUMNS.filter((c) =>
  stagedColumns.includes(c)
);
const writeColumns = [
  ...(stagedAdminAreas
    ? ["admin_area_1", "admin_area_2", "admin_area_3", "admin_area_4"]
    : []),
  ...stagedOptionalColumns,
];
const displayColumns = ["facility_id", ...writeColumns];
```

Never expose raw `getStagedColumns` output to the client — it contains
`rowid` and has no guaranteed order.

Both reads run over the DEDUPED view (must match integrate exactly, so the
user reviews the rows integration will actually write):

```sql
SELECT ... FROM (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY facility_id
    ORDER BY ${buildDedupOrderClause(writeColumns)}
  ) AS rn
  FROM ${stagingTableName}
) t WHERE rn = 1
```

1. `getStructureStagedColumnValues(mainDb, family, column)` — additionally
   require `column` ∈ `stagedOptionalColumns`. Query (via `mainDb.unsafe`;
   table name is trusted-internal from stored step_3_result, column is a
   closed union post-Zod — both sanctioned):

   ```sql
   SELECT COALESCE(${column},'') AS value, COUNT(*)::int AS count
   FROM <deduped> GROUP BY 1 ORDER BY count DESC, value LIMIT 201
   ```

   Return the first 200 as `{ values, truncated: rows.length > 200 }`.
   (`COALESCE`: staging never writes NULL today, but the columns are
   nullable — belt and braces. Blanks are `''`.)
2. `getStructureStagedRecodeRows(mainDb, family, column, values, offset,
   limit)` — same gates. Filter:

   ```ts
   const inList = values.map((v) => `'${escapeSqlString(v)}'`).join(",");
   // ... WHERE COALESCE(${column},'') IN (${inList})
   ```

   (empty `values` → return `{ columns: displayColumns, rows: [], total: 0 }`
   without querying). One count query for `total`; one page query selecting
   `displayColumns`, `ORDER BY facility_id LIMIT ${limit} OFFSET ${offset}`,
   cells coalesced to `''`.
3. `setStructureRecodes(mainDb, family, recodes, stagingNonce)` —
   validation first: drop empty per-column maps
   (`{ facility_type: {} }` must not reach storage — it would render
   `VALUES ()` at integrate); total assignments across all columns ≤ 5000
   (err: "Too many assignments"); every column ∈ `stagedOptionalColumns`
   (needs the step_3_result parse — read it ONLY for validation; the write
   below re-checks state atomically). Then the single conditional write
   (the file's own claim convention — a read-then-write guard passes
   mid-restage and loses/misattaches saves):

   ```ts
   const updated = await mainDb`
     UPDATE structure_upload_attempts
     SET recodes = ${JSON.stringify(recodes)}
     WHERE dataset_family = ${family}
       AND step = 4
       AND status_type <> 'importing'
       AND (step_3_result::jsonb->>'stagingNonce') = ${stagingNonce}
   `;
   ```

   `updated.count === 0` → err: "Staging has changed since this page was
   loaded — refresh and review again." (Pre-deploy attempts have no nonce →
   `->>` yields NULL → save rejected → user restages. Rare, self-healing.)
   Empty recodes object (after normalization) is a valid clear.

**Handlers** (`server/routes/instance/structure.ts`): three `defineRoute`
blocks, each `requireGlobalPermission("can_configure_data")` +
`log("<registryKey>")`, thin (call the DB fn, `c.json(res)`). No notify —
the wizard refetches attempt state after saves like every other step.

### Phase 3 — integrate overlay

**`integrate_structure_from_staging.ts`**:

- `integrateStructureFromStaging` gains a 5th parameter
  `recodes: StructureRecodes`. Update the caller
  (`structureStep4_ImportData`).
- After computing `stagedColumns`, assert every recode column ∈
  `stagedColumns` — throw
  `new Error("Recoded column not staged — re-stage and review again")`
  (should be unreachable given the clearing + nonce; fail loudly if not).
- Build, once, for the columns that have ≥1 assignment:

  ```ts
  const recodeJoins = entries.map(([col, map]) => ({
    col,
    alias: `rc_${col}`,
    valuesSql: Object.entries(map)
      .map(([fid, val]) =>
        `('${escapeSqlString(fid)}','${escapeSqlString(val)}')`
      )
      .join(","),
  }));
  ```

- Thread the overlay into ALL THREE strategy writers
  (`insertAllFacilities`, `upsertFacilities`, `updateExistingFacilities`)
  — pass `recodeJoins` down. In each writer's INNER subquery (the one with
  `ROW_NUMBER()`):
  - the select list replaces each recoded column `col` with
    `COALESCE(${alias}.val, ${col}) AS ${col}`;
  - the FROM clause gains, per recoded column,
    `LEFT JOIN (VALUES ${valuesSql}) AS ${alias}(fid, val) ON ${alias}.fid = ${stagingTableName}.facility_id`;
  - `buildDedupOrderClause` stays byte-identical and keeps referencing the
    raw column names. This is the load-bearing subtlety: window-clause
    column references resolve to INPUT columns, not select-list aliases, so
    ranking runs on ORIGINAL values — the reviewed rn=1 winner is the
    integrated row (settled ruling 3). Do not "simplify" by pre-applying
    the COALESCE in a CTE the ranking reads from.
  - qualify bare staging column references with the staging table name
    where the new joins would make them ambiguous (`fid`/`val` are the only
    join columns, so only `facility_id` in the ON clauses needs care).
  - the OUTER queries are unchanged (`EXCLUDED.col` / `s.col` already read
    the projected inner values).
- `insertAdminAreasFromStaging`, `cleanupUnusedAdminAreas`,
  `deleteAllFamilyFacilities`, and both assert helpers: untouched (admin
  columns are never recodable; the overlay never mutates staging).
- The ≤5000-assignment cap bounds the VALUES lists; no batching needed.

**`structureStep4_ImportData`** (`server/db/instance/structure.ts:915`):
recodes must come from under the claim, not the pre-claim `rawUA` read
(settled ruling 5). Extend the existing claim UPDATE (:935-944) with
`RETURNING recodes, step_3_result`, use the RETURNING row's
`step_3_result` for the staging table name and its `recodes`
(`parseJsonOrUndefined(...) ?? {}`) for the integrate call.

### Phase 4 — client

All in `client/src/components/structure_import/` unless noted. Rename
`step_4.tsx` → `step_5_import.tsx` (component `Step4` → `Step5Import`);
create `step_4_recode.tsx` (component `Step4Recode`). No "formerly
step_4" comments — git history is the record.

**`index.tsx` — stepper surgery**

- `maxStep: 3` → `maxStep: 5`. (The import screen gains a stepper circle
  for the first time; today it renders past the last circle. The existing
  `stepLabelFormatter` keeps labels right.)
- Replace the fetch-time step sync (:56) with the landing rule:

  ```ts
  stepper.setCurrentStep((prev) =>
    res.data.step === 4
      ? prev > 4 ? prev : reviewApplies(res.data) ? 4 : 5
      : res.data.step
  );
  ```

  with

  ```ts
  function reviewApplies(sua: StructureUploadAttemptDetail): boolean {
    if (sua.step !== 4 || sua.status.status !== "configuring") return false;
    const staged = sua.step3Result?.stagedOptionalColumns ?? [];
    return _RECODABLE_FACILITY_COLUMNS.some((c) => staged.includes(c));
  }
  ```

  Effects: a silent refetch never yanks a user on import (5) back to
  review; DHIS2 / no-recodable-column imports land straight on import (no
  mandatory empty step); re-entering an errored attempt lands on import
  next to the error banner (whose text points at the mode picker).
- `getValidation` — full new body for the step cases:
  - case 3: `{ canGoPrev: true, canGoNext: !!sua.step3Result }`. (Today it
    is unconditionally `canGoNext: false`, which strands users who click
    back from import; with recodes at stake, the "escape" — restaging —
    would destroy their work. `step3Result` is only defined at DB step 4,
    so this is safe.)
  - new case 4: `{ canGoPrev: true, canGoNext: true }` (review is
    skippable).
  - new case 5:
    `{ canGoPrev: sua.status.status === "configuring", canGoNext: false }`.
- Step rendering: add a Match for
  `currentStep() === 4 && sourceType && step1Result && step2Result && step3Result`
  rendering `Step4Recode`; move the import Match to `currentStep() === 5`.
  **Both MUST be placed before the existing `>= 2` and `>= 1` fallthrough
  Matches** — Switch takes the first match, so a late placement renders
  step 2 at steps 4/5.

**`index.tsx` — hoisted review state** (settled ruling 6)

Hold the review step's working state in `StructureUploadAttemptForm` (it
survives the keyed-wrapper remounts that every refetch causes):

```ts
type RecodeUiState = {
  stagingNonce: string | undefined; // state belongs to this staging run
  column: StructureRecodableColumn | undefined;
  checkedValues: string[];          // values marked for reassignment
  autoChecked: boolean;             // OTHER_REGEX suggestion applied once
  assignments: StructureRecodes;    // working copy, incl. unsaved edits
  customTargets: string[];          // user-added "new category" values
  pageOffset: number;
};
```

One `createStore<RecodeUiState>` + a reset helper. `Step4Recode` receives
the store + setter as props. When the fetched attempt's
`step3Result.stagingNonce` differs from `state.stagingNonce`, reset the
whole store (fresh staging = fresh review) and hydrate `assignments` from
the attempt's saved `recodes`.

**`step_4_recode.tsx`** — layout top to bottom:

1. Intro text (what this step does; skippable).
2. Column `<Select>` — options =
   `_RECODABLE_FACILITY_COLUMNS.filter(c => (p.step3Result.stagedOptionalColumns ?? []).includes(c))`
   labeled via `getStructureColumnLabel(col, p.facilityColumns)`; default
   `facility_type` when present, else first. Changing column resets
   `checkedValues`/`pageOffset` (assignments for other columns are kept —
   they're per-column in the store). If the options list is empty render an
   empty-state line + nothing else (normally unreachable — the landing rule
   skips to 5 — but reachable via circle clicks).
3. Values panel — fetched with the `with_csv.tsx` effect+StateHolder
   pattern keyed on `column` via
   `serverActions.getStructureStagedColumnValues({ family, column })`.
   Each value row: `<Checkbox>` (checked = in `checkedValues`), the value
   (`''` shown as a translated "(blank)"), count. On first successful load
   for this staging run (`!autoChecked`) AND when saved recodes are empty:
   auto-check values matching
   `const OTHER_REGEX = /\bother\b|\bautre\b|\boutros?\b/i;`
   (inline constant — mirrors `lib/hfa_sentinel_classification.ts`'s
   heuristic; deliberately not imported, it's a UI suggestion), then set
   `autoChecked` so the user's unchecks are never overridden. Truncation
   notice when `truncated`.
4. Target options signal:
   `distinct values − checkedValues − {''}` + `customTargets` + all values
   already used in `assignments[column]`. Above the table: a small
   "new category" `<Input>` + add `<Button>` pushing into `customTargets`.
5. Rows table — fetched with the same effect pattern keyed on
   `column + checkedValues + pageOffset` via
   `serverActions.getStructureStagedRecodeRows({ family, column,
   values: checkedValues, offset: pageOffset, limit: 100 })` (skip the call
   and show a hint when `checkedValues` is empty). Render with panther
   `<Table>`:
   - columns: the response's `columns` (labels via
     `getStructureColumnLabel` for optional columns, plain header for
     facility_id/admin areas), plus a leading selection column and a
     trailing "Assign to" column.
   - selection: OWN `createSignal<Set<string>>` of facility_ids + a
     `<Checkbox>` per row and a select-all-on-page checkbox in the header
     area — do NOT use Table's `bulkActions` (settled ruling 7). Clear the
     set on every page change and on column/checkedValues change.
   - "Assign to" cell: `<Select size="sm">` with options
     `[{ value: "", label: "— keep as is —" }, ...targetOptions]`; value =
     `assignments[column]?.[facility_id] ?? ""`; onChange `""` deletes the
     assignment, else sets it (geojson step_3 delete-on-empty pattern).
   - bulk bar above the table: target `<Select>` + "Assign selected"
     `<Button>` applying to the current selection set, then clearing it.
   - pager below: Prev/Next `<Button size="sm">` ± 100 + a translated
     "Showing X–Y of N". Clamp: if a response's `total` ≤ `pageOffset`,
     reset `pageOffset` to 0. (Hand-rolled by necessity — no pagination
     component exists; truncation is not an option because every row must
     be assignable.)
6. Assigned-count line: "N of M rows assigned" for the checked values
   (assigned = keys of `assignments[column]` — note assignments persist
   even for rows outside the current filter; that's fine, they're sparse
   and integrate is facility-keyed).
7. Save footer — step_2_csv shape exactly (:265-292):
   `createFormAction` → normalize (drop empty per-column maps) →
   `serverActions.setStructureRecodes({ family, recodes:
   unwrap(state.assignments), stagingNonce: p.step3Result.stagingNonce! })`
   with `p.silentFetch` as callback (harmless — state is hoisted); a
   `needsSaving` signal tracks unsaved edits; `StateHolderFormError` +
   save `<Button state=...>` + saved `Switch`. If `stagingNonce` is
   undefined (pre-deploy attempt), disable save with a "re-stage to use
   this feature" note.

`Step4Recode` props: the hoisted store + setter, `family`,
`step3Result`, `recodes` (saved server copy), `facilityColumns`,
`silentFetch`.

**`step_5_import.tsx`**: add one summary block above the strategy radio —
for each column with assignments in `p.recodes`:
"{getStructureColumnLabel(col)}: {N} facilities will be recoded". No other
changes.

## Edge cases (already decided)

- Blanks (`''`) are countable/checkable/recodable as source; never a
  target (ruling 10); stored targets are non-empty trimmed (Zod).
- Restage / step-2 re-save clears recodes server-side; the nonce makes a
  racing save fail loudly; the integrate assertion backstops column drift.
- Duplicate facility_id rows: reads show integrate's rn=1 winners ranked
  on original values; the overlay guarantees winner identity never shifts.
- HMIS gets the feature identically; DHIS2 skips to import via the
  landing rule.
- Values past the 200-value cap can't be selected for reassignment —
  accepted (facility_type cardinality is always tiny; notice shown).
- Pre-deploy step-4 attempts (no `stagingNonce` / no
  `stagedOptionalColumns`): review degrades to empty state or a clear
  re-stage error; never crashes (`?? []` everywhere).
- `facilityMatch` and `getStep3ResultWithFreshMatch` are untouched —
  recodes never change facility_id.

## Verification

1. `deno task typecheck` — must pass clean (in-scope files).
2. Zod harness (execute, don't reason): write a scratch script importing
   the two new schemas (absolute-path import, run with
   `deno run --allow-all -c deno.json <script>`) asserting:
   `{}` parses; `{ facility_type: { f1: "Hospital" } }` parses;
   `{ facility_type: { f1: "" } }` fails; `{ facility_name: {...} }` fails.
3. If a configured dev environment is available (`.env` present), boot the
   server briefly and confirm the
   `✅ All N routes correctly implemented` line and that migration 068
   applies. If not available, state so in your report — do not fake it.
4. Report, without hedging, exactly what was run and what wasn't. A full
   browser walkthrough (HFA CSV with "Other" + duplicate facility_id rows
   disagreeing blank-vs-value on type; recode incl. a blank + a bulk
   assign; restage → recodes cleared + stale save rejected; integrate →
   backbone values correct, admin placement unchanged) is Tim's to run or
   to delegate separately — list it as remaining, don't claim it.

## Phases (check off as completed)

- [x] Phase 1 — types, migration 068 + base SQL, DB type, seven clearing
      sites, staging nonce in both stagers, detail `recodes`.
- [x] Phase 2 — schemas + three registry entries, exported integrate
      helpers, gated deduped read fns, conditional-UPDATE save, handlers.
- [x] Phase 3 — overlay joins in all three strategy writers (original-value
      ranking), staged-column assertion, claim RETURNING.
- [x] Phase 4 — stepper surgery + landing rule + validation cases, hoisted
      state, `step_4_recode.tsx`, `step_5_import.tsx` rename + summary.
- [x] Verification steps above; report.
