# PLAN A3: one indicator list, sources underneath

Status: OPEN. Rulings agreed (Tim, 2026-09-10). Not started. Supersedes
PLAN_2_DHIS2_INDICATOR_IMPORT.md (its §1 ruling is ruling 8 here; delete
that file in the first commit of this plan). Lands AFTER PLAN_A2:
generated ids must avoid the reserved words, and the reserved-word
validator this plan extends is A2's.

Repos: app, `wb-fastr-modules` (ruling 5: module definitions declare the
indicator ids their scripts read; pushed FIRST, then the app, because the
definition schema is strip-mode so old apps ignore the new field while a
new app refuses a definition without it), and `wb-fastr-site`
(help-button text that names raw indicators).

Read first: [SYSTEM_05](SYSTEM_05_facilities_indicators.md) "Derived
commons", "Computability", "Client state & wizard";
[SYSTEM_06](SYSTEM_06_ingestion.md) HMIS CSV and DHIS2 import;
[SYSTEM_08](SYSTEM_08_results_packages.md) module execution;
`lib/types/indicators.ts`; `lib/types/dataset_hmis_import.ts` (every
stored JSON shape that carries a raw id); `server/db/instance/indicators.ts`;
`server/db/instance/dataset_hmis_import_runs.ts` (`validateRunSelection`,
`resolveDatasetHmisCsvReview`, the enqueue path);
`server/worker_routines/import_hmis_data_dhis2/{dispatch,scheduler,worker}.ts`;
`server/worker_routines/import_hmis_data_csv/{stage_csv,worker}.ts`;
`server/db/project/datasets_in_project_hmis.ts` (the extract's `base`
filter); `server/db_startup.ts` (migration then transform order, the
new-database seed); `server/runs/{indicator_catalog,generation_wizard_reads}.ts`
and `server/worker_routines/generate_run/resolve_modules.ts` (where a
module definition meets the instance); `lib/table_structures/indicators.ts`;
`server/module_loader/{load_module,module_source}.ts` (definitions are
fetched per call, never stored; production has no modules checkout);
`build_help_buttons.ts` and `deno.json` (the generated-file pattern);
`wb-fastr-modules/m001/script.R` and `_parameters.ts`;
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md) (column rename
and named-constraint guards).

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
that has already drifted from the scripts: `ipd`, `new_fp` and
`pnc1_newborn` are seeded and read by no script; `pnc1`, `rdt_positive`
and `micro_positive` are read by m001/m004/m005 and seeded nowhere. The
seed runs only when a database is created, so no existing instance would
receive a new special even if the list were right.

## 2. The model

An **indicator** is `base` or `derived`. A base is an additive monthly
series defined by one or more **sources**; its sources are summed at
extract and the sum goes through m001/m002 adjustment. A derived is an
expression over indicators and population terms, evaluated after
aggregation (m012). A **source** is one DHIS2 data element or operand (id
= the UID or `UID.UID`) or one CSV indicator column (id = the value in
the file), and it belongs to exactly one base. A **special indicator** is
an id a module script reads by name; it is always a base, seeded on every
instance, and never deletable.

Terminology is exactly that: indicator, base, derived, source, special.
No "raw", no "common", no `is_default`.

## 3. Rulings

1. **One list.** The dictionary is one UI list with a Type column and, for
   a base, its sources. The raw tab, raw editor, raw batch upload,
   `indicators_raw` and `indicator_mappings` are deleted.
2. **Two tables.** `indicators` (as today, minus `is_default`, ruling 5)
   and `indicator_sources (source_id PRIMARY KEY, indicator_id NOT NULL
   REFERENCES indicators ON DELETE CASCADE, source_label NOT NULL,
   updated_at)`. `dataset_hmis.source_id REFERENCES indicator_sources ON
   DELETE RESTRICT`, under the named constraint `dataset_hmis_source_id_fkey`
   in both `_main_database.sql` and the migration (the validator compares
   the fresh replay byte for byte), so data never exists without an owner
   and deleting a base with data is refused with the friendly pre-check
   `deleteIndicatorRaw` has today. `dataset_hmis_import_ledger.source_id`
   CASCADEs as it does from `indicators_raw` now, and the ledger's
   deleted-mid-wizard join moves to the new table. No `source_kind`
   column: the DHIS2 dispatcher classifies ids against live DHIS2 metadata
   at run time and keeps no stored type to drift (`dispatch.ts`), and CSV
   sources are whatever the file said.
3. **A source belongs to exactly one base.** Enforced by the primary key.
   A second use of the same element is a derived over the first.
4. **Every name is the new name, and one-route shapes.** `indicator_raw_id`
   becomes `source_id` in `dataset_hmis`, the ledger, the CSV staging
   tables, and every TS type; `rawIndicatorIds` / `indicatorRawId` /
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
   read with `parseJsonOrThrow`, so the rename ships with the data
   transform (ruling 12) or the history tab crashes on every old row.
5. **Special indicators are declared by the modules, not by the app.**
   `ModuleDefinitionCore` gains `requiredIndicators: string[]` (required
   by the definition schema; the modules repo's vendored copy
   `.validation/_module_definition_github.ts` is re-copied in the same
   commit), compiled into `definition.json` by the modules build, carried
   on `ModuleDefinitionDetail` for the guard below, and stripped at
   manifest write by the installed schema (strip mode), so the manifest
   shape is unchanged. The app fetches nothing at boot: definitions are
   not stored and are fetched from GitHub per wizard call, and production
   has no modules checkout, so the union is generated at app build time
   into `lib/module_required_indicators.generated.ts` by a new
   `deno task build:module-indicators` reading each registry module's
   `definition.json` under `FASTR_MODULES_LOCAL_DIR` (the
   `help_targets.generated.ts` pattern; frozen dirs are outside
   `MODULE_REGISTRY`). Because nothing regenerates a committed file on
   its own, the task has a `--check` mode wired into `deno task typecheck`
   (which both deploy scripts gate on) that diffs the committed file
   against the checkout. From the union:
   - **seeds**: every special is inserted with `INSERT ... ON CONFLICT DO
     NOTHING` and `sort_order = MAX + 1` on EVERY boot, positioned after
     the data transforms (a boot that aborts in the transform must not
     seed first; the generator avoids special words and the transform
     tests special-ness by set membership, so the order is otherwise
     free); a no-op boot touches no `updated_at`, so the version stamps
     and the datatable caches do not churn. `_COMMON_INDICATORS` is
     deleted; the seed-order array `backfillCommonIndicatorSortOrder`
     reads moves into `server/runs/indicator_catalog.ts` as a frozen
     constant, since manifest transforms of immutable old packages read
     it;
   - **`is_default` is dropped**: special-ness is membership in the
     generated set everywhere the column is read today (delete guard,
     batch replace, the manager's badge, the m012 parity test fixture).
     It is in no manifest, project database or `IndicatorMetadata`;
   - **validator**, in lib, shared by editor and server: an id in A2's
     reserved set is refused for any indicator; a special id is refused
     for a derived, at create and at retype; a special is never deleted;
   - **module guard**: where a module definition meets the instance
     dictionary, `getRunGenerationModuleOptions` (the wizard) and
     `resolve_modules.ts` (the run's re-fetch at the pinned ref; a derived
     can be created between wizard and generate), a definition requiring
     an id the instance does not hold as a base (absent, or derived) is
     refused with a message naming the id. "Absent" matters: with a
     "derived only" rule, a module declaring an id the committed union
     lacks would reproduce today's drift silently.
   Modules cleanup in the same push: m001 declares its DQA and
   consistency-pair ids including the malaria pair; m004, m005, m006 and
   m011 declare what their scripts filter on and m004/m005 stop reading
   the unseeded `pnc1`; m003 reads no literal id and declares none;
   `ipd`, `new_fp` and `pnc1_newborn` leave the seeds unless a module
   declares them.
6. **Ids are chosen at creation and are immutable after.** The id is the
   column key in every results package, expression, figure snapshot and AI
   tool call. Creation is a naming step in both import paths, one shared
   component: each candidate shows a proposed id (ruling 10) editable
   inline, or "add as a source of an existing base" for the specials.
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
    reserved or special word. `{common}_own` in ruling 12 goes through the
    same function.
11. **Batch dictionary upload is one file**: `indicator_id, label, type,
    sources, expression, format_as, thresholds`; `sources`
    semicolon-separated for a base, empty for a derived. Replace refuses
    with a listing when it would remove a source with data, a special, or
    an id another expression names; upsert keeps `sort_order`. The
    download mirrors the file.
12. **Migration: a DDL migration plus a TypeScript data transform.**
    Instance migrations run before the transforms, each transform runs in
    one transaction and may run DDL, and `./validate_migrations` replays
    only the SQL on a fresh database (the transform is covered by its own
    harness, §5). Split:
    - **085 (SQL)**: create `indicator_sources`; `ALTER TABLE ... RENAME
      COLUMN indicator_raw_id TO source_id` on `dataset_hmis`, the ledger
      and the CSV staging tables, guarded on column existence (the
      protocol's rename pattern: O(1), keeps the primary key and the five
      indexes); drop the old FKs to `indicators_raw`; add the new FKs
      `NOT VALID` under their `_main_database.sql` names, guarded on
      `pg_constraint`; drop `indicators.is_default`; no `DROP TABLE`. On
      the fresh schema every statement is a guarded no-op. Older
      migrations that name the old tables get table-existence guards so
      the fresh replay passes: 003's two index creations and 079's DO
      block (079's `is_default` inserts sit after its early return and
      never execute on a fresh replay). The instance-side precedent is
      003's own guards.
    - **The transform (TS, one transaction)**: gated on
      `to_regclass('indicators_raw') IS NOT NULL`, which is the forced
      gate here (no Zod parse is involved); a second boot and a fresh
      database see a false gate and do nothing; a boot that aborts inside
      it re-runs it next boot, and the previous image still runs against
      the transitional schema. It writes `indicator_sources` for every raw
      before anything validates, applies the rules below, rewrites the
      stored JSON, runs `VALIDATE CONSTRAINT`, and drops the two old
      tables at the end.
    Rules, each logged per decision:
    - a mapping onto a derived is dropped (none today);
    - a raw mapped to one common becomes its source;
    - an unmapped raw becomes a new base (ruling 10 id from the raw
      label) with the raw as sole source: about 260 in Uganda (one with
      data), 109 in Ethiopia (all with data); the manager's bulk delete
      removes what a team does not want;
    - a raw shared by commons of which exactly one is special: the special
      keeps it; each other common O becomes derived `S + O_own` where
      `O_own` is a new base holding O's remaining sources (omitted when
      none), valid only when S's sources are a subset of O's. Otherwise,
      and whenever two specials share a raw, the transform aborts with the
      listing and the instance is resolved by hand before deploy: 13 pairs
      in Côte d'Ivoire, Kenya, Malawi, RCA, RDC and Somaliland (sweep
      2026-09-10);
    - a raw shared by non-special commons only becomes its own base and
      every common that held it becomes derived over its parts, with
      `_own` remainders as above. Former commons keep id, label, format
      and thresholds, so pinned figures keep working;
    - after the rewrites every derived is resolved; an expression over the
      8-ingredient cap aborts the transform with the listing;
    - stored JSON (ruling 4): run rows get `indicatorIds: []` and
      `sourceIds` = the old raw ids; pair, stat and progress keys are
      renamed and the `route` / `computedIndicators` fields stripped;
      schedule selections are rewritten to the ids of the bases now owning
      their sources; CSV configs rename the mapping key;
    - the id table (old raw id → owning base; new bases) is written to
      the log so a team can find what its elements became.
    **Consequence, stated once:** every common the shared-raw rules
    rewrite changes slightly in value from its next package on, because
    adjustment runs per element instead of on the sum. The log names each.
13. **The HMIS datatable's raw view becomes "by source".** Same query,
    keyed by `source_id`; the toggle label changes.
14. **Client cache name** bumps to `instance_indicators_v4` (its own
    convention for a payload-shape change). No Valkey prefix exists for
    the dictionary, and no slide-config sweep: `IndicatorMetadataDisplay`
    never carried type or sources and packages are immutable. The
    datatable caches key on the base-only stamp, which now hashes
    `indicators` base rows plus `indicator_sources.updated_at` and counts,
    so a derived edit still does not churn them; the transform's source
    inserts churn them once.

## 4. Implementation

Order: modules declaration (pushed first), then generated union and
schema, then server, then client, each stage typechecking green.

1. **Modules**: `requiredIndicators` on `ModuleDefinitionCore` and the
   definition schema, the vendored schema copy re-synced; m001, m004,
   m005, m006, m011 declare; the cleanup in ruling 5; `deno task build`.
2. **Generated union and schema**: `deno task build:module-indicators`
   (with `--check`, chained into `typecheck`) and
   `lib/module_required_indicators.generated.ts`; `_main_database.sql`;
   instance migration `085_indicator_sources.sql` and the guards on 003
   and 079; the transform
   `server/db/migrations/data_transforms/indicator_sources.ts` registered
   in `INSTANCE_DATA_TRANSFORMS`.
3. **lib**: `lib/types/indicators.ts` (`IndicatorSource`, base carries
   `sources`, one `InstanceIndicatorDetails`, the special/reserved
   validator beside `getNewIndicatorIdIssue`, `is_default` gone),
   `lib/indicator_id.ts` (ruling 10), `lib/types/dataset_hmis_import.ts`
   and `lib/types/dataset_hmis.ts` (ruling 4 names and dropped fields),
   `lib/types/_module_definition_github.ts` and the detail type,
   `lib/api-routes/instance/{indicators,datasets,indicators_dhis2}.ts`
   (raw routes deleted; selections carry `indicatorIds`; the search
   response carries period type), `lib/table_structures/indicators.ts`
   deleted, `lib/common_indicator_catalog.ts` reads the union and drops
   its "seeded on every instance" comment, `lib/types/instance.ts` and
   `instance_sse.ts` (the raw count leaves the summary).
4. **Server**: `db/instance/indicators.ts` (one CRUD, sources in the
   indicator's transaction, batch per ruling 11), `db/instance/instance.ts`
   (both stamps over the two tables), `db/instance/dataset_hmis.ts`
   (windowed delete, by-source datatable), `db/instance/
   dataset_hmis_import_{runs,ledger}.ts` (expansion, `skipped_values`),
   `db/instance/_main_database_types.ts`, `db/project/
   datasets_in_project_hmis.ts` (extract joins sources), `db_startup.ts`
   (every-boot seed after the transforms), `runs/indicator_catalog.ts`
   (the frozen order), `runs/generation_wizard_reads.ts` and
   `worker_routines/generate_run/resolve_modules.ts` (the module guard),
   `worker_routines/import_hmis_data_dhis2/{dispatch,scheduler,worker,
   instantiate_worker}.ts` (ruling 7 message carries sources; the route,
   the URL guard and the batch-size env var deleted; skip-and-record),
   `exposed_env_vars.ts` and `.env.example`,
   `worker_routines/import_hmis_data_csv/{stage_csv,worker,
   integrate_staged,instantiate_worker}.ts` (full unknown set on the hold;
   re-stage action), `server/dhis2/goal2_indicators` (period-type field,
   decomposition), `server/dhis2/goal3_analytics` and `server/dhis2/mod.ts`
   (deleted, export removed), `routes/instance/{indicators,
   indicators_dhis2,datasets,health}.ts`,
   `tests/m012_expression_parity_test.ts` (fixture).
5. **Client**: `indicator_manager_hmis/` (one list; the naming component
   with the metadata refusals; `_edit_indicator_raw.tsx` and the raw batch
   form deleted; `dhis2_indicator_select_form.tsx` becomes the naming
   step), `instance_dataset_hmis/imports/` (`_indicator_picker.tsx` lists
   indicators; `_wizard/`, `_csv_wizard.tsx`, `_csv_needs_review_card.tsx`
   (the third action), `_csv_staging_summary.tsx`, `_tab_future.tsx`,
   `_tab_history.tsx`, `_run_view.tsx`, `_run_detail.tsx`,
   `_tab_by_indicator.tsx`, `_ledger_indicator_detail.tsx`, `index.tsx`),
   `instance_dataset_hmis/{_delete_data,_import_information,
   dataset_items_holder}.tsx`, `components/WindowingSelector.tsx` (by
   source; shared by all three families), `instance/instance_data.tsx`,
   `state/instance/{t1_store,t2_indicators,t2_datasets}.ts`.
6. **Docs and generated**: SYSTEM_05 (including its "seeded on every
   instance" sentence), SYSTEM_06 and SYSTEM_08 prose and `globs` (files
   added and deleted, including the generated file); `wb-fastr-site` help
   text for the indicator manager and imports, then
   `deno task build:help-buttons`; `lib/ai_tools/tools_methodology_docs.ts`
   wording.

## 5. Verification

- `deno task typecheck` (now including the union `--check`),
  `./validate_migrations` (fresh replay across the guarded 003/079 and a
  no-op 085), `./validate_protocols`, `./validate_queries`.
- Transform harness on scratch DBs seeded from read-only dumps of the
  Uganda, Sierra Leone and Malawi dictionaries (PROTOCOL_ACCESS_DBS), run
  after 085 has been applied to them: sources = single-mapped raws; new
  bases = unmapped + shared + `_own`; every generated id unique, bare,
  unreserved, non-special; Malawi aborts on `anc1`/`anc4`; a second boot
  is a no-op (gate false); for an indicator with no shared source the
  extract's per-indicator sums are identical before and after; for a
  rewritten one the derived's evaluation over unadjusted data equals the
  old base's sum; every historical run row, version row and schedule
  parses after the JSON rewrite with the dropped fields gone; the
  every-boot seed adds the missing specials at the end of the order and
  a second boot writes nothing.
- Harness: id generation (accents, punctuation, leading digits, empty,
  collisions, reserved, special); the validator (special as derived
  refused, reserved refused, special delete refused); the metadata check
  (each non-SUM aggregation type, each non-numeric or fractional value
  type, each non-monthly or absent period type refused; `NUMBER` with
  SUM accepted; operands checked through their element); decomposition
  (factor 1/100/1000/10000, another factor refused, annualized refused,
  whitespace accepted, one case per non-whitelisted term); skip-and-record
  (a fractional and a negative facility value are skipped, counted and
  sampled on the ledger row, the pair integrates); expansion of a derived
  selection to sources with a population term and a CSV source dropped;
  a queued run launched after a source is added does not include it; a
  module definition without `requiredIndicators` fails schema validation;
  the module guard refuses a definition requiring an absent id and one
  requiring a derived id.

## 6. Out of scope

- The DHIS2 population writer (PLAN_2 §2 second bullet: yearly
  population elements from DHIS2 into the population store, with a
  population-type choice in the naming step): tracked in SYSTEM_05 Open
  items when PLAN_2 is deleted. Until it lands, population rates are
  authored by hand over CSV-uploaded population, as today.
- A `rate_per_1k` display format (ruling 8): SYSTEM_05 Open item.
- Renaming an indicator id after creation.
- HFA and ICEH dictionaries.

## 7. Done when

The gates and harnesses pass, the three repos are pushed in order, the
SYSTEM prose is updated, PLAN_2 is deleted, and this file is deleted in
the same commit.
