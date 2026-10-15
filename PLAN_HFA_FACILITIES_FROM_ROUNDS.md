# PLAN: HFA facilities imported by the round's data wizard

**Status:** open, not started.

**What this plan does.** The HFA facility registry (`facilities_hfa`) stops
being imported through the structure wizard. The HFA data import wizard maps the
file's facility columns (admin areas, name, type, ownership, customs) from the
same kept rows it imports data from, shows every difference between the file and
the current registry before launch, and writes the facilities the user approved
and the round's data in one transaction. One new table records whether each
registry value came from a round or from the user, which sets the default for
the next round's review. The structure wizard's HFA branch is deleted. The
registry's schema and every consumer of it (the run extract, the parquet
snapshot, query-time disaggregation, weights, scopes, maps) are untouched, and
no registry content changes at deploy.

**Next step:** Review 3

**Branch:** `version2`.

**Repos touched:** this app only. `wb-fastr-modules` and panther are not
touched: the extract's shape and the m010 inputs do not change.

**Read first:** `CLAUDE.md`, `SYSTEMS.md`, `SYSTEM_05_facilities_indicators.md`
(Structure ELT; Facilities, admin areas, weights; HFA time points),
`SYSTEM_06_ingestion.md` (HFA import runs; Integration; Client; HFA follow-on
work), `HFA_WORK_CATALOGUE.md` ("Inputs to the L1 rework"), then §2 and §3 here.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_HFA_FACILITIES_FROM_ROUNDS.md."
- Branch: `version2`, overriding `PROTOCOL_APP_PLANS.md`'s `tim-branch`: version
  2 work lands there. Confirm with `git branch --show-current`. Never create a
  branch.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. Plus `./validate_migrations` for a step that touches a migration,
  `./validate_fresh_boot` for a step that touches `_main_database.sql`.
- Migration numbers are assigned at the step from the highest file then present.
  At the time of writing the highest is 211, so this plan says 212, 213 and 214.
- Build log: §8. Last step: 5.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each
  area the step names, §2 and §3 here, the step's own section in §4, and §8.
- Vocabulary, used exactly as defined here:
  - **Round**: a row of `hfa_time_points`. "Time point" in code.
  - **Registry**: `facilities_hfa` with `admin_areas_hfa_1..4`. Written by the
    HFA data import and by the facilities page, never by the structure wizard.
  - **Kept row**: the one file row per facility that survives the row filters
    and the duplicate resolution. The data and the facility columns come from
    the same kept row.
  - **Facility columns**: the mapping from registry columns to file headers,
    `HfaCsvMappingParams.facilityColumns`.
  - **Change**: an existing facility whose kept-row value for a column differs
    from its registry value. Admin areas change as one tuple.
  - **Decision**: keep (the registry value stays) or take (the file value is
    written), per change group with per-facility exceptions.
  - **Source**: a row of `hfa_facility_sources`: which round, or the user, set a
    facility's current value for a column group.

## 1. The problem

### 1.1 The survey is the source of the facilities, and the code already knows

HFA facilities are never a master list. Every facility in the HFA registry
appears in a survey file, with its admin areas, name, type and ownership
collected as questionnaire answers. The structure import's HFA branch was built
around that fact:

- It accepts the XLSForm so it can resolve ODK choice codes to labels
  (`server/server_only_funcs_importing/stage_structure_from_csv.ts:128-177`).
- It dedups by the most-filled row because survey exports carry one row per
  submission attempt (`buildDedupOrderClause`,
  `integrate_structure_from_staging.ts:350`).
- It has a recode step because real files classify many facilities as "Other"
  (`server/db/instance/structure.ts:1018-1271`, `step_4_recode.tsx`).

So today the user uploads the same file twice: once to the structure wizard,
mapping the facility columns, and once to the HFA data wizard, mapping the id
column, the time point and the filters. The two runs apply two different dedup
rules to the same rows (structure: most-filled; data: first/last plus
per-facility overrides), so the registry row can come from a submission the data
import discarded.

### 1.2 What goes wrong

- **The ordering trap.** The data import validates ids against the registry
  (`stage_csv.ts`, the `validFacilities` table and the final join) and holds in
  `needs_review` when any are missing (`worker.ts:43-49`), listing up to ten of
  them (`lib/types/dataset_hfa_import.ts:107-110`). The only remedies are
  Integrate anyway, which drops those facilities' data, or leaving the wizard,
  running the structure wizard on the same file, then discarding and restarting
  the data import.
- **Changes land unseen.** `add_and_update` and `replace_all` overwrite every
  mapped column of every matched facility. Nothing shows the user what a new
  file changes, and nothing records where a value came from.
- **Recodes die with the attempt.** `structure_upload_attempts.recodes` is
  nulled at every re-stage (seven sites in `structure.ts`). Harmonising "Other"
  is repeated per round, by hand.
- **The team's files need inputs the wizard lacks** (`HFA_WORK_CATALOGUE.md`,
  "Inputs to the L1 rework"): Madagascar's `id_admin0` is blank in every row and
  the structure stager drops a row with a blank mapped admin cell; Guinea's form
  carries `id_admin1_corrected`, `id_admin2_corrected` and `id_fac_corrected`,
  filled only when the pre-filled value is wrong, and a one-header-per-column
  mapping cannot apply them; the facility id defaults to `id_fac_txt` by name
  alone, which Madagascar has but leaves blank (`lib/utils.ts:39`); Mali's later
  rounds carry new facility ids and 20 regions instead of 11, which today lands
  with nothing shown.

### 1.3 What must not change

The registry is analytically load-bearing. The run extract inner-joins
`hfa_data` to `facilities_hfa` for admin areas
(`server/runs/capture_inputs/hfa.ts:150`), m010 stratifies by them, and type and
ownership disaggregation is a query-time join against the per-run parquet
snapshot of the registry
(`server/server_only_funcs_presentation_objects/facility_context.ts`,
`server/run_query/run_read.ts`, `facilitiesTableForFamily`). Every round in a
package is therefore disaggregated by one current set of attributes, which is
what makes a cross-round series comparable. The end state keeps one row per
facility, in the same table, with the same columns.

## 2. The model

### 2.1 In one sentence

Each round's import maps the facility columns from its own file, shows the user
every facility it would change, and writes the approved facilities and the data
together; the registry remembers who set each value.

### 2.2 The tables

```text
facilities_hfa, admin_areas_hfa_1..4, hfa_data, hfa_facility_weights
                                     unchanged

hfa_facility_sources                 new: who set the current value
  facility_id   TEXT NOT NULL  FK facilities_hfa(facility_id) ON DELETE CASCADE
  column_group  TEXT NOT NULL  CHECK IN ('admin', 'facility_name', 'facility_type',
                               'facility_ownership', 'facility_custom_1'..'facility_custom_5')
  kind          TEXT NOT NULL  CHECK IN ('round', 'user')
  time_point    TEXT           FK hfa_time_points(label) ON UPDATE CASCADE ON DELETE SET NULL
                               (NOT NULL when written with kind 'round'; NULL after the round is deleted)
  PRIMARY KEY (facility_id, column_group)

structure_upload_attempts            single-row, HMIS only (Step 5)
  slot TEXT PRIMARY KEY DEFAULT 'single' CHECK (slot = 'single')
  dataset_family dropped
```

A registry cell with no source row is of unknown origin: every cell of a
registry imported before this plan. `admin` covers the whole admin tuple,
because admin values are only a valid hierarchy as a tuple.

### 2.3 Facility columns

```ts
facilityColumns: {
  adminArea1: { value: string };
  adminAreas: { level: 2 | 3 | 4; header: string; correctionHeader?: string }[];
  optional: Partial<Record<OptionalFacilityColumn, { header: string; correctionHeader?: string }>>;
};
```

Level 1 is the country and is never a column: the wizard pre-fills the value
with the registry's current level-1 value when the registry is non-empty, else
`getCountryLabel(countryIso3)`. Levels 2 to the HFA `adminDepth` are mapped all
or none. Optional columns come from the HFA structure schema's enabled set. A
correction column wins where its trimmed cell is non-blank. Every mapped header
and correction header is resolved through the XLSForm by its own header, with
the resolver lifted from the structure stager: a header matched to a
`select_one` question by the HFA header convention has its codes replaced by
choice labels, unresolved codes stay raw and are counted per column.

Defaults, in order: the latest complete run's mapping where the header exists in
the new file (compared by raw header text, re-encoded against the new file),
else the core header names matched ignoring case, else unmapped. Core names:
levels 2, 3, 4 from `id_admin1_name`, `id_admin2_name`, `id_admin3_name`;
`facility_name` from `id_fac_name`; `facility_type` from `id_fac_type`; a
correction column from the mapped header with a trailing `_name` or `_txt`
removed plus `_corrected`. Ownership has no core name. The facility id defaults
to the first of `id_fac_txt`, `id_fac` that has a non-blank value, in the HFA
data wizard and the weights wizard; the headers route reports which headers have
values.

### 2.4 The data wizard

Steps: upload, mappings, facility columns, duplicates (auto-skipped when none),
changes, review and launch. Every step is stateless until launch; every decision
rides `HfaCsvMappingParams` and is re-validated by the stage leg exactly as the
duplicate overrides are today.

- **Facility columns** renders the mapping of §2.3. Under each picker, from a
  stateless preview over the kept rows: blank cells, distinct values, unresolved
  codes with a sample, and for admin columns the values not in the registry.
  Next is disabled while the registry is empty and the admin levels are
  unmapped.
- **Changes** shows the facility match (known, new, absent from this file) and,
  per column, every change grouped as "current value to file value, N
  facilities", with keep or take per group and per facility. It lists the admin
  areas that would lose their last facility together with the scopes
  (`hfa.adminArea2`) and geojson maps keyed on those names, the admin paths the
  file introduces, and the new facilities with an incomplete admin tuple. The
  per-facility "Other" reassignment lives here, for new and changed facilities,
  with unmapped file columns such as `id_fac_type_other` shown as context,
  because text questions are never staged. When the registry is non-empty and
  nothing is known, launch requires an explicit confirmation that the ids are
  new.

```ts
facilityChanges: {
  column: "admin" | OptionalFacilityColumn;
  from: string;          // the admin tuple joined at the registry depth
  to: string;
  decision: "keep" | "take";
  exceptions: string[];  // facility ids decided the other way
}[];
recodes: Partial<Record<StructureRecodableColumn, Record<string, string>>>; // facility id to value
```

### 2.5 Decisions and their defaults

For a registry cell with no source row, no default: the user must choose a rule
for every column with changes before Next enables. Otherwise the default is:
source kind `user`, keep; source round newer than the imported round, keep;
source round older than or equal to the imported round, keep when the values are
equal and take otherwise. A decision that agrees with the default is written as
kind `round` with the imported round; a decision against it is written as kind
`user`. New facilities are written with kind `round`. A recode is written as
kind `user`. Recodes are pre-filled from the latest complete run where the
facility id and the raw value match.

### 2.6 The integrate leg

Inside the existing per-round transaction, in this order: stamp the time point;
delete the round's data and variables; lock the registry rows the decisions name
`FOR UPDATE`; recompute the changes from the per-run facility staging table and
fail with the ids when any (facility, column, from, to) differs from what the
user was shown; insert admin areas 1..4 with `ON CONFLICT DO NOTHING`; upsert
the new facilities and the taken changes, padding levels above `adminDepth` with
the deepest value as the structure stager does; write the source rows; insert
the variables, the values and the data; run `cleanupUnusedAdminAreas`; bump
`structure_last_updated` only when a registry row or an admin area changed; flip
complete. After commit, notify the structure channel when the registry changed,
and record in the diagnostics the geojson area ids
(`countOrphanedGeoJsonAreaIds(sql, "hfa")`) and the scopes whose
`hfa.adminArea2` no longer matches an admin area. The order is forced by the
schema: the facility FK on `hfa_data` is immediate, and the composite FK on
`facilities_hfa` needs the admin rows first.

### 2.7 The facilities page, HFA tab

No import entry. A searchable table over the registry with the source of each
facility's admin tuple and type, a per-row edit that writes kind `user`, and
"Remove facilities with no data and no weights", which shows the count first and
removes only those rows. Delete facilities stays with its existing refusals.

### 2.8 Order of operations for a user

Create the round, import its data (facilities appear), import its weights, which
come from the sampling frame in a separate file and need the facilities.

### 2.9 Rejected alternatives

- **A derived registry** (per-round observations, a rule, a dictionary and
  overrides; the first draft of this plan). The rule resolves between-round
  changes silently, a time-point reorder changes the registry with no import,
  the automatic deletion of unobserved facilities collides with the weights
  cascade, and the migration deletes unreferenced rows on every instance.
- **Create new facilities from the data wizard, leave updates to the structure
  wizard.** Two writers, two mapping UIs, two dedup rules.
- **A persistent recode dictionary keyed on the raw value.** Applied to admin
  columns it renames homonyms under different parents; applied to "Other" it
  cannot say what each facility is. Per-facility recodes with the file's context
  columns, remembered as user sources, cover the real case.
- **Per-round attributes at run time.** Would change the parquet the R code
  reads and move facilities between groups across a series.
- **Weights mapped in the data wizard.** The data upload is the raw ODK export,
  which carries no weights; weights stay a separate file (ruled, 2026-10-15).

## 3. Rulings

Rulings marked _(proposed)_ were derived by the author of this file, not heard;
they stand unless overruled here before `Do 1`.

1. `facilities_hfa`, `admin_areas_hfa_1..4`, `hfa_data` and
   `hfa_facility_weights` keep their schemas and names. Every consumer outside
   this plan's surface is untouched.
2. The one new table is `hfa_facility_sources`, exactly §2.2. No observations,
   dictionary or overrides tables.
3. After Step 5 the only writers of `facilities_hfa` and `admin_areas_hfa_1..4`
   are the HFA data import's integrate leg and the facilities page, both through
   `server/db/instance/hfa_facilities.ts`, inside the caller's transaction, with
   the stamp bumped only when something changed. _(proposed)_
4. The facility columns are §2.3: level 1 a fixed value, levels 2 to
   `adminDepth` all or none, optional columns within the enabled set, an
   optional correction column per mapped column, every header resolved through
   the XLSForm by a helper lifted from `stage_structure_from_csv.ts:128-177`
   into `server/server_only_funcs_csvs/resolve_odk_labels.ts`. _(proposed)_
5. Pre-fill is §2.3's order: latest complete run, core names, unmapped. The
   facility id default is the first of `id_fac_txt`, `id_fac` with values, in
   the data wizard and the weights wizard (catalogue Q9). _(proposed)_
6. Changes are computed statelessly before launch and decided as §2.4, carried
   in the launch payload, stored on the run row, and re-validated per (facility,
   column, from, to) at staging and inside the integrate transaction with the
   rows locked; any difference fails the run naming the ids. _(proposed)_
7. Defaults are §2.5. A cell with no source has no default. _(proposed)_
8. A new facility with an incomplete admin tuple holds the run in `needs_review`
   with its ids; Integrate anyway drops its rows. An existing facility with an
   incomplete file tuple keeps its registry tuple and shows no change. The hold
   for rows with a missing facility id stays. The not-found counter, its sample,
   the `validFacilities` staging table and the non-empty registry launch gate
   (`dataset_hfa_import_runs.ts:128-135`) go. _(proposed)_
9. Diagnostics gain `facilityMatch { known, new, absent }`, `facilityChanges`
   (per column: changed, kept, taken), `labelResolution` (the structure stager's
   shape), `facilitiesWithoutAdminTuple { count, sample }`,
   `orphanedGeojsonAreaIds` and `orphanedScopeAreas`, all optional because old
   runs lack them. The clean condition becomes
   `nRowsInvalidMissingFacilityId = 0 AND facilitiesWithoutAdminTuple.count = 0 AND nRowsTotal > 0`.
   Stored diagnostics lose `nRowsInvalidFacilityNotFound` and
   `facilityNotFoundSample` through a `.ts` migration registered in
   `TS_MIGRATIONS` (stored JSON is never touched in SQL); the same migration
   cancels every run in `needs_review` with a message saying the release
   superseded it and drops that run's staging tables. _(proposed)_
10. The integrate leg is §2.6, in that order.
11. "Other" reassignment is per facility, in the changes step, with unmapped
    file columns as context; the HMIS structure wizard keeps its own review
    step. The editor is shared between the two under
    `client/src/components/data/_shared/`. _(proposed)_
12. The facilities page HFA tab is §2.7. _(proposed)_
13. Migrations: 212 creates `hfa_facility_sources`; 213 is the `.ts` migration
    of ruling 9; 214 deletes the `hfa` row of `structure_upload_attempts`, drops
    `temp_structure_staging_hfa`, re-keys the table on `slot` (a name no earlier
    migration drops; 054 drops `id`) and drops `dataset_family`. No registry
    content changes at deploy. _(proposed)_
14. The structure import loses its HFA branch and its family parameter in Step
    5: the XLSForm input, the label resolution and
    `StructureCsvStep1Result.xlsForm` leave the structure path;
    `deleteFamilyFacilities` keeps its family parameter and its refusals; the
    registry readers (`getStructureItems`, exports, `structureSchema` per
    family, `facilitiesTableForFacilityFamily`, `listAdminArea2s`) keep theirs.
    The geojson orphan count moves out of the structure step-4 route into the
    shared writer. _(proposed)_
15. Weights are a separate import of a separate file, unchanged in shape,
    imported after the round's data. Unknown facility ids are skipped and
    reported with a count and a sample instead of rejecting the file; the import
    refuses only when every id is unknown, and the message says that facilities
    are created by the round's data import. _(proposed)_
16. A time-point reorder, a time-point delete and an HFA data delete do not
    touch the registry. A time-point delete sets `time_point` to NULL on its
    source rows through the FK, which makes those cells default to take.
    _(proposed)_
17. Nothing in `wb-fastr-modules` changes. The extract SQL in
    `server/runs/capture_inputs/hfa.ts` is not touched.
18. HMIS/HFA crosswalks are out of scope (§6).

## 4. Steps

### Step 1: schema, types, the registry writer, the scan

**Surface.**

- `server/db/instance/_main_database.sql`
- `server/db/migrations/instance/212_hfa_facility_sources.sql`
- `server/db/instance/hfa_facilities.ts` (new: the registry reads and writes of
  rulings 3, 6, 7, 12: compute changes against the registry, apply decisions and
  new facilities with admin insert, padding, source rows, cleanup and the
  conditional stamp; edit one facility; remove unreferenced facilities; orphan
  reports)
- `server/server_only_funcs_csvs/resolve_odk_labels.ts` (new; the structure
  stager keeps its own copy until Step 5)
- `server/server_only_funcs_csvs/scan_hfa_rows.ts` (kept-row facility values:
  fixed level 1, correction columns, label resolution, headers with values)
- `lib/types/dataset_hfa_import.ts` (`facilityColumns`, `facilityChanges`,
  `recodes`, the previews, the diagnostics of ruling 9)
- `lib/utils.ts` (core header names, candidate-list id default)
- `server/tests/hfa_facility_changes_test.ts` (new)
- `SYSTEM_05_facilities_indicators.md` (manifest: `hfa_facilities.ts`; prose: an
  "HFA registry writes" section stating §2.2, §2.5 and §2.6 as the authoritative
  contract)
- `SYSTEM_06_ingestion.md` (manifest: the test)

**Deliverable.** Rulings 1, 2, 4, 5 (the constants), 7, 13 (migration 212). The
table exists in the base schema and the migration. The writer implements §2.5
and §2.6 and is exercised by the test against a scratch schema: changes grouped
per column and tuple, defaults per source kind and round order, no default on an
unknown source, decision mismatch refusal, admin inserted before the upsert,
padding above depth, source rows written, cleanup, stamp bumped only on change,
remove-unreferenced refusing nothing it should not. Nothing calls the writer yet
except the test.

**Not in this step.** Any import change. Any route. Any client.

**Gates.** `./validate_migrations`, `./validate_fresh_boot`, the new test under
`deno task test`.

**Ends with.** One commit.

### Step 2: the import writes the registry

**Surface.**

- `server/worker_routines/import_hfa_data_csv/stage_csv.ts`
- `server/worker_routines/import_hfa_data_csv/integrate_staged.ts`
- `server/worker_routines/import_hfa_data_csv/worker.ts`
- `server/worker_routines/import_hfa_data_csv/instantiate_worker.ts`
- `server/db/instance/dataset_hfa_import_runs.ts` (launch validation of rulings
  4, 6, 8; latest complete run's mappings)
- `server/routes/instance/datasets.ts` (headers with values; the stateless
  facility preview and changes preview; latest mappings; the structure notify
  after a launch or a resumed review completes with a changed registry)
- `lib/api-routes/instance/datasets.ts`
- `server/db/migrations/instance/213_hfa_run_diagnostics_facility_changes.ts`
- `server/db/migrations/runner.ts`
- `client/src/components/data/hfa/imports/staging_summary.tsx`
- `client/src/components/data/hfa/imports/needs_review_card.tsx`
- `server/tests/hfa_import_facilities_test.ts` (new)
- `SYSTEM_06_ingestion.md` (manifest: the test; prose: HFA import runs, clean
  condition, integration contract, staging rules, the label-resolution paragraph
  moved here from S5 Structure ELT)
- `SYSTEM_01_api_contract.md` (prose only if the registry contract text changes)
- `HFA_WORK_CATALOGUE.md` (Q5 is superseded: the hold for unknown facilities no
  longer exists; L1 points here)

**Deliverable.** Rulings 6, 8, 9, 10, 13 (migration 213). The stage leg stages
the kept row's facility values into a per-run table, validates the decisions
against it, and records the diagnostics of ruling 9. The integrate leg runs §2.6
through the Step 1 writer. The worker's clean condition is ruling 9's. Launch
validation enforces rulings 4, 6 and 8 fully from this step: the only launcher
between Step 2 and Step 3 is the test. The staging summary and the needs-review
card render the new diagnostics and the dropped not-found block.

**Not in this step.** The wizard. Any structure import change.

**Gates.** `./validate_migrations`. The committed harness
`server/tests/hfa_import_facilities_test.ts` stages a small CSV plus XLSForm
through `stageHfaCsvIntoTables` and `integrateStagedHfaData` against a scratch
schema and asserts the registry, the source rows, the data and the diagnostics,
including a stale decision refusal and an incomplete-tuple hold.

**Ends with.** Several commits, each green: the types and migration; the stage
leg; the integrate leg; the routes; the client summary.

### Step 3: the wizard

**Surface.**

- `client/src/components/data/hfa/imports/wizard.tsx`
- `client/src/components/data/hfa/imports/facility_columns_step.tsx` (new)
- `client/src/components/data/hfa/imports/facility_changes_step.tsx` (new)
- `client/src/components/data/hfa/imports/mod.ts`
- `client/src/components/data/_shared/recode_editor.tsx` (new; lifted from
  `facilities/import/step_4_recode.tsx`, which becomes an adapter over it)
- `client/src/components/data/_shared/mod.ts`
- `client/src/components/data/facilities/import/step_4_recode.tsx`
- `client/src/components/data/hfa/hfa_weights.tsx` (the id default of ruling 5)
- `SYSTEM_06_ingestion.md` (manifest; Client prose for the HFA wizard)
- `SYSTEM_05_facilities_indicators.md` (prose: the shared editor, the weights
  wizard default)

**Deliverable.** Rulings 5, 11 and §2.4. The two new steps sit between mappings
and duplicates and between duplicates and review; pre-fill, per-column preview,
grouped changes with keep or take, exceptions, the recode editor with context
columns, the orphan line, the id-mismatch confirmation. Every pre-filled picker
shows where its value came from until edited.

**Not in this step.** The facilities page. Help buttons.

**Gates.** Floor.

**Ends with.** Several commits, each green: the shared editor; the facility
columns step; the changes step.

### Step 4: the facilities page

**Surface.**

- `client/src/components/data/facilities/facilities.tsx`
- `client/src/components/data/facilities/with_csv.tsx`
- `client/src/components/data/facilities/hfa_registry/**` (new, with `mod.ts`:
  the table, the row edit, the remove-unreferenced action)
- `client/src/components/data/facilities/mod.ts`
- `client/src/state/instance/t2_structure.ts`
- `lib/types/structure.ts`
- `lib/api-routes/instance/structure.ts`
- `server/routes/instance/structure.ts` (routes: registry rows with sources,
  edit facility, remove unreferenced)
- `server/db/instance/hfa_facilities.ts`
- `SYSTEM_05_facilities_indicators.md` (manifest; Client prose)

**Deliverable.** Ruling 12 and §2.7. The HFA tab has no import entry; the HMIS
tab is unchanged. Both saves run through the Step 1 writer and report orphaned
geojson area ids and scope areas.

**Not in this step.** Removing the structure wizard's HFA branch: the tab stops
linking to it, the code goes in Step 5.

**Gates.** Floor.

**Ends with.** Several commits, each green: routes and DB; the table and edit;
the remove action.

### Step 5: the structure import is HMIS-only, weights follow the data

**Surface.**

- `server/db/instance/structure.ts`
- `server/routes/instance/structure.ts`
- `lib/api-routes/instance/structure.ts`
- `server/server_only_funcs_importing/stage_structure_from_csv.ts`
- `server/server_only_funcs_importing/stage_structure_from_dhis2.ts`
- `server/server_only_funcs_importing/integrate_structure_from_staging.ts`
- `server/db/instance/_main_database.sql`
- `server/db/migrations/instance/214_structure_upload_attempts_hmis_only.sql`
- `lib/types/structure.ts`
- `client/src/components/data/facilities/import/**`
- `client/src/components/data/facilities/facilities.tsx`
- `server/db/instance/hfa_facility_weights.ts`
- `client/src/components/data/hfa/hfa_weights.tsx`
- `SYSTEM_05_facilities_indicators.md` (Structure ELT prose rewritten for one
  family; ODK label resolution paragraph removed; weights prose)
- `SYSTEM_01_api_contract.md` (prose only if the registry contract text changes)

**Deliverable.** Rulings 13 (migration 214), 14, 15. No code path writes
`facilities_hfa` except the Step 1 writer. The import machinery has no family
parameter; the registry readers keep theirs. `structure_upload_attempts` is
single-row on `slot`. The XLSForm input, the label resolution and
`StructureCsvStep1Result.xlsForm` are gone from the structure path. The weights
import skips and reports unknown ids and names the order.

**Not in this step.** Anything HFA-wizard-side; it is finished.

**Gates.** `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** Several commits, each green: the migration and schema; the server
import machinery; the client import steps; the weights; the SYSTEM prose.

## 5. Gates catalogue

| Gate                                             | First reached |
| ------------------------------------------------ | ------------- |
| `./validate_migrations`                          | Step 1        |
| `./validate_fresh_boot`                          | Step 1        |
| `server/tests/hfa_facility_changes_test.ts`      | Step 1        |
| `server/tests/hfa_import_facilities_test.ts`     | Step 2        |
| Floor (typecheck, test, validate_protocols, run) | every step    |

## 6. Out of scope

- HMIS/HFA crosswalks for admin areas, facility types and facilities.
- Per-round facility attributes at run time (rejected, §2.9).
- HMIS structure import behaviour, beyond losing its family parameter.
- Weights mapped from the data file (rejected, §2.9).
- Removing dataset rows in-platform and the sentinel review UI (SYSTEM_06 "HFA
  follow-on work").
- Help buttons for the new steps.
- The Sierra Leone round 1 re-import itself (operational, §7 names it as the
  first use).

## 7. Rollout and rollback

Nothing ships before the Step 5 review passes. Then:

1. On the host, dump every instance's `main` database before the deploy
   (`docker exec <country>-postgres pg_dump -U postgres -d main`, gzipped into a
   directory named in the build log), because nothing in this repo takes a
   backup (`SYSTEM_15_admin_ops.md`, "Backups").
2. `./deploy_testing`. Migrations 212 to 214 run. No registry row changes; runs
   held in `needs_review` are cancelled with a message; an in-progress HFA
   structure attempt is discarded.
3. On the testing instance, re-import one existing round with facility columns,
   keep every change at the changes step, and confirm the registry is
   byte-identical; rerun m010 and compare against the previous package for that
   round: identical. Then take one change and confirm the new package differs
   only there.
4. Release with `./deploy`. First operational use: the Sierra Leone round 1
   re-import in SYSTEM_06 "HFA follow-on work", data before weights, whose six
   vaccine-indicator oracle values still apply.

Rollback: migrations 212 and 213 are additive apart from the cancelled held
runs; 214 deletes the HFA attempt row and re-keys the table. Rollback is the
step-1 dump restored plus a redeploy of the previous release.

## 8. Build log

| Date       | Step | Entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-15 | 1    | `HfaFacilityChangeGroupDecision` carries `facilityIds`, the whole group as the user was shown it, beyond §2.4's shape. Without the members, a facility that moved into an existing group, or a new change matching a decided group, passes re-validation; ruling 6's per-(facility, column, from, to) check needs them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-15 | 1    | An admin `from`/`to` is the tuple as JSON (`encodeHfaAdminTuple`), not a separator join: a join reads two tuples the same when a name contains the separator, and the value is a re-validation key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-15 | 1    | §2.5's "a decision that agrees with the default is written as kind round with the imported round", read literally, rewrites a kept user value or a kept newer round's value as the imported round's. The writer's rule, stated in SYSTEM_05: a take agreeing with the default, or with no default, is the round's; any decision against the default is the user's; a keep the default keeps leaves the source; a keep with no default is the user's; an unchanged mapped cell whose default would not keep becomes the round's (§2.5's "keep when the values are equal").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-15 | 1    | A blank and a NULL registry value are equal, so no change. A taken blank writes `''`, as the structure import has always written a blank mapped cell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-15 | 1    | `HfaCsvMappingParams` does not gain `facilityColumns`, `facilityChanges` and `recodes` yet. The types exist on their own (`HfaFacilityColumns`, `HfaFacilityChangeGroupDecision`, and `StructureRecodes`, whose shape is §2.4's `recodes`) because required fields break the wizard's `createStore<HfaCsvMappingParams>` (Step 3's surface) and `validateHfaCsvRunConfig` (Step 2's). Step 2 must edit `lib/types/dataset_hfa_import.ts`, which its Surface omits: it adds the three fields to the mapping params and drops `nRowsInvalidFacilityNotFound` and `facilityNotFoundSample` (ruling 9), and the wizard's initial store needs the three fields from that commit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-15 | 1    | Step 2's stage leg and routes read `scan_hfa_rows.ts` and `hfa_facilities.ts`, neither in Step 2's Surface, so Step 1 built what they need: `createHfaFacilityCollector` for the stage leg's single pass, `resolveHfaKeptRows` (stage_csv.ts keeps its inline copy until Step 2 uses it), context headers for the recode editor, `summarizeHfaFacilityColumns` (the facility columns preview), `previewHfaFacilityChanges` (match, groups, new ids, incomplete tuples, introduced paths, lost areas with their scopes and map), `getHfaRegistryAdminAreaNames` and `reportHfaRegistryOrphans`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-15 | 1    | `HFA_CORE_FACILITY_ID_COLUMN` stays beside `HFA_CORE_FACILITY_ID_COLUMNS` until its last users go: the HFA wizard and the weights wizard (Step 3) and the structure step 2 (Step 5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-15 | 1    | `resolve_odk_labels.ts` uses the data stager's header convention (last `/` segment, exact, else the one caseless match). The structure stager's lookup, which its comment says is the same, predates the caseless match. stage_csv.ts's `matchCsvColumnsToXlsForm` keeps its own lookup until Step 2 can call `findXlsFormQuestionForHeader`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-15 | 1    | `finishHfaRegistryWrite` runs `cleanupUnusedAdminAreas` and the stamp only when a registry row changed: an admin area can lose its last facility only when a facility moves or leaves, so "a registry row or an admin area changed" is "a registry row changed". `cleanupUnusedAdminAreas` is imported from the structure integrator unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-15 | 1    | The import's write locks every registry row the file names, not only those the decisions name: the recompute reads them all and writes sources for the unchanged ones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-15 | 1    | The writer refuses a recode that names neither a new facility nor a taken change in that column, naming the facilities. `HfaLabelResolution.column` is the registry column; a correction header is counted under its column.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-15 | 1    | Step 1 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-15 | 1    | Review finding (code): `server/db/instance/hfa_facilities.ts:703-717`, `previewHfaFacilityChanges`. `decide` runs `d.facilityIds.includes(id)` and `d.exceptions.includes(id)` for every facility of every admin change group, quadratic in the group's size, where `resolveHfaChangeDecisions` builds sets for the same test. Edit: `decisionByKey` holds `{ members: new Set(d.facilityIds), exceptions: new Set(d.exceptions), decision: d.decision }` per group key, and `decide` tests `members.has(change.facilityId)` and `exceptions.has(change.facilityId)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-15 | 1    | Review finding (prose, resolved in d1b762594): SYSTEM_05 "Facilities, admin areas, weights" listed what bumps `structure_last_updated` without the HFA registry writer, which `finishHfaRegistryWrite` bumps on every write that changed a row. The list now names it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-15 | 1    | Step 1 reviewed: 2 findings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-15 | 1    | Fix: `previewHfaFacilityChanges` holds each decided group's members and exceptions as sets, so the decision lookup is a set test, as the review's code finding states.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-15 | 1    | Step 1 fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-15 | 1    | Re-review, outside the findings (a row, not a finding): `resolveHfaChangeDecisions` (`server/db/instance/hfa_facilities.ts:310`, `:333`, `:336`) builds `new Set(d.facilityIds)` twice per decision and `new Set(d.exceptions)` once, the same `{ members, exceptions, decision }` index `previewHfaFacilityChanges` now builds at `:703-709`. Edit: one helper indexes `HfaFacilityChangeGroupDecision[]` by group key into `{ members: Set<string>, exceptions: Set<string>, decision }`, built once and read by both; `resolveHfaChangeDecisions` keeps its duplicate-key and exceptions-outside-members checks and reads the index's `members` where it rebuilds `decided`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-10-15 | 1    | Step 1 reviewed: pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-15 | 2    | `lib/types/dataset_hfa_import.ts`, outside the Surface as the Step 1 row foresaw: `HfaCsvMappingParams` gains `facilityColumns`, `facilityChanges` and `recodes` (`StructureRecodes`), the diagnostics lose `nRowsInvalidFacilityNotFound` and `facilityNotFoundSample`, and `HfaFacilityRecodeRow` and `HfaFacilityChangesReview` type the changes preview route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-15 | 2    | Other files outside the Surface the change needs: `client/src/components/data/hfa/imports/wizard.tsx` (its initial store gets the three fields; it launches with empty facility columns, which launch validation refuses until Step 3, so the harness is the only launcher, as the step says); `server/tests/hfa_csv_column_matching_test.ts` (its mappings gain the fields, its database the HFA schema row and the time point the stage leg now reads); `lib/api-routes/instance/structure.ts` (exports `structureRecodesSchema`, which the launch body reuses); `server/server_only_funcs_csvs/resolve_odk_labels.ts` (`findXlsFormQuestionForHeader` indexes each form once, so the stage leg's matcher uses it with no scan per header); `SYSTEM_05_facilities_indicators.md` ("The file side" points at S6, which now holds how the kept row's cells are read).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-15 | 2    | One commit, not the five "Ends with" lists: the mapping fields and the dropped not-found fields break the stage leg, the worker, launch validation, the wizard store and the staging summary together, and a split that kept each commit green would leave one in which unknown facilities' data is dropped with no hold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-15 | 2    | `hfa_facilities.ts` is not edited: the stage leg composes the exported `previewHfaFacilityChanges` and `resolveHfaChangeDecisions`, so a recode naming an unwritten cell is refused at integration, which the same run reaches right after staging.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-15 | 2    | The orphan reports are written into the diagnostics inside the integrate transaction, just before the flip, not after commit as §2.6 says: the state is the same and the diagnostics land with the complete flip. The structure notify is after commit, in the routes' `onComplete`, by comparing `structure_last_updated` before the launch with its value when the worker finishes; the worker's message protocol is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-15 | 2    | Not in the plan: the integrate leg refuses when a facility the stage leg found in the registry is new with an incomplete tuple (removed from the registry during a hold), since its data would otherwise be dropped unseen. The per-run facilities table records `known` for it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-15 | 2    | Migration 213 also fills the stored `csv_config` of earlier runs with empty facility fields, so stored configs have the current shape and `getDatasetHfaLatestMappings` returns one, and drops the facility-check table of a run still running at deploy, which the boot sweep's current table names no longer cover.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-15 | 2    | `n_rows_integrated` is the count of data rows inserted, without the left-out facilities' rows, no longer the staged count. `nRowsValid` is the kept facilities minus the new ones without a complete tuple. The stage leg now requires the time point to exist (the changes read the round's order); launch already did.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-15 | 2    | `isCleanHfaStaging` moved from the worker to `stage_csv.ts`, so the harness tests the hold rule. `previewDatasetHfaFacilityChanges` returns the preview with a recode row per new facility and per facility with a change in a recodable column, carrying the context headers the request names. `SYSTEM_01_api_contract.md` is unchanged: it states no registry contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-15 | 2    | Step 2 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-15 | 2    | Review finding (code): `server/worker_routines/import_hfa_data_csv/stage_csv.ts:337`, the stage leg calls `previewHfaFacilityChanges`, which beyond the change set the leg needs projects the admin areas and, when a decision empties an area, reads every scope and parses every HFA geojson map (`server/db/instance/hfa_facilities.ts:740-745`) for a result the leg discards and the integrate leg computes again in `reportHfaRegistryOrphans`; it also re-reads the HFA structure schema the leg read at `stage_csv.ts:130` (`hfa_facilities.ts:690`), as `server/routes/instance/datasets.ts:749` re-reads the one `scanHfaFacilitiesForPreview` read at `:698`. Edit: `hfa_facilities.ts` exports `readHfaFacilityChangeSet(sql, { file, facilityColumns, schema: StructureSchema, timePoint })` returning `{ changeSet: HfaFacilityChangeSet; registryRows: HfaRegistryRow[] }`, the body of `previewHfaFacilityChanges` through `computeHfaFacilityChanges` with the caller's schema in place of `readHfaSchema`; `previewHfaFacilityChanges` takes `schema` and calls it; the stage leg calls it with `resSchema.data` and takes `facilityMatch` from `changeSet.match`, the resolved decisions from `changeSet.changes`, `newFacilityIds` from `changeSet.newFacilities` plus `changeSet.newFacilitiesWithoutAdminTuple`, and `facilitiesWithoutAdminTuple` as the count and the first `DIAGNOSTIC_SAMPLE_SIZE` ids of the sorted `newFacilitiesWithoutAdminTuple`; `scanHfaFacilitiesForPreview` returns the schema beside the scan and the changes route passes it on. |
| 2026-10-15 | 2    | Review finding (code): `server/worker_routines/import_hfa_data_csv/stage_csv.ts:347-365` repeats `server/db/instance/hfa_facilities.ts:970-999`: the loop counting changed, kept and taken per column group from the change groups and the resolved decisions. Edit: `hfa_facilities.ts` exports `countHfaFacilityChanges(changes: HfaFacilityChangeGroup[], resolved: ResolvedDecisions): HfaFacilityChangeCounts[]`, with `ResolvedDecisions` exported; `writeHfaFacilitiesFromImport` takes `changeCounts` from it and its loop keeps only the taken changes' `adminUpdates` and `optionalUpdates`; the stage leg's loop becomes the call.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-15 | 2    | Review finding (code): `server/worker_routines/import_hfa_data_csv/integrate_staged.ts:124-130`, the diagnostics written at complete recompute `facilityMatch`, `facilityChanges` and `facilitiesWithoutAdminTuple` from the registry at integration but keep `nRowsValid` from staging, so a held run whose registry gained or lost a facility before "Integrate anyway" records a valid-row count that disagrees with its own facility counts. Edit: add `nRowsValid: staged.length - registry.skippedFacilityIds.length` to the object.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-15 | 2    | Review finding (code): `client/src/components/data/hfa/imports/staging_summary.tsx:406, 409, 412`, `getAdminAreaLabel(o.adminAreaLevel as ...)` casts `o.adminAreaLevel`, a `number`, to the level union where `getAdminAreaLabelForLevel(level: number)` in the same module exists for it. Edit: import `getAdminAreaLabelForLevel` and write `t3(getAdminAreaLabelForLevel(o.adminAreaLevel))` at the three sites.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-15 | 2    | Review finding (code): `server/db/instance/dataset_hfa_import_runs.ts:190-192`, `HFA_FACILITY_COLUMN_GROUPS.includes(d.column)` is never false: `d.column` is typed `HfaFacilityColumnGroup`, the list holds every member, and the only caller's body passed `hfaFacilityChangeGroupDecisionSchema`. Edit: delete the check and the `HFA_FACILITY_COLUMN_GROUPS` import.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-10-15 | 2    | Review finding (prose, resolved in f84e72248): `server/worker_routines/import_hfa_data_csv/stage_csv.ts:383`, the `known` flags went as `::text[]::boolean[]` with no reason given, and the plain `::boolean[]` a reader would write back in fails in postgres.js ("cannot cast type boolean to boolean[]": it types a boolean array parameter as one boolean, `sql.array` included). A comment now records the workaround.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-15 | 2    | Review finding (prose, resolved in 4dd498d01): SYSTEM_06 "Integration" said `hfa_facility_weights` is populated by the structure import; only the weights import (`importHfaFacilityWeights`, S5) writes it. The sentence now names the weights import.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-15 | 2    | Step 2 reviewed: 7 findings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-15 | 2    | Fix: `readHfaFacilityChangeSet` reads the change set against the caller's schema; `previewHfaFacilityChanges` and the stage leg call it, so the stage leg neither projects admin areas nor reads scopes and maps, and neither re-reads the schema; the changes route passes the schema `scanHfaFacilitiesForPreview` read. `countHfaFacilityChanges` counts changed, kept and taken per column for the stage leg and the writer. The diagnostics written at complete carry the integrated `nRowsValid`. The staging summary labels orphaned map areas through `getAdminAreaLabelForLevel`. Launch validation drops the column-group check that could not fail.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-10-15 | 2    | `server/tests/hfa_facility_changes_test.ts`, outside the findings' files: `previewHfaFacilityChanges` now takes the schema, so the test's three calls pass its `SCHEMA`, typed `StructureSchema`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-15 | 2    | Step 2 fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-15 | 2    | Step 2 reviewed: pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-15 | 3    | §2.5's recode pre-fill "from the latest complete run where the facility id and the raw value match" is not built: a run stores its recodes as facility id to value, never the file value each replaced, so the raw-value match cannot be made, and a match on the facility id alone would override a file that now codes the facility properly. A recode is written as the user's source, which every later round keeps by default, so an earlier recode carries forward with no pre-fill.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-10-15 | 3    | The duplicates step always shows, not "auto-skipped when none" (§2.4): the code wins. It always shows since c74a8af4e, after a tester reported the silent skip as a defect, and says there is nothing to resolve.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-15 | 3    | The facility id pre-fill follows ruling 5's order: the latest complete run's id column where the new file has it with values, then the first of `id_fac_txt`, `id_fac` with values. Level 1 reads the registry's value through `getStructureItems`, the facilities page's cached read, which needs `can_view_data`; without it the wizard pre-fills the country.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-15 | 3    | Files outside the Surface: `lib/utils.ts` (`decodeRawCsvHeader` beside `encodeRawCsvHeader`, to find the latest run's headers by raw text in the new file); `client/src/components/data/hfa/imports/facility_column_label.ts` (new) and `staging_summary.tsx` (its column label helper moved there, shared with the two new steps); `server/routes/instance/structure.ts` and `lib/api-routes/instance/structure.ts` (the weights headers route reports `headersWithValues`, which ruling 5's weights default needs).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-15 | 3    | Two commits, not three: the weights default alone, then the shared editor, both steps and the wizard together, because `lint:structure` refuses a `_shared/` folder with a single consumer until the changes step uses it, and the two steps share the wizard's rewrite. The shared folder is claimed in SYSTEM_06's manifest, its prose in SYSTEM_05.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-15 | 3    | The changes step's state lives in `createHfaFacilityChangesState`, which the wizard owns so decisions survive moving between steps. Decisions are kept per (group, facility); the areas lost and paths introduced are read again through the changes route whenever an admin decision changes, the recode rows whenever the context columns change. On Next the decisions are written into the mappings as each group's most common decision plus exceptions, and recodes on cells the import does not write are dropped. Each mapped recodable column's `<header>_other` column is shown as context by default.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-15 | 3    | Step 3 built.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-15 | 3    | Review finding (code): `client/src/components/data/hfa/imports/facility_changes_step.tsx:167-188`, the admin-impact effect, with `load()` at `:233`. `load()` stores the preview it fetched with no decisions and sets `fetchedAdmin` to `"[]"`, but the effect's signature is `encode()` over every admin member that has a default or a decision, so it equals `"[]"` only when no admin change has a default: right after every load the file is scanned and the registry read a second time for the result `load()` just stored, and setting a group to its own default refetches as well. Edit: `encode(groups, include = () => true)` filters `decided` by `include(change, decision)`; the effect passes `(change, decision) => decision !== (change.defaultDecision ?? "take")`, the members the route would not decide that way on its own (`previewHfaFacilityChanges` reads only the members a decision names and takes `defaultDecision ?? "take"` for the rest), so the signature is `"[]"` after a load with no overriding decision and changes only when the projection would.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-15 | 3    | Review finding (code): `client/src/components/data/hfa/imports/wizard.tsx:309-321`, `resetColumnChoices`. A new CSV clears the column choices and the recodes but not the changes state: `ui.recode.contextColumns` keeps the old file's encoded headers and `contextSeeded` stays true, so the new file's `_other` columns are never seeded and `load()` sends the old headers to the changes route, whose collector throws "Header not found in uploaded csv" (`getCsvColumnIndex`) for a header the new file lacks or holds at another index; the changes step then cannot load and nothing on the duplicates step can clear them. The old file's decisions, column rules, checked values and custom targets survive the same way. Edit: `createHfaFacilityChangesState` returns `reset()`, which in one `batch` sets the review undefined and `setUi(reconcile({ columnRules: {}, decisions: {}, idsConfirmedNew: false, contextSeeded: false, recode: emptyRecodeEditorUi() }))`; `resetColumnChoices` calls `changes.reset()` in its batch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-15 | 3    | Review finding (code): `client/src/components/data/hfa/imports/facility_changes_step.tsx:307-318`, `prunedRecodes`, called from `wizard.tsx:476-479`. `recodableIds(col)` holds every new facility whatever the column, so a recode assigned to a new facility in a recodable column that is later unmapped on the facility columns step survives the prune, rides the launch and is refused by `cleanHfaRecodes` ("Recodes name the column X, which the import does not map"), with no control left in the wizard to clear it. Edit: `prunedRecodes(recodes, facilityColumns: HfaFacilityColumns)` skips a column with `facilityColumns.optional[col] === undefined`; `commitChanges` passes `unwrap(mappings.facilityColumns)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-10-15 | 3    | Review finding (code): `client/src/components/data/hfa/imports/facility_columns_step.tsx:282-380`. The pickers sit inside `StateHolderWrapper state={p.preview}`, whose ready branch is keyed on the data object, so every preview fetch (on entering the step and after each pick) unmounts the pickers for "Fetching data…" and recreates them, and a preview error leaves the step with no picker to correct the mapping. Edit: render the `<For each={mappedColumns()}>` block outside the wrapper, keep the wrapper around the facilities count line only, and under each column's pickers render `<Show when={headersOf(column) && columnPreview(column)}>` with `const columnPreview = (column: MappedColumn) => p.preview.status === "ready" ? previewOf(p.preview.data, column) : undefined`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-15 | 3    | Review finding (code): `client/src/components/data/hfa/imports/facility_changes_step.tsx:412-420`. The group and facility `TableConfig`s are created in `FacilityChangesStep`, which the wizard's `<Show when={currentStepKind() === "changes"}>` creates again on every visit, so a table's search text and sort are lost on Back and Next while the decisions beside them survive (PROTOCOL_UI_COMPONENTS rule 14: the config lives with the query's owner). Edit: move `tableConfigs` and `tableConfig(key)` into `createHfaFacilityChangesState`, return `tableConfig`, and read `p.state.tableConfig(...)` in `FacilityChangesStep`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-15 | 3    | Review finding (code): `client/src/components/data/hfa/imports/wizard.tsx:418`, `void untrack(fetchColumnsPreview)` inside an `on()` callback, which Solid already runs untracked. Edit: `void fetchColumnsPreview();`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-15 | 3    | Step 3 reviewed: 6 findings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-10-15 | 3    | Fix: the admin-impact effect sends only the members decided against what the changes route would decide alone, so a review just loaded is not read again; a new CSV resets the changes state (`reset()`), so the old file's context columns, decisions and rules never reach the new file; `prunedRecodes` drops recodes on columns no longer mapped; the facility column pickers sit outside the preview's wrapper, so a preview read keeps them mounted and an error leaves them usable; the changes tables' configs live in `createHfaFacilityChangesState`; the step-entry effect calls `fetchColumnsPreview()` without `untrack`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-15 | 3    | Step 3 fixed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
