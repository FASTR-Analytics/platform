# PLAN A4: one table of indicators

Status: OPEN. Rulings agreed (Tim, 2026-09-11). Supersedes
PLAN_A3_ONE_INDICATOR_LIST.md, whose steps 1 to 5 are on `tim-branch` and
unshipped. A3's steps 1 to 3 stay as built. Its steps 4 and 5 are reworked
in place by the steps below: the entity they introduced (the "source") is
removed and its migration is rewritten under the same number. PLAN_A3 was
deleted in the commit that added this file; its text is in git history.

**Next step: Do 3.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`; after step 4's review passes the
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
`Fix N` if there are. After step 4's review passes, the reviewer deletes
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
  this plan ships before step 4's review passes (§7).

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
13. **The sweep (Tim, 2026-09-12).** Names that survived step 2 because
    they mean something other than the removed entity, or because their
    rename reaches outside a step's surface, are renamed in one sweep,
    step 4, so that nothing in the three tiers says source, common or
    mapping when this plan closes. Examples, not the whole list:
    `Dhis2RunCredentialsSource` and the route body and worker-message key
    `credentialsSource` (how a DHIS2 flow obtains credentials); `run.source`
    on `dataset_hmis_import_runs`, the ledger item's `source` and
    `stagingResult.sourceType` (the import route: dhis2, csv, backfill);
    `HmisCsvMappingParams` and the `mappings` key of `csv_config` (CSV
    column to field); `indicatorMappingsVersion` and
    `baseIndicatorMappingsVersion` (the two dictionary stamps); the
    `CommonIndicator` family (`CommonIndicator`, `CommonIndicatorDefinition`,
    `CommonIndicatorType`, `COMMON_INDICATOR_TYPES`, `getCommonIndicators`,
    `buildCommonIndicatorDictionary`, `resolveCommonIndicatorCatalog`,
    `common_indicator_catalog.ts`, the catalog row type); `describeDhis2Source*`
    survivors in docs; and the `hmisSources`-era words in SYSTEM prose. A
    stored column or JSON key is renamed only with its migration and
    transform (the lockstep rule); a key the run manifest carries is renamed
    only with the manifest transform. `indicator_common_id` stays (§6).

## 4. Steps

Four steps. A3's steps 1 to 3 are landed and are not redone.

| Step | Name | The one thing it proves |
| --- | --- | --- |
| 1 | The table | one table, 086 rewritten, applied to the restored dev database with the analysed set unchanged |
| 2 | The screens | every screen reads indicators, sums and derived indicators and no string says source |
| 3 | Docs and close | the repo and the site read as written today |
| 4 | The sweep | no name in lib, server, client or the docs says source, common or mapping except `indicator_common_id` and DHIS2's own field names |

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

**Ends with.** Several commits. Deployable with step 1 once step 4's
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

**Ends with.** One commit here and one in `wb-fastr-site`.

### Step 4: The sweep

**Surface.** Every file in `lib/`, `server/`, `client/src/`, the SYSTEM and
PROTOCOL_APP files, `server/db/migrations/instance/` for the migration the
stored keys need, `server/runs/manifest_transform.ts` for a manifest key,
and the harnesses under `server/tests/`.

**Before building.** Take the inventory first and commit it as the first
§8 row of the step: `grep -rniw "source\|sources\|common\|mapping\|mappings"
lib server client/src SYSTEM_*.md PROTOCOL_APP_*.md` outside
`server/db/migrations/**`, each hit classed as one of: the removed entity's
word (rename), another concept carrying the word (rename, ruling 13),
`indicator_common_id` (keep, §6), a DHIS2 API field name (keep), an English
word that is not a name (keep, e.g. "the source of truth"). The classing is
the step's work list; a hit in no class is a finding for Review 4.

**Deliverable.** Ruling 13 whole. Every name in the rename classes renamed
across the three tiers in one commit per concept (the credentials origin,
the import route, the CSV columns, the dictionary stamps, the indicator
type family, the doc survivors), each green on its own. A stored column or
JSON key gets migration 087 with its transform block and forced skip-gate
(PROTOCOL_APP_MIGRATIONS "Skip-Gate Gotcha"), and `validate_migrations`
replays it; a manifest key gets its transform and the m012 parity fixture.
SYSTEM_05, SYSTEM_06, SYSTEM_07 and SYSTEM_08 prose renamed with the code.

**Not in this step.** `indicator_common_id` (§6). Behaviour: no screen,
route, query or package changes what it does.

**Gates.** The grep above at zero outside the keep classes, the class list
in §8. `./validate_migrations` and `./validate_queries` if a stored key
moved. `deno task test` with the m012 parity fixture changed only for
renamed keys. The step-2 grep and gate 2 at zero with no exception left but
DHIS2's field names.

**Ends with.** Several commits. The review that passes this step deletes
this file in its last commit.

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
1 to 4 ship once, together, after step 4's review passes.

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
| 2026-09-11 | 1 | **"Before building" is done; no code is built.** The dev `main` database was dropped, recreated and restored from `~/wb-fastr-dev-main-before-086.sql.gz` (restore exit 0). It now records migrations up to `085_ledger_skipped_values`, holds 16 indicators, 15 `indicators_raw` rows, 9 `indicator_mappings` rows, 371,087 `dataset_hmis` rows, `dataset_hmis.indicator_raw_id` and no `indicator_sources`. Tim stopped the dev server by hand (this session could not signal processes). The next `Do 1` session must NOT restore again: check `SELECT migration_id FROM schema_migrations ORDER BY 1 DESC LIMIT 1` is `085_ledger_skipped_values` and `indicators_raw` exists; only if 086 has been applied since is the restore repeated. Boot for the gate with `./run`; if port 8000 is taken, `PORT=8001` is the precedent (PLAN_A3 §8). |
| 2026-09-11 | 1 | Dump facts for 086, read from the restored database. Commons: 10 bases (`new_fp`, `anc4`, `delivery`, `pnc1_newborn`, `pnc1_mother`, `bcg`, `penta1`, `penta3`, `measles2`, `opd`, `measles1`), 5 derived (`anc1` = `measles1` under the special id; `wer`, `aaaa`, `ipd` name `anc1`; `asdf`). Raws: 9 bare UIDs whose label equals the id, `Bpndtw5yACp` and four of its operands with real labels. Mappings: `Bl9cq5ZpeU5` to both `anc4` and `measles1`; `WMs1OfiqmYO`, `muZ9mQLjnNw`, `yTcqi4vo5j4`, `zhxRZPwaIfT`, `uVIZtOjcqtR`, `DgJergzdmfd`, `OMtkRAJmDN8` each 1:1 to `bcg`, `delivery`, `opd`, `penta1`, `penta3`, `pnc1_mother`, `pnc1_newborn`; `L4EsISvd1Hu` and the `Bpndtw5yACp` family unmapped. No mapping onto a derived. Expected under ruling 10: the seven 1:1 raws fold (their commons become DHIS2 elements, data repointed to the common id); `Bl9cq5ZpeU5` becomes base `bl9cq5zpeu5` and `anc4` and `measles1` become sums over it; `L4EsISvd1Hu` and the five `Bpndtw5yACp` raws become bases under generated ids (checkbox off); `anc1` is renamed `anc1_2` with the three expressions naming it rewritten, and an empty base `anc1` is inserted. 11 run rows, 37 version rows (one deletion version with `rawIndicatorsToInclude`, CSV and DHIS2 staging results with `indicatorRawId` and `route`), 0 schedules. |
| 2026-09-11 | 1 | Noted while reading, not built (for the next Do 1 session): (a) the step-1 grep gate reaches `server/dhis2/goal2_indicators/decompose_indicator.ts` and its test through `Dhis2ParsedOperand.source_id`, which the Surface omits; the gate wins, rename the field to `dhis2_id`. (b) `lib/indicator_expression/resolve.ts` is outside the Surface; a sum is a leaf there, so the expression dictionary builders (`buildCommonIndicatorDictionary`, `loadExpressionDictionaryEntries`) map `sum` to the resolver's `base`. (c) The package catalog schemas (`indicatorRowV2` in `server/runs/indicator_catalog.ts`, `run_manifest.ts:167`) accept `base` or `derived` only; emitting a sum as `type: "base"` in the catalog row keeps old images able to read new packages, which ruling 4's "treated exactly as a base" allows. (d) `hmisSources` (`lib/types/instance.ts`, `instance_sse.ts`, `server/db/instance/instance.ts`, client `t1_store.ts` and `instance_data.tsx`) counts the dropped table; remove it. (e) `judgeDerivedIndicators` derives "has data" from sources today; with one table the client cannot know which bases have rows from the dictionary alone, so the lib function should take the set as a parameter and step 2 decides the manager's signal (the ledger is the cheap one). (f) `_main_database_types.ts` and `health.ts` (`/dhis2-indicators-export`, wire keys `id, label, mappedTo` read outside the repo) are in the gate list. (g) Killing processes and `git checkout` are denied to this session's harness; a session that needs the dev server stopped must ask Tim. |
| 2026-09-11 | 1 | Do 1 session ended at handoff: nothing built, tree at `82792f1e` plus this log, gates not run. **Next step stays `Do 1`.** |
| 2026-09-11 | 1 | Step 1 built in one commit (the schema, 086, the DB layer, the extract, the workers, the routes, the lib types, the client compile fixes, the harnesses, the validators and the SYSTEM prose are one change, none green alone). The restore was not repeated: the dev database was at `085_ledger_skipped_values` with `indicators_raw` present at session start. Gates: `deno task typecheck` (server, client, `lint:systems`), `deno task test` (93 passed, 0 failed, m012 parity included), `./validate_migrations`, `./validate_queries` (63 cases), `./validate_fresh_boot` (22 specials as empty bases, every checkbox on, no `indicator_sources`), `./validate_protocols` (0 tier-1, 0 new tier-2), `./validate_indicator_migration ~/wb-fastr-dev-main-before-086.sql.gz` (PASS; output in the next row), the step-1 grep at zero outside `server/db/migrations/**` except one substring hit (`resource_id`, `_main_database_types.ts:223`, a column of another table; a word boundary on `source_id` clears it, as gate 2 already rules for `is_default`), and the boot: `timeout` does not exist on macOS, so the server was started the way `./run` starts it (`deno run --allow-all --env-file --unstable-broadcast-channel main.ts`) under a bash wrapper that stopped it after it listened (`./run` pipes the server through `while read`, so a bounded `./run` would orphan the deno process on port 8000). The boot applied 086 to the dev database: it now records `086_indicators_one_table`, holds 25 indicators (2 sums), no `indicators_raw`; port 8000 is free. |
| 2026-09-11 | 1 | `validate_indicator_migration` output over the pre-086 dump: `[086] derived special anc1 renamed anc1_2, empty base anc1 inserted`; `Bl9cq5ZpeU5 -> bl9cq5zpeu5 new base`; `Bpndtw5yACp (Postnatal Clinic Visits) -> postnatal_clinic_visits new base`; `Bpndtw5yACp.Ckyegjg37TN -> postnatal_clinic_visits_newborns_2_3d`; `Bpndtw5yACp.oqDd9VqyOrf -> postnatal_clinic_visits_newborns_4_7d`; `Bpndtw5yACp.p1wfz09QXvm -> postnatal_clinic_visits_mothers_1d`; `Bpndtw5yACp.wWijyO29a8e -> postnatal_clinic_visits_newborns_7d`; `DgJergzdmfd -> pnc1_mother folded`; `L4EsISvd1Hu -> l4esisvd1hu new base`; `muZ9mQLjnNw -> delivery folded`; `NKPF6JLELwz.LH3tOusvpY8 (ART Cervical cancer +ve on ART received cryotherapy - 40 - 44 years) -> art_cervical_cancer_ve_on_art_received_cryotherapy_40_44_years new base`; `OMtkRAJmDN8 -> pnc1_newborn folded`; `uVIZtOjcqtR -> penta3 folded`; `WMs1OfiqmYO -> bcg folded`; `yTcqi4vo5j4 -> opd folded`; `zhxRZPwaIfT -> penta1 folded`. `15 raws: 7 folded, 8 new bases (8 generated ids), 2 sums, 1 derived specials renamed. 9 bases with data compared, 371087 data rows, 2085 ledger rows, 11 run rows, 37 version rows, 0 schedules parsed.` The dump holds 15 raws, not 14 as the earlier dump-facts row counted: `NKPF6JLELwz.LH3tOusvpY8` is the fifteenth. `anc4` and `measles1` became sums over `bl9cq5zpeu5`; `ipd`, `wer` and `aaaa` now name `anc1_2`. |
| 2026-09-11 | 1 | Decisions the rulings left open, taken as built. (a) A common with mappings that is derived (none in the dump): its raws become bases of their own and the derived stays; the old extract took nothing from such a mapping, so the analysed set is unchanged. (b) The renamed derived special and the empty base inserted under the special id share the derived's label: the migration cannot read the lib's seed labels. (c) A sum needs at least one member; the server refuses an empty list. (d) `updateIndicator` refuses retyping a base that has data or that a sum names, and changing a set `dhis2_id` while the base has data; a new `dhis2_id` must be DHIS2-shaped and owned by no other indicator. (e) The catalog row `type` is `"base" | "derived"` and a sum is emitted as `base` (note (c) of the previous session), so the package schemas and the manifest transform are untouched. (f) `judgeDerivedIndicators` takes the set of ids with data as a parameter (note (e)); until step 2 the client passes the bases that carry a `dhis2_id`, an interim signal recorded as a SYSTEM_05 open item. (g) The client's pair lists post `{ indicatorId, periodId }` (`Dhis2RunPairInput`); `validateRunSelection` resolves each `dhis2Id` and refuses an uploaded base; the stored pair carries all three. (h) The 086 expression rewrite for the renamed special tokenises bracketed identifiers and renames only whole bare identifiers or an exact `[id]`. |
| 2026-09-11 | 1 | Renames and removals beyond the plan's list, each forced by the gate or by the type changes: `Dhis2ParsedOperand.source_id` is `dhis2_id` (`decompose_indicator.ts` and its test, outside the Surface, per note (a)); `expandIndicatorSelectionToSources` is `expandIndicatorSelection` and returns `elements`; `generateIndicatorId`'s `sourceId` parameter is `fallbackId`; `getNewSourceIdIssue`, `baseIdsWithSources`, `IndicatorSource`, `IndicatorWithSources`, `HmisDatatableView`, `hmisSources`, the windowing `grain` and `datasetHmisWindowingIndicatorSchema` are gone; `PeriodSourceStat` is `PeriodIndicatorStat`; `classifySources`/`SourceRoute` are `classifyElements`/`ElementRoute`; `INDICATOR_BATCH_SOURCES_SEPARATOR` is `INDICATOR_BATCH_MEMBERS_SEPARATOR`; `createIndicatorsFromDhis2` returns `{ created, assigned }`. Kept, because they are outside the Surface and not in the step-1 grep: `Dhis2SourceVerdict`, `Dhis2SourceRefusal`, `describeDhis2SourceRefusal` (lib) and S7's `source_eligibility.ts` / `getDhis2SourceVerdict`; and the word "common" in `CommonIndicator`, `getCommonIndicators`, `common_indicator_catalog.ts`. Both are ruling 12 leftovers for step 2 or 3 to rule on. |
| 2026-09-11 | 1 | Client: 25 files edited only as far as the lib types forced (strings and layout untouched). The naming step maps its A3 state onto the A4 input: a DHIS2-shaped candidate posts as an element (a "new" target creates, an "attach" target assigns the UID to that base), any other candidate as an uploaded base; the editor's source list is the one `dhis2_id`; the manager's Type column gained a Sum case; the datatable's view toggle stays but is not sent; the cache name is `instance_indicators_v5` (ruling 11). Step 2 owns the rest. |
| 2026-09-11 | 1 | Step 1 built. |
| 2026-09-11 | 1 | Review 1, surface (no code change asked). The step is one commit, `5b8cdd3b`. Two files outside the Surface changed: `lib/indicator_id.ts` (`generateIndicatorId`'s `sourceId` parameter is `fallbackId`) and `server/dhis2/goal2_indicators/decompose_indicator.ts` (`Dhis2ParsedOperand.source_id` is `dhis2_id`); both are forced by the step-1 grep gate, which names `sourceId` and `source_id`, and both were logged by the Do session. The shell wrapper `validate_fresh_boot` changed a comment only. Every other changed file is in the Surface or is a client file the type changes forced. |
| 2026-09-11 | 1 | Review 1, gates run by the reviewer, all green: `deno task typecheck` (server, client, `lint:systems`); `deno task test` (93 passed, 0 failed; the analysed-set, expansion, naming, migration-parity and m012-parity harnesses among them, the m012 fixture changed only for `include_in_analysis` and `dhis2_id`); `./validate_protocols` (0 tier-1, 0 new tier-2); `./validate_migrations`; `./validate_queries` (63 cases); `./validate_fresh_boot` (22 specials as empty bases, every checkbox on, no old tables); `./validate_indicator_migration ~/wb-fastr-dev-main-before-086.sql.gz` (PASS, the same id table and counts as the Do session's row); the step-1 grep at zero outside `server/db/migrations/**` except the `resource_id` substring (`_main_database_types.ts:223`, another table's column), and the word-boundary form at zero. The boot: the dev database was at `086_indicators_one_table` with 18 bases, 2 sums, 5 derived, 371,087 data rows and none of the old tables; the server was started the way `./run` starts it (Valkey already up), listened on port 8000 after 8 s, answered `GET /` with 200, and was stopped; port 8000 is free. Every Deliverable item of step 1 was found in the code (schema and 086 as ruling 10; the CRUD with the ruling 2 and 7 pre-checks; the extract of ruling 4; the expansion and persisted pairs of ruling 5; `applyIndicatorNaming` for both import paths; the seed unchanged; the sort-order backfill untouched). §8 has the rows the step should have produced. |
| 2026-09-11 | 1 | **Review 1 finding, Fix 1 item (changes code).** `validate_indicator_migration.ts`, the analysed-set assertion (`analysedAfter`, near line 395): it takes the set to be the rows with `include_in_analysis` TRUE, but ruling 3's set is `analysedIndicatorIds` (checkbox on, or a special, or reached by a checked derived). A CSV raw whose id is a special (`sba`, `pnc1`, any special an old instance was never seeded with) and that no indicator already holds keeps its own id under ruling 10 (the validator accepts a special as a base) and lands with its checkbox off, yet ruling 3 analyses it: the first package after the migration gains that series and §5 gate 5 does not see it. Fix: build the post set with `analysedIndicatorIds` from lib over the post rows (definition and checkbox as `CommonIndicator`s) and compare that with the expected set. The dev dump still passes (none of its raws has a special id). Whether 086 should instead set the checkbox on for such a row is Tim's to rule; ruling 10 says off for every base from a raw, and the code follows it. |
| 2026-09-11 | 1 | Review 1 note for Tim, no code change asked (a consequence of ruling 11). `getBaseIndicatorMappingsVersion` hashes the non-derived rows whose checkbox is on (narrower than ruling 3's set: a special with its checkbox off and a base reached only through a derived do not move it). The datatable it keys lists every base that has ledger rows with its label read from `indicators` (`getDatasetHmisItemsForDisplayByIndicator`), and after 086 those are mostly bases created from raws, checkbox off. A label edit on one of them does not move the stamp, so the cached datatable keeps the old label until the next version id; under A3 the stamp covered every base row. The cheapest cure is to hash every non-derived row (a derived edit still costs the datatable nothing). |
| 2026-09-11 | 1 | Step 1 reviewed: 3 findings (one changes code: the validator's analysed set; the other two are recorded, no change asked). |
| 2026-09-11 | 1 | Fix 1, done by the reviewing agent at Tim's instruction (one session, two steps; the review's own findings were its work list). `validate_indicator_migration.ts` now builds the post rows as `CommonIndicator`s and takes the analysed set as `analysedIndicatorIds` from lib plus every derived with its checkbox on, the same set the extract and the catalog use, instead of the checkbox alone. Proof: the gate over the pre-086 dump still passes with the same counts; a copy of that dump with one CSV raw `sba` appended fails with `analysed set gained sba` (the raw keeps its special id under ruling 10 and lands with its checkbox off, and ruling 3 analyses it), where before the fix it passed. The ruling 11 note stands as recorded; nothing else changed. |
| 2026-09-11 | 1 | Step 1 fixed. |
| 2026-09-11 | 1 | Review 1 of Fix 1, by a fresh agent. The fix is one commit, `9da0d299`, touching `validate_indicator_migration.ts` and this file only, both in the Surface. The Fix 1 item is in the code: the analysed-set assertion (`validate_indicator_migration.ts:396-418`) builds the post rows as `CommonIndicator`s, takes `analysedIndicatorIds(postCommons, POPULATION_TYPE_IDS)` from lib plus every derived with its checkbox on, and compares that with the commons before. That is the set the extract (`datasets_in_project_hmis.ts:175`) and the catalog (`resolveCommonIndicatorCatalog`, which drops a derived with its checkbox off) use. The proof was reproduced, not taken from the log: a copy of the pre-086 dump with the row `sba` appended to the `indicators_raw` COPY block fails with `analysed set gained sba` (16 raws, 9 new bases, 8 generated ids), while the unmodified dump passes with the same id table and counts as before. |
| 2026-09-11 | 1 | Review 1 of Fix 1, gates run by the reviewer, all green: `deno task typecheck` (server, client, `lint:systems`); `deno task test` (93 passed, 0 failed); `./validate_protocols` (0 tier-1, 0 new tier-2, 17 baselined); `./validate_migrations` (schemas unchanged); `./validate_queries` (63 cases); `./validate_fresh_boot` (22 specials as empty bases, every checkbox on); `./validate_indicator_migration ~/wb-fastr-dev-main-before-086.sql.gz` (PASS: 15 raws, 7 folded, 8 new bases, 2 sums, 1 derived special renamed; 371,087 data rows, 2,085 ledger rows, 11 run rows, 37 version rows); the step-1 grep at zero outside `server/db/migrations/**` except the `resource_id` substring (`_main_database_types.ts:223`), and the word-boundary form at zero; the gate 2 word-boundary grep over `server lib` at zero except the comment at `server/run_query/virtual_defaults.ts:113` naming the presentation objects' own `is_default` column, which gate 2 excludes. The boot: the dev database was at `086_indicators_one_table` (18 bases, 2 sums, 5 derived, 371,087 data rows, none of the old tables); the server was started the way `./run` starts it (Valkey already up on 7379), applied no migration, listened on port 8000 after 9 s, answered `GET /` with 200, and was stopped; port 8000 is free. |
| 2026-09-11 | 1 | Step 1 reviewed: pass. The ruling 11 note (`getBaseIndicatorMappingsVersion` hashing only checked non-derived rows) stands as recorded for Tim; no code change asked. Next step `Do 2`. |
| 2026-09-11 | 2 | Step 2 built in one commit. Gates: `deno task typecheck` (server, client, `lint:systems`), `deno task test` (93 passed, 0 failed), `./validate_protocols` (0 tier-1, 0 new tier-2, 17 baselined), the step-1 grep extended to `client/src` at zero with word boundaries (the substring form hits `offerIndicatorSource` five times in the visualization CF editor, another concept, outside the surface), gate 2 word-boundary over `server lib client/src` at zero outside migrations except the `is_default` comment `run_query/virtual_defaults.ts:113` that gate 2 excludes. The boot: Valkey was up; the server was started the way `./run` starts it, applied no migration (dev database at `086_indicators_one_table`, 18 bases, 2 sums, 5 derived, 371,087 data rows), listened on port 8000; Vite was started on port 3000 with `VITE_BYPASS_AUTH=true` passed as a process variable (the local env file is unchanged); both were stopped after; port 8000 is free. |
| 2026-09-11 | 2 | Screens exercised in the browser (Playwright over the dev server, nothing saved): the manager (Type column reads DHIS2 element / Uploaded / Sum / Derived, Defined by shows the DHIS2 id, the members or the formula, the checkbox on every row, the Special badge, no console error); the editor for the sum `anc4` (member picker over bases, Number forced, special note); Create indicator as Derived with the formula `bl9cq5zpeu5 / bcg`, which showed the ruling 3 line "bl9cq5zpeu5 is not included in analysis, but this formula uses it, so generation includes it anyway" under the formula; the datatable (one view, no series toggle, 9 indicators with rows); the delete window (Delete all indicators, then a multi-select of the same 9); Imports: the By indicator tab (ledger by indicator id with the dictionary label, 15 rows, Retry failed pairs (834)), History ("Imported via" column, "15 indicators (15 DHIS2 elements)"), a run detail ("DHIS2 ids not found in DHIS2" over the six unknown ids); the DHIS2 wizard picker (Type and Defined by columns), a selection of `anc4` (sum), `ipd` (derived) and `new_fp` (uploaded) reviewed as "Indicators: 3 (1 DHIS2 elements)" and "12 (indicator, month) pairs"; Import from DHIS2 against the stored connection (`https://hmis.moh.gov.so`, 43 results for "BCG", refusals worded "Cannot be imported: …" and "Cannot be decomposed: …"), one DHIS2 indicator added and named: two operand elements and one derived row; typing `anc1` in an element's id showed "Assigns this DHIS2 id to the existing indicator anc1" with the label locked to that indicator's, typing `bcg` showed the refusal "already exists and is not an uploaded indicator", and the formula preview read `(anc1 / bcg)`. Not exercised: a CSV hold's third action (no `needs_review` run exists on the dev database); the code path is the same naming step fed uploaded ids. One pre-existing console error, outside the surface and unchanged: `PeriodSelector: selectedStartPeriodId is out of bounds` when the delete window opens, before `WindowingSelector` corrects the default bounds on mount. |
| 2026-09-11 | 2 | Decisions taken as built. (a) The manager's has-data signal is the import ledger (`getDatasetHmisImportLedger`, read once and again when `datasetVersions.hmis` moves); the set passed to `judgeDerivedIndicators` and to the editor is `analysedIdsWithData` over every non-derived row, so an unchecked derived is judged as it would be if checked; while the ledger loads the Status column is empty and the editor warns about no ingredient. (b) The ruling 3 notice is a live line under the formula, not a blocking dialog: it appears as the formula is typed and the save goes. (c) The naming step's row kind is fixed by the host, not by the id's shape: the DHIS2 select form feeds elements, the CSV hold feeds uploaded ids; an uploaded id is the file's and is not editable (only the label is), so a re-stage matches the rows; an element whose UID an indicator already carries reads "Already imported as" and is still posted, because the server's landing map needs it to rewrite a derived formula and creates nothing for it; one new id chosen for two rows is refused (the server refuses it too). (d) `Dhis2SourceRefusal`, `Dhis2SourceVerdict`, `describeDhis2SourceRefusal`, S7's `getDhis2SourceVerdict`, `withSourceVerdicts` and the file `source_eligibility.ts` (with its test) are renamed to the Element form: lib, S7, `db/instance/indicators.ts`, two tests, SYSTEM_05 and SYSTEM_07 prose and glob. Outside the Surface, forced by the step-2 grep on the client import and deferred to this step by the Do 1 log. (e) The dataset page heading "DATA SOURCE" is "DATASET" on all three dataset pages (`instance_dataset_hfa/index.tsx` and `instance_dataset_iceh/index.tsx` are outside the Surface, one string each, changed so the three siblings agree). (f) The Indicators card in `instance_data.tsx` repeated the indicator count under a "Sources" label; the block is removed. (g) The CSV wizard's second step is "Columns" and its local store is `columns`; the payload key `mappings` and `HmisCsvMappingParams` stay (stored `csv_config` JSON). (h) The Special badge, the reference list and the editor's error say a special may be a base or a sum (ruling 2 of A3 as `getSpecialIndicatorTypeIssue` implements it). (i) `_indicator_display.ts` (new, under the S5 glob) holds `indicatorTypeLabel` and `definedByText` for the manager and the picker. |
| 2026-09-11 | 2 | **Step-2 grep, code wins, for Tim to rule on.** The case-insensitive grep over the three surfaces is not at zero. Every hit that names the removed entity is gone; what remains is four other concepts the word list also matches, none of which step 2 can rename inside its Surface: (1) `Dhis2RunCredentialsSource` and the route body and worker-message key `credentialsSource` (how a DHIS2 flow obtains credentials: inline or stored), 73 hits in 20 files across lib, the DHIS2 worker, the scheduler, the geojson wizard, SYSTEM_07 and PROTOCOL_APP_WORKER_ROUTINES; (2) `run.source`, the ledger item's `source` and `stagingResult.sourceType` (the import route: dhis2, csv, backfill), a `dataset_hmis_import_runs` column and stored version JSON, so a rename is a migration; (3) `HmisCsvMappingParams` and the `mappings` key of `csv_config` (CSV column to field), stored JSON; (4) `indicatorMappingsVersion` and `baseIndicatorMappingsVersion`, which SYSTEM_05 "Client state & wizard" rules keep their names (carried by the run manifest and dataset-info types). Ruling 12 also names types: the `CommonIndicator` family (`CommonIndicator`, `CommonIndicatorDefinition`, `getCommonIndicators`, `common_indicator_catalog.ts`, 164 hits in 28 files over lib, server, client and tests) still says "common"; no gate checks it and the rename is a three-tier sweep. |
| 2026-09-11 | 2 | Step 2 built. |
| 2026-09-12 | plan | Tim ruled on the two step-2 leftovers: rename everything, in one sweep, as a fourth step. Ruling 13 and Step 4 were written by the Do 2 session at his instruction; every "step 3" that meant "the last step" now says step 4 (§0, §4, §7). Next step stays `Review 2`. |
| 2026-09-12 | 2 | Review 2, by a fresh agent. The session began with a dirty tree: the only change was this file, Tim's ruling 13 and step 4 (the `plan` row above), left uncommitted by the Do 2 session; it was committed on its own (`cfc6a0ce`) before the review so the step's diff stays isolated. The step is one commit, `fb0c9864`, 40 files. Outside the Surface, all logged by the Do session in decision (d) and (e): `lib/types/indicators.ts`, `server/db/instance/indicators.ts`, `server/dhis2/goal2_indicators/{attach_verdicts,mod,element_eligibility}.ts` (the last renamed from `source_eligibility.ts`), `server/routes/instance/indicators_dhis2.ts`, `server/tests/dhis2_element_eligibility_test.ts` (renamed) and `indicator_naming_test.ts`, SYSTEM_07 (glob and prose): the `Dhis2Source*` to `Dhis2Element*` rename, forced by the step-2 grep through the client's import of `describeDhis2SourceRefusal`; and `instance_dataset_hfa/index.tsx`, `instance_dataset_iceh/index.tsx`: one heading string each ("DATA SOURCE" to "DATASET"), forced by no gate. Recorded; no change asked (the sweep of ruling 13 would rename the headings anyway). Every other changed file is in the Surface. |
| 2026-09-12 | 2 | Review 2, gates run by the reviewer, all green: `deno task typecheck` (server, client, `lint:systems`); `deno task test` (93 passed, 0 failed); `./validate_protocols` (0 tier-1, 0 new tier-2, 17 baselined); `./validate_migrations`; `./validate_queries` (63 cases); `./validate_fresh_boot` (22 specials as empty bases, every checkbox on); `./validate_indicator_migration ~/wb-fastr-dev-main-before-086.sql.gz` (PASS, 15 raws: 7 folded, 8 new bases, 2 sums, 1 derived special renamed; 371,087 data rows, 2,085 ledger rows, 11 run rows, 37 version rows); the step-1 grep extended to `client/src` at zero with word boundaries (substring form: `resource_id` in `_main_database_types.ts:223` and `offerIndicatorSource` in the visualization CF editor, other concepts); gate 2 word-boundary at zero outside migrations except the `is_default` comment gate 2 excludes; gate 1 at zero. The boot: the dev database was at `086_indicators_one_table` (18 bases, 2 sums, 5 derived, 371,087 data rows, none of the old tables); the server was started the way `./run` starts it (Valkey up on 7379), applied no migration, listened on port 8000 after 8 s, answered `GET /` with 200, and was stopped; port 8000 is free. The browser exercise of the step-2 gate is taken from the Do session's §8 row, as the gate says; it was not repeated. |
| 2026-09-12 | 2 | Review 2, Deliverable found in the code: the manager's one list with Type via `indicatorTypeLabel` (DHIS2 element, Uploaded, Sum, Derived), Defined by via `definedByText`, the checkbox on every row (`setIncludeInAnalysis`, an `updateIndicator` with nothing else changed), the Special badge and the reference list (`indicators_manager.tsx`); the editor branching on type with the DHIS2 id input locked once set, the member `MultiSelectSearch` over bases, the checkbox, and the ruling 3 line `unanalysedNotice` under the formula (`_edit_indicator.tsx`); the naming step with element, uploaded and derived rows, `namingAssignTarget`, "Already imported as", the chosen-twice refusal (`_naming_step.tsx`), fed by the DHIS2 select form and by the CSV hold's third action (`_csv_needs_review_card.tsx`); the picker's Type and Defined by columns (`_indicator_picker.tsx`); History ("Imported via"), run detail, the By indicator tab and detail ("Re-import this indicator"); one datatable view and no `view` field in the datasets routes (ruling 8); the delete window over `indicatorsToInclude` (ruling 9); the dictionary file as ruling 7's nine columns in `INDICATOR_BATCH_FILE_COLUMNS`, the download writing the same columns and the upload form describing them; SYSTEM_05 and SYSTEM_06 prose for the manager, the naming step, the has-data signal and the imports tabs. The has-data signal: `analysedIdsWithData` over every non-derived row with the ledger's ids, so a sum counts when any member has rows. |
| 2026-09-12 | 2 | **Review 2 finding, Fix 2 item (changes code).** `client/src/components/instance_dataset_hmis/_delete_data.tsx:74`: `err: "You must select at least one admin area"` is a plain English string; the Deliverable asks every string in the surface in three languages, and the sibling line 57 was wrapped in `t3` by this step. Wrap it the same way. The reviewer's scan of the surface for plain-string `text`, `header`, `label`, `placeholder`, `heading`, `title` and `err` props found no other. |
| 2026-09-12 | 2 | **Review 2 finding, Fix 2 item (docs).** `SYSTEM_06_ingestion.md:395`: "fetched only while the By-source tab is showing" survived the paragraph this step rewrote two sentences later ("By indicator is the import ledger"). Step 3's gate greps SYSTEM_06 for "source" and would reach it; since a Fix 2 session runs anyway, rewrite it there as "By indicator tab". Line 89's "by-source union" (the progress JSON's two shapes) and lines 84 to 94's `source` column are ruling 13's second concept and stay for step 4. |
| 2026-09-12 | 2 | Review 2 finding, no change asked. The step-2 grep is not at zero, as the Do session recorded: the remaining hits are `Dhis2RunCredentialsSource` / `credentialsSource`, `run.source` / the ledger item's `source` / `stagingResult.sourceType`, `HmisCsvMappingParams` / the `mappings` key, and `indicatorMappingsVersion` / `baseIndicatorMappingsVersion`, plus the `CommonIndicator` family under ruling 12. Tim's ruling 13 (2026-09-12) moves all of them to step 4, so the gate is read as "at zero outside ruling 13's concepts" for this step; step 4's gate closes it. |
| 2026-09-12 | 2 | Step 2 reviewed: 4 findings (one changes code: the untranslated string; one doc line for the same Fix session; two recorded, no change asked). Next step `Fix 2`. |
| 2026-09-12 | 2 | Fix 2, done by the reviewing agent at Tim's instruction (one session, two steps, as Fix 1 was). `_delete_data.tsx:74` is wrapped in `t3` (en, fr, pt); `SYSTEM_06_ingestion.md:395` reads "By indicator tab". Gates: `deno task typecheck` (server, client, `lint:systems`), `./validate_protocols` (0 tier-1, 0 new tier-2, 17 baselined), the plain-string scan of the surface at zero, `By-source` in SYSTEM_06 at zero. Nothing else changed. |
| 2026-09-12 | 2 | Step 2 fixed. |
| 2026-09-12 | 2 | Review 2 of Fix 2, by a fresh agent. The tree was clean on `tim-branch`. The fix is one commit, `bad87ad3`, touching `_delete_data.tsx`, `SYSTEM_06_ingestion.md` and this file, all in the Surface. Both Fix 2 items are in the code: `_delete_data.tsx:74-78` wraps the admin-area error in `t3` (en, fr, pt), matching its sibling at line 57; `SYSTEM_06_ingestion.md:395` reads "By indicator tab is showing", and `By-source` is absent from SYSTEM_06. Nothing else changed. |
| 2026-09-12 | 2 | Review 2 of Fix 2, gates run by the reviewer, all green: `deno task typecheck` (server, client, `lint:systems`); `deno task test` (93 passed, 0 failed); `./validate_protocols` (0 tier-1, 0 new tier-2, 17 baselined); the step-1 grep extended to `client/src` at zero with word boundaries; gate 2 word-boundary at zero outside migrations except the `is_default` comment gate 2 excludes; gate 1 at zero; the step-2 grep over the three surfaces at zero outside ruling 13's concepts (`credentialsSource` / `Dhis2RunCredentialsSource`, `run.source` / the ledger item's `source` / `sourceType`, `HmisCsvMappingParams` / `mappings`, the two `MappingsVersion` stamps), as the Review 2 row reads it. The boot: the dev database was at `086_indicators_one_table` (18 bases, 2 sums, 5 derived, 371,087 data rows, none of the old tables); the server was started the way `./run` starts it (Valkey up on 7379), applied no migration, listened on port 8000 after 8 s, answered `GET /` with 200, and was stopped; port 8000 is free. |
| 2026-09-12 | 2 | **Review 2 of Fix 2 finding, Fix 2 item (changes code).** `client/src/components/instance_dataset_hmis/_delete_data.tsx:52`: the confirmation passed to `createDeleteAction`, `"Are you sure you want to delete this data?"`, is a plain English string. Review 2's scan covered named props (`text`, `header`, `label`, `placeholder`, `heading`, `title`, `err`) and missed this positional argument. Every other `createDeleteAction` confirmation in `client/src` is wrapped in `t3`, and a wider scan of the step-2 surface for English sentences in string literals outside `en`/`fr`/`pt` keys finds no other live hit (the one other match, `dataset_items_holder.tsx:71`, is a commented-out block). The string predates step 2 (`942ef169`) and was not changed by it; it is a finding because the Deliverable asks every string in the surface in three languages, and the file was touched by both the step and the fix. Wrap it in `t3`. |
| 2026-09-12 | 2 | Step 2 reviewed: 1 finding (changes code: the delete confirmation string). Next step `Fix 2`. |
| 2026-09-12 | 2 | Fix 2 (second), done by the reviewing agent at Tim's instruction (one session, two steps, as Fix 1 and the first Fix 2 were). `_delete_data.tsx:52` wraps the `createDeleteAction` confirmation in `t3` (en, fr, pt). Gates: `deno task typecheck` (server, client, `lint:systems`), `./validate_protocols` (0 tier-1, 0 new tier-2, 17 baselined), the plain-string scan of the surface at zero, every `createDeleteAction` confirmation in `client/src` wrapped in `t3`. Nothing else changed. |
| 2026-09-12 | 2 | Step 2 fixed. |
| 2026-09-12 | 2 | Review 2 of the second Fix 2, by a fresh agent. The tree was clean on `tim-branch`. The fix is one commit, `04d2e7ae`, touching `_delete_data.tsx` and this file, both in the Surface. The item is in the code: `_delete_data.tsx:51-56` passes `t3({ en, fr, pt })` to `createDeleteAction`, matching its two `err` siblings in the same function. Every `createDeleteAction` call in `client/src` now passes a `t3` call, a translation object literal, or a variable; none passes a plain string. The plain-string scan of the step-2 surface (named props and the confirmation argument) finds only the commented-out block at `dataset_items_holder.tsx:71`. Nothing else changed. |
| 2026-09-12 | 2 | Review 2 of the second Fix 2, gates run by the reviewer, all green: `deno task typecheck` exit 0 (server, client, `lint:systems`); `deno task test` (93 passed, 0 failed); `./validate_protocols` (0 tier-1, 0 new tier-2, 17 baselined); the step-1 grep extended to `client/src` at zero with word boundaries; gate 2 word-boundary at zero outside migrations except the `is_default` comment at `run_query/virtual_defaults.ts:113` that gate 2 excludes; gate 1 at zero; the step-2 grep over the three surfaces at zero outside ruling 13's concepts (`credentialsSource` / `Dhis2RunCredentialsSource`, `run.source` / the ledger item's `source` / `sourceType`, `HmisCsvMappingParams` / `mappings`, the two `MappingsVersion` stamps). The boot: the dev database was at `086_indicators_one_table` (18 bases, 2 sums, 5 derived, 371,087 data rows, none of the old tables); Valkey was up in `valkey-local`; the server was started the way `./run` starts it, applied no migration (the JSON sweeps checked 0 transformed), listened on port 8000 after 7 s, answered `GET /` with 200, and was stopped; port 8000 is free. |
| 2026-09-12 | 2 | Step 2 reviewed: pass. Next step `Do 3`. |
