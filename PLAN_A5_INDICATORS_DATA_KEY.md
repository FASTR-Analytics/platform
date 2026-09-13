# PLAN A5: the data is a fact store, the dictionary a layer over it

Status: DRAFT. Written 2026-09-12 from Tim's rulings in discussion; the
rulings marked *(proposed)* in §3 are the drafter's recommendation and
stand unless Tim overrules them in §3 before `Do 1`. Reviewed against the
code on 2026-09-13; the passages marked *(2026-09-13)* in §3 and §4 are
Tim's rulings from that review (§8 has the reasons). Only 1.72.1 is
deployed (Tim, 2026-09-12): instance migrations 085 to 088 and project
migration 042 have never run outside the dev database and may be
rewritten or merged freely. Follows PLAN_A4, closed 2026-09-12 at
`9d076cd7` (its text is in git history at `9d076cd7^`); A5 does not
reopen it: A4's one table, its words, its screens and its sweep stay. A5
keys the data rows by what DHIS2 or the file called them and makes the
dictionary a layer over that store, so a name, a type or the whole
dictionary can change without a data row moving. Renaming an indicator,
a migration that touches no data, and a worker that writes what it
fetched all follow from that.

**Next step: Do 3.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`; after step 3's review passes the
file is deleted instead of advanced.

All work is on `tim-branch`.

Repos: app and `wb-fastr-site` (help text). The modules repo is not
touched: the extract still emits `indicator_common_id`, and nothing a module
script reads changes.

Read first: [SYSTEM_05](SYSTEM_05_facilities_indicators.md) "The four
indicator dictionaries" and "Client state & wizard";
[SYSTEM_06](SYSTEM_06_ingestion.md) "HMIS import runs", "Staging (phase
1)", "Integration (phase 2)" and "Client";
[SYSTEM_07](SYSTEM_07_dhis2.md); [SYSTEM_08](SYSTEM_08_results_packages.md)
"m012: indicator values"; `lib/types/indicators.ts`;
`lib/types/dataset_hmis_import.ts`; `lib/hmis_indicator_catalog.ts`
(`analysedIndicatorIds`, `expandIndicatorSelection`,
`resolveHmisIndicatorCatalog`); `lib/indicator_expression/` (the parser
and the identifier renamer); `server/db/instance/indicators.ts`;
`server/db/instance/dataset_hmis_import_runs.ts` (`validateRunSelection`);
`server/db/instance/dataset_hmis_import_ledger.ts`;
`server/worker_routines/import_hmis_data_csv/stage_csv.ts` (the indicator
validation); `server/worker_routines/import_hmis_data_dhis2/worker.ts`;
`server/db/project/datasets_in_project_hmis.ts` (the extract);
`server/runs/indicator_catalog.ts` (the package row type);
`server/db/migrations/instance/086_indicators_one_table.sql` (rewritten
again by step 1); `validate_indicator_migration.ts`;
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md).

## 0. How to work this plan

The whole instruction to a fresh agent is: **"Do the next step of
PLAN_A5_INDICATORS_DATA_KEY.md."** Everything else is here.

A session does exactly one thing, named by the **Next step** line at the
top of this file: `Do N` builds step N; `Review N` reviews it; `Fix N`
builds the work list a review left. Steps alternate Do, Review, and the
line moves on only when a review passes. A session never does two of these.

**Session start.** The branch is `tim-branch`; confirm it with `git branch
--show-current` and confirm `git status` is clean (sessions are serial; a
dirty tree means another session did not finish, so stop and say so).
Never create a branch; commit to `tim-branch`. Every session ends with a
closing row in §8 (`Step N built`, `Step N reviewed: pass`, `Step N
reviewed: K findings`, `Step N fixed`); if the **Next step** line and the
last closing row disagree, stop and say so. Then read, in this order:
`CLAUDE.md`, `SYSTEMS.md`, the SYSTEM file for each area the step names,
§2 and §3 of this plan, the step's own section in §4, and §8. Nothing else
in this plan is required reading for a step.

**A Do session** builds the step as its §4 section says, within its
Surface, and ends when the step's gates and the §0 floor are green, §8 has
the rows the step produced plus its closing row, the **Next step** line
says `Review N`, and the last commit is made. Then it stops.

**A Review session** is a fresh agent that did not write the code. It lists
the step's commits (`git log` from the commit that last set the **Next
step** line to `Do N` or `Fix N`) and checks four things. Nothing outside
the step's Surface changed (`git diff --stat` against the surface list;
every file outside it is a finding). Every item in the step's Deliverable
is present in the code, established by reading the code, never the commit
message or the log. Every gate in the step's Gates and the §0 floor passes
when the reviewer runs it; a gate the reviewer cannot run from a file in
the repo or a command in this plan is itself a finding. §8 has the rows
the step should have produced. Each finding is one row in §8 with the file
and line, followed by the closing row. The review ends with the **Next
step** line set to `Do N+1` if there are no findings that change code, or
`Fix N` if there are. After step 3's review passes, the reviewer deletes
this file in its last commit instead of setting the line. Then it stops.

**A Fix session** is a Do session whose work list is the review's findings
in §8 and nothing else. It ends with its closing row and the line set to
`Review N`.

**Every session edits exactly two things in this file:** the **Next step**
line and §8. It never rewrites a ruling, a step section or a fact, even
one it has shown to be wrong; it records the disagreement in §8, and the
code wins. The edit to this file rides the session's last commit, so the
tree and the plan always agree. If a session cannot finish, it leaves the
tree green at the last good commit, records in §8 exactly what is done
and what is not, leaves the **Next step** line unchanged, and says so.

Rules that bind every step:

- **The step ends green and booting.** `deno task typecheck`, `deno task
  test`, `./validate_protocols`, and `./run` starting against the dev
  database are the floor. A step that touches migrations also passes
  `./validate_migrations`; one that touches the query engine or the
  extract also passes `./validate_queries`. The step's own gates in §4
  come on top. Every gate is something the reviewer can run: a script in
  the repo, a `deno task`, or a harness file the Do session committed
  (under `server/tests/` or as a named root-level `validate_*` file),
  never a one-off the doer ran and described.
- **Touch only the surface the step names.** A typecheck error outside
  that surface is reported, not fixed.
- **Where this plan and the code disagree, the code wins** and §8 records
  it. A ruling in §3 is overruled only by Tim, in §3, before the step that
  depends on it.
- **Docs move with the code.** `lint:systems` fails the typecheck when a
  file is not claimed by exactly one SYSTEM manifest, so globs change in
  the step that adds, moves or deletes the file. Prose in the SYSTEM file
  for a changed contract is rewritten in the same step, not deferred to
  step 3.
- **Append to the build log (§8) before committing.**
- **One thing per session.** Commit with a message that says why. Where a
  step says "several commits", each one is green on its own.
- **Do not ship.** `./deploy_testing` ships the working tree. Nothing in
  this plan ships before step 3's review passes (§7). A4 and A5 ship
  together.

Vocabulary is §2's. The words "source", "raw", "common" and "mapping" do
not exist in this plan except in ruling 8 and §5 gate 5, which name the
pre-A4 rows 086 migrates, and in ruling 8's bullet for the 087 column
rename; A4 removed them. The word "base" does not exist in this plan
except in §1 and ruling 10, which describe what is being removed.

## 1. The problem

`dataset_hmis` is a store of facts: a count for a facility, a month and a
series, keyed by what DHIS2 or the file called that series. Before A4
every row was keyed that way. The dictionary is a layer over that store:
it names each series, says what kind it is, and says what to fetch and
what to analyse. The two have different lives. Facts arrive once and stay;
names and types change as a team learns what it has.

A4 tied them together by keying the rows by the indicator's id. Every
change to the layer then reaches into the store. Renaming an indicator
means rewriting every data and ledger row under it, so the server refuses
(`updateIndicator`, "Indicator IDs cannot be changed after creation"), and
migration 086 rewrites 262,723 of 371,087 rows on the dev database to
carry the indicator id instead of the DHIS2 UID they already carried. The
refusal began as a bug fix in July 2026 (`67870f28`: renames failed on
foreign keys that do not cascade, or silently did nothing); A3 step 4
(`5384298b`) kept it and gave it a reason, that the id is the column key
in every results package. That reason does not bind the dictionary.
Packages are immutable and keep the ids they were generated with whatever
the dictionary later says, exactly as they keep a deleted indicator
(ruling 5).

A5 restores the natural key. The layer can then be renamed, retyped,
replaced from a file or extended without a row moving; renaming is the
first thing that falls out, and it is the ordinary case: a team imports a
DHIS2 element, names it, and later wants a better name. The migration
becomes dictionary-only, and the import worker writes rows under the id
it fetched.

A4 also stored one type, `base`, for two kinds the user sees, Uploaded and
DHIS2 element, and told them apart by whether a `dhis2_id` was set. In the
code `base` is the predicate "has rows of its own" in about eight places.
It buys nothing that a two-value set does not, and it puts a word in the
model that no screen may say. A5 stores the four kinds as the four types.

What A4 built that this plan keeps: one table, sums over indicators that
have rows, include in analysis, the analysed set, the naming step with its
assign case, the one datatable view, the delete window by indicator, the
dictionary file, the four words, the sweep, and every harness that does
not assert on the key or on the type name.

## 2. The model

The data rows are the facts, keyed by `data_id`, what DHIS2 or the file
called the series. The dictionary is the layer of names and types over
them, and nothing in it moves a row.

An **indicator** is one row of `indicators` with one of four types,
stored in `definition_type` under the code names in the second column:

| Type (what every screen says) | Code name | Definition |
| --- | --- | --- |
| Uploaded | `uploaded` | an additive monthly series filled by file; its rows carry its `data_id`, the value the file's indicator column said |
| DHIS2 element | `dhis2_element` | an additive monthly series the import fetches from DHIS2; its rows carry its `data_id`, the data element UID or `UID.COC` operand |
| Sum | `sum` | a list of Uploaded or DHIS2 element ids, `members`; computed from their rows at extract, adjusted like a count |
| Derived | `derived` | an expression over indicators of any type and population terms, evaluated by m012 after adjustment |

**`data_id`** is the key the data rows carry. Uploaded files are treated
like DHIS2 exports: one id space, one column, one uniqueness rule. It is
nullable on an Uploaded indicator that has never received a file value (a
seeded special, an indicator typed by hand); such an indicator cannot
receive rows until it has one. A DHIS2 element always has one, and it is
DHIS2-shaped. A sum and a derived never do.

Two facts are read off the type by the database itself, as generated
columns that nothing may write: **`has_rows`** (Uploaded or DHIS2
element: the indicator's own rows carry its data id) and **`is_count`**
(Uploaded, DHIS2 element or Sum: adjusted by m001 and m002, always
formatted as a number). A sum's members live in `indicator_sum_members`,
whose foreign key can only reach an indicator with `has_rows`. Every rule
the database can hold, it holds; the app's pre-checks exist for their
listings and the constraints are the backstop.

Every data row of `dataset_hmis` and every ledger row carries `data_id`,
never an indicator id. The indicator's id (`indicator_common_id`) is its
name: the key of sums' member lists, of derived expressions, of the
extract, of every package and of every figure. It is renamable. The data
id is the key of the rows and is fixed once rows exist under it.

Every indicator has one boolean, **include in analysis**, as A4 §2. A
**special indicator** may be Uploaded, a DHIS2 element or a Sum, never
Derived. Reserved words are unchanged.

Terminology adds three words to A4's: **data id** (the column, the
dictionary file column and the code name), **has rows** and **count**
(the two generated columns, and the same two predicates in lib). On screen a DHIS2
element's data id is labelled "DHIS2 id" and an Uploaded indicator's is
labelled "File id"; "data id" is a name for developers and the dictionary
file, never a label a screen shows.

## 3. Rulings

1. **The key, the types and the constraints.** The dictionary is these
   two tables, proven on the dev Postgres (17.4) before this plan was
   written; the fourteen cases after the DDL are step 1's
   `indicator_schema_test`:

   ```sql
   CREATE TABLE indicators (
     indicator_common_id text PRIMARY KEY NOT NULL,
     indicator_common_label text NOT NULL,
     definition_type text NOT NULL
       CHECK (definition_type IN ('uploaded', 'dhis2_element', 'sum', 'derived')),
     data_id text UNIQUE,
     expression text,
     include_in_analysis boolean NOT NULL DEFAULT TRUE,
     format_as text NOT NULL DEFAULT 'number'
       CHECK (format_as IN ('percent', 'number', 'rate_per_10k')),
     thresholds text,  -- JSON: ThresholdsRule (nullable)
     sort_order integer NOT NULL DEFAULT 0,
     updated_at timestamptz DEFAULT CURRENT_TIMESTAMP,

     has_rows boolean GENERATED ALWAYS AS
       (definition_type IN ('uploaded', 'dhis2_element')) STORED,
     is_count boolean GENERATED ALWAYS AS
       (definition_type IN ('uploaded', 'dhis2_element', 'sum')) STORED,

     CONSTRAINT indicators_fields_check CHECK (
       (definition_type = 'uploaded'      AND expression IS NULL) OR
       (definition_type = 'dhis2_element' AND expression IS NULL AND data_id IS NOT NULL) OR
       (definition_type = 'sum'           AND expression IS NULL AND data_id IS NULL) OR
       (definition_type = 'derived'       AND expression IS NOT NULL AND data_id IS NULL)
     ),
     CONSTRAINT indicators_element_shape_check CHECK (
       definition_type <> 'dhis2_element'
       OR data_id ~ '^[a-zA-Z][a-zA-Z0-9]{10}(\.[a-zA-Z][a-zA-Z0-9]{10})?$'
     ),
     CONSTRAINT indicators_count_format_check CHECK (NOT is_count OR format_as = 'number'),
     -- Required by the composite FK in indicator_sum_members; redundant with the PK otherwise.
     UNIQUE (indicator_common_id, has_rows)
   );

   CREATE TABLE indicator_sum_members (
     sum_id text NOT NULL REFERENCES indicators(indicator_common_id)
       ON DELETE CASCADE ON UPDATE CASCADE,
     member_id text NOT NULL,
     -- Always TRUE; exists so the FK can pin members to indicators with has_rows.
     member_has_rows boolean NOT NULL DEFAULT TRUE CHECK (member_has_rows),
     PRIMARY KEY (sum_id, member_id),
     -- NO ACTION (the default), not RESTRICT: deleteIndicators removes a
     -- sum and its members in one statement, and RESTRICT checks each row
     -- before the sum's cascade has removed the junction row (2026-09-13).
     FOREIGN KEY (member_id, member_has_rows)
       REFERENCES indicators(indicator_common_id, has_rows)
       ON UPDATE CASCADE
   );
   ```

   `members` as JSON text does not exist. The API and the dictionary file
   keep `members` as an array and a semicolon list; the DB layer writes
   the junction and aggregates it back ordered by member id (the junction
   has no position column, so authored order is not kept; 2026-09-13). A
   sum with no members is refused by the DB layer, as A4 did. The UNIQUE
   constraint on `data_id` is `indicators_data_id_key` on every database:
   086 renames the one the column rename keeps *(2026-09-13)*. The seed
   writes `uploaded` explicitly, since `definition_type` has no default
   *(2026-09-13)*. `dataset_hmis.indicator_id` becomes
   `dataset_hmis.data_id` and the ledger's column likewise; the data FK is
   `dataset_hmis_data_id_fkey FOREIGN KEY (data_id) REFERENCES
   indicators(data_id) ON DELETE RESTRICT DEFERRABLE`, the ledger FK
   `dataset_hmis_import_ledger_data_id_fkey ... ON DELETE CASCADE`, both
   under those names in `_main_database.sql` and in 086; indexes follow
   the column. The fourteen cases, each in its own savepoint: (1) a sum
   over an element and an Uploaded is accepted; (2) a sum over a sum is
   refused by the FK; (3) a sum over a derived is refused by the FK; (4)
   deleting a member a sum names is refused by the FK at the end of the
   statement, while deleting the sum and the member in one statement is
   accepted; (5) renaming a
   member cascades into the junction and touches no data row; (6)
   retyping a member to derived while a sum names it is refused, because
   `has_rows` flips and the cascade hits the child's CHECK; (7) a DHIS2
   element with a non-UID data id is refused by CHECK; (8) a sum with a
   data id is refused by CHECK; (9) deleting an element with rows is
   refused by RESTRICT; (10) writing `has_rows` is refused, generated
   column; (11) switching an element with rows to Uploaded is accepted and
   touches no row; (12) changing a data id that has rows is refused by the
   data FK; (13) changing one that has no rows is accepted; (14) taking a
   data id another indicator holds is refused by UNIQUE.
2. **Four types, never "base".** The type union in lib has four members
   under the code names of §2; two helpers, `hasRows(type)` and
   `isCount(type)`, the same predicates as the generated columns, replace
   every `type === "base"` and `type !== "derived"` test; SQL reads the
   columns. The editor offers the four; the manager's Type
   column, the import picker, the dictionary file's `type` column, every
   error string and every help text use the four words. The special
   message reads "can only be Uploaded, a DHIS2 element or a Sum". Sum
   members are indicators that have rows, of either kind.
3. **Switching type.** Uploaded to DHIS2 element requires a `data_id` that
   is DHIS2-shaped (`^[a-zA-Z][a-zA-Z0-9]{10}$`, or that twice with a dot)
   and is allowed with rows; it changes no rows. DHIS2 element to Uploaded
   is always allowed and changes no rows. Any switch to or from Sum or
   Derived keeps A4's rules: refused with rows, refused when a sum names
   it (the friendly pre-check lists the sums; the junction's FK is the
   backstop). `expandIndicatorSelection` keeps the DHIS2 elements a selection
   reaches and counts what it drops as `uploadedIndicatorsDropped`, as A4.
   A DHIS2 element DHIS2 does not know stays a skip-and-record error at
   fetch, as A3 ruling 9 made it.
4. **The data id is fixed once rows exist under it.** The editor locks the
   field, `updateIndicator` refuses a change or clearing, and the
   dictionary file's replace refuses moving a data id between indicators
   when the old one has rows. An indicator with no rows may take, change
   or clear its data id freely, within its type's rule. To give a series a
   different name, rename the indicator (ruling 5); a data id never moves.
5. **Rename.** `updateIndicator` accepts a new `indicator_common_id`. In
   the indicator's transaction it updates the row (the junction follows
   by `ON UPDATE CASCADE`), rewrites every derived `expression` that names
   the old id (the lib identifier renamer; whole identifiers and exact
   `[id]` only, as 086 does), and rewrites `indicatorIds` in every
   schedule's selection.
   Historical run rows (selections, pairs, progress, stats) and version
   rows are history and are not rewritten; the pairs they hold are data
   ids and stay valid. Figure configs in project databases are not
   rewritten: after a rename a figure filtered on the old id shows nothing
   against packages generated later, exactly as after a delete today.
   Refused: renaming from a special id (the module scripts read it by
   name); renaming to an id that fails the validator, is reserved, is
   taken, or is a special when the indicator is derived. The cache name
   bumps (ruling 12).
6. **CSV staging resolves a file value two ways.** A value in the file's
   indicator column is matched first against `indicators.data_id`; a match
   writes the rows under it. Otherwise it is matched against the
   `indicator_common_id` of an indicator that has rows: one that has a
   data id resolves to that data id (a file that speaks the indicator's
   name lands under its key); an Uploaded with no data id is an **adopt**,
   shown in the hold's naming step as "assigns this file id to the
   existing indicator X", and the naming transaction sets its `data_id` to
   the value. A value that is one indicator's data id and another's
   indicator id is refused at staging with both named. A value matching
   nothing lands in the hold as today, where the third action creates an
   Uploaded indicator with `data_id` = the value and id = the value when it
   passes the validator, otherwise the generated id. One consequence is
   said on screen rather than hidden: a renamed indicator keeps its data
   id, so its old name stays its key; an indicator later created under
   that old name can never receive a file that says it (staging refuses
   the ambiguity and names both), and the editor says whose data id the
   typed id is.
7. **The naming step.** The DHIS2 select form creates DHIS2 elements
   (`data_id` = the UID or operand) or, when the typed id is an existing
   Uploaded indicator with no data id, sets its `data_id` and makes it a
   DHIS2 element (A4 ruling 6's assign, now only while the indicator has
   no rows: ruling 4). Typing any other existing id is refused. A candidate whose UID some indicator
   already holds as its data id is shown as already imported and creates
   nothing. A DHIS2 indicator decomposes as before. The CSV hold creates
   Uploaded indicators with the file value as `data_id`, or adopts (ruling
   6).
8. **Migration 086, rewritten in place, with 087 and 088 folded in**
   *(the fold proposed)*. None of 085 to 088 has run outside the dev
   database, which step 1 replaces with a production copy at 1.72.1
   before applying. 085 (ledger skipped values) is unrelated and stays.
   087 (the import route column and the staging result's `kind`) and 088
   (the CSV config's `columns`) rewrite the same run and version JSON 086
   rewrites, so they become bullets of 086 and their files are deleted;
   the cost is nil, since no database records them. Dictionary-only: **no
   `UPDATE` touches `dataset_hmis` or the ledger.** In order:
   - add `data_id` (renaming `dhis2_id` if present), `include_in_analysis`,
     the two generated columns and `indicator_sum_members`; replace the
     type CHECK with the four types, rewriting every existing `base` row's
     type below; the shape, format and fields CHECKs are added last, after
     every row satisfies them;
   - a raw mapped to exactly one common that is not derived, which has no
     other mapping: the common takes `data_id` = the raw id and becomes a
     DHIS2 element when the raw id is DHIS2-shaped, otherwise Uploaded.
     The raw ceases to exist as an id; its rows already carry the raw id
     and do not move. A mapping onto a derived common contributed nothing
     to the old extract and is dropped; its raw takes the next bullet (A4's
     086 does the same);
   - every other raw becomes an indicator of its own with `data_id` = the
     raw id, a DHIS2 element when DHIS2-shaped and Uploaded otherwise,
     under its own id when the raw id is not DHIS2-shaped and passes the
     validator, otherwise under an id generated from its label (A3 ruling
     10 and A4's 086 as written: a UID passes the charset validator but
     never becomes an indicator id; the existing PL/pgSQL generator,
     pinned to `lib/indicator_id.ts` by the existing harness; 2026-09-13);
   - a common with mappings that did not fold becomes a sum, its members
     written to `indicator_sum_members` as the indicators its raws became;
     a common with no mappings stays Uploaded with no data id;
   - a derived under a special id is renamed to the generator's suffix form
     and an Uploaded indicator with no data id is inserted under the
     special id, as A4;
   - `include_in_analysis` TRUE for every row that was a common, FALSE for
     every indicator created from a raw, as A4;
   - `dataset_hmis.indicator_raw_id` and the ledger column are renamed to
     `data_id` (guarded on column existence); the FKs are added under their
     ruling 1 names; stored JSON is rewritten: run window selections to
     `indicatorIds` (raw ids mapped to the indicators they became) plus
     the persisted `dataIds`; pairs and progress keep their values under
     the key `dataId`; CSV staging results rename their key; deletion
     windows to `indicatorsToInclude` as A4; schedules to indicator ids;
     the `columns.indicator_id` key of every CSV run's `csv_config` renamed
     `data_id`, since the file's column holds data ids;
   - the run and ledger `source` columns and their CHECKs renamed `route`,
     the staging result's `sourceType` renamed `kind` on version rows and
     inside `run_stats`, and `csv_config.mappings` renamed `columns`
     (087 and 088 as written today, every step guarded);
   - `RAISE NOTICE` the id table, printed by `validate_indicator_migration`;
   - `DROP TABLE indicator_mappings`, then `indicators_raw`.
   The older migrations A4 guarded (003, 056, 070, 079) keep their guards,
   updated where a guard names a column this plan renames.
9. **Run and version shapes.** `Dhis2FetchTarget` becomes `{ dataId }`;
   a run pair is `{ dataId, periodId }`; the window selection keeps
   `indicatorIds` and persists `dataIds`. `validateRunSelection`'s pairs
   path checks each data id belongs to a DHIS2 element and resolves
   nothing. The worker fetches `dataId` and writes rows under it. The
   ledger is keyed by `data_id`; retry and re-import pass the ledger's own
   keys. Progress and stats are keyed by data id; the client labels them
   through the dictionary. `HmisCsvColumns.indicator_id` is `data_id`, the
   name the wizard's Columns step shows for the file's indicator column.
10. **Extract and catalog.** The extract's rows branch joins `dataset_hmis`
    to `indicators` on `data_id` and emits `indicator_common_id`; the sum
    branch joins `indicator_sum_members` to the members' data ids. The
    analysed-count stamp and the special-indicator rule read `is_count`.
    The catalog's `baseIdsInData`
    is the analysed indicators with rows, and sums, whose data id or
    members' data ids have rows. The package catalog row's `type`
    (`indicatorRowV2` in `server/runs/indicator_catalog.ts` and the
    metadata schema in `lib/types/run_manifest.ts`) carries the four code
    names of §2 in every package generated from now on. An old package's
    frozen `inputs/indicators.json` and `manifest.json` still say `base`;
    both schemas accept `base` as a legacy value beside the four names,
    and nothing maps it, since the frozen row never carried the DHIS2 id
    that would tell Uploaded from DHIS2 element and no read path consumes
    `type` (the display projection strips it). No package file is
    rewritten, no manifest transform block is added, and
    `server/runs/manifest_transform.ts` is not touched *(Tim,
    2026-09-13)*. A sum is still one slot with its own identifier as
    expression; m012's tables are unchanged in shape.
11. **Dictionary file.** Columns: `indicator_id, label, type, data_id,
    members, expression, include_in_analysis, format_as, thresholds`;
    `type` in the four words. Replace refuses with a listing when it would
    remove an indicator with rows or one a sum names, move a data id whose
    owner has rows, or set a type the data id's shape forbids (ruling 3).
    Upsert keeps `sort_order`. The download mirrors the file. The two-pass
    write keeps a row's unchanged data id in the first pass: the data FK
    refuses clearing one that has rows, and the pre-check has already
    refused every move that is not allowed *(2026-09-13)*.
12. **Client cache name** bumps to `instance_indicators_v6`. The stamp
    `baseIndicatorsVersion` is named for what it hashes, the analysed
    counts (`is_count AND include_in_analysis`): `countIndicatorsVersion`,
    in the dataset-info types and the client cache key. New captures
    write it into `datasets[].info` of the manifest; old manifests keep
    `baseIndicatorsVersion` there, which is `z.unknown()` and read by
    nothing, so there is no transform block and no schema version bump.
    Manifests are not rewritten *(Tim, 2026-09-13: parallel work on the
    `version2` branch may supersede them)*. Project migration 042, which
    has never run outside dev, is rewritten to map the pre-A4 name
    straight to `countIndicatorsVersion`; no 043. `indicatorsVersion` is
    unchanged.
13. **Labels.** "DHIS2 id" on a DHIS2 element's row and editor, "File id"
    on an Uploaded row and editor, "Data id" nowhere on screen. The
    manager's Defined by column shows the data id for both, the members
    for a sum, the formula for a derived. Every string in three languages.
14. **Foreign keys stay** *(proposed)*. Deleting an indicator with rows is
    refused with the friendly pre-check, as today. The alternative, data
    that outlives its indicator under its data id and is re-adopted by
    naming, is one line per FK and is not built unless Tim rules for it
    here.
15. **Module-read ids that are not specials** *(proposed)*. m007 and m008
    read eleven ids by name that are not in `SPECIAL_INDICATOR_IDS`
    (`gnl_attendance`, `anc1_before20`, `new_fp`, `mal_treatment`,
    `mal_confirmed_uncomplicated`, `hypertension_new`, `diabetes_new`,
    `nhmis_actual_reports_ontime`, `nhmis_expected_reports`,
    `nhmis_timely_and_data`, `total_population`). Renaming one silently
    drops it from those modules. Proposed: leave them out of scope here and
    record them as a SYSTEM_05 open item; the fix is in the modules or in
    the special list, not in this plan.

## 4. Steps

Three steps.

| Step | Name | The one thing it proves |
| --- | --- | --- |
| 1 | The key | four stored types, data and ledger rows keyed by `data_id`, 086 dictionary-only, the analysed set and the extract unchanged, no data row touched |
| 2 | The screens and the rename | four types on every screen, an indicator renamed with its references, a file value adopted |
| 3 | Docs and close | the repo and the site read as written today |

Format of each step: **Surface**, **Deliverable**, **Not in this step**,
**Gates** (on top of the §0 floor), **Ends with**.

### Step 1: The key

**Surface.** `server/db/instance/_main_database.sql`,
`server/db/instance/_main_database_types.ts`,
`server/db/migrations/instance/086_indicators_one_table.sql` (rewritten),
`087_import_route.sql` and `088_csv_config_columns.sql` (deleted, ruling
8), the guarded older instance migrations (003, 056, 070, 079) where a
guard names a renamed column, `server/db/migrations/project/042_dataset_info_stamp_names.sql`
(rewritten, ruling 12),
`lib/types/{indicators,dataset_hmis_import,dataset_hmis,instance,run_manifest}.ts`,
`lib/api-routes/instance/{indicators,indicators_dhis2,datasets}.ts`,
`lib/hmis_indicator_catalog.ts`, `lib/indicator_expression/**` (the
renamer and the dictionary builders' leaf rule only),
`lib/special_indicators.ts` (the type rule), `server/db/instance/{indicators,
instance,dataset_hmis,dataset_hmis_import_runs,dataset_hmis_import_ledger}.ts`,
`server/db/project/datasets_in_project_hmis.ts`, `server/db_startup.ts`,
`server/runs/indicator_catalog.ts`,
`server/worker_routines/import_hmis_data_dhis2/**`,
`server/worker_routines/import_hmis_data_csv/**`,
`server/routes/instance/{indicators,indicators_dhis2,datasets,health}.ts`,
`validate_indicator_migration.ts`, `validate_fresh_boot.ts`, the harnesses
under `server/tests/`, SYSTEM_05, SYSTEM_06, SYSTEM_07 and SYSTEM_08 globs
and the prose for every contract this step changes, and whatever client
files the type changes force to compile (strings and layout untouched;
step 2 owns them).

**Deliverable.** Rulings 1, 2 (lib and server half), 3 (server half), 4
(server half), 5 (server half: the transaction, the refusals, the
renamer), 6 (server half: staging's resolution and the adopt case in the
naming transaction), 7 (server half), 8, 9, 10, 11 (server half), 12 and
14 whole. The schema and 086 as ruled, with the fresh replay green. The
seed unchanged in effect: each special an Uploaded indicator with no data
id, checkbox on. The frozen sort-order backfill untouched.
`validate_indicator_migration` asserting §5 gate 5, including that no data
or ledger row changed.

**Not in this step.** Strings, layout, the editor's four types, the rename
in the editor, the hold's adopt row, the dictionary file's form (step 2).
Site help text (step 3).

**Gates.** `./validate_migrations`. `./validate_queries`. `validate_fresh_boot`
(22 specials as Uploaded with no data id, every checkbox on).
Harnesses under `server/tests/`: the
analysed set (unchanged in what it proves, green under the new types);
the expansion (ruling 3: a sum to its members' data ids, a derived to the
DHIS2 elements it reaches, Uploaded indicators and population terms
dropped and counted); the naming transaction (ruling 7: create an element,
assign to an empty Uploaded and retype it, refuse a taken id, skip a UID
some indicator holds, decompose; the CSV host creating Uploaded and
adopting); staging resolution (ruling 6: a data id match, an indicator id
match, an adopt, an ambiguity refused, an unknown value held); the rename
(ruling 5: members, expressions and schedule selections rewritten in one
transaction; a special refused; a taken id refused; run rows untouched);
the schema (ruling 1: the fourteen cases, `indicator_schema_test`, against
the dev database); the migration id generator parity (exists). Two greps.
The key: `grep -rnw "indicator_id\|indicatorId" server/db/instance/_main_database.sql
server/db/instance/dataset_hmis.ts server/db/instance/dataset_hmis_import_ledger.ts
server/db/instance/dataset_hmis_import_runs.ts server/db/project/datasets_in_project_hmis.ts
server/worker_routines lib/types/dataset_hmis_import.ts lib/types/dataset_hmis.ts`
at zero: the data and ledger columns, the pairs, the workers and the CSV
columns carry `data_id` or `dataId`. `indicator_id` survives elsewhere on
purpose, as the dictionary file's first column, the naming input's
proposed id and the catalog's references to indicators by name, which is
why this grep is scoped. The words: `grep -rnw "base\|dhis2_id\|dhis2Id\|
baseIndicatorsVersion" server lib` at zero outside `server/db/migrations/**`,
`server/dhis2/**` (where `dhis2_id` names a DHIS2 metadata field) and the
legacy `base` value the two package schemas accept (ruling 10); every
other survivor is listed in §8 by the Do session with its reason.
`m012_expression_parity_test` passes, its fixture changed only for the
renamed and added fields on the indicator type.

**Ends with.** Several commits, each green on its own where the step
allows it; the schema, 086, the DB layer, the workers and the extract land
in one. Not deployable alone.

### Step 2: The screens and the rename

**Surface.** `client/src/components/indicator_manager_hmis/**`,
`client/src/components/instance_dataset_hmis/**`,
`client/src/components/WindowingSelector.tsx`,
`client/src/state/instance/{t1_store,t2_indicators,t2_datasets}.ts`,
`lib/help/**` only if a help target's id must change, SYSTEM_05 and
SYSTEM_06 prose for the client contracts, `server/tests/` for a harness
the step adds.

**Deliverable.** Rulings 2 (client half), 3 (client half), 4 (client
half), 5 (client half), 6 (client half), 7 (client half), 11 (form and
download) and 13 whole. The editor: four types; an Uploaded or DHIS2
element with id, label, File id or DHIS2 id (locked once rows exist),
include in analysis; a sum and a derived as A4; the id input editable on
an existing indicator with the rename's refusals shown; switching
Uploaded to DHIS2 element gated on the id's shape. The manager: Type in
the four words, Defined by as ruling 13, the checkbox, the Special badge,
the reference list. The hold's naming step with the adopt row. The import
picker and wizard counting DHIS2 elements by type. History, current,
future and run views, the ledger tab and detail labelled through the
dictionary from data ids. The delete window over indicators. The
dictionary file form and download as ruling 11. Every string in three
languages.

**Not in this step.** Anything in the server or lib beyond a type the
client needs. Site help text (step 3).

**Gates.** `./validate_protocols` (0 new flags). The step-1 grep extended
to `client/src` at zero, survivors listed with reasons. `grep -rn "Base\b\|
base indicator\|de base\|indicador de base\|indicadores de base" client/src/
components/indicator_manager_hmis client/src/components/instance_dataset_hmis`
at zero. The server booted against the dev database and the manager, a
rename of an indicator that a sum and a derived name, an import selection,
the DHIS2 naming step, a CSV hold with an adopt row, the datatable and the
delete window exercised; recorded in §8 with what was done.

**Ends with.** Several commits. Deployable with A4 and step 1 once step
3's review passes.

### Step 3: Docs and close

**Surface.** SYSTEM_05, SYSTEM_06, SYSTEM_07, SYSTEM_08 prose;
`wb-fastr-site` help text for the indicator manager and the imports;
`lib/help/help_targets.generated.ts` via `deno task build:help-buttons`;
this file.

**Deliverable.** Every SYSTEM sentence about the HMIS dictionary and the
data key reads as §2; the site help text names the four types, the data
id under its two labels, and renaming; the generated help targets rebuilt;
nothing else changes.

**Not in this step.** Code.

**Gates.** `grep -rniw "dhis2_id\|indicator_id\|base\|bases" SYSTEM_05_facilities_indicators.md
SYSTEM_06_ingestion.md SYSTEM_07_dhis2.md SYSTEM_08_results_packages.md`
at zero except DHIS2 API field names and SYSTEM_08's one sentence on
reading an old package's `base` row (ruling 10). `deno task
build:help-buttons` leaves the tree unchanged when run twice.

**Ends with.** One commit here and one in `wb-fastr-site`. The review that
passes this step deletes this file in its last commit.

## 5. Gates catalogue

The §0 floor applies to every step. These are the whole-plan gates; the
step that first reaches zero is named, and every later step keeps it
there.

1. A4's gates 1 and 2 stay at zero. Landed.
2. Step 1's two greps: the key grep over the data, ledger, pair, worker
   and CSV-column files at zero, and `grep -rnw "base\|dhis2_id\|dhis2Id\|
   baseIndicatorsVersion" server lib client/src` at zero outside
   `server/db/migrations/**`, `server/dhis2/**`, the legacy `base` value
   the two package schemas accept (ruling 10) and the client's DHIS2
   select form where `dhis2_id` names a DHIS2 metadata field, every other
   survivor listed in §8 with its reason. Step 1 for `server` and `lib`,
   step 2 for `client/src`.
3. `./validate_migrations` green: the fresh replay with 086 a no-op.
   Step 1.
4. `validate_fresh_boot` exit 0: the special list as Uploaded with no data
   id, every checkbox on. Step 1.
5. `validate_indicator_migration <dump>...`, before rollout, over a dump
   of every instance's `main` database (§7); no dump is taken or run in
   step 1. What it asserts, per dump: every raw became exactly one
   indicator's data id, folded or new; every generated id is unique, bare,
   unreserved, non-special and equal to what `lib/indicator_id.ts`
   produces for the same label; no derived is under a special id; every
   common with mappings is a DHIS2 element, an Uploaded indicator or a
   sum whose members are the indicators its raws became; the type is
   `dhis2_element` exactly where the data id is DHIS2-shaped; the
   analysed set after equals the set of commons before; the extract's
   per-indicator sums for that set are identical before and after;
   **`dataset_hmis` and the ledger have the same row count and the same
   checksum over (facility, key, period, count) before and after**, and
   every row's key is some indicator's data id; every run row, version
   row, schedule and deletion version parses under the new shapes; a
   second run of the migrations does nothing; it prints the id table.
6. Committed harnesses under `server/tests/` for: the schema constraints,
   the analysed set, the expansion, the naming transaction, staging
   resolution, the rename, the migration generator parity, and the ones
   A3 and A4 landed. `deno task test` runs them all.

## 6. Out of scope

- Renaming the column and package key `indicator_common_id` (A4's §6, in
  git history).
- Rewriting figure configs in project databases after a rename (ruling 5).
- Data that outlives its indicator (ruling 14, unless Tim rules for it).
- Protecting the module-read ids that are not specials (ruling 15).
- Renaming a facility id, which has the same shape of cost.
- The DHIS2 population writer, `rate_per_1k`, sums' totals in the
  datatable, HFA and ICEH dictionaries (A4's §6).

## 7. Rollout and rollback

Everything here needs real infrastructure and is Tim's to trigger. A4 and
A5 ship once, together, after A5's step 3 review passes.

1. Take a fresh read-only dump of every `main` database at 1.72.1 and run
   `validate_indicator_migration` over all of them. There is nothing to
   resolve by hand; a failure is a defect in 086 and goes back to a Fix
   session. The gate now also proves that no data or ledger row changed,
   so the one large table on every instance is untouched by the release.
2. Take a named backup of every instance's `main` database immediately
   before the release. After 086 has committed on an instance, the
   previous image cannot read that database (columns renamed, tables
   dropped), so rollback is that dump plus the previous image. Rehearse
   the restore on testing-tim.
3. `./deploy_testing` from `tim-branch` (it ships the working tree; check
   `git status`), verify the manager, an import, a rename and the datatable
   against the production copy, then the fleet release.

## 8. Build log

Append-only. One row per decision, deviation, correction or defect, and
one closing row per session (`Step N built`, `Step N reviewed: pass`,
`Step N reviewed: K findings`, `Step N fixed`). Newest last. The next
agent reads this section before its step.

| Date | Step | Entry |
| --- | --- | --- |
| 2026-09-12 | plan | Ruling 1's DDL and its fourteen cases were run against the dev Postgres (17.4) in rolled-back transactions with temp tables before the draft was written: a generated column can carry a UNIQUE constraint and be the target of a composite FK; `ON UPDATE CASCADE` through such an FK re-evaluates the child's CHECK (case 6); and the data FK without an update clause refuses changing a data id that has rows (case 12). |
| 2026-09-12 | plan | Tim, 2026-09-12: only 1.72.1 is deployed, so instance migrations 085 to 088 and project 042 may be rewritten or merged (ruling 8's fold, ruling 12's rewrite of 042); and a production instance directory replaces the dev database instead of the dump restore A4 used (step 1, "Before building"). |
| 2026-09-12 | plan | A reviewer's findings on an earlier draft, each verified against the code before this row. Held and fixed: the refusal's stated reason (`indicators.ts:799`, written by A3 step 4 at `5384298b`, after the July fix), now in §1; the key grep was over-broad (`indicator_id` is legitimately the dictionary file's first column, the naming input's proposed id, the CSV wizard's column name and the catalog's name for an indicator), now scoped in step 1 and §5 gate 2; the fold needs a non-derived common (086 lines 368 to 373 and 424: a mapping onto a derived is dropped), now in ruling 8; ruling 6 did not say what a value matching an indicator that already has a different data id does (it resolves to that data id) and did not state the shadow a rename leaves (the old name stays the key), now both in ruling 6; the assign case of A4 (`indicators.ts:603`: "only a base indicator without a DHIS2 id", rows or not) is given up on purpose: under ruling 4 a series with rows keeps its key, so an uploaded series whose file id is a UID continues from DHIS2 by the type switch (ruling 3) and one whose file id is not becomes a member of a Sum beside a new element; nothing rewrites a data row. Verified and unchanged: ruling 15's eleven ids are each read by name in the m007 or m008 sources of the modules checkout and none is a special. Moot: A4 is closed (`9d076cd7`), so Do 1 waits for nothing. |
| 2026-09-12 | plan | Two simplifications the reviewer weighed, not taken. (a) `data_id NOT NULL`, defaulting to the indicator id: it removes the null state and the adopt case, but 086 cannot give a common with no mapping its own id as data id when an unmapped raw of that same id exists (the raw's rows already carry that key, and folding them into the common would add rows to an analysed series, which §5 gate 5 forbids); nullable keeps them apart, as A4's 086 does with a generated id. (b) Reading the kind off the data id's shape instead of storing it: moot under four stored types, where the type carries the intent and a UID-shaped upload that is deliberately not fetched is simply Uploaded. |
| 2026-09-12 | plan | Drafted from Tim's rulings in discussion: the data rows keyed by what DHIS2 or the file said (`data_id`), uploads treated like DHIS2 exports, the four kinds stored as the four types and never "base", the indicator id renamable. The reasons, read from the code: the rename refusal at `indicators.ts:809` dates from a July FK bug fix (`67870f28`), not a ruling; A4's 086 repoints 262,723 of 371,087 dev data rows that already carried the key A5 uses; `Dhis2FetchTarget` carries two ids so the worker can fetch one and write the other; `base` is the predicate "has rows" in about eight places and nothing more. Rulings 14 and 15 are the drafter's proposals. |
| 2026-09-13 | plan | Pre-implementation review against the code, every claim below read from it. Two findings Tim ruled on. (1) The production copy taken by `download_data` on 2026-09-12 15:54 was booted at 15:59, and `schema_migrations` shows A4's 085 to 088 applied to it then; no 1.72.1 dump exists. Tim retakes the copy; "Before building" now says so. (2) Ruling 10 asked the package readers to map an old package's `base` row to Uploaded or DHIS2 element by its DHIS2 id, but `HmisIndicatorCatalogRow` (`lib/hmis_indicator_catalog.ts:46`) never carried one, and nothing reads `type` back from a package (`IndicatorMetadataDisplay` strips it; no server, lib or client code branches on it). Tim: manifests are not rewritten, the `version2` branch may supersede them. Rulings 10 and 12 now say: both package schemas accept `base` as a legacy value, no mapping, no transform block, no schema version bump; the stamp rename reaches new manifests only, since the old key in `datasets[].info` is `z.unknown()` and read by nothing. `manifest_transform.ts` leaves step 1's surface. |
| 2026-09-13 | plan | Four smaller corrections from the same review, folded into rulings 1, 8 and 11. The junction's member FK is NO ACTION, not RESTRICT: `deleteIndicators` (`indicators.ts:980`) removes a sum and its members in one statement and RESTRICT checks per row before the cascade has cleared the junction. Ruling 8's third bullet read literally kept a UID as an indicator id (a UID passes the charset validator); it now says what A4's 086 and `validate_indicator_migration.ts:251` do, generated from the label. Renaming `dhis2_id` keeps the old UNIQUE constraint name on migrated databases, so 086 renames it to `indicators_data_id_key`. The DDL has no type default, so the seed (`db_startup.ts:402`) writes `uploaded`. The dictionary file's first pass keeps an unchanged data id, since the data FK refuses clearing one that has rows. Members come back ordered by member id; the junction has no position column and Tim was told. |
| 2026-09-13 | 1 | The plan file and the `.gitignore` change (`download_data`, the retake script) were uncommitted at session start. Read as the plan's own arrival, not an unfinished session, and committed first. The dev database was the retaken 1.72.1 copy (`schema_migrations` ended at 084); the "Before building" passage §8 refers to is not in §4 and nothing was needed from it. |
| 2026-09-13 | 1 | Ruling 1's case (4), the one-statement delete of a sum and its member: NO ACTION is checked per row at the end of the statement in row order, so the delete passes only when the sum's row is scanned before the member's (the dev postgres refused `DELETE ... WHERE id IN ('total','up')`). `deleteIndicators` removes the sums' junction rows in the same transaction before the indicators, and `indicator_schema_test` case 4 pins that; the FK stays NO ACTION. |
| 2026-09-13 | 1 | Files outside the step's Surface the gates forced, each a rename and nothing else: `lib/types/instance_sse.ts` and `lib/types/datasets_in_project.ts` (`baseIndicatorsVersion` to `countIndicatorsVersion`, ruling 12 and the words grep); `server/dhis2/goal2_indicators/decompose_indicator.ts` (`Dhis2ParsedOperand.dhis2_id` is `data_id` in lib, so the writer compiles); `server/tests/dhis2_decompose_indicator_test.ts`, `dhis2_skip_and_record_test.ts` and `indicator_id_test.ts` (field and issue names). `Dhis2NamingIndicator.dhis2_id` and the create route's `indicators[].dhis2_id` are `uid`: a DHIS2 indicator's UID is never a data id. `NewIndicatorIdIssue` `special_not_base` is `special_derived`. |
| 2026-09-13 | 1 | Migration 079 re-added its two-type `indicators_definition_fields_check` on a fresh replay (the base schema names its type CHECK the same, so 079's type guard skipped and its fields guard fired, and the seeded `uploaded` rows violated it: `./validate_fresh_boot` failed at 079). Its fields guard is now also conditioned on the type CHECK not being 086's, and 086 drops the old-named fields CHECK unconditionally. |
| 2026-09-13 | 1 | The oldest version rows (pre-PLAN_A3) carry `workItemHistory[].indicatorId`, the raw id under that key; the dev dump had 21 such rows and the validator's retired-key scan caught them. 086's pair rewriter renames that key to `dataId` too, and rewrites `workItemHistory`. |
| 2026-09-13 | 1 | Dev proof, not a rollout step: the dev `main` was dumped to the scratchpad before boot and `./validate_indicator_migration` passed over it (11 raws: 9 folded, 2 new DHIS2 elements under generated ids `sis_cur_contacts_ulterieurs` and `sis_cur_premiers_contacts`, `opd` a sum over them; 386,758 data rows and 890 ledger rows unchanged by checksum; 4 run rows, 25 version rows parsed). `./run`'s boot then applied 085, 086 and project 042 to the dev database, validated 285 routes, passed the dev-boot test run and listened on 8000. The boot's "Run manifests 20 checked, 19 transformed" is the existing PLAN_A4 block 6 over the retaken runs directory, not this step. |
| 2026-09-13 | 1 | Words-grep survivors (`grep -rnw "base\|dhis2_id\|dhis2Id\|baseIndicatorsVersion" server lib` outside the exemptions), each the English word or ruling 10's legacy value: `lib/types/indicators.ts:210-217` (`PackageIndicatorType`, the `base` the two package schemas accept, ruling 10); `server/runs/indicator_catalog.ts:88,313` (the v1 package backfill's "base id" merge rule, a frozen legacy format); `server/run_query/catalog_expression_items.ts:76` and `server/tests/dhis2_element_eligibility_test.ts:1` (comments outside the surface, S9 and S7); every other hit is "base" as an ordinary word: base URL, base font, base schema, base run, base letter, `const base` in reports, versions, upload, conditional formatting and the parquet writer. Key grep at zero. |
| 2026-09-13 | 1 | CSV staging (ruling 6): each distinct file value is resolved once into a per-run `_resolved` table (a fourth throwaway intermediate); an ambiguous value throws, so the run fails loudly with both indicators named; the adopt case and an unmatched value are held as `unknownIndicators` with `data_id` samples, and the naming step's `uploaded` rows carry `{ data_id, indicator_id, label }`, adopting when the id is an existing Uploaded indicator with no data id. The client hold posts `data_id = indicator_id` until step 2 builds the adopt row. |
| 2026-09-13 | 1 | The rename's renamer is `renameIdentifierInExpression` in `lib/indicator_expression/parse.ts`: text-level, the same segment rule as 086's SQL, so the author's formatting survives; a new id that is not bare-shaped is written bracketed, since a bare replacement would not re-parse. Pinned against seven cases in `indicator_rename_test`. |
| 2026-09-13 | 1 | Client files changed only as far as the types forced, strings and layout otherwise untouched (step 2): the stamp rename in `t1_store`, `t2_datasets`, `WindowingSelector`, `instance_dataset_hmis/{index,_delete_data,dataset_items_holder}`; `dataId` in the ledger, run, wizard and staging views; `_indicator_display.ts` over the four types; the editor's type select needed an option per stored type, so `TYPE_OPTIONS` carries `uploaded` and `dhis2_element` under the two words; the naming step and the select form post `data_id` and `uid`; `instance_indicators_v6`. |
| 2026-09-13 | 1 | Step 1 built. Rulings 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 and 14 (server and lib halves as §4 assigns them): the schema and the junction, 086 rewritten dictionary-only with 087 and 088 folded and deleted, project 042 rewritten, the DB layer with the rename transaction, the workers and the extract on `data_id`, the four-type catalog row and the legacy `base` in both package schemas, `countIndicatorsVersion`, the validators, three new harnesses (schema, rename, staging resolution) and the existing ones under the new types. Gates green: `deno task typecheck` (with `lint:systems`), `deno task test` (123), `./validate_protocols`, `./validate_migrations`, `./validate_fresh_boot`, `./validate_queries` (63), `./validate_indicator_migration` over the dev dump, the boot; both greps as recorded above. |
| 2026-09-13 | 1 | Review 1, commits `728ec361` and `3eab4b47` against `2cee60e4`. Gates run by the reviewer, all green: `deno task typecheck` with `lint:systems`, `deno task test` (123 passed), `./validate_protocols` (0 new flags), `./validate_migrations`, `./validate_fresh_boot` (22 Uploaded specials, no data id, checkbox on), `./validate_queries` (63), `./validate_indicator_migration` over the Do session's `dev-main-1.72.1.sql` (11 raws, 9 folded, 2 new, 386,758 data and 890 ledger rows unchanged by checksum), the boot (`main.ts` against the dev database: 285 routes, dev-boot tests 123, listening on 8000), the key grep at zero, the words grep with exactly the survivors the row above lists. Surface: the six files outside it are the renames the row above records and nothing else, read line by line; accepted. Every deliverable read in the code: the schema and 086 as ruling 1 and 8 (the fold, the own-id rule, the sum loop over non-derived commons, the derived-special rename, the FKs under their names, every rewriter, the drop), `updateIndicator` with the rename transaction and the four refusals, the naming plan's assign and adopt, the ledger, the worker fetching and writing `dataId`, the extract's two joins, `analysedIdsWithData`, the catalog row's type, the two package schemas, 042, the seed, the fourteen schema cases, the rename, expansion, naming and staging harnesses. The findings follow. |
| 2026-09-13 | 1 | Finding 1 (code, ruling 6): `server/worker_routines/import_hmis_data_csv/stage_csv.ts:305-306` joins the id-owner only when it `has_rows AND data_id IS NOT NULL`, so a file value that is one indicator's data id and the id of an Uploaded indicator with no data id is not refused: it lands silently under the first. That is exactly the shadow ruling 6 says staging refuses with both named ("an indicator later created under that old name can never receive a file that says it"). Proven on the dev database in a rolled-back transaction: `zz_renamed` (uploaded, data id `zz_old_name`) and `zz_old_name` (uploaded, no data id); the resolution row for value `zz_old_name` is `data_owner=zz_renamed, id_owner=null, data_id=zz_old_name`. Fix: match the id-owner on `indicator_common_id` alone for the ambiguity test, resolve through it only when it has rows and a data id, and add the case to `csv_staging_resolution_test.ts` (its ambiguity case at `:130` seeds the shadow with a data id of its own, so it never reaches this branch). |
| 2026-09-13 | 1 | Finding 2 (comment): `lib/indicator_expression/parse.ts` says `renameIdentifierInExpression` is "the same rule instance migration 086 applies in SQL (`fastr_rename_identifier`)". The SQL at `086_indicators_one_table.sql:112` substitutes `p_new` raw (no `writeIdentifier` bracketing) and interpolates `p_old` into the regex unescaped; harmless at its one call site (`086:508`, a special id to a bare suffix form), but the two are not the same rule. Reword the comment to say what differs, or make the SQL bracket a non-bare new id. |
| 2026-09-13 | 1 | Finding 3 (docs, §0 "Docs move with the code"): SYSTEM_05 still describes the pre-A5 model in sentences this step's contracts changed: `:73` ("a base's DHIS2 id"), `:681` (HFA time points as "the ONE dictionary where renames genuinely work"), `:917` ("the bases and sums that have rows"), `:920-921` (the ledger "one row per indicator × month"; its grain is data id × month), `:936` ("Base and sum indicators have no status"), `:940` ("the DHIS2 id" in Defined-by; `definedByText` shows the data id for Uploaded too), `:944-947` ("a base has a DHIS2 id input", "the other bases", "a base or sum is forced to number"). `SYSTEM_05:396` omits "non-derived" from the sum bullet (086 `:470-474` gates on `definition_type = 'base'`; `:388` says it right). `SYSTEM_08:699` says "both schemas accept" `base` and then that v1 rejects a `type`; the two that accept it are `indicatorRowV2` and `runIndicatorMetadataSchema`. `server/db/migrations/instance/070_hmis_csv_import_runs.sql:7` says "post-087 column name"; 087 is gone, the rename is 086's. |
| 2026-09-13 | 1 | Finding 4 (docs, aspiration stated as fact): four added sentences describe step 2, which is not built. `SYSTEM_05:278-281`: no screen says "File id" (`grep -rn "File id" client/src` is empty; the editor's one input is labelled "DHIS2 id" for both types, `_edit_indicator.tsx:552-561`), and "data id" is user-facing in server errors (`indicators.ts:405,1287`, `dataset_hmis_import_runs.ts:227`). `SYSTEM_05:346-349`: nothing generates an id for a file value; the hold posts the value as the id (`_naming_step.tsx:252-256`) and a value that fails the validator refuses the save (`indicators.ts:443-451`). `SYSTEM_05:261-262` and `:322-324`: the rename and the free data id are API-only (the editor's id input is `disabled` on update, `_edit_indicator.tsx:529`, and locks the data id once set, `:162-163`, `:569`). `SYSTEM_06:159` and `:409`: the client does not label ledger pairs through the dictionary (the finding below). Each sentence is rewritten to what the code does today, or moved to step 2's section of this plan; step 2 then rewrites it again. |
| 2026-09-13 | 1 | Not a step 1 finding, recorded for step 2 (its deliverable "History, current, future and run views, the ledger tab and detail labelled through the dictionary from data ids" is exactly this): the rename of the run pair and ledger keys to `dataId` changed what the keys hold, and three client label maps are still keyed by `indicator_common_id` and looked up by data id, so every DHIS2 element's label is blank: `imports/_run_detail.tsx:69-77` vs `:93-94`, `imports/_tab_by_indicator.tsx:233-238` vs `:58-59` (the "Indicator ID" column also now shows a UID), `imports/index.tsx:141-153` vs `:248`. Also step 2's: the CSV wizard renders the `HmisCsvColumns` key `data_id` raw as a column label (`imports/_csv_wizard.tsx:222,244`); the editor applies the DHIS2 shape and uniqueness rule to an Uploaded indicator's data id (`_edit_indicator.tsx:369-376`, stricter than the server) and accepts an empty DHIS2 id the server then refuses (`:195`, `:367-368`); the type select mixes bare words with the old descriptive forms (`:80-101`); `batch_upload_form.tsx:86-88` still documents `dhis2_id` and "base, sum or derived" above a column list that prints `data_id`; "shown as already imported" (ruling 7) is a client rendering of `created: 0, assigned: 0`, which the server returns without naming the skip. |
| 2026-09-13 | 1 | Observations, no change asked. (a) Fresh installs only: the seed runs inside the base schema before migrations (`db_startup.ts:65`), and 079's frozen sort-order backfill ranks `definition_type = 'base'` rows in seed order and everything else alphabetically (`079:376-383`), so a new database's 22 specials now sort alphabetically instead of in seed order. Existing instances are unaffected. The deliverable says the backfill is untouched; Tim decides whether the fresh-install order is worth a guard. (b) Harness soft spots, each claim true in the code but unforced by a test: the rename's atomicity (no case makes the transaction fail midway), the validator half of the rename refusal (only `reserved` is sent through `updateIndicator`; the charset rules are pinned in `indicator_id_test`), run rows' `progress` and `run_stats` (the rename test seeds neither), m012's fixture sets every data id equal to its indicator id. (c) `validate_indicator_migration` asserts "second run does nothing" as no pending migration after the run, not by re-executing 086; `./validate_migrations` is the replay. (d) `isCount` is spelled `type !== "derived"` (`lib/types/indicators.ts:198`), the one surviving negative form, and it is the count predicate itself. (e) The three DB-backed harnesses drop every database matching their prefix `WITH (FORCE)` at import, so two concurrent `deno task test` runs destroy each other's throwaway database; the naming test already did this before A5. (f) Migrations 003 and 079 name `indicator_sources`, a table never built, in comments from `5384298b`; outside this step. |
| 2026-09-13 | 1 | Step 1 reviewed: 4 findings (one code, one comment, two docs). Next step Fix 1. |
| 2026-09-13 | 1 | Fix 1 done by the reviewing session on Tim's instruction ("if small, make them yourself"), a departure from §0's one-thing-per-session; the next review is a fresh agent as §0 requires. Finding 1: `stage_csv.ts` now joins the id-owner on `indicator_common_id` alone and resolves through it only when it has rows and a data id (`CASE WHEN by_id.has_rows THEN by_id.data_id END`), so the shadow of a rename is refused whatever the later indicator's type; `csv_staging_resolution_test.ts` seeds `renamed2` (data id `old_empty`) beside an empty Uploaded `old_empty` and pins the refusal naming both. Finding 2: the renamer's comment now says what differs from 086's SQL function. Finding 3: the SYSTEM_05 sentences at the lines listed, the 086 sum bullet, SYSTEM_08's two schemas and 070's comment rewritten. Finding 4: the four aspirational passages now say what the code does today and name PLAN_A5 step 2 for the rest (the editor's id input disabled on update, the data id locked once set, the hold posting the value as the id, the "DHIS2 id" label on both types, the blank labels in the run detail and By indicator tab). Gates rerun: `deno task typecheck`, `deno task test`, `./validate_migrations`, `./validate_protocols`, the boot. |
| 2026-09-13 | 1 | Step 1 fixed. Next step Review 1. |
| 2026-09-13 | 1 | Review 1 (second pass), commit `ce188ef0` against `c94771c9`. Surface: the eight files changed are all in step 1's Surface. Each Fix 1 finding read in the code: (1) `stage_csv.ts` joins the id-owner on `indicator_common_id` alone and resolves through it only when `has_rows` and a data id are set, the ambiguity test excludes the self-match (`data_owner <> id_owner`), and `csv_staging_resolution_test.ts` seeds `renamed2`/`old_empty` and pins the refusal naming both; (2) the renamer's comment states the raw substitution and the one call site that differ from 086's SQL; (3) and (4) every SYSTEM_05, SYSTEM_06, SYSTEM_08 and 070 line the findings named is rewritten, and each new sentence was checked against the code it describes: the id input `disabled` on update and the one "DHIS2 id" label with an Uploaded placeholder (`_edit_indicator.tsx`), `namingInputFromState` posting the value as the id, the type-switch guard at `indicators.ts:921` being the only one, "data id" in the server error strings at `indicators.ts:405,485,1215,1231` and `dataset_hmis_import_runs.ts:227`, `indicatorTypeLabel` and `definedByText` in `_indicator_display.ts`. Gates rerun, all green: `deno task typecheck` with `lint:systems`, `deno task test` (124 passed), `./validate_protocols` (0 new flags, 17 baselined), `./validate_migrations`, `./validate_fresh_boot` (22 Uploaded specials, no data id, checkbox on), `./validate_queries` (63), `./validate_indicator_migration` over `dev-main-1.72.1.sql` (11 raws, 9 folded, 2 new, 386,758 data and 890 ledger rows unchanged by checksum, 4 run and 25 version rows parsed), the boot (`main.ts` against the dev database: 285 routes, dev-boot tests 124, listening on 8000), the key grep at zero, the words grep with the survivors the Do session listed plus one more of the same kind, `server/runs/indicator_catalog.ts:133` (a comment on ruling 10's legacy `base` value). |
| 2026-09-13 | 1 | Step 1 reviewed: pass. Next step Do 2. |
| 2026-09-13 | 2 | Surface: nineteen files, all in step 2's Surface: `client/src/components/indicator_manager_hmis/**` (the editor, the manager, the naming step, the display helpers, the DHIS2 select form, the dictionary file form, the sort modal's comment), `client/src/components/instance_dataset_hmis/imports/**` (the shell, the four tab and detail views, the run view, the CSV wizard, the hold card, the staging summary, the review step), SYSTEM_05 and SYSTEM_06 prose. `client/src/state/instance/*`, `WindowingSelector.tsx`, `lib/help/**` and `server/tests/` untouched: no type, cache name, help target or harness needed to change. |
| 2026-09-13 | 2 | The editor (`_edit_indicator.tsx`): `TYPE_OPTIONS` is the four words from `indicatorTypeWord`, with a caption per type; the data id input is labelled by `dataIdLabel` ("File id" / "DHIS2 id"), locked while `idsWithData` reports rows under the existing indicator, and while the ledger has not loaded (a set data id is then treated as fixed, since the server refuses the change either way); a DHIS2 element's data id must be set and DHIS2-shaped, an Uploaded indicator's is any text or empty (the DHIS2 shape rule the pre-A5 editor applied to both is gone); neither may be another indicator's. The id input is editable on an existing indicator and disabled on a special; a changed id runs the validator and the taken check before the save (`renameError`), and the server's other refusals arrive as the form error. A typed id that is another indicator's data id shows the shadow note ruling 6 asks for (`shadowNote`). A switch out of Uploaded or DHIS2 element is refused in the form while rows exist or a sum names the indicator (`typeSwitchError`), the same two guards as `updateIndicator`. |
| 2026-09-13 | 2 | The naming step (`_naming_step.tsx`): one row type for both kinds of value, `NamingValueRow { data_id, data_label, indicator_id, label, importedAs? }`; the DHIS2 select form's candidates are `{ data_id, data_label }`, so `dhis2_id` is gone from `client/src`. A file value's proposed id is the value itself when it passes the validator and is free or names an Uploaded indicator with no data id (the adopt row by default), otherwise generated from it (`proposeUploadedId`); the row's id is editable, and the adopt row reads "Assigns this File id to the existing indicator X". The hold card passes the unknown values as `values`. |
| 2026-09-13 | 2 | Import views (ruling 9): `indicatorsByDataId` and `indicatorNameText` in `_indicator_display.ts`; the imports shell builds the map once and hands it to the Current tab (the running run's pairs in flight), the By indicator tab (columns Indicator ID, Label, "DHIS2 id / File id", the rollup keyed by data id) and the ledger detail (subheading "label (id) · data id", or the data id alone); the run detail builds its own for the failed and skipped pair tables ("DHIS2 id" and "Indicator" columns). On the dev database every one of the ledger's 11 data ids resolves, none of which equals its indicator id, so the tab's label column was blank for all of them before this step. |
| 2026-09-13 | 2 | Rulings 9 and 13 read together on the CSV wizard's Columns step: ruling 9 says the step shows the name `data_id`, ruling 13 says "Data id" nowhere on screen. Ruling 13 is the label ruling and the review of step 1 listed the raw key as a step 2 item, so the step labels the four columns ("Facility id", "Indicator (file id, DHIS2 id or indicator id)", "Period (yyyymm)", "Count") and the key `data_id` stays the field name. Tim can overrule in §3. |
| 2026-09-13 | 2 | "data id" still reaches the screen inside server error strings (`indicators.ts` and `dataset_hmis_import_runs.ts`, listed by Review 1), which the client renders verbatim; the server is outside this step's Surface, and SYSTEM_05 now says so. The version's import information (`_import_information.tsx`, "Period-indicator combinations") still prints each stat's data id raw: the version view is not in the deliverable's list and has no dictionary; left as is. |
| 2026-09-13 | 2 | Greps. Key grep over the step 1 files plus the client surface: the survivors are the datatable's series column `indicator_id` (`dataset_items_holder.tsx:113,164,188`, `WindowingSelector.tsx:143`: the display rows are keyed by `indicator_common_id`, the ledger joined to the dictionary), the editor's and naming step's `indicatorId` / `indicator_id` (the id typed or chosen for an indicator), the By indicator tab's column key `indicatorId` (the resolved indicator id column) and the create route's `indicator_id` field in the select form; none is a data or ledger key. Words grep over `client/src`: `dhis2_id`, `dhis2Id` and `baseIndicatorsVersion` at zero; `base` survives only as tailwind tokens (`base-100`, `base-content`), a local `const base` in the wizard's recurrence builder and elsewhere the English word. The "Base" grep over the two component directories at zero. "data id" as a screen string at zero in both directories. |
| 2026-09-13 | 2 | Gates: `deno task typecheck` with `lint:systems`, `deno task test` (124 passed), `./validate_protocols` (0 tier-1, 0 new tier-2, 17 baselined). The boot: `./run` against the dev database (285 routes, dev-boot tests, listening on 8000). The browser exercise was blocked at Clerk's sign-in, which the session cannot complete (`BYPASS_AUTH` covers the API, not the client's sign-in), so the screens' contracts were exercised through the routes they post to, by a script kept in the session scratchpad: the manager's list (19 rows, three types present); a derived `zz_deriv` created over `sis_cur_premiers_contacts`, that indicator renamed to `zz_premiers` as the editor posts, `opd`'s members and the derived's expression rewritten, the data id and all 890 ledger rows untouched; refused as the editor pre-checks: renaming a special, renaming to a taken id, changing the DHIS2 id of an element with rows, switching it to a sum; allowed: DHIS2 element to Uploaded with rows and back; renamed back, `zz_deriv` deleted. A CSV run (one row under a test indicator's file id, two unknown values) held in `needs_review` naming both values; the restage with one adopt row (`zz_adopt_target`, an Uploaded indicator with no file id, adopts its own id as its file id) and one new Uploaded indicator completed, the ledger holding rows under all three file ids; the datatable route listed them by indicator id; the delete window over the three indicators removed the rows; the three indicators deleted; the dictionary back at 19 rows and the ledger's data rows as at the start. Not exercised: a DHIS2 import launch and the DHIS2 naming step, which need a DHIS2 server (the selection expansion is `indicator_selection_expansion_test`, the naming transaction's assign case `indicator_naming_test`, and the wizard's element count uses the same lib function the server persists). The dev database keeps the exercise's history rows: run 5 (error, every row dropped, the script's first attempt), run 6 (complete) and the versions the import and the delete minted. |
| 2026-09-13 | 2 | Step 2 built. Rulings 2, 3, 4, 5, 6, 7 (client halves), 11 (form and download) and 13 whole. Next step Review 2. |
| 2026-09-13 | 2 | Review 2, commits `197f8661` and `3604e100` against `af2fcbce`. Surface: twenty files, every one in step 2's Surface (the two component directories, SYSTEM_05, SYSTEM_06, this file's **Next step** line and §8 only). Every deliverable read in the code: the editor's four types from `HMIS_INDICATOR_TYPES` through `indicatorTypeWord` with a caption each, the data id input labelled by `dataIdLabel` and locked by `existingHasRows` (the ledger's answer through `analysedIdsWithData`, keyed by data id), a DHIS2 element's data id required and shape-checked, an Uploaded indicator's free, neither another's (`dataIdOwners`), the id input editable on an existing indicator and disabled on a special, `renameError` (special, taken) and the validator on a changed id, `old_indicator_common_id` posted to `/indicators/update`, `shadowNote`, `typeSwitchError` (rows, naming sums); the manager's Type and Defined-by columns (`indicatorTypeLabel`, `definedByText`: the data id for both kinds, members, formula), the download over `INDICATOR_BATCH_FILE_COLUMNS` in ruling 11's order, the batch form's column text and refusal text; the naming step's one `NamingValueRow`, `proposeUploadedId`, the adopt row "Assigns this File id / DHIS2 id to the existing indicator", `namingIssues` refusing an existing id that cannot be assigned to, `namingInputFromState` posting `data_id` for both kinds; the DHIS2 select form's `{ data_id, data_label }` candidates; the hold card passing `values`; the import picker's Type column, the wizard's `expandIndicatorSelection(...).dataIds.length` and "(DHIS2 element, month) pairs"; `indicatorsByDataId` built once in the imports shell and handed to the Current tab, the By indicator tab (Indicator ID, Label, "DHIS2 id / File id") and the ledger detail, the run detail's own map for the failed table and the skipped table that reuses its columns; the Columns step's four labels; the delete window over `indicatorsToInclude`. Every new string carries en, fr and pt. |
| 2026-09-13 | 2 | Review 2 gates, rerun by the reviewer, all green: `deno task typecheck` with `lint:systems`, `deno task test` (124 passed), `./validate_protocols` (0 tier-1, 0 new tier-2, 17 baselined), the boot (`main.ts` against the dev database: 20 run manifests checked and 0 transformed, 285 routes, dev-boot tests 124, listening on 8000). The key grep over the step 1 files plus `client/src` has exactly the survivors the Do session listed (the datatable's `indicator_id` series column, the editor's and naming step's typed or chosen id, the By indicator tab's resolved-id column key, the select form's create field); the words grep over `client/src` has `dhis2_id`, `dhis2Id` and `baseIndicatorsVersion` at zero and `base` only as tailwind tokens, `const base` and the English word; the "Base" grep over the two directories at zero; "data id" as a screen string at zero in both. The Do session's route exercise (`exercise_step2.ts`, found in its session scratchpad) rerun against the boot: every check passed, ALL OK (the rename with the sum's members and the derived's expression rewritten and the 890 ledger rows untouched, the four refusals, the two allowed switches, every ledger and run-detail data id resolving through the dictionary, the CSV hold naming both values, the restage adopting one and creating one, the datatable, the delete window, the dictionary back at 19 rows). The dev database keeps one more CSV run and the versions the import and the delete minted. |
| 2026-09-13 | 2 | Observations, no change asked. (a) `client/src/components/indicator_manager_hmis/indicators_manager.tsx:252` spells the count predicate `c.definition.type !== "derived"` where ruling 2 names `isCount`; the same spelling Review 1 accepted in lib's `isCount` itself (its observation (d)), so the same treatment; Tim decides whether either is worth a change. (b) `client/src/components/instance_dataset_hmis/imports/_ledger_indicator_detail.tsx:183` offers "Re-import this indicator" on every row, an Uploaded indicator's file id included, which `validateRunSelection` refuses as not a DHIS2 element; the button predates A5 and A4 had the same for an uploaded id. (c) Process: the step's exercise gate ran from a script in the Do session's scratchpad, not the repo, so §0's "a gate the reviewer can run from a file in the repo" held only because that scratchpad survived; CLAUDE.md makes the browser verification Tim's own and never a plan item, so no harness is asked for; Tim decides whether the script becomes a root-level `validate_*` file (it depends on the dev database's dictionary and facility ids). (d) `_import_information.tsx:157` prints a version's per-stat data id raw, as the Do session recorded; the version view is outside the deliverable. |
| 2026-09-13 | 2 | Step 2 reviewed: pass. Next step Do 3. |
