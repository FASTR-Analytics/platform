# PLAN A4: one table of indicators

Status: OPEN. Rulings agreed (Tim, 2026-09-11). Supersedes
PLAN_A3_ONE_INDICATOR_LIST.md, whose steps 1 to 5 are on `tim-branch` and
unshipped. A3's steps 1 to 3 stay as built. Its steps 4 and 5 are reworked
in place by the steps below: the entity they introduced (the "source") is
removed and its migration is rewritten under the same number. PLAN_A3 was
deleted in the commit that added this file; its text is in git history.

**Next step: Do 1.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`; after step 3's review passes the
file is deleted instead of advanced.

All work is on `tim-branch`.

Repos: app and `wb-fastr-site` (help text). The modules repo is not
touched: m001, m002 and m012 read the extract and the catalog by
`indicator_common_id`, and a sum reaches them as one more row of counts.

Read first: [SYSTEM_05](SYSTEM_05_facilities_indicators.md) "Derived
commons", "Computability", "Client state & wizard";
[SYSTEM_06](SYSTEM_06_ingestion.md) HMIS CSV and DHIS2 import;
[SYSTEM_07](SYSTEM_07_dhis2.md); [SYSTEM_08](SYSTEM_08_results_packages.md)
"m012: indicator values" and the manifest transform;
`lib/types/indicators.ts`; `lib/types/dataset_hmis_import.ts` (every
stored JSON shape that carries an id the import fetches);
`lib/common_indicator_catalog.ts` (the catalog, computability and the
selection expansion); `server/db/instance/indicators.ts`;
`server/db/instance/dataset_hmis_import_runs.ts` (`validateRunSelection`,
`resolveDatasetHmisCsvReview`); `server/db/project/datasets_in_project_hmis.ts`
(the extract); `server/db/migrations/instance/086_indicator_sources.sql`
(the file step 1 rewrites); `server/runs/manifest_transform.ts`;
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md).

## 0. How to work this plan

The whole instruction to a fresh agent is: **"Do the next step of
PLAN_A4_INDICATORS_ONE_TABLE.md."** Everything else is here.

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
  this plan ships before step 3's review passes (§7).

Vocabulary is §2's. The word "source" does not exist in this plan except
in §1, which describes what is being removed.

## 1. The problem

Caitlin's two points (2026-09-10) stand as the problem: a DHIS2 data
element should be usable in a formula without first creating something
else and mapping it, and importing data for a formula should not require
remembering which data elements its ingredients were mapped from.

PLAN_A3 answered both, but with a model nobody can explain. It made a
DHIS2 element a "source": a second kind of thing with its own id space
(the DHIS2 UID), stored in its own table, owned by exactly one base
indicator, not itself a row in the list. Every screen then has to explain
that the thing the user searched for in DHIS2 is not an indicator, that it
lives under one, that it can live under only one, and that using it twice
means writing a formula over the base that owns it. The ownership rule
also created a rollout precondition: 107 raws on 17 instances that were
mapped to more than one common had to be resolved by hand before the
migration could ship anywhere.

Tim's proposal to Caitlin (2026-09-10) has one concept, and this plan
builds it: everything in the list is an indicator. A DHIS2 element is an
indicator that carries a DHIS2 id. A CSV column is an indicator whose id
is what the file says. A sum is an indicator built from other indicators
and adjusted like a count. A derived indicator is evaluated after
adjustment. Every data row belongs to the indicator it was fetched or
uploaded for. There is no second table and no second id space.

What A3 built that this plan keeps: special indicators and reserved words,
the id generator, the validator, one DHIS2 fetch route with
skip-and-record, source eligibility and decomposition as pure functions,
the one-list manager, the picker and wizard by indicator, the naming step,
the CSV re-stage, and every stored-JSON rename that does not say "source".

## 2. The model

An **indicator** is one row of `indicators` with one of three definitions:

- **base**: an additive monthly series with rows in `dataset_hmis`. A
  base fetched from DHIS2 carries `dhis2_id`, the data element UID or
  `UID.COC` operand the import fetches to fill it; the Type column reads
  **DHIS2 element**. A base with no `dhis2_id` is filled by CSV upload,
  where the file's indicator column value is the indicator's own id; the
  Type column reads **Uploaded**. Both are counts and their format is
  `number`.
- **sum**: a list of base ids, `members`. Computed from the members' rows
  at extract, one facility × month series, adjusted by m001 and m002 like
  any base. A count; format `number`. The Type column reads **Sum**.
- **derived**: an expression over indicators of any type and population
  terms, evaluated by m012 after adjustment and aggregation. Chooses its
  format. The Type column reads **Derived**.

Every indicator has one boolean, **include in analysis**. On means the
extract carries it and m001 and m002 adjust it; off means it is
dictionary only, its data still imported and stored, still usable as a
member or in a derived indicator's expression. The analysed set is ruling 3.

A **special indicator** is an id a registry module script reads by name
(`SPECIAL_INDICATOR_IDS`); it may be a base or a sum, never derived. A
**reserved word** is an identifier no indicator id may be (`RESERVED_WORDS`).
Both are A3 ruling 5, unchanged.

Terminology is exactly that: indicator, base, DHIS2 element, uploaded,
sum, derived, member, include in analysis, special, reserved. No "source",
no "raw", no "common", no "mapping". "Formula" is the word for a derived
indicator's expression, never for the indicator.

## 3. Rulings

1. **One table.** `indicators` gains `dhis2_id text UNIQUE` (nullable),
   `members text` (JSON array of indicator ids, nullable) and
   `include_in_analysis boolean NOT NULL DEFAULT TRUE`. `definition_type`
   is `base`, `sum` or `derived`, with one CHECK: a base has neither
   `expression` nor `members`; a sum has `members` and neither
   `expression` nor `dhis2_id`; a derived has `expression` and neither
   `members` nor `dhis2_id`. `indicator_sources` does not exist.
   `dataset_hmis.indicator_id` and `dataset_hmis_import_ledger.indicator_id`
   reference `indicators(indicator_common_id)`: the data FK `ON DELETE
   RESTRICT DEFERRABLE` under the name `dataset_hmis_indicator_id_fkey`
   in both `_main_database.sql` and 086, the ledger FK `ON DELETE
   CASCADE`. Deleting a base with data is refused by the friendly
   pre-check, as today.
2. **Sum members are bases only.** No sum inside a sum. A sum names an
   indicator that does not exist, or that is not a base, is refused at
   save. Deleting an indicator that a sum names is refused with the list
   of sums (a sum is data, so the dependency is strict). A derived
   indicator's references stay as A3 ruled: never blocking, judged by
   `judgeDerivedIndicator` and shown in the manager.
3. **The analysed set.** An indicator is in the extract, and therefore in
   m001, m002 and every package, when its checkbox is on, or it is a
   special, or a derived with its checkbox on reaches it through the
   resolver. Sum membership alone does not put a member in the extract:
   the sum is computed from the members' rows whether or not they are
   analysed themselves. A derived with its checkbox off is left out of
   the run's catalog, so it is in no package. When a derived is saved that
   reaches an unchecked indicator, the editor says so once and saves
   anyway; generation includes that indicator regardless. Anything the
   naming step creates is on. The catalog's `baseIdsInData` is the analysed bases and sums
   that have rows.
4. **Extract.** `datasets_in_project_hmis.ts` emits every analysed base
   from its own rows and every analysed sum as `SUM(count)` over its
   members' rows per facility × month, all under `indicator_common_id`.
   In the results catalog a sum is treated exactly as a base (its own
   identifier as expression, one slot). m012's ingredient and expression
   tables are unchanged in shape.
5. **Import selects indicators.** A window or schedule selection carries
   `indicatorIds`. `validateRunSelection` expands a sum to its members
   and a derived through the resolver to the bases it reaches, keeps the
   bases with a `dhis2_id`, and records the uploaded bases and population
   terms it dropped with a count. The expansion is persisted on the run
   row as pairs of `{ indicatorId, dhis2Id }` and carried in the worker
   message, so the worker fetches `dhis2Id` and writes rows under
   `indicatorId` without re-resolving. The ledger is keyed by
   `indicator_id`. Retry and re-import selections stay at pair grain. A
   base that is a DHIS2 indicator by live metadata (A3 ruling 9) stays a
   permanent ledger error naming the decomposition importer.
6. **Naming step.** Each candidate element or operand shows a proposed id
   (A3 ruling 10) editable inline. Typing the id of an existing base that
   has no `dhis2_id` assigns the UID to that base (this is how a seeded
   special such as `anc1` becomes a DHIS2 element). Typing any other
   existing id is refused. A candidate whose UID already belongs to an
   indicator is shown as already imported and creates nothing. A DHIS2
   indicator decomposes (A3 ruling 8) into bases for its operands and a
   derived `(numerator) / (denominator)` over their ids. Sums are not made
   in the naming step; they are made in the list. Eligibility refusals
   (A3 ruling 6) are unchanged.
7. **Dictionary file.** One file: `indicator_id, label, type, dhis2_id,
   members, expression, include_in_analysis, format_as, thresholds`;
   `members` semicolon-separated. Replace refuses with a listing when it
   would remove an indicator with data or one a sum names, or move a
   `dhis2_id` between indicators when the old one has data; upsert keeps
   `sort_order`. The download mirrors the file.
8. **Datatable.** One view, by indicator, over the indicators that have
   rows (bases). Sums have no rows and do not appear; their totals are in
   packages. The view toggle and the `view` request field go.
9. **Delete-data window.** `indicatorsToInclude`, a list of indicator ids,
    stored in deletion version rows under that name.
10. **Migration 086, rewritten in place.** The file keeps its number: it
    has run only on the dev database, which step 1 restores from the
    pre-086 dump before applying the rewrite. One transaction, plain SQL
    and PL/pgSQL, no guards that fail-stop on data, nothing resolved by
    hand. In order:
    - add the three columns and widen the type CHECK;
    - a raw mapped to exactly one common, which has no other mapping,
      and whose id is DHIS2-shaped (`^[a-zA-Z][a-zA-Z0-9]{10}$` or that
      twice with a dot): the common becomes a DHIS2 element under its own
      id with `dhis2_id` = the raw id, and the raw's data and ledger rows
      are repointed to the common id. The raw ceases to exist as an id;
    - every other raw becomes a base of its own: a DHIS2-shaped raw under
      an id generated from its label (A3 ruling 10, in PL/pgSQL, pinned to
      `lib/indicator_id.ts` by the existing harness) with `dhis2_id` = the
      raw id; a CSV raw under its own id when it passes the validator, or
      a generated id when it does not (ruled: keep and generate; the next
      file that says the old id lands in the naming step, which is where
      unknown ids go). Its rows are repointed to the id it got;
    - a common with mappings that did not fold in the step above becomes a
      sum over the bases its raws became; a common with no mappings stays
      an empty base;
    - a derived row under a special id (one exists fleet-wide, `anc1` on
      demo) is renamed to the generator's suffix form (`anc1_2`) and an
      empty base is inserted under the special id, so no special is ever
      derived and nothing stops;
    - `include_in_analysis` is TRUE for every row that was a common and
      FALSE for every base created from a raw, so the first package after
      the migration analyses exactly the series the last one did;
    - `dataset_hmis.indicator_raw_id` and the ledger column are renamed to
      `indicator_id` (guarded on column existence) and the FKs are added
      under their `_main_database.sql` names; every stored JSON shape is
      rewritten (run selections to `indicatorIds` plus the persisted
      pairs, schedules to indicator ids, CSV configs, deletion windows,
      staging results);
    - `RAISE NOTICE` the id table (raw id, label, the indicator it became,
      whether folded) so a team can find what its elements became; the
      migration runner suppresses notices, so `validate_indicator_migration`
      prints it;
    - `DROP TABLE indicator_mappings`, then `indicators_raw`.
    Older migrations already guarded for A3 (003, 056, 079) stay guarded.
11. **Client cache name** bumps to `instance_indicators_v5`. No Valkey
    prefix exists for the dictionary. The datatable caches key on the
    base-only stamp, which hashes analysed base and sum rows.
12. **Words.** The Type column and every string read DHIS2 element,
    Uploaded, Sum, Derived. "Include in analysis" is a checkbox in the list
    and in the editor. No screen, string, type, column, route key or file
    name says source, raw, common or mapping after step 2.
    `indicator_common_id` stays as a column and package key (§6).

## 4. Steps

Three steps. A3's steps 1 to 3 are landed and are not redone.

| Step | Name | The one thing it proves |
| --- | --- | --- |
| 1 | The table | one table, 086 rewritten, applied to the restored dev database with the analysed set unchanged |
| 2 | The screens | every screen reads indicators, sums and derived indicators and no string says source |
| 3 | Docs and close | the repo and the site read as written today |

Format of each step: **Surface**, **Deliverable**, **Not in this step**,
**Gates** (on top of the §0 floor), **Ends with**.

**Intermediate state.** After step 1 the server and the DB speak §2 while
the client still renders A3's shapes wherever step 1's type changes did
not force it to change. Step 2 removes it. There is no other intermediate
state.

### Step 1: The table

**Surface.** `server/db/instance/_main_database.sql`,
`server/db/instance/_main_database_types.ts`,
`server/db/migrations/instance/086_indicator_sources.sql` (rewritten; its
name may change to `086_indicators_one_table.sql` since it has never been
recorded outside the dev database), `lib/types/{indicators,
dataset_hmis_import,dataset_hmis,instance,instance_sse,run_manifest}.ts`,
`lib/api-routes/instance/{indicators,indicators_dhis2,datasets}.ts`,
`lib/common_indicator_catalog.ts`, `server/db/instance/{indicators,
instance,dataset_hmis,dataset_hmis_import_runs,dataset_hmis_import_ledger}.ts`,
`server/db/project/datasets_in_project_hmis.ts`, `server/db_startup.ts`,
`server/runs/indicator_catalog.ts`,
`server/worker_routines/import_hmis_data_dhis2/**`,
`server/worker_routines/import_hmis_data_csv/**`,
`server/routes/instance/{indicators,indicators_dhis2,datasets,health}.ts`,
`validate_indicator_sources` and `.ts` (renamed
`validate_indicator_migration`), `validate_fresh_boot.ts`, the harnesses
under `server/tests/`, SYSTEM_05, SYSTEM_06, SYSTEM_07 and SYSTEM_08 globs
and the prose for every contract this step changes, and whatever client
files the type changes force to compile (strings and layout untouched;
step 2 owns them).

**Before building.** Restore the dev `main` database from
`~/wb-fastr-dev-main-before-086.sql.gz` (a plain-SQL `pg_dump` taken before
A3's 086 and before its hand resolution, so it still carries the shared
raw `Bl9cq5ZpeU5` and the derived special `anc1`). With the server
stopped, against the dev postgres named by `PG_HOST` and `PG_PORT` in
`.env`:

```
dropdb -h $PG_HOST -p $PG_PORT -U postgres main
createdb -h $PG_HOST -p $PG_PORT -U postgres main
gunzip -c ~/wb-fastr-dev-main-before-086.sql.gz | psql -h $PG_HOST -p $PG_PORT -U postgres -d main
```

The next `./run` applies the rewritten 086 to it, since the dump records
migrations only up to 085. Record the restore and that boot in §8.

**Deliverable.** Rulings 1 to 5, 7 (server half), 9, 10 and 11 whole. The schema and 086 as ruled, with the fresh replay green.
One CRUD in `db/instance/indicators.ts` writing `dhis2_id`, `members` and
`include_in_analysis` in the indicator's transaction, with the pre-checks
of rulings 2 and 7. The extract of ruling 4. The expansion of ruling 5
and its persisted pairs in the run row and worker message. The naming
transaction of ruling 6 on the server (the client half is step 2). The
seed unchanged in effect: each special an empty base, checkbox on. The
frozen sort-order backfill untouched. `validate_indicator_migration` restoring a dump into a scratch
container, applying the migrations and asserting §5 gate 5.

**Not in this step.** Strings, layout, the Type column, the checkbox in
the UI, the naming step's client, the datatable view, the dictionary
file's form (step 2). Site help text (step 3).

**Gates.** `./validate_migrations`. `./validate_queries`. `validate_fresh_boot`
(22 specials as empty bases, every checkbox on, no `indicator_sources`).
`validate_indicator_migration ~/wb-fastr-dev-main-before-086.sql.gz`
passing, its output recorded in §8. Harnesses under `server/tests/`: the
analysed set (ruling 3: on, special, reached by a derived, not reached by
a sum alone); the expansion (ruling 5: a sum to its members, a derived to
its DHIS2 bases, uploaded bases and population terms dropped and counted,
a queued run keeping its enqueue-time pairs); the naming transaction
(ruling 6: assign to an empty base, refuse a taken id, skip an imported
UID, decompose); the migration id generator parity (exists). `grep -rn
"indicator_sources\|source_id\|sourceId\|sourceIds\|IndicatorSource\|
unknownSources\|sourcesToInclude" server lib` at zero outside
`server/db/migrations/**` and `client/src` (client is step 2).
`m012_expression_parity_test` passes, its fixture changed only for the
new fields on the indicator type.

**Ends with.** Several commits, each green on its own where the step
allows it; the schema, 086, the DB layer and the extract land in one. Not
deployable alone.

### Step 2: The screens

**Surface.** `client/src/components/indicator_manager_hmis/**`,
`client/src/components/instance_dataset_hmis/**`,
`client/src/components/WindowingSelector.tsx`,
`client/src/components/instance/instance_data.tsx`,
`client/src/state/instance/{t1_store,t2_indicators,t2_datasets}.ts`,
`lib/help/**` only if a help target's id must change, SYSTEM_05 and
SYSTEM_06 prose for the client contracts, `server/tests/` for a harness
the step adds.

**Deliverable.** Rulings 6 (client half), 7 (form and download), 8, 9
and 12 whole. The manager: one list with Type (DHIS2 element, Uploaded,
Sum, Derived), the DHIS2 id shown on an element row, the members on a sum
row, the expression on a derived row, the checkbox on every row, the
special badge and the reference list. The editor: a base with id, label,
DHIS2 id (read-only once set), format; a sum with a member picker over
bases; a derived as today, with the ruling 3 notice at save. The naming
step over the DHIS2 select form as ruling 6, and the CSV hold's third
action creating uploaded bases through it. The import picker and wizard
showing members and expressions under a row, never a UID list. History,
current, future and run views and the ledger tab and detail by indicator
("Re-import this indicator"). One datatable view. The delete window over
indicators. The dictionary file form and download as ruling 7. Every
string in three languages.

**Not in this step.** Anything in the server or lib beyond a type the
client needs. Site help text (step 3).

**Gates.** `./validate_protocols` (0 new flags). `grep -rni "source\|raw
indicator\|common indicator\|mapping" client/src/components/
indicator_manager_hmis client/src/components/instance_dataset_hmis
client/src/state/instance/t2_indicators.ts` at zero, except DHIS2 API
field names that must be spelled as DHIS2 spells them. The step-1 grep
extended to `client/src` at zero. The server booted against the dev
database and the manager, an import selection, the naming step, the
datatable and the delete window exercised; recorded in §8 with what was
done.

**Ends with.** Several commits. Deployable with step 1 once step 3's
review passes.

### Step 3: Docs and close

**Surface.** SYSTEM_05, SYSTEM_06, SYSTEM_07, SYSTEM_08 prose;
`wb-fastr-site` help text for the indicator manager and the imports;
`lib/help/help_targets.generated.ts` via `deno task build:help-buttons`;
this file.

**Deliverable.** Every SYSTEM sentence about the HMIS dictionary reads as
§2; the site help text names indicators, sums and derived indicators; the generated
help targets rebuilt; nothing else changes.

**Not in this step.** Code.

**Gates.** `grep -rni "source\|indicator_mappings\|indicators_raw\|
is_default" SYSTEM_05_facilities_indicators.md
SYSTEM_06_ingestion.md SYSTEM_07_dhis2.md` at zero except DHIS2 API
field names. `deno task build:help-buttons` leaves the tree unchanged when
run twice.

**Ends with.** One commit here and one in `wb-fastr-site`. The review
that passes this step deletes this file in its last commit.

## 5. Gates catalogue

The §0 floor applies to every step. These are the whole-plan gates; the
step that first reaches zero is named, and every later step keeps it
there.

1. A3's gates 1 and 2 stay at zero (`_COMMON_INDICATORS`,
   `table_structures/indicators`, `goal3_analytics`,
   `DHIS2_FACILITY_BATCH_SIZE`, `assertUrlWithinLimit`, `MAX_URL_LENGTH`,
   `Dhis2RunRoute`, `computedIndicators`). Landed.
2. `grep -rn "indicators_raw\|indicator_mappings\|indicatorRawId\|
   rawIndicatorIds\|raw_indicator_id\|IndicatorRaw\|is_default\|
   rawIndicatorsToInclude\|indicator_sources\|source_id\|sourceId\|
   sourceIds\|IndicatorSource\|unknownSources\|sourcesToInclude" server
   lib client/src` at zero outside `server/db/migrations/**`, with a word
   boundary on `is_default` (the presentation objects' own column is not
   a hit). Step 1 for `server` and `lib`, step 2 for `client/src`.
3. `./validate_migrations` green: the fresh replay with 086 a no-op.
   Step 1.
4. `validate_fresh_boot` exit 0: the special list as empty bases, every
   checkbox on. Step 1.
5. `validate_indicator_migration <dump>...` over the pre-086 dev dump
   (step 1) and, before rollout, over a dump of every instance's `main`
   database (§7). What it asserts, per dump: every raw became exactly one
   indicator or folded into exactly one common; every generated id is
   unique, bare, unreserved, non-special and equal to what
   `lib/indicator_id.ts` produces for the same label; no derived is under
   a special id; every common with mappings is a DHIS2 element or a sum
   whose members are the indicators its raws became; the analysed set
   after equals the set of commons before; the extract's per-indicator
   sums for that set are identical before and after; `dataset_hmis` and
   the ledger have the same row counts and every row points at an
   existing indicator; every run row, version row, schedule and deletion
   version parses under the new shapes; a second run of the migrations
   does nothing; it prints the id table.
6. Committed harnesses under `server/tests/` for: the analysed set, the
   expansion, the naming transaction, the migration generator parity, and
   the ones A3 landed (id generation and the validator, skip-and-record,
   eligibility and decomposition, m012 parity). `deno task test` runs them
   all.

## 6. Out of scope

- Renaming the column and package key `indicator_common_id` to
  `indicator_id`. It is the column every module script reads
  (`wb-fastr-modules`), the parquet column of every results object, the
  query engine's dimension id and the AI tools' dimension name. The
  rename is a three-repo change with a manifest transform and a
  cache-prefix bump. Propose it as its own plan when the modules repo is
  next opened (PLAN_1e).
- The DHIS2 population writer (SYSTEM_05 Open items).
- A `rate_per_1k` display format (SYSTEM_05 Open item).
- Renaming an indicator id after creation.
- Showing a sum's computed totals in the facility datatable.
- HFA and ICEH dictionaries.

## 7. Rollout and rollback

Everything here needs real infrastructure and is Tim's to trigger. Steps
1 to 3 ship once, together, after step 3's review passes.

1. Take a fresh read-only dump of every `main` database and run
   `validate_indicator_migration` over all of them. There is nothing to
   resolve by hand; a failure is a defect in 086 and goes back to a Fix
   session.
2. Take a named backup of every instance's `main` database immediately
   before the release. After 086 has committed on an instance, the
   previous image cannot read that database (columns renamed, tables
   dropped), so rollback is that dump plus the previous image. Rehearse
   the restore on testing-tim.
3. `./deploy_testing` from `tim-branch` (it ships the working tree; check
   `git status`), verify the manager, an import and the datatable against
   a restored production dump, then the fleet release.

## 8. Build log

Append-only. One row per decision, deviation, correction or defect, and
one closing row per session (`Step N built`, `Step N reviewed: pass`,
`Step N reviewed: K findings`, `Step N fixed`). Newest last. The next
agent reads this section before its step.

| Date | Step | Entry |
| --- | --- | --- |
| 2026-09-11 | plan | PLAN_A3 steps 1 to 5 were built and reviewed on `tim-branch` (commits `439f0e9d` to `bc98ef54`, never deployed). Its build log is the §8 of that file at `bc98ef54`. Steps 1 to 3 stay as built; steps 4 and 5 are reworked by this plan's steps 1 and 2. The source entity is removed because it is a second identity for something that already has one, and its ownership rule created a fleet-wide hand-resolution precondition (§1). |
| 2026-09-11 | plan | Rulings agreed with Tim: one table, members as bases only, `derived` kept as the word and the code name, the analysed set with the checkbox, a CSV raw whose id fails the validator kept under a generated id, a derived reaching an unchecked indicator noticed at save and generated regardless. |
