# PLAN A3: one indicator list, sources underneath

Status: OPEN. Rulings agreed (Tim, 2026-09-10; ruling 5 re-ruled the same
day; ruling 12 re-ruled the same day: one SQL migration, no boot-time
transform, shared raws resolved by hand). Supersedes
PLAN_2_DHIS2_INDICATOR_IMPORT.md (its §1 ruling is ruling 8 here; step 1
deletes that file). PLAN_A2 has landed (instance migration 084,
`RESERVED_INDICATOR_IDS`, renamed by ruling 5): generated ids avoid its
reserved words and the validator this plan extends is A2's.

**Next step: Do 4.** Each session sets this line in its final commit. Its
values are `Do N`, `Review N` and `Fix N`; after step 6's review passes the
file is deleted instead of advanced.

All work is on `tim-branch`.

Repos: app and `wb-fastr-site` (help-button text that names raw
indicators). The modules repo is not touched.

Read first: [SYSTEM_05](SYSTEM_05_facilities_indicators.md) "Derived
commons", "Computability", "Client state & wizard";
[SYSTEM_06](SYSTEM_06_ingestion.md) HMIS CSV and DHIS2 import;
`lib/types/indicators.ts`; `lib/types/dataset_hmis_import.ts` (every
stored JSON shape that carries a raw id); `server/db/instance/indicators.ts`;
`server/db/instance/dataset_hmis_import_runs.ts` (`validateRunSelection`,
`resolveDatasetHmisCsvReview`, the enqueue path);
`server/worker_routines/import_hmis_data_dhis2/{dispatch,scheduler,worker}.ts`;
`server/worker_routines/import_hmis_data_csv/{stage_csv,worker}.ts`;
`server/db/project/datasets_in_project_hmis.ts` (the extract's `base`
filter); `server/db_startup.ts` (the new-database seed);
`server/runs/indicator_catalog.ts` (the sort-order backfill old packages
read); `lib/table_structures/indicators.ts`;
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) (column rename
and named-constraint guards, "Dropping a table that older migrations
touch"); instance migrations 079 (a data move with `RAISE` fail-stops in
one SQL file) and 084 (a fleet-sweep guard), the two precedents ruling 12
follows.

## 0. How to work this plan

The whole instruction to a fresh agent is: **"Do the next step of
PLAN_A3_ONE_INDICATOR_LIST.md."** Everything else is here.

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
the step should have produced (deviations, facts found wrong, defects
found by running the app). Each finding is one row in §8 with the file and
line, followed by the closing row. The review ends with the **Next step**
line set to `Do N+1` if there are no findings that change code, or `Fix N`
if there are. After step 6's review passes, the reviewer deletes this file
in its last commit instead of setting the line. Then it stops.

**A Fix session** is a Do session whose work list is the review's findings
in §8 and nothing else. It ends with its closing row and the line set to
`Review N`.

**Every session edits exactly two things in this file:** the **Next step**
line and §8. It never rewrites a ruling, a step section or a fact, even
one it has shown to be wrong; it records the disagreement in §8, and the
code wins. The edit to this file rides the session's last commit, so the
tree and the plan always agree. If a session cannot finish, it leaves the
tree green at the last good commit, records in §8 exactly what is done
and what is not, leaves the **Next step** line unchanged, and says so. The
deletion of this file after step 6's review is the one exception to the
two-things rule.

Rules that bind every step:

- **The step ends green and booting.** `deno task typecheck`, `deno task
  test`, `./validate_protocols`, and `./run` starting against the dev
  database are the floor. A step that touches migrations also passes
  `./validate_migrations`; one that touches the query engine also passes
  `./validate_queries`. The step's own gates in §4 come on top. Every gate
  is something the reviewer can run: a script in the repo, a `deno task`,
  or a harness file the Do session committed (under `server/tests/` or as
  a named root-level `validate_*` file), never a one-off the doer ran and
  described. Where a step's Gates say "a harness", the harness is a
  committed file.
- **Touch only the surface the step names.** A typecheck error outside
  that surface is reported, not fixed. A rename, a cleanup, or a deletion
  that the step does not list waits for the step that does.
- **Where this plan and the code disagree, the code wins** and §8 records
  it. A ruling in §3 is overruled only by Tim, in §3, before the step that
  depends on it.
- **Docs move with the code.** `lint:systems` fails the typecheck when a
  file is not claimed by exactly one SYSTEM manifest, so globs change in
  the step that adds, moves or deletes the file. Prose in the SYSTEM file
  for a changed contract is rewritten in the same step, not deferred to
  step 6.
- **Append to the build log (§8) before committing.** Every deviation from
  §2 or §3, every fact the step found wrong in this plan, and every defect
  found by running the app goes in the log with the step number and the
  reason. The next agent reads the log first.
- **One thing per session.** Commit with a message that says why. Where a
  step says "several commits", each one is green on its own.
- **Do not ship.** `./deploy_testing` ships the working tree; steps 1 to 3
  are safe to deploy on their own, and §7 says when the rest goes.

Vocabulary is §2's: indicator, base, derived, source, special, reserved.
Until step 4 lands, the code still says raw and common; a step before 4
uses the code's names for the things it touches and never renames ahead
of step 4.

## 1. The problem

A DHIS2 data element enters the dictionary as a raw whose id is the DHIS2
UID. To use it in a formula the user must create a common and map the raw
into it; to import data for a derived indicator the user must remember
which raws its ingredients were mapped from and re-select them (Caitlin,
2026-09-10). Uganda has 468 raws, 260 of them unmapped. CSV countries have
the same ceremony: an unknown indicator id in a data file is dropped at
staging instead of becoming an indicator.

Underneath, the ids the module scripts read by name (`anc1`, `penta1`,
`delivery`, ...) are a hand-kept list in `lib/table_structures/indicators.ts`
that has drifted from the registry scripts: `ipd`, `new_fp` and
`pnc1_newborn` are seeded and read by no registry script (`new_fp` is read
only by the frozen m007); `pnc1`, `rdt_positive` and `micro_positive` are
read by m001/m004/m005 and seeded nowhere, as are eight other count ids
m001, m004 and m005 filter on (ruling 5 lists them). Nothing fails on the
missing ones: a module reading an id the instance lacks sees no rows, which is
the ordinary case for any unmapped common today. The list's only job is to
give a fresh instance the ids the scripts read, with labels, so the naming
step can offer them.

## 2. The model

An **indicator** is `base` or `derived`. A base is an additive monthly
series defined by one or more **sources**; its sources are summed at
extract and the sum goes through m001/m002 adjustment. A derived is an
expression over indicators and population terms, evaluated after
aggregation (m012). A **source** is one DHIS2 data element or operand (id
= the UID or `UID.UID`) or one CSV indicator column (id = the value in
the file), and it belongs to exactly one base. A **special indicator** is
an id a registry module script reads by name; it may exist only as a
base, and a new database is seeded with each as an empty base. A
**reserved word** is an identifier no indicator id may be, however the id
is produced (typed, generated, batch-uploaded, decomposed from DHIS2, or
written by the migration): the special ids (except as a base), the
population type ids and the expression function names.

Terminology is exactly that: indicator, base, derived, source, special,
reserved. No "raw", no "common", no "seed", no "default", no `is_default`.

## 3. Rulings

1. **One list.** The dictionary is one UI list with a Type column and, for
   a base, its sources. The raw tab, raw editor, raw batch upload,
   `indicators_raw` and `indicator_mappings` are deleted.
2. **Two tables.** `indicators` (as today, minus `is_default`, ruling 5)
   and `indicator_sources (source_id PRIMARY KEY, indicator_id NOT NULL
   REFERENCES indicators ON DELETE CASCADE, source_label NOT NULL,
   updated_at)`. `dataset_hmis.source_id REFERENCES indicator_sources ON
   DELETE RESTRICT DEFERRABLE` (deferrable as the FK it replaces), under
   the named constraint `dataset_hmis_source_id_fkey` in both
   `_main_database.sql` and the migration (the validator compares the
   fresh replay byte for byte), so data never exists without an owner and
   deleting a base with data is refused with the friendly pre-check
   `deleteIndicatorRaw` has today. `dataset_hmis_import_ledger.source_id`
   CASCADEs as it does from `indicators_raw` now, and the ledger's
   deleted-mid-wizard join moves to the new table. No `source_kind`
   column: the DHIS2 dispatcher classifies ids against live DHIS2 metadata
   at run time and keeps no stored type to drift (`dispatch.ts`), and CSV
   sources are whatever the file said.
3. **A source belongs to exactly one base.** Enforced by the primary key.
   A second use of the same element is a derived over the first.
4. **Every name is the new name, and one-route shapes.** `indicator_raw_id`
   becomes `source_id` in `dataset_hmis`, the ledger and every TS type,
   and `raw_indicator_id` becomes `source_id` in the per-run CSV staging
   tables `stage_csv.ts` creates (code, not schema: they are created and
   dropped by the import); `rawIndicatorIds` / `indicatorRawId` /
   `raw_indicator_id` become `indicatorIds` / `sourceId` / `source_id` in
   `Dhis2RunSelection`, `Dhis2ScheduleSelection`, `Dhis2RunPair`,
   `PeriodIndicatorRawStat`, `DatasetDhis2StagingResult`,
   `Dhis2PairFetchStat`, `DatasetHmisImportRunProgress`,
   `DatasetHmisImportRunStats`, `HmisCsvMappingParams` and the datatable
   windowing types. With one fetch route (ruling 9) the `route` field on
   pair stats and progress, the `Dhis2RunRoute` type and
   `classification.computedIndicators` go. These are STORED JSON
   (`dataset_hmis_import_runs.selection` / `run_stats` / `progress` /
   `csv_config`, `dataset_hmis_versions.staging_result`, schedule rows),
   read with `parseJsonOrThrow` (a bare cast), so the rename ships with
   the JSON rewrite in migration 086 (ruling 12) or the history tab
   crashes on every old row.
5. **Special indicators and reserved words.** `SPECIAL_INDICATOR_IDS` in
   `lib/special_indicators.ts` is the hand-kept list of HMIS count ids the
   registry scripts read by name, with three-language labels: `anc1`,
   `anc4`, `delivery`, `sba`, `bcg`, `penta1`, `penta3`, `measles1`,
   `measles2`, `opd`, `pnc1`, `pnc1_mother`, `rdt_positive`,
   `micro_positive`, `confirmed_malaria_treated_with_act` (m001 adds its
   malaria pair only when all three exist), `rota1`, `rota2`, `opv1`,
   `opv2`, `opv3`, `vitaminA`, `fully_immunized` (m004/m005). `ipd`,
   `new_fp` and `pnc1_newborn` leave: no registry script reads them.
   `nmr` and `imr` stay out: m004/m005 list them but they are survey
   mortality rates, not counts. A special id may exist only as a base:
   the modules read it as a count, so a derived under that id would be
   silently ignored. `RESERVED_WORDS` (A2's `RESERVED_INDICATOR_IDS`,
   renamed here because population type ids and function names are not
   indicators) is the union: special ids + population type ids +
   expression function names. From the two constants:
   - **validator**, in lib, one function on every path that writes an
     indicator id (editor, server routes, batch upload, the naming step,
     DHIS2 decomposition), without the `kind` parameter: an id in
     `RESERVED_WORDS` is refused, except a special id for a base; a
     special id is refused for a derived at create and at retype; a
     source id keeps only the charset rule;
   - **id generator** (ruling 10): a generated id in `RESERVED_WORDS`
     takes the `_2` suffix, so a generated id never reaches the validator
     as a reserved word;
   - **migration guard** (ruling 12): 086 fail-stops on a derived row
     under a special id, the same way 084 fail-stops on a reserved one;
   - **manager**: a badge on a special row and the reference list of
     special ids and reserved words;
   - **new-database seed**: each special inserted as an empty base, as
     `_COMMON_INDICATORS` does today. Existing instances get nothing on
     boot; a team adds or deletes specials as it likes, and deleting one
     is refused only by ruling 2's data pre-check like any base.
   No module guard and no declaration in the module definitions.
   `is_default` is dropped everywhere it is read (delete guard, batch
   replace, the manager's badge, the m012 parity test fixture in
   `server/tests/`); it is in no manifest, project database or
   `IndicatorMetadata`. The sort-order backfill
   `backfillCommonIndicatorSortOrder` moves into
   `server/runs/indicator_catalog.ts` over a frozen copy of today's
   14-id order, since manifest transforms of immutable old packages read
   it and the special list may change; `lib/table_structures/indicators.ts`
   is deleted.
6. **Ids are chosen at creation and are immutable after.** The id is the
   column key in every results package, expression, figure snapshot and AI
   tool call. Creation is a naming step in both import paths, one shared
   component: each candidate shows a proposed id (ruling 10) editable
   inline, or "add as a source of an existing base".
   - **DHIS2 select form**: selecting elements or operands creates the
     bases and their sources in one transaction on save. **A source must
     be an additive monthly count by DHIS2's own metadata**: the element's
     `aggregationType` is `SUM`, its `valueType` is `NUMBER` or one of the
     `INTEGER*` types (`PERCENTAGE`, `UNIT_INTERVAL` and every non-numeric
     type are refused), and its period type is `Monthly` (the search
     fetches `dataSetElements[dataSet[periodType]]`, which it does not
     today; an element in no data set has no period and is refused). An
     operand is checked through its element. Refusals show in the list
     with the reason, before naming. `NUMBER` is accepted because it is
     the DHIS2 editor's default value type and most real count elements
     carry it; integrality is enforced per value at import (ruling 9).
     The search endpoints already fetch `aggregationType` and `valueType`
     and nothing reads them today. CSV sources carry no metadata and are
     the user's file.
   - **CSV data run**: the `needs_review` hold (the worker parks a run
     there when staging drops rows and releases the import slot; its
     actions live in `_csv_needs_review_card.tsx`) gains a third action
     beside "Integrate anyway" and "Discard": "Create indicators for the
     unknown ids and re-stage". The hold stores the full distinct
     unknown-id set on the run row (today's diagnostics cap the sample at
     10). The action creates the indicators, then relaunches the same run
     through the full stage leg: the hold keeps only the final staging
     table, so re-stage reads the asset again and refuses if the asset no
     longer matches its pin; it writes `csv_config` without
     `resumeFromStaging` and reuses the claim-or-queue logic of
     `resolveDatasetHmisCsvReview`.
7. **Import selects indicators; sources are expanded where pairs are
   enumerated.** Window and schedule selections carry `indicatorIds`.
   `validateRunSelection` (shared by launch, enqueue and the scheduler's
   fire path) expands them: derived → flattened base ingredients (the
   resolver) → their sources, population terms and non-DHIS2-shaped
   sources dropped with a count in the run detail. The expansion is
   persisted on the run row's `selection` as `sourceIds` (the summary
   projection passes window selections through unchanged; the history
   label shows the indicator count with the source count beside it) and
   carried in the worker message, so the worker and the history tab never
   re-resolve. A queued run reuses its enqueue-time `sourceIds` (its
   `total_pairs` was recorded then, and the launch total must equal the
   worker's list), so a source added to a base after enqueue is not in
   that run. `pairs` selections (retry failed, re-import from the ledger)
   stay at source grain: that is what a pair is.
8. **DHIS2 indicators are decomposed, never imported as values** (PLAN_2
   §1). The importer accepts an indicator by WHITELIST: its numerator and
   denominator each parse as `#{uid}` and `#{uid.coc}` terms, numeric
   literals, `+ - * /` and parentheses, with any whitespace between
   tokens; the indicator is not `annualized`; every element passes ruling
   6, which by requiring a monthly period type also excludes yearly
   population denominators (a population term is never created by this
   importer; the DHIS2 population writer is out of scope, §6); and
   `indicatorType.factor` is 1 (`number`), 100 (`percent`), 10000
   (`rate_per_10k`) or 1000 (`number` with a note in the decomposition
   summary; a `rate_per_1k` display format touches the DB check, the
   manifest schema, the figure bundle, the value scale and four style
   editors and is an Open item in SYSTEM_05). Then the operands become
   bases with sources (or attach to an existing base through the naming
   step), and the indicator becomes a derived with expression
   `(numerator) / (denominator)`. Everything outside the whitelist is
   refused with the offending term shown: three-part operands
   `#{uid.coc.aoc}` and wildcards `#{uid.*.aoc}`, item modifiers
   (`.aggregationType()`, `.periodOffset()`, `.yearToDate()`, `.minDate()`,
   `.maxDate()`), nested indicators `N{}`, program items `D{}` `A{}`
   `I{}`, reporting rates `R{}`, org-unit-group counts `OUG{}`, constants
   `C{}`, `[days]`, operators outside the four (`^`, `%`, comparisons,
   `&&`, `||`), every function (`if`, `isNull`, `greatest`, `least`,
   `log`, `firstNonNull`, `subExpression`, the `d2:` family), and any
   other factor. A blacklist would miss the next form DHIS2 adds. The
   search routes this lands on are `server/routes/instance/indicators_dhis2.ts`,
   which already fetch numerator, denominator, `annualized` and the
   factor.
9. **The analytics fetch route is deleted.** The importer has one way to
   read DHIS2: `dataValueSets`, the values facilities reported, with no
   DHIS2-side formula. A source that classifies as a DHIS2 indicator (or
   any other `dx` item type: program indicator, reporting rate, event
   item) becomes a permanent ledger error naming the decomposition
   importer; its existing data stays. Which sources those are is only
   knowable against live DHIS2 metadata, so the first post-deploy run's
   ledger is the listing, and those series stop refreshing until
   re-created through ruling 8. Deleted with the route:
   `server/dhis2/goal3_analytics` and its barrel export,
   `assertUrlWithinLimit`, `MAX_URL_LENGTH`, the "exceeds safe limit" and
   "unrecognized headers" branches of `describeFetchError`, and
   `DHIS2_FACILITY_BATCH_SIZE` (env var, `.env.example`, worker), all of
   which exist only for that path. **Values**: a facility value that is
   not a non-negative integer is skipped and counted on the ledger row
   (`skipped_values` count plus a capped sample of facility and value),
   the pair still integrates and stays `ready`, and the run detail and
   By-indicator tab show the count. Failing the whole pair would block a
   source-month for every facility in the country on one facility's
   decimal, deterministically, until DHIS2 changes the value; the pull is
   per element per month for all facilities and the ledger has no
   per-facility grain, so skip-and-record is the only shape that keeps
   refresh alive and the anomaly visible. The stored `count` therefore
   remains a non-negative integer by construction, and nothing truncates.
10. **Id generation lives in lib** so the client previews exactly what the
    server writes: NFKD-fold, lowercase, non `[a-z0-9]` runs → `_`, trim
    `_`, prefix `i_` when the result starts with a digit, truncate to 64
    (generated ids only; the validator's 128 maximum for typed ids is
    unchanged); an empty result falls back to `i_` + the source id slugged
    the same way; then `_2`, `_3` on collision with an existing id or a
    reserved word (ruling 5's union). Migration 086 (ruling 12) applies
    the same rule in PL/pgSQL for the bases it creates from unmapped
    raws; the two spellings must agree, and the harness in §5 checks
    that they do.
11. **Batch dictionary upload is one file**: `indicator_id, label, type,
    sources, expression, format_as, thresholds`; `sources`
    semicolon-separated for a base, empty for a derived. Replace refuses
    with a listing when it would remove a source with data or an id
    another expression names; upsert keeps `sort_order`. The download
    mirrors the file.
12. **Migration: one SQL file, 086, no boot-time transform.** The
    runner wraps each migration in one transaction and records it only
    on success (`server/db/migrations/runner.ts`), so a `RAISE` anywhere
    in 086 leaves the old tables, columns and image untouched, exactly as
    079 and 084 behave. `db_startup.ts` is not changed and
    `INSTANCE_DATA_TRANSFORMS` gains nothing: the protocol assigns table
    and column changes to SQL migrations, and every rule below is plain
    SQL or PL/pgSQL. `./validate_migrations` covers 086 on the fresh
    replay, where every statement is a guarded no-op.
    - **Hand resolution before deploy, guarded by 086.** The fleet sweep
      of 2026-09-10 found 107 raws mapped to more than one common on 17
      instances (Uganda 27, Sierra Leone 18, Ethiopia 10, Ghana 9, RCA
      and Mozambique 6 each, Burkina Faso 4, demo and Somaliland 3 each,
      Malawi and demo-fr 2 each, Côte d'Ivoire, Kenya, RDC, Mauritania,
      Nigeria, Zambia and Tchad 1 each) and one derived row under a
      special id (`anc1` on demo). Each is resolved in the manager before
      deploy by someone who knows the data: the raw stays mapped to one
      common and any other common that summed it is rewritten as a
      derived over its parts. That choice moves adjustment from the sum
      to the parts and changes the derived's value slightly from its
      next package on, which is why a person makes it and not a rule.
      086 then fail-stops, with the listing, on any raw still mapped to
      more than one common, any mapping onto a derived, and any derived
      row under a special id, the way 084 fail-stops on a reserved id.
      One image ships fleet-wide, so every instance must be clean first
      (§5).
    - **What 086 does**, in order, in its one transaction: create
      `indicator_sources`; the guards above; every mapped raw becomes the
      source of its one common; every unmapped raw becomes a new base
      (id by ruling 10 in PL/pgSQL from the raw label, label = raw label)
      with the raw as its sole source, about 260 in Uganda (one with
      data) and 109 in Ethiopia (all with data), the manager's bulk delete
      removing what a team does not want; `ALTER TABLE ... RENAME COLUMN
      indicator_raw_id TO source_id` on `dataset_hmis` and the ledger,
      guarded on column existence (the protocol's rename pattern: O(1),
      keeps the primary key and the five indexes); drop the old FKs to
      `indicators_raw`, found through `pg_constraint.confrelid` rather
      than by name, since the base schema never named them; add the new
      FKs under their `_main_database.sql` names, guarded on
      `pg_constraint`; drop `indicators.is_default`; rewrite the stored
      JSON (ruling 4) with jsonb: run rows get `indicatorIds: []` and
      `sourceIds` = the old raw ids, pair, stat and progress keys are
      renamed and the `route` / `computedIndicators` fields stripped,
      schedule selections are rewritten to the ids of the bases now
      owning their sources (zero rows fleet-wide today), CSV configs
      rename the mapping key; `RAISE NOTICE` the id table (old raw id →
      owning base; new bases) so a team can find what its elements
      became; `DROP TABLE` `indicator_mappings` then `indicators_raw`.
    - **Fresh replay.** Older migrations that name the old tables or
      columns get table-existence guards so the replay passes, the one
      sanctioned edit of an applied migration ("Dropping a table that
      older migrations touch" in the protocol): 003's two index creations
      on `indicator_mappings`, 056's ledger backfill INSERT (its `CREATE
      TABLE IF NOT EXISTS` is skipped before the FK is resolved, but the
      INSERT names `indicator_raw_id` on both tables), and 079's
      id-charset DO block. 079's `is_default` inserts sit after its early
      return and never execute on a fresh replay, and 002 is already
      column-guarded.
13. **The HMIS datatable's raw view becomes "by source".** Same query,
    keyed by `source_id`; the toggle label changes.
14. **Client cache name** bumps to `instance_indicators_v4` (its own
    convention for a payload-shape change). No Valkey prefix exists for
    the dictionary, and no slide-config sweep: `IndicatorMetadataDisplay`
    never carried type or sources and packages are immutable. The
    datatable caches key on the base-only stamp, which now hashes
    `indicators` base rows plus `indicator_sources.updated_at` and counts,
    so a derived edit still does not churn them; 086's source inserts
    churn them once.

## 4. Steps

Six steps. Each row is one Do session followed by one Review session, plus
a Fix and another Review when a review fails (§0). Sessions are serial, in
table order. The old §4 order (schema, lib, server, client, each green)
could not hold: a lib rename breaks server and client in the same instant.
These steps are vertical instead. Steps 1 to 3 need nothing from the
dictionary change and ship on their own; they exist to make step 4 as
small as it can be.

| Step | Name | Depends on | Ships alone? | The one thing it proves |
| --- | --- | --- | --- | --- |
| 1 | Lib foundations | none | yes | rulings 5 and 10 exist as pure functions with harnesses |
| 2 | One fetch route, skip-and-record | none | yes | ruling 9, with the ledger recording skipped values |
| 3 | Source eligibility and decomposition | none | yes | rulings 6 and 8 as pure functions, the search route carrying the verdict |
| 4 | The switch | 1, 2, 3 | no | one list, two tables, 086 applied on the dev database and every fleet dump |
| 5 | Naming step, CSV re-stage | 4 | no | a DHIS2 element or CSV column becomes an indicator through one component |
| 6 | Docs read-through and close | 5 | no | the repo and the site read as written today |

Format of each step: **Surface** (the files and areas it may touch;
anything else is out of bounds), **Deliverable**, **Not in this step**,
**Gates** (on top of the §0 floor), **Ends with** (what is true when the
session stops).

**Intermediate states the build passes through.** Each is listed with the
step it appears in and the step that removes it, so no agent mistakes it
for the end state or closes it early.

| State | From | Until |
| --- | --- | --- |
| The validator has ruling 5's shape but raw ids still exist; raw ids call the source-id charset rule | 1 | 4 |
| `db_startup` seeds `SPECIAL_INDICATOR_IDS` with `is_default = TRUE`, since the column still exists | 1 | 4 |
| Old run rows carry `route` and `computedIndicators` keys that no type names; nothing reads them | 2 | 4 (086 strips them) |
| The search route returns each element's eligibility verdict and each indicator's decomposition; no client reads them | 3 | 5 |
| The DHIS2 select form creates one base per selected element with the ruling 10 id and the element as its source, with no inline edit, no "add as a source of an existing base", and no metadata refusal | 4 | 5 |
| A CSV `needs_review` hold still offers only "Integrate anyway" and "Discard" | 4 | 5 |

### Step 1: Lib foundations

**Surface.** `lib/special_indicators.ts` (new), `lib/indicator_id.ts`
(new), `lib/types/indicators.ts` (`RESERVED_WORDS` replaces
`RESERVED_INDICATOR_IDS`; the validator per ruling 5), the validator's
callers as they stand today (`server/db/instance/indicators.ts`,
`server/routes/instance/indicators.ts`,
`client/src/components/indicator_manager_hmis/{_edit_indicator_common,
_edit_indicator_raw,batch_upload_form}.tsx`, and any other file
`grep -rn getNewIndicatorIdIssue` lists), `lib/table_structures/indicators.ts`
(deleted), `server/runs/indicator_catalog.ts` (the frozen 14-id order and
`backfillCommonIndicatorSortOrder` move here), `server/db_startup.ts` (the
new-database seed reads `SPECIAL_INDICATOR_IDS`),
`lib/common_indicator_catalog.ts` (the comment that says the seed runs on
every instance), the harness files under `server/tests/`, SYSTEM_05 and
SYSTEM_06 globs and prose for the files added, moved and deleted,
`PLAN_2_DHIS2_INDICATOR_IMPORT.md` (deleted; its population writer moves
to SYSTEM_05 Open items, §6).

**Deliverable.** Ruling 5's `SPECIAL_INDICATOR_IDS` with three-language
labels and `RESERVED_WORDS`; ruling 10's generator; the validator without
`kind`, refusing a reserved word, accepting a special for a base and
refusing it for a derived, a source id checked by the charset rule only;
every caller compiles against the new signature; a fresh database seeds
exactly the special list; `lib/table_structures/indicators.ts` is gone and
old packages still backfill their sort order from the frozen copy.

**Not in this step.** Any schema change. Any rename of raw or common.
`is_default` (step 4).

**Gates.** A harness under `server/tests/` for the generator (accents,
punctuation, leading digits, empty, collisions with an existing id and
with a reserved word, the 64 cap, the `i_` prefix and fallback) and for
the validator (a reserved word refused; a special accepted as a base and
refused as a derived; a source id passing the charset rule only). A
fresh-postgres boot (`db_startup` against an empty database) exits 0 and
`SELECT indicator_common_id FROM indicators` on it equals the special
list. `grep -rn "_COMMON_INDICATORS\|table_structures/indicators"
server lib client/src` at zero.

**Ends with.** One or two commits. The tree is deployable on a normal
release; the only user-visible change is the seed on a new instance.

### Step 2: One fetch route, skip-and-record

**Surface.** `server/worker_routines/import_hmis_data_dhis2/{dispatch,
worker}.ts`, `server/dhis2/goal3_analytics/**` (deleted),
`server/dhis2/mod.ts`, `server/exposed_env_vars.ts`, `.env.example`,
`lib/types/dataset_hmis_import.ts` (`Dhis2RunRoute`, the `route` field on
`Dhis2PairFetchStat` and `DatasetHmisImportRunProgress`, and
`classification.computedIndicators` go; `skipped_values` and its sample
arrive on the ledger item), `server/db/instance/dataset_hmis_import_ledger.ts`,
`server/db/instance/_main_database.sql` and
`server/db/instance/_main_database_types.ts` (the two ledger columns),
`server/db/migrations/instance/085_ledger_skipped_values.sql` (new), the
files under `client/src/components/instance_dataset_hmis/imports/` that
render `route` or `computedIndicators` today and the two that show the
skipped count (`_run_detail.tsx`, `_tab_by_indicator.tsx`), a harness
under `server/tests/`, SYSTEM_06 and SYSTEM_07 globs and prose.

**Deliverable.** Ruling 9 whole: `dispatch.ts` classifies to `dvs` or
`unknown` only, an id that is a DHIS2 indicator or any other `dx` item is
a permanent ledger error naming the decomposition importer; the analytics
directory, its export, `assertUrlWithinLimit`, `MAX_URL_LENGTH`, the
"exceeds safe limit" and "unrecognized headers" branches of
`describeFetchError`, and `DHIS2_FACILITY_BATCH_SIZE` are gone; a facility
value that is not a non-negative integer is skipped, counted on the ledger
row with a capped sample, the pair integrates and stays `ready`, and the
run detail and By-indicator tab show the count. 085 adds the two ledger
columns, idempotently, and the base schema carries them.

**Not in this step.** Anything named raw or common. The JSON strip of
`route` / `computedIndicators` on old run rows (086, step 4).

**Gates.** `./validate_migrations`. A harness under `server/tests/` for
skip-and-record: a fractional and a negative facility value are skipped,
counted and sampled, the pair integrates. `grep -rn
"goal3_analytics\|DHIS2_FACILITY_BATCH_SIZE\|assertUrlWithinLimit\|
MAX_URL_LENGTH\|Dhis2RunRoute\|computedIndicators" server lib client/src
.env.example` at zero.

**Ends with.** One or two commits. Deployable on a normal release; the
user-visible change is that sources which were DHIS2 indicators stop
refreshing and say why in the ledger.

### Step 3: Source eligibility and decomposition

**Surface.** `server/dhis2/goal2_indicators/**` (the data-element field
list gains `dataSetElements[dataSet[periodType]]`; two new pure modules:
the eligibility check of ruling 6 and the decomposition parser of ruling
8), `lib/types/indicators.ts` (`DHIS2DataElement` carries the period
type; a verdict type and a decomposition result type),
`lib/api-routes/instance/indicators_dhis2.ts` and
`server/routes/instance/indicators_dhis2.ts` (the search responses carry
the verdict per element and per operand and the decomposition per
indicator), harnesses under `server/tests/`, SYSTEM_07 globs and prose.

**Deliverable.** Ruling 6's check as a pure function over the element's
metadata (`aggregationType`, `valueType`, period type; an operand through
its element) returning accepted or a reason. Ruling 8's parser as a pure
function over numerator, denominator, `annualized` and the factor,
returning the operand list, the expression and the format, or the
offending term. Both reachable through the search routes, additively.

**Not in this step.** Any client change. Creating anything.

**Gates.** Harnesses under `server/tests/`: the metadata check (each
non-SUM aggregation type, each non-numeric or fractional value type, each
non-monthly or absent period type refused; `NUMBER` with SUM accepted;
operands checked through their element) and decomposition (factor
1/100/1000/10000, another factor refused, annualized refused, whitespace
accepted, one case per non-whitelisted term in ruling 8).

**Ends with.** One commit. Deployable on a normal release; nothing
user-visible changed.

### Step 4: The switch

**Surface.** `server/db/instance/_main_database.sql`,
`server/db/migrations/instance/086_indicator_sources.sql` (new) and the
guards on `003`, `056` and `079`, `server/db/instance/_main_database_types.ts`,
`lib/types/{indicators,dataset_hmis_import,dataset_hmis,instance,
instance_sse}.ts`, `lib/api-routes/instance/{indicators,datasets}.ts`,
`lib/common_indicator_catalog.ts`, `server/db/instance/{indicators,
instance,dataset_hmis,dataset_hmis_import_runs,dataset_hmis_import_ledger}.ts`,
`server/db/project/datasets_in_project_hmis.ts`, `server/db_startup.ts`
(the seed loses `is_default`), `server/worker_routines/import_hmis_data_dhis2/
{dispatch,scheduler,worker,instantiate_worker}.ts`,
`server/worker_routines/import_hmis_data_csv/{stage_csv,worker,
integrate_staged,instantiate_worker}.ts`, `server/routes/instance/
{indicators,indicators_dhis2,datasets,health}.ts`,
`server/tests/m012_expression_parity_test.ts`,
`client/src/components/indicator_manager_hmis/**`,
`client/src/components/instance_dataset_hmis/**`,
`client/src/components/WindowingSelector.tsx`,
`client/src/components/instance/instance_data.tsx`,
`client/src/state/instance/{t1_store,t2_indicators,t2_datasets}.ts`, a
root-level `validate_indicator_sources` script (new) and harnesses under
`server/tests/`, SYSTEM_05 and SYSTEM_06 globs and prose (including the
"seeds all 14" and `is_default` sentences).

**Deliverable.** Rulings 1, 2, 3, 4, 7, 11, 12, 13 and 14 whole. 086 as
ruling 12 spells it, with the fresh replay green. One CRUD in
`db/instance/indicators.ts` writing sources in the indicator's
transaction; the batch file of ruling 11; both stamps over the two
tables; the extract joining sources; the windowed delete and the by-source
datatable; `validateRunSelection` expanding indicators to sources and
persisting `sourceIds` on the run row and in the worker message; the CSV
staging column renamed; every stored JSON shape under its ruling 4 name;
`is_default` gone from every reader; the manager as one list with the
Type column, the sources under a base, the special badge and the
reference list; the raw tab, raw editor and raw batch form deleted; the
picker, wizard, history, current, future, run views and ledger detail
reading indicators and sources; the DHIS2 select form creating one base
per element with the ruling 10 id (the intermediate state above); the
cache name `instance_indicators_v4`.

**Not in this step.** The naming component, inline id editing, "add as a
source of an existing base", the metadata refusals in the list, the
decomposition flow, the CSV third action (step 5). The site help text
(step 6).

**Gates.** `./validate_migrations`. `./validate_queries`. A fresh-postgres
boot exits 0 with the special list as empty bases. 086 applied to the dev
database boots and the manager lists every former raw as a source or a
base. `validate_indicator_sources <dump>...`: restores each given `main`
dump into a scratch container, applies the migrations, and asserts the
§5 replay list; run over dumps of every instance (§7) and the output
recorded in §8 by instance. Harnesses under `server/tests/` for ruling 7:
a derived selection expands to sources with a population term and a
non-DHIS2-shaped source dropped and counted; a queued run launched after
a source is added does not include it. `grep -rn "indicators_raw\|
indicator_mappings\|indicatorRawId\|rawIndicatorIds\|raw_indicator_id\|
IndicatorRaw\|is_default\|rawIndicatorsToInclude" server lib client/src`
at zero outside `server/db/migrations/**` (DHIS2's
`categoryCombo.isDefault` in `lib/types/indicators.ts` is not a hit; it
stays).

**Ends with.** Several commits, each green on its own where the step
allows it; the base schema, 086, the DB layer and the extract land in
one. Not deployable alone: the select form has no naming UI and the CSV
hold has no third action.

### Step 5: Naming step, CSV re-stage

**Surface.** `client/src/components/indicator_manager_hmis/**` (the
naming component; `dhis2_indicator_select_form.tsx` becomes the naming
step over it), `client/src/components/instance_dataset_hmis/imports/
{_csv_needs_review_card,_csv_staging_summary,_csv_wizard}.tsx`,
`lib/api-routes/instance/{indicators,indicators_dhis2,datasets}.ts`,
`server/routes/instance/{indicators,indicators_dhis2,datasets}.ts`,
`server/db/instance/{indicators,dataset_hmis_import_runs}.ts` (the
create-from-DHIS2 transaction; the re-stage action),
`server/worker_routines/import_hmis_data_csv/{stage_csv,worker}.ts` (the
full unknown-id set on the hold), `lib/types/dataset_hmis_import.ts`
(the hold's diagnostics carry the full set), harnesses under
`server/tests/`, SYSTEM_05 and SYSTEM_06 prose.

**Deliverable.** Ruling 6 whole and ruling 8's user-facing half: one
shared naming component showing each candidate's proposed id editable
inline or "add as a source of an existing base"; the DHIS2 select form
refusing ineligible elements in the list with the reason, decomposing an
indicator into bases and a derived, and creating everything in one
transaction on save; the CSV hold storing the full distinct unknown-id
set and offering "Create indicators for the unknown ids and re-stage",
which creates them through the same component and relaunches the run
through the full stage leg with the asset pin re-checked.

**Not in this step.** The site help text (step 6).

**Gates.** A harness under `server/tests/` for the create-from-DHIS2
transaction (a refused element creates nothing; a decomposed indicator
creates its bases, sources and derived or nothing). The re-stage action
exercised against the dev database with a CSV carrying an unknown id:
the hold shows the full set, the action creates the indicators, the run
re-stages and integrates. Both recorded in §8 with the run id.

**Ends with.** Several commits. Deployable with step 4 once §7's
precondition holds.

### Step 6: Docs read-through and close

**Surface.** SYSTEM_05, SYSTEM_06, SYSTEM_07 prose; `wb-fastr-site` help
text for the indicator manager and the imports;
`lib/help/help_targets.generated.ts` via `deno task build:help-buttons`;
this file.

**Deliverable.** Every SYSTEM sentence that says raw, common, mapping,
seed, default or `is_default` about the HMIS dictionary reads as §2;
the site help text names indicators and sources; the generated help
targets rebuilt; nothing else changes.

**Not in this step.** Code.

**Gates.** `grep -rni "raw indicator\|indicator_mappings\|indicators_raw\|
is_default" SYSTEM_05_facilities_indicators.md SYSTEM_06_ingestion.md
SYSTEM_07_dhis2.md` at zero. `deno task build:help-buttons` leaves the
tree unchanged when run twice.

**Ends with.** One commit here and one in `wb-fastr-site`. The review
that passes this step deletes this file in its last commit.

## 5. Gates catalogue

The §0 floor applies to every step. These are the whole-plan gates; the
step that first reaches zero is named, and every later step keeps it
there.

1. `grep -rn "_COMMON_INDICATORS\|table_structures/indicators" server lib
   client/src` at zero. Step 1.
2. `grep -rn "goal3_analytics\|DHIS2_FACILITY_BATCH_SIZE\|
   assertUrlWithinLimit\|MAX_URL_LENGTH\|Dhis2RunRoute\|computedIndicators"
   server lib client/src .env.example` at zero. Step 2.
3. `grep -rn "indicators_raw\|indicator_mappings\|indicatorRawId\|
   rawIndicatorIds\|raw_indicator_id\|IndicatorRaw\|is_default\|
   rawIndicatorsToInclude" server lib client/src` at zero outside
   `server/db/migrations/**`. Step 4.
4. `./validate_migrations` green: the fresh replay across the guarded
   003/056/079, 085 and 086 as no-ops. Steps 2 and 4.
5. Fresh-postgres boot exit 0 with the special list as empty bases.
   Steps 1 and 4.
6. `validate_indicator_sources` over a dump of every instance's `main`
   database (PROTOCOL_ACCESS_DBS), not a sample, since one image ships
   fleet-wide. What it asserts, per dump: an instance still carrying a
   shared raw or a derived special fails with its listing and nothing
   else changes on it (the old tables and columns are intact, the
   migration is not recorded); on a clean instance sources = mapped raws,
   new bases = unmapped raws, every generated id unique, bare,
   unreserved, non-special and equal to what `lib/indicator_id.ts`
   produces for the same label; the extract's per-indicator sums are
   identical before and after for every base; every run row, version row
   and schedule parses after the JSON rewrite with the dropped fields
   gone; a second run of the migrations does nothing. Step 4; re-run
   before rollout (§7).
7. Committed harnesses under `server/tests/` for: id generation and the
   validator (1); skip-and-record (2); the metadata check and
   decomposition (3); selection expansion and the queued-run case (4);
   the create-from-DHIS2 transaction (5). `deno task test` runs them all.

## 6. Out of scope

- The DHIS2 population writer (PLAN_2 §2 second bullet: yearly
  population elements from DHIS2 into the population store, with a
  population-type choice in the naming step): tracked in SYSTEM_05 Open
  items when step 1 deletes PLAN_2. Until it lands, population rates are
  authored by hand over CSV-uploaded population, as today.
- A `rate_per_1k` display format (ruling 8): SYSTEM_05 Open item.
- Renaming an indicator id after creation.
- HFA and ICEH dictionaries.
- Module cleanup (m004/m005's `pnc1` fallback, the frozen m007/m008
  directories): PLAN_1e.

## 7. Rollout and rollback

Everything here needs real infrastructure and is Tim's to trigger. Steps
1 to 3 ship on normal releases as they pass review. Steps 4 to 6 ship
once, together, after step 6's review passes.

1. **Before the step 4 to 6 release:** resolve every shared raw and the
   derived special by hand in each instance's manager (ruling 12 lists
   them by instance from the 2026-09-10 sweep; the sweep query in
   ruling 12's guard is the check). Then take a fresh read-only dump of
   every `main` database and re-run `validate_indicator_sources` over
   all of them until every instance passes. This is the precondition;
   the release does not go out while any instance fails.
2. Take a named backup of every instance's `main` database immediately
   before the release. After 086 has committed on an instance, the
   previous image cannot read that database (the columns are renamed and
   `is_default` is gone), so rollback is that dump plus the previous
   image. Rehearse the restore on testing-tim.
3. `./deploy_testing` from `tim-branch` (it ships the working tree;
   check `git status`), verify the manager, an import and the datatable
   against a restored production dump, then the fleet release.

## 8. Build log

Append-only. One row per decision, deviation, correction or defect, and
one closing row per session (`Step N built`, `Step N reviewed: pass`,
`Step N reviewed: K findings`, `Step N fixed`). Newest last. The next
agent reads this section before its step.

| Date | Step | Entry |
| --- | --- | --- |
| 2026-09-10 | plan | Ruling 12 re-ruled: one SQL migration, no boot-time transform. The TS transform, the special tiebreak and the `_own` decomposition are gone; shared raws and the derived special are resolved by hand before rollout and 086 fail-stops on any that remain. |
| 2026-09-10 | plan | §4 rewritten from four horizontal stages to six vertical steps with a Do / Review / Fix session protocol (§0). The horizontal order could not typecheck green stage by stage. |
| 2026-09-10 | plan | Migrations renumbered: 085 is step 2's ledger columns (`skipped_values` and its sample), 086 is the dictionary migration. Every "085" in the rulings now reads 086. |
| 2026-09-10 | plan | Fleet sweep re-run: 107 raws shared across 17 instances, one derived special (`anc1` on demo). The original "13 pairs in six countries" was the abort set under the old tiebreak rule, not the resolution list. |
| 2026-09-10 | 1 | `lib/mod.ts` (kernel, outside the step's Surface) gained two export lines so `lib/special_indicators.ts` and `lib/indicator_id.ts` reach the server and client through the barrel like every other lib module. |
| 2026-09-10 | 1 | Migration 079's header comment named `lib/table_structures/indicators.ts` as the backfill's authority; the pointer now names `server/runs/indicator_catalog.ts` so gate 1 is at zero. Comment only; the runner does not checksum migrations. |
| 2026-09-10 | 1 | Generator: the `i_` digit prefix and the 64 cap are applied once, to the chosen stem, so an empty label with a digit-leading source id yields `i_12abc`, not `i_i_12abc`. 086's PL/pgSQL must apply the same order. |
| 2026-09-10 | 1 | The fresh-postgres boot gate is committed as root-level `validate_fresh_boot` (+ `validate_fresh_boot.ts`), modelled on `validate_queries`: a throwaway container, `dbStartUp()`, then the seed asserted. Passed: 22 specials as empty bases. |
| 2026-09-10 | 1 | Fact wrong in SYSTEM_05 and in `lib/common_indicator_catalog.ts`: the seed never ran "on every instance"; `db_startup` seeds only when the `main` database does not exist. Prose and comment corrected. |
| 2026-09-10 | 1 | The seed label now goes through `t3` at boot, after `exposed_env_vars.ts` has set the instance language; `_COMMON_INDICATORS` called `t3` at lib module load. |
| 2026-09-10 | 1 | Floor: typecheck, `deno task test` (28 passed), `validate_protocols`, `validate_migrations`, `validate_fresh_boot` green. Dev boot ran `dbStartUp` (13 projects and 13 manifests checked), route validation and the in-boot suite, then failed at listen only because a deno process started before the session holds port 8000. `client/src/app.css` carries an unrelated uncommitted edit from a parallel workstream; not staged. |
| 2026-09-10 | 1 | Step 1 built |
| 2026-09-10 | 1 | Review: `lib/table_structures/mod.ts` changed outside the Surface (its export line for the deleted `indicators.ts`) with no §8 row. The barrel edit is the deletion's only consequence; no code change. |
| 2026-09-10 | 1 | Review: SYSTEM_05 line 269 runs past the file's wrap width after the seed paragraph rewrite. Formatting only; step 6's read-through rewraps it. |
| 2026-09-10 | 1 | Review: every gate re-run green by the reviewer: typecheck (856 files claimed), `deno task test` 28 passed, `validate_protocols`, `validate_migrations`, `validate_fresh_boot` (22 specials as empty bases), gate 1 grep at zero. The committed tree booted against the dev database on `PORT=8001` to "Listening"; port 8000 is held by a server started before the step commit. Deliverable checked in code: 22 specials with en/fr/pt labels, `RESERVED_WORDS` union, generator per ruling 10, validator per ruling 5 on all four callers (retype covered in `updateIndicatorCommon` and the editor; batch upload writes bases only), frozen 14-id order in `indicator_catalog.ts`. |
| 2026-09-10 | 1 | Step 1 reviewed: 2 findings |
| 2026-09-10 | 2 | `RawRoute.unknown` carries a `reason` (`not_found` or `dhis2_indicator`): the dispatcher still probes the `indicators` endpoint so a DHIS2 indicator gets its own ledger error naming the DHIS2 indicator import in the indicator configuration, and a run detail box separate from the not-found list. `classification.computedIndicators` (a count) is replaced by `dhis2IndicatorIds` (the list). |
| 2026-09-10 | 2 | Two stored-JSON keys are optional until 086: `classification.dhis2IndicatorIds` and `Dhis2PairFetchStat.skippedValues` are absent on run rows written before this step, and the run detail reads them with `?? []` / `?? 0`. Step 4's 086 JSON rewrite should set `dhis2IndicatorIds: []` and `skippedValues: 0` on old rows so both become required there (an addition to ruling 12's list). |
| 2026-09-10 | 2 | Fact wrong in the Surface: `_main_database_types.ts` has no ledger row type (the ledger module declares its row shapes inline), so the two columns landed in `_main_database.sql`, 085 and `dataset_hmis_import_ledger.ts` only. |
| 2026-09-10 | 2 | Skip-and-record parses numerically (`Number`, then `Number.isInteger && >= 0`), not by a digit-only pattern: a NUMBER-typed element reports integers as "12.0", which ruling 6 accepts as a source, so "12.0" counts as 12 and "12.5", "-4", blank and non-numeric are skipped. The reduce is a pure function in `dispatch.ts` (`reduceDvsValues`), the harness is `server/tests/dhis2_skip_and_record_test.ts`, and the sample cap is 10. |
| 2026-09-10 | 2 | The pair stat, the run detail (a "Skipped values" table of pairs with a count) and the By-indicator rollup (a summed column) show the count; the per-month sample lives on the ledger row and is not rendered yet (`_ledger_indicator_detail.tsx` is outside the step's Surface). |
| 2026-09-10 | 2 | Facts wrong in SYSTEM_07, corrected in the same step: the retry paragraph said the worker passes `maxAttempts: 10, maxDelayMs: 60000` (it passes 3 and 30000, excluding size/timeout errors); the goal table had no `goal5_data_value_sets/` row. |
| 2026-09-10 | 2 | Floor and gates: typecheck (854 files claimed), `deno task test` 36 passed (8 new in `dhis2_skip_and_record_test.ts`), `validate_protocols`, `validate_migrations` (085 a no-op on the fresh replay), gate 2 grep at zero, gate 1 still at zero. `./run` against the dev database applied 085 ("Applying migration: 085_ledger_skipped_values.sql"), ran the in-boot suite and reached "Listening" on port 8000; stopped afterwards. |
| 2026-09-10 | 2 | Step 2 built |
| 2026-09-11 | 2 | Review: SYSTEM_06 line 156 ("Shadow verification (`shadow_passed`) was removed. DVS-analytics divergence is normal on real servers, so the gate aborted healthy first runs.") is history prose that names the deleted analytics route as if it still existed. Outside the step's changed contract; step 6's read-through drops or rewrites it. No code change. |
| 2026-09-11 | 2 | Review: every gate re-run green by the reviewer: typecheck (every tracked file claimed), `deno task test` 36 passed, `validate_protocols`, `validate_migrations` (085 a no-op on the fresh replay, 88 instance migrations, schema unchanged), gate 1 and gate 2 greps at zero, no `DHIS2_FACILITY_BATCH_SIZE` or `goal3_analytics` reference anywhere in the repo outside this plan. `./run` on the committed tree booted against the dev database (085 already applied by the Do session, so no "Applying migration" line), ran the in-boot suite (36 passed) and reached "Listening" on port 8000; stopped afterwards. Diff stat against the Surface: every changed file is listed in it. Deliverable checked in code: `RawRoute` is `dvs` or `unknown` with a `reason`; a DHIS2 indicator fails every pair permanently with a message naming the DHIS2 indicator import and keeping data; `reduceDvsValues` skips non-integers and negatives with a capped sample of 10 and the pair integrates `ready` through `upsertHmisLedgerPairsFromData`; the CSV integrate path passes no sample and records 0; 085 and `_main_database.sql` carry the two columns with defaults so 056's backfill INSERT still fits; `_run_detail.tsx` shows the DHIS2-indicator box and the skipped-values table, `_tab_by_indicator.tsx` the summed column. |
| 2026-09-11 | 2 | Step 2 reviewed: 1 finding |
| 2026-09-11 | 3 | Ruling 6 deviation: `INTEGER_NEGATIVE` is refused although it is an `INTEGER*` type. Every value of such an element is a negative, which skip-and-record drops, so it could never contribute a count. `NUMBER`, `INTEGER`, `INTEGER_POSITIVE` and `INTEGER_ZERO_OR_POSITIVE` are accepted. |
| 2026-09-11 | 3 | Ruling 6 reading: an element in several data sets is accepted when at least one has period type `Monthly` (the monthly values are what the dataValueSets pull reads). The refusal lists every period type found; an element in no data set is refused with no value. |
| 2026-09-11 | 3 | Addition to ruling 8's whitelist: a formula with more than `MAX_INDICATOR_EXPRESSION_INGREDIENTS` (8) distinct operands is refused as `too_many_operands`, since the derived it would author cannot be resolved. Operands are deduped by source id across both sides. |
| 2026-09-11 | 3 | Factor 1000: the expression is `(((numerator) / (denominator)) * 1000)` with `format_as: "number"` and a three-language `note`, so the value keeps its per-1000 meaning until a `rate_per_1k` format exists. The ruling names the format and the note but not where the scaling goes. |
| 2026-09-11 | 3 | The accepted expression is written through `writeIndicatorExpression` over `[source_id]` identifiers (`[uid]` / `[uid.coc]`), fully parenthesised, and re-parses with `parseIndicatorExpression` (asserted in the harness). Step 5 renames those identifiers to the base ids it creates with `renameIdentifiers`; the parse result is not a stored shape. |
| 2026-09-11 | 3 | Beside the two pure modules (`source_eligibility.ts`, `decompose_indicator.ts`) a third goal-2 file, `attach_verdicts.ts`, does the shaping: `withSourceVerdicts` and `withDecompositions`, the latter fetching operand elements not already in the search's own results by chunked `id:in` filters. The verdict gains an `element_not_found` kind for an operand whose element the server no longer has. Wire types (`Dhis2SourceVerdict`, `Dhis2IndicatorParse`, `Dhis2IndicatorDecomposition`, the two search-item types) live in `lib/types/indicators.ts`. |
| 2026-09-11 | 3 | The three search routes' response types are typed (`Dhis2DataElementSearchItem[]`, `Dhis2IndicatorSearchItem[]`) instead of `any[]`; the select form's `DHIS2Indicator[]` / `DHIS2DataElement[]` state still typechecks because the items extend those types. No client file changed. The data-element field list fetches `dataSetElements[dataSet[id,periodType]]`. |
| 2026-09-11 | 3 | Floor and gates: typecheck (every tracked file claimed; SYSTEM_07 globs gained the two harnesses), `deno task test` 61 passed (25 new across `dhis2_source_eligibility_test.ts` and `dhis2_decompose_indicator_test.ts`), `validate_protocols`, gates 1 and 2 still at zero. The server booted against the dev database (no migration to apply), ran the in-boot suite (61 passed) and reached "Listening" on port 8000; stopped afterwards. `validate_migrations` and `validate_queries` not run: the step touches neither. |
| 2026-09-11 | 3 | Step 3 built |
| 2026-09-11 | 3 | Review: SYSTEM_07 line 153 and the `Dhis2IndicatorParse` comment in `lib/types/indicators.ts` say each operand is written as the bracket-quoted `[source_id]`. `writeIdentifier` brackets only a name outside `/^[a-z][a-z0-9_]*$/`, so an all-lowercase UID is written bare. The contract that holds (asserted by the harness) is that the expression re-parses and names exactly the operands, which is what step 5's `renameIdentifiers` needs; the wording is imprecise, not the code. Step 6's read-through rewords it. No code change. |
| 2026-09-11 | 3 | Review: every gate re-run green by the reviewer: typecheck (every tracked file claimed), `deno task test` 61 passed, `validate_protocols`, gates 1 and 2 greps at zero, no em-dash in the new files. The committed tree booted against the dev database (no instance migration to apply, 13 projects checked), ran the in-boot suite (61 passed) and reached "Listening" on port 8000; stopped afterwards. Diff stat against the Surface: every changed file is listed in it. Deliverable checked in code: `getDhis2SourceVerdict` refuses non-SUM, non-count value types (`INTEGER_NEGATIVE` per the §8 deviation) and any element without a monthly data set, `getDhis2OperandVerdict` adds `element_not_found`; `parseDhis2Indicator` tokenises by whitelist with the offending construct as the term, parses with precedence and unary minus, maps factor 1/100/1000/10000 to a format with the `* 1000` scaling and note, refuses `annualized`, another factor, an empty side and more than 8 distinct operands; the search routes return `withSourceVerdicts` and `withDecompositions` over the default field list, which now carries `dataSetElements[dataSet[id,periodType]]`, so the combined search's `known` elements have their period type. Harnesses cover every case the Gates list. No client file changed. |
| 2026-09-11 | 3 | Step 3 reviewed: 1 finding |
