# PLAN: HFA facilities derived from survey rounds

**Status:** open, not started.

**What this plan does.** The HFA facility registry (`facilities_hfa`) stops
being imported through the structure wizard and becomes a table derived from
what each survey round says about each facility. The HFA data import wizard
gains a step that maps the file's facility columns (admin areas, name, type,
ownership, customs). Each round's kept row writes one observation per
facility. The registry is recomputed from the observations by a fixed rule:
the latest round by `sort_order` wins per column, a persistent recode
dictionary maps raw labels to canonical values, and per-facility overrides win
over everything. The HFA branch of the structure import is deleted. Every
downstream consumer of `facilities_hfa` (the run extract, the parquet
snapshot, query-time disaggregation, weights, the facilities page) is
untouched.

**Next step:** Do 1

**Branch:** `version2`.

**Repos touched:** this app only. `wb-fastr-modules` and panther are not
touched: the extract's shape and the m010 inputs do not change.

**Read first:** `CLAUDE.md`, `SYSTEMS.md`, `SYSTEM_05_facilities_indicators.md`
(Structure ELT; Facilities, admin areas, weights; HFA time points),
`SYSTEM_06_ingestion.md` (HFA import runs; Integration; HFA follow-on work),
then §2 and §3 here.

## 0. How to work this plan

Cadence, session shapes, the two-things rule and the step rules are
`panther/protocols/PROTOCOL_ALL_PLANS.md`; the app bindings are
`PROTOCOL_APP_PLANS.md`. This plan binds them as follows.

- Instruction: "Do the next step of PLAN_HFA_FACILITIES_FROM_ROUNDS.md."
- Branch: `version2`. Confirm with `git branch --show-current`. Never create
  a branch.
- Floor: `deno task typecheck`, `deno task test`, `./validate_protocols`,
  `./run`. Plus `./validate_migrations` for a step that touches a migration,
  `./validate_fresh_boot` for a step that touches `_main_database.sql`.
- Build log: §8. Last step: 5.
- A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for
  each area the step names, §2 and §3 here, the step's own section in §4,
  and §8.
- Vocabulary, used exactly as defined here:
  - **Round**: a row of `hfa_time_points`. "Time point" in code.
  - **Observation**: what one round's kept row says about one facility's
    attributes. One row of `hfa_facility_observations`.
  - **Registry**: `facilities_hfa`. Derived, never imported, never edited
    directly.
  - **Derivation**: the function that recomputes the registry from the
    observations, the dictionary and the overrides.
  - **Dictionary**: `hfa_facility_recodes`, a persistent per-column map from
    an observed raw value to a canonical value.
  - **Override**: `hfa_facility_overrides`, a per-facility per-column value
    that wins over every observation.
  - **Authored layer**: the dictionary and the overrides. Written only by
    users, never by an import, and never deleted by one.
  - **Referenced**: a facility id that some other table points at
    (`hfa_facility_weights` today; the HMIS/HFA crosswalks of §6 later).

## 1. The problem

### 1.1 The survey is the source of the facilities, and the code already knows

HFA facilities are never a master list. Every facility in the HFA registry
appears in a survey file, with its admin areas, name, type and ownership
collected as questionnaire answers. The structure import's HFA branch was
built around that fact:

- It accepts the XLSForm so it can resolve ODK choice codes to labels
  (`server/server_only_funcs_importing/stage_structure_from_csv.ts:125-161`).
- It dedups by the most-filled row because survey exports carry one row per
  submission attempt (`buildDedupOrderClause`,
  `integrate_structure_from_staging.ts:344`).
- It has a recode step because real files classify many facilities as
  "Other" (`structure.ts:1005-1237`, `step_4_recode.tsx`).

So today the user uploads the same file twice: once to the structure wizard,
mapping the facility columns, and once to the HFA data wizard, mapping the id
column, the time point and the filters. The two runs apply two different dedup
rules to the same rows (structure: most-filled; data: first/last plus
per-facility overrides), so the registry row can come from a submission the
data import discarded.

### 1.2 What goes wrong

- **The ordering trap.** The data import validates ids against the registry
  in `stage_csv.ts:351-378` and holds in `needs_review` when any are missing
  (`worker.ts:44-48`). The diagnostics carry a count only
  (`lib/types/dataset_hfa_import.ts:107`), never the ids. The only remedy is
  to leave the wizard, run the structure wizard on the same file, then
  discard and restart the data import.
- **Mixed provenance, silently overwritten.** The registry row holds imported
  values and hand corrections in the same columns. `add_and_update` and
  `replace_all` overwrite both. Nothing records where a value came from.
- **Recodes die with the attempt.** `structure_upload_attempts.recodes` is
  scoped to one staging and nulled at every re-stage. Harmonising "Other" is
  repeated per round, by hand, and the second round can land on categories
  that differ from the first.
- **Re-import order is not neutral.** SYSTEM_06 "HFA follow-on work" plans a
  Sierra Leone round 1 re-import after later rounds exist. With the structure
  wizard, whichever file is imported last wins, regardless of which round it
  is.

### 1.3 What must not change

The registry is analytically load-bearing. The run extract inner-joins
`hfa_data` to `facilities_hfa` for admin areas
(`server/runs/capture_inputs/hfa.ts:140-152`), m010 stratifies by them, and
type and ownership disaggregation is a query-time join against the per-run
parquet snapshot of the registry (`server/server_only_funcs_presentation_objects/facility_context.ts`,
`server/run_query/run_read.ts:199`). Every round in a package is therefore
disaggregated by one current set of attributes, which is what makes a
cross-round series comparable. The end state keeps one row per facility, in
the same table, with the same columns.

## 2. The model

### 2.1 In one sentence

Facilities are what the surveys say they are; the most recent round wins; the
user can override any facility and can map any label once.

### 2.2 The tables

```
hfa_facility_observations          written by the HFA data import, per round
  facility_id      TEXT NOT NULL
  time_point       TEXT NOT NULL  FK hfa_time_points(label) ON UPDATE CASCADE ON DELETE CASCADE
  admin_area_1..4  TEXT           (nullable; blank never stored, NULL means not collected or blank)
  facility_name    TEXT
  facility_type    TEXT
  facility_ownership TEXT
  facility_custom_1..5 TEXT
  PRIMARY KEY (facility_id, time_point)

hfa_facility_recodes               authored: the dictionary
  column           TEXT NOT NULL  (an admin_area_N or an optional facility column)
  raw_value        TEXT NOT NULL
  canonical_value  TEXT NOT NULL
  PRIMARY KEY (column, raw_value)

hfa_facility_overrides             authored: per-facility values
  facility_id      TEXT NOT NULL
  column           TEXT NOT NULL
  value            TEXT NOT NULL
  PRIMARY KEY (facility_id, column)

facilities_hfa                     derived. Schema unchanged.
```

Observations have no FK to the registry: they precede it. Overrides have no
FK either: an override for a facility that currently has no observations is
kept, so a transient re-import cannot destroy authored work.

### 2.3 The derivation

`deriveHfaFacilities(sql)` runs inside the same transaction as whatever
changed its inputs, and is the only writer of `facilities_hfa` and of
`admin_areas_hfa_1..4`. For every facility id with at least one observation:

1. **Admin tuple.** Take the admin columns from the latest round (by
   `hfa_time_points.sort_order`) whose observation has every admin column at
   the registry's `adminDepth` non-null. Admin values are only a valid
   hierarchy as a tuple, so they are never mixed across rounds.
2. **Each optional column.** Take the value from the latest round whose
   observation has that column non-null. Columns are independent: a round
   that did not collect ownership leaves ownership to an earlier round.
3. **Dictionary.** For each column, replace the value by
   `hfa_facility_recodes.canonical_value` where a row matches
   `(column, value)`. Applied to admin columns and optional columns alike.
4. **Override.** For each column with an override, the override wins.
   An admin override is always the full tuple at the registry depth
   (enforced at save), so step 1 and step 4 never mix.
5. **Refuse** when a facility ends with no admin tuple (no round supplied a
   complete one and there is no override). The refusal names the facility
   ids. The registry's admin columns are NOT NULL and stay that way.

Then: upsert the derived rows, delete registry rows for facility ids with no
observation, insert admin areas with `ON CONFLICT DO NOTHING`, run
`cleanupUnusedAdminAreas`, bump `structure_last_updated`, and notify the
structure channel. Deleting a registry row that is **referenced** is refused
before any write, with the ids and the table that references them. The
operation that would have caused it (a round re-import with a stricter
filter, a round delete) fails whole.

Invariant, asserted by the derivation: every `(facility_id, time_point)` in
`hfa_data` has an observation. The data import writes both from the same kept
rows in one transaction, so the invariant holds by construction after Step 2
and by the migration of Step 1 before it.

### 2.4 The data wizard

Steps: upload, mappings, **facility columns**, duplicates (auto-skipped when
none), review. The facility-columns step maps the admin columns (all or none,
at the HFA registry's `adminDepth`) and each enabled optional facility column
(the HFA structure schema's enabled set, as today's structure wizard step 2).
Mappings are pre-filled from the latest complete run's mappings wherever the
header still exists. Every mapped facility column is resolved through the
XLSForm exactly as the structure stager does today: header matched to a
`select_one` question by the HFA header convention, code replaced by choice
label, unresolved codes kept raw and counted per column in the diagnostics.

The review step shows the facility match (ids already in the registry versus
new) computed statelessly by the duplicates preview, which already scans the
ids. A file where nothing matches an existing registry is the ID-mismatch tell
and is shown as such; it never blocks.

The stage leg stages the kept row's facility columns into a per-run table.
The integrate leg, inside the existing per-round replace transaction:
DELETE observations for the round, INSERT from the staging table, write
`hfa_data` and the dictionary as today, derive, flip complete. No
`needs_review` hold for unknown facilities exists any more; the hold remains
for rows with a missing facility id, resolved as today.

### 2.5 The facilities page, HFA tab

No import. The registry table as today, plus:

- **Edit facility**: a modal per row showing, per column, the derived value,
  the observed value in each round, the dictionary mapping if one applied,
  and an override field. Saving an override re-derives.
- **Categories**: per recodable column, the distinct observed raw values with
  facility counts and a canonical target per value. Saving re-derives. This
  replaces the structure wizard's per-attempt recode step, and persists.
- The HFA "delete all facilities" action is gone. Deleting HFA data (per
  round, existing) removes observations through the FK cascade and re-derives.

### 2.6 Order of operations for a user

Create the round, import its data (facilities appear), import its weights
(which require the facilities). Weights stay a separate import: they come
from the sampling frame, not the survey, and are facility by round.

### 2.7 Why this shape: the coming HMIS/HFA link

Within months the platform will link HMIS and HFA admin areas, facility
types and, where possible, facilities, so that analyses can combine both
families. Linking is a user-led or AI-led mapping that produces three
authored artifacts: an admin-area crosswalk per level, a facility-type
crosswalk (or one canonical type list both families map into), and a
facility crosswalk keyed on both ids. None of them belong inside either
registry row: they must survive re-imports on both sides and must never be
touched by an import. That is exactly the authored-layer separation this plan
introduces for HFA. The dictionary is the first half of the type link (raw
label to canonical value); the crosswalks are further authored layers of the
same kind; and the referenced-row rule in §2.3 already covers them. A
product's admin-area-2 scope is registry-agnostic and matched by name across
both registries today, so a spelling difference between families already
loses one family's results silently; the dictionary is where the HFA side of
that gets fixed.

The registry's existence as a table, keyed on the survey's immutable facility
id, is what a crosswalk joins against, and that is the same in the imported
and the derived design. Deriving changes who writes the attribute columns,
not whether the join target exists.

### 2.8 Rejected alternatives

- **Create new facilities from the data wizard, leave updates to the
  structure wizard.** Freezes attributes at first sight (round 1 is the
  messiest), keeps two writers and two mapping UIs for the same columns, and
  makes provenance mixed with no record. A lateral move.
- **Latest import wins.** Depends on upload order; breaks the planned round 1
  re-import. Latest **round** by `sort_order` is order-neutral.
- **First round wins.** Freezes the messiest data.
- **Per-round attributes at run time.** Would change the parquet the R code
  reads, `facility_context`, maps and every disaggregation, and would make a
  facility move between groups across a series. Rejected; per-round facts
  are stored (observations) but one derived row is what runs see.
- **Keep the structure import as a second writer for unsurveyed
  facilities.** Ruled out: every HFA facility is always in a dataset. Nothing
  downstream reads unsurveyed facilities (the extract starts from `hfa_data`,
  weights represent not-in-sample as absence).
- **The cheap fix** (a pre-launch facility check in the wizard listing the
  missing ids). Removes the surprise, keeps everything in §1.2.

## 3. Rulings

Rulings marked _(proposed)_ were derived by the author of this file, not
heard; they stand unless overruled here before `Do 1`.

1. `facilities_hfa` keeps its schema and its name. Every consumer outside
   this plan's surface is untouched.
2. The three new tables are exactly §2.2. `hfa_facility_observations` never
   stores a blank string; blank cells become NULL at staging.
3. The derivation is §2.3, per column, latest round by `sort_order`, admin
   columns as a tuple, dictionary then override, refuse on a facility with no
   admin tuple, refuse on deleting a referenced registry row. _(proposed)_
4. The derivation is the only writer of `facilities_hfa` and
   `admin_areas_hfa_1..4` after Step 5. It runs inside the caller's
   transaction after: the HFA data integrate leg, a round delete, an override
   save, a dictionary save, HFA data deletion.
5. The data import writes observations and `hfa_data` from the same kept rows
   in one transaction. The invariant in §2.3 is asserted there.
6. The dictionary applies to admin columns and to every optional facility
   column except `facility_name` (renaming is not recoding, as the structure
   wizard already rules). Overrides apply to every column including
   `facility_name`; an admin override is the full tuple. _(proposed)_
7. Overrides for a facility with no current observations are kept, not
   deleted. _(proposed)_
8. Label resolution through the XLSForm moves to a shared helper under
   `server/server_only_funcs_csvs/` in Step 2 and is used by the HFA data
   stager; Step 5 removes it from the structure stager. HMIS CSV structure
   imports never took an XLSForm.
9. Diagnostics: `nRowsInvalidFacilityNotFound` is removed from
   `DatasetHfaCsvStagingResult`; `facilityMatch { known, new }` and
   `labelResolution` (per column: resolved count, up to 10 distinct
   unresolved values, the structure stager's shape) are added. Stored
   diagnostics on old runs are rewritten in place by an instance migration,
   as migration 093 did for renamed keys. The clean condition becomes
   `nRowsInvalidMissingFacilityId = 0 AND nRowsTotal > 0`. _(proposed)_
10. The wizard's facility-columns step is mandatory for the admin columns
    only in effect: the derivation refuses a facility with no admin tuple
    from any round, so a first round without admin columns fails at
    integration with the ids named, not at the wizard. The wizard warns when
    admin columns are unmapped. _(proposed)_
11. Mappings pre-fill from the latest complete run's `csv_config.mappings`
    where the header exists in the new file. Served by one new route.
12. Migration for existing instances (Step 1): for every
    `(facility_id, time_point)` in `hfa_data` or in `hfa_facility_weights`,
    insert one observation copying the registry row's columns. Registry rows
    with neither data nor weights are deleted (they cannot exist under
    §2.3). No overrides are created: the derived registry equals the
    migrated one until a round is re-imported with facility mappings.
    _(proposed)_
13. The structure import loses its HFA branch and its family parameter in
    Step 5. `structure_upload_attempts` becomes a single-row table
    (migration). `deleteFamilyFacilities` accepts `hmis` only. The registry
    readers (`getStructureItems`, exports, `structureSchema` per family,
    `facilitiesTableForFacilityFamily`) keep their family parameter: the two
    registries remain per family. The recode step stays for HMIS: it is
    family-agnostic and HMIS type columns are free text too. _(proposed)_
14. `validateHfaCsvRunConfig` stops requiring a non-empty HFA registry
    (`dataset_hfa_import_runs.ts:130`) and validates the facility-column
    mappings instead: headers exist, admin columns all-or-none at the
    registry depth, optional columns within the enabled set.
15. Weights are unchanged: separate import, facility by round, reject unknown
    ids, populated after the round's data.
16. Nothing in `wb-fastr-modules` changes. The extract SQL in
    `server/runs/capture_inputs/hfa.ts` is not touched.
17. HMIS/HFA crosswalks are out of scope (§6). This plan only guarantees
    that a derived registry row is never deleted while referenced, which is
    the rule a crosswalk will rely on.

## 4. Steps

### Step 1: schema, migration, derivation

**Surface.**
- `server/db/instance/_main_database.sql`
- `server/db/migrations/instance/204_hfa_facility_observations.sql`
- `server/db/instance/hfa_facilities.ts` (new: observations, overrides,
  dictionary, `deriveHfaFacilities`, the referenced-row check)
- `server/tests/hfa_facility_derivation_test.ts` (new)
- `SYSTEM_05_facilities_indicators.md` (manifest: the two new files; prose:
  a new "HFA registry derivation" section stating §2.2 and §2.3 as the
  authoritative contract)

**Deliverable.** Rulings 1, 2, 3, 7, 12. The three tables exist in the base
schema and the migration. The migration backfills observations per ruling 12
and deletes unreferenced registry rows. `deriveHfaFacilities` implements
§2.3 and is exercised by the test against a scratch schema: latest round by
`sort_order` per column, admin tuple never mixed, dictionary then override,
refusal on a missing admin tuple, refusal on deleting a referenced row,
overrides kept for a facility with no observations, the `hfa_data`
invariant. Nothing calls the derivation yet except the test.

**Not in this step.** Any import change. Any route. Any client.

**Gates.** `./validate_migrations`, `./validate_fresh_boot`, the new test
under `deno task test`.

**Ends with.** One commit.

### Step 2: the import writes observations and derives

**Surface.**
- `lib/types/dataset_hfa_import.ts`
- `server/server_only_funcs_csvs/resolve_odk_labels.ts` (new; the label
  resolution lifted from `stage_structure_from_csv.ts:125-161`, which keeps
  its own copy until Step 5)
- `server/server_only_funcs_csvs/scan_hfa_rows.ts`
- `server/worker_routines/import_hfa_data_csv/stage_csv.ts`
- `server/worker_routines/import_hfa_data_csv/integrate_staged.ts`
- `server/worker_routines/import_hfa_data_csv/worker.ts`
- `server/worker_routines/import_hfa_data_csv/instantiate_worker.ts`
- `server/db/instance/dataset_hfa_import_runs.ts`
- `server/db/instance/dataset_hfa.ts` (HFA data deletion re-derives)
- `server/routes/instance/hfa_time_points.ts` (round delete re-derives)
- `server/db/migrations/instance/205_hfa_run_diagnostics_facility_match.sql`
- `client/src/components/data/hfa/imports/staging_summary.tsx`
- `client/src/components/data/hfa/imports/needs_review_card.tsx`
- `SYSTEM_06_ingestion.md` (manifest for the new file; prose: HFA import
  runs, clean condition, integration contract, staging rules)

**Deliverable.** Rulings 4, 5, 8, 9, 14. `HfaCsvMappingParams` gains
`facilityColumns` (admin columns, optional columns, by header). The stage leg
resolves labels for every mapped facility column, stages the kept row's
facility columns into a per-run table (blank to NULL), drops the
`validFacilities` table and the not-found counter, and records
`facilityMatch` and `labelResolution`. The integrate leg replaces the round's
observations and calls the derivation inside the existing transaction; a
derivation refusal fails the run with the ids in the error. The clean
condition is ruling 9. Round delete and HFA data delete call the derivation
in their transactions. Migration 205 strips the removed key from stored
diagnostics. The staging summary shows the match and the label resolution.

**Not in this step.** The wizard step (the mappings are accepted from the
launch input but no UI authors them yet; the launch validation accepts an
empty `facilityColumns` so existing wizard launches still work until Step
3). Any structure import change.

**Gates.** `./validate_migrations`. A committed harness
`server/tests/hfa_import_observations_test.ts` that stages a small CSV plus
XLSForm through `stageHfaCsvIntoTables` and `integrateStagedHfaData` against
a scratch schema and asserts the observations, the derived registry and the
diagnostics.

**Ends with.** Several commits, each green: the shared label helper; the
types and migration; the stage leg; the integrate leg and the two
re-deriving callers; the client summary.

### Step 3: the wizard's facility-columns step

**Surface.**
- `client/src/components/data/hfa/imports/wizard.tsx`
- `client/src/components/data/hfa/imports/facility_columns_step.tsx` (new)
- `client/src/components/data/hfa/imports/mod.ts`
- `server/routes/instance/datasets.ts` (the latest-mappings route; the
  duplicates preview returns `facilityMatch`)
- `server/db/instance/dataset_hfa_import_runs.ts` (latest mappings read)
- `lib/types/dataset_hfa_import.ts` (`HfaDuplicatePreview.facilityMatch`)
- `SYSTEM_06_ingestion.md` (manifest; Client prose for the HFA wizard)

**Deliverable.** Rulings 10, 11. The step sits between mappings and
duplicates, lists the admin columns at the HFA `adminDepth` and the enabled
optional columns, pre-fills from the latest complete run, warns when admin
columns are unmapped, and the review step shows the facility match with the
ID-mismatch tell when `known = 0` and the registry is non-empty. Launch
validation now enforces ruling 14 fully (the Step 2 allowance for an empty
`facilityColumns` is removed).

**Not in this step.** The facilities page. Help buttons for the new step
(added in Step 4 with the page's, so the help build runs once).

**Gates.** Floor.

**Ends with.** One commit.

### Step 4: the facilities page owns the authored layers

**Surface.**
- `client/src/components/data/facilities/facilities.tsx`
- `client/src/components/data/facilities/hfa_registry/**` (new: the edit
  modal and the categories editor, with `mod.ts`)
- `client/src/components/data/facilities/mod.ts`
- `client/src/state/instance/t2_structure.ts`
- `lib/types/structure.ts`
- `server/routes/instance/structure.ts` (routes: facility detail with
  per-round observations, save overrides, list column values, save
  dictionary)
- `server/db/instance/hfa_facilities.ts`
- `lib/help/help_targets.generated.ts` via `deno task build:help-buttons`
  if help buttons are added
- `SYSTEM_05_facilities_indicators.md` (manifest; Client prose)

**Deliverable.** Rulings 4, 6, 7 and §2.5. The HFA tab has no import entry
and no delete-all; it has Edit facility and Categories. Both saves re-derive
in their transaction and bump `structure_last_updated`. The HMIS tab is
unchanged.

**Not in this step.** Removing the structure wizard's HFA branch: the HFA
tab stops linking to it, the code goes in Step 5.

**Gates.** Floor. `deno task build:help-buttons` unchanged on a second run
if help buttons were added.

**Ends with.** Several commits, each green: routes and DB; the edit modal;
the categories editor.

### Step 5: the structure import is HMIS-only

**Surface.**
- `server/db/instance/structure.ts`
- `server/routes/instance/structure.ts`
- `server/server_only_funcs_importing/stage_structure_from_csv.ts`
- `server/server_only_funcs_importing/stage_structure_from_dhis2.ts`
- `server/server_only_funcs_importing/integrate_structure_from_staging.ts`
- `server/db/instance/_main_database.sql`
- `server/db/migrations/instance/206_structure_upload_attempts_hmis_only.sql`
- `lib/types/structure.ts`
- `client/src/components/data/facilities/import/**`
- `client/src/components/data/facilities/facilities.tsx`
- `client/src/components/data/facilities/with_csv.tsx`
- `SYSTEM_05_facilities_indicators.md` (Structure ELT prose rewritten for
  one family; ODK label resolution paragraph removed)

**Deliverable.** Ruling 13. No code path can write `facilities_hfa` except
`deriveHfaFacilities`. The import machinery has no family parameter; the
registry readers keep theirs. `structure_upload_attempts` is single-row; the
migration deletes any `hfa` row and drops the family column. The XLSForm
input, the label resolution and `StructureCsvStep1Result.xlsForm` are gone
from the structure path. `deleteFamilyFacilities` takes no family and acts on
HMIS.

**Not in this step.** Anything HFA-side; it is finished.

**Gates.** `./validate_migrations`, `./validate_fresh_boot`.

**Ends with.** Several commits, each green: the migration and schema; the
server import machinery; the client import steps; the SYSTEM prose.

## 5. Gates catalogue

| Gate | First reached |
| --- | --- |
| `./validate_migrations` | Step 1 |
| `./validate_fresh_boot` | Step 1 |
| `server/tests/hfa_facility_derivation_test.ts` | Step 1 |
| `server/tests/hfa_import_observations_test.ts` | Step 2 |
| `deno task build:help-buttons` idempotent | Step 4, if help buttons added |
| Floor (typecheck, test, validate_protocols, run) | every step |

## 6. Out of scope

- HMIS/HFA crosswalks for admin areas, facility types and facilities, and
  any canonical instance-level type list shared by both families. Ruling 17
  is the only thing this plan does for them.
- Per-round facility attributes at run time (rejected, §2.8).
- HMIS structure import behaviour, beyond losing its family parameter.
- The HFA weights import and page.
- Removing dataset rows in-platform and the sentinel review UI (SYSTEM_06
  "HFA follow-on work").
- The Sierra Leone round 1 re-import itself (operational, §7 names it as
  the first use).

## 7. Rollout and rollback

Nothing ships before the Step 5 review passes. Then:

1. `./deploy_testing`. Migrations 204 to 206 run. Existing HFA registries
   are unchanged in content (ruling 12) except for unreferenced rows, which
   are deleted; the deploy log records their count per instance.
2. On the testing instance, re-import one existing round with facility
   mappings and confirm the derived registry differs from the migrated one
   only where the survey says something different. Rerun m010 and compare
   against the previous package for that round: identical where the registry
   is identical.
3. Release with `./deploy`. First operational use: the Sierra Leone round 1
   re-import in SYSTEM_06 "HFA follow-on work", now with facility mappings,
   whose six vaccine-indicator oracle values still apply.

Rollback is a database restore to the pre-deploy backup plus a redeploy of
the previous release. Migration 206 deletes `structure_upload_attempts` HFA
rows and migration 204 deletes unreferenced registry rows, so the migrations
are not reversible in place.

## 8. Build log

| Date | Step | Entry |
| --- | --- | --- |
