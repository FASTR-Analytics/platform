# PLAN_1a — Indicator restructure (typed commons, arbitrary expressions, m012, m007/m008 drop)

Status: DESIGN RULED 2026-08-30 (Tim). Amended same day after a
code-verified review round (every claim in it was independently verified
against code before adoption). Nothing built. **All design decisions are
made — there are no open rulings.** This file, with
[PLAN_1b_POPULATION_STORE.md](PLAN_1b_POPULATION_STORE.md) and
[PLAN_1c_MODULE_CLEANUP.md](PLAN_1c_MODULE_CLEANUP.md), replaced the
deleted `PLAN_1_COMMON_INDICATOR_TYPES.md`, whose query-time "hosting"
mechanism is REJECTED (§1.14).

**Release stipulation: 1a and 1b are ONE release.** Nothing ships until
both are green. 1a is testable alone first on a testing instance
(`./deploy_testing`) with throwaway generated packages.

Repos: app = `/Users/timroberton/projects/apps/wb-fastr` (all relative
paths below); modules = `/Users/timroberton/projects/apps/wb-fastr-modules`
(authored `_metrics/*.ts` etc.; `deno task build` there regenerates
`definition.json`; its `.validation/` schema copy re-syncs with the app's).
Deploy order: app first, then modules push.

## 0. The two principles

> **Generation decides what the numbers are made of; the query only
> aggregates and applies the formula.**

A derived indicator is a ROW in a results file carrying the additive
ingredient sums its own expression references. Any chart grouping
re-aggregates ingredients with SUM (always valid — they are additive
counts), and the indicator's expression is applied AFTER aggregation:
expression-over-sums, never sum-of-expressions, which is what makes the
result exact at every grouping. Expressions are CATALOG DATA snapshotted
into the package and evaluated by a pure TypeScript evaluator — never in
SQL, never from the wire. This is the contract the engine already runs for
m008 (`numerator/denominator`) and HFA (`COALESCE(sum_val,
avg_num/avg_weight)`); m012's only novelty is that the formula comes from
the catalog per indicator instead of one metric-wide string.

> **The read path knows exactly one format: the current one.**

Four clauses, each an existing codebase doctrine, and every old-package
question in this plan is answered by one of them — never case-by-case:

1. **Transform-forward, never tolerate.** `RUN_MANIFEST_SCHEMA_VERSION`
   bumps 5→6 and one transform block upgrades every old package's manifest
   in place at boot. No read-path code ever branches on package vintage,
   holds a fallback, or parses a union of old∪new shapes.
2. **Stored vocabulary never shrinks; live authoring vocabulary does.**
   An enum member kept for immutable stored blobs, a metric id kept in a
   client lookup list for frozen figures — these are inert data, never
   code paths.
3. **The module registry is generation-plane only.** The read plane —
   server AND client — reads module identity from the manifest as plain
   strings. `ModuleId` is a generation-plane type.
4. **All dispatch is on declared types** (`scriptGenerationType`, a
   metric's declared evaluation). Nothing is inferred from request shape,
   data shape, or vintage. (Rationale recorded once: the prior design's
   request-shape inference provably over-matched 11 shipped metrics and
   resisted ~20 review rounds.)

## 1. Rulings (all decided; do not re-litigate)

1. **Three dictionaries stay**; `calculated_indicators` folds INTO
   `indicators`.
2. **Types on a common indicator:**
   - `base` — defined by mappings (SUM of mapped raws at extract). No
     expression. The only type m001/m002 ever see.
   - `derived` — an ARBITRARY expression over 1..8 other commons (base or
     derived; chaining by substitution; cycles and depth rejected at
     authoring AND capture). The 8-ingredient cap is measured AFTER
     chain-flattening.
   - `population_rate` — STRUCTURED definition `{numeratorExpression`
     (over commons ONLY, never naming the population term; flattens to at
     most 7 ingredients — person-years takes the eighth slot),
     `populationType`, `multiplier}`. The generation step assigns
     person-years to its own slot and composes the final catalog
     expression, so validator/cap/flattener have no population
     carve-outs. Type + migration land in 1a; evaluation lands in 1b.
   - The authoring validator rejects `population_rate` ids as INGREDIENTS
     of any expression (ingredients must resolve to base or derived) —
     the same rule capture enforces, enforced first where the user is.
   - `composite` (row-wise pre-aggregation conditionals) — DEFERRED.
3. **Expression grammar**: `+ - * /`, parentheses, numeric literals,
   identifiers (bare `^[a-z][a-z0-9_]*$`, else `[bracket quoted]`), calls
   limited to `abs`/`coalesce`/`nullif`. NULL propagates; division
   zero-guarded. Fully arbitrary expressions are a HARD requirement —
   3+ ingredients, any operator mix; never negotiate this down to
   numerator/denominator forms.
4. **Presentation fields on commons**: `format_as`
   (`percent|number|rate_per_10k`; base = `number`), thresholds?,
   `group_label`, `sort_order`.
5. **m012 — the indicator-values module (new, app-executed).**
   `scriptGenerationType: "indicator_values"`: the "script" is a DuckDB
   SQL step run by the generation pipeline in-process (no Docker, no R;
   the R surface is isolated to `runRScript` in
   `worker_routines/generate_run/execute_module.ts`, untouched). Depends
   on m002. One results object `INDICATOR_VALUES`:
   `indicator_common_id, period_id, admin_area_2..4, ing1..ing8` —
   **area×month grain, uniformly** (rows summed across facilities at the
   finest admin level; NO `facility_id`, no facility columns; facility
   analysis stays on m3-01-01 and the quality metrics; m008 parity, so no
   shipped capability is lost). One row per indicator × month × finest
   area, ingredient slots per the catalog's slot-map; base rows put their
   count in `ing1`. **One adjustment basis**, a module config selection
   at generation defaulting from the instance count-variable setting —
   adjustment-scenario comparison stays m3-01-01's job; a different basis
   means regenerating, the system's normal lifecycle. The step fails the
   generation loudly on any unresolvable ingredient. Frictions ruled:
   the step's script artifact is `___script___.sql` (file name is a total
   function of the declared module type; `_MODULE_SCRIPT_FILE_NAME` in
   `server/exposed_env_vars.ts` becomes that function, and
   `server/runs/package_internals.ts` serves it); the memo key keeps
   folding `R_DOCKER_IMAGE_TAG` (`computeModuleKey`,
   `worker_routines/generate_run/resolve_reuse.ts:192`) — spurious m012
   re-runs on image bumps are accepted, the step is trivial.
6. **One metric `m12-01-01`, `formatAs: "indicator"`, with a DECLARED
   evaluation variant** in the metric schema (github + installed): it
   names the ingredient props that travel on the wire and declares that
   the value is computed per-indicator from the run catalog. The wire
   contract, explicitly: the client compiles `values =
   [{prop: ingN, func: "SUM"}…]` from the declaration; the server runs
   ordinary engine SQL, then applies each indicator's catalog expression
   to the aggregated ingredients of main AND roll-up rows, returning a
   single `value` column with ingredient columns dropped; the
   resultsValue presented to the editor/figure layer carries
   `valueProps: ["value"]` — no prop picker, `valuesFilter` never
   applies. (The same wire/display split PAE metrics already have, but
   declared — no sentinel strings.) The scorecard is a preset on this
   metric, and `SPECIAL_SCORECARD_TABLE_METRICS`
   (`client/src/generate_visualization/special_chart_checks.ts:29`) gains
   `m12-01-01` — while keeping `m8-01-01` for frozen figures (§0 clause 2).
7. **Server-side guards on `indicator_values` ROs — validations of a
   declared type, never inference** (the RO's module type is a manifest
   lookup via `getModuleIdForResultsObjectFromRun`): reject any
   client-sent `postAggregationExpression` (PAE acceptance is otherwise
   unconditional — `lib/validate_fetch_config.ts:286-291` — so this is a
   real bypass without the guard), any `values[].func` other than SUM,
   and any prop outside the declared ingredient set.
8. **Cross-indicator pooling is impossible by declaration**: `m12-01-01`
   declares `requiredDisaggregationOptions: ["indicator_common_id"]`, and
   required options are enforced server-side as GROUPBYS with a hard
   error (`findMissingRequiredGroupBys`,
   `server/run_query/run_read.ts:576`, rejected in
   `server/run_query/run_data_reads.ts:69-81`; `indicator_common_id` is
   not exempt, `lib/disaggregation_labels.ts:148-162`; a filter does NOT
   satisfy it). Every aggregated row the evaluator sees is keyed by
   exactly one indicator. AUTHORING INVARIANT (record in the module
   schema docs): the guard is the INTERSECTION across all metrics sharing
   an RO (`run_read.ts:590-592`) — every metric ever added to
   `INDICATOR_VALUES` must require `indicator_common_id`, or the guard
   dissolves for all of them.
9. **Manifest v6 — one bump, one transform block, three stamps** (§0
   clause 1; `server/runs/manifest_transform.ts` block 4):
   - `indicators[]` catalogs gain `sort_order` (and the new optional
     type/expression/slot-map fields for new packages). Placement of the
     v1 backfill (verified 2026-08-30 against `manifest_transform.ts`):
     the transform has NO per-block version gates — every block runs on
     any forced pass, and block 1 unconditionally recomputes
     `indicators[]` through `buildRunIndicatorCatalog` BEFORE block 4
     runs. The backfill therefore lives INSIDE
     `buildRunIndicatorCatalog`'s v1 row path (the same backfill function
     the live migration uses: base commons matching the 14-list keep its
     order, remaining base commons alphabetical after, calculated rows
     keep their snapshot order appended last; v2 rows carry real
     `sort_order` from the mirror), so there is exactly ONE derivation of
     catalog content — NEVER a block-4 patch of `indicators[]`, which
     would be a second derivation that block 1 wipes and re-patches on
     every future forced pass. Block 4 stamps only `commonIndicators` and
     the version. The client sorts axes by catalog order
     UNCONDITIONALLY — the hardcoded list
     (`get_INDICATOR_COMMON_IDS_IN_SORT_ORDER`,
     `lib/table_structures/indicators.ts:27`) is deleted from the read
     path; `_COMMON_INDICATORS` survives only write-side (the boot seed
     at `server/db_startup.ts:389-400` and the backfill function).
   - A new top-level `commonIndicators` manifest field (id/label):
     finalize stamps it from the v2 mirror; the block stamps old packages
     from their v1 mirrors — read ONCE, at transform time, where
     mirror-reading belongs. Then `getCommonIndicatorsFromManifestInputs`
     (`server/run_query/run_read.ts:356-399`) and its per-request mirror
     I/O are DELETED; its four consumers (`server/runs/attach_run.ts:69`,
     `server/db/project/projects.ts:89`, `server/mcp/context_cache.ts:284`,
     the `run_query/mod.ts` re-export) read the manifest field. This
     executes SYSTEM_08's stated target ("the read path parses the
     manifest only; input mirrors are raw provenance"), and it frees the
     v2 mirror to use clean field names — nothing on the read path opens
     it.
   - The version stamp itself is the rollback story for ALL new
     vocabulary (the `indicator_values` enum value, the metric evaluation
     field): a rolled-back server sees version 6 and refuses gracefully
     ("written by a newer server", `server/runs/manifest_cache.ts:28-34`)
     instead of blank projects (the `projects.ts:84-102` catch) and
     uncaught 500s (`routes/instance/run_generation.ts:209`,
     `attach_run.ts:66`).
   The block reads only the manifest and one small JSON mirror per
   package — no parquet scans, bounded boot cost.
10. **Definitions snapshot into the run; packages stay standalone; an
    edit means a new run.** `prepare_inputs.ts` writes ONE v2
    `indicators.json` mirror (id, label, type, expression, slot-map,
    format_as, thresholds, group, sort); the
    `calculated_indicators_snapshot.json` writer goes.
    `runs/indicator_catalog.ts` remains the only mirror reader
    (finalize + transform time), reading v1 rows for old packages and v2
    for new — two writers' formats at write/transform time, ONE catalog
    contract at read time.
11. **m007 and m008 dropped; registry-free reading COMPLETED (server and
    client).** Registry entries deleted (`lib/types/module_registry.ts`).
    POs over their metrics DELETED by a project migration with FOUR
    LITERAL ids (`m7-01-01/02/03`, `m8-01-01`; precedent `project/038`;
    NEVER a `NOT IN` sweep — the `4f0dd3dc` data-loss bug). **The PO
    deletion is a user-visible loss and is OWNED**: configured scorecards
    are rebuilt from the m12-01-01 preset (one click); repointing was
    considered and REJECTED (config-compat sweep + dual-id handling for
    marginal gain). Read-path work, complete list (verified):
    - Server: drop `getValidatedModuleId` at `run_read.ts:627`, `:682`;
      `server/runs/package_internals.ts:49` replaces it with an explicit
      module-id SHAPE check (it is the path-traversal guard for
      `runs/{runId}/outputs/{moduleId}`), and the fileName guard its
      doctrine comment (:32-38) describes but never implements is made
      real in the same commit.
    - Client: `_shared/results_package/package_view.tsx:61,:238`
      (`:238` is in the render tree — the whole package view dies today)
      and `instance_results_packages/detail.tsx:233` use the manifest's
      module id string; `project/project_metrics.tsx:49` groups by the
      manifest's module list instead of `getPossibleModules()`;
      `instance/compare_projects.tsx:141` iterates project modules, not
      `MODULE_REGISTRY`; `status.tsx` already degrades (label falls back
      to raw id — fine).
    - Types: read-plane types carry `string`
      (`InstalledModuleSummary.id`, `MetricsByModule.moduleId`, viewer
      props in `view_script/logs/files.tsx`); `ModuleId` stays
      generation-plane (wizard, resolve, loader). The dead types
      `InstalledModuleWithResultsValues` and `ModuleDetailForRunningScript`
      (`lib/types/modules.ts:92,:104` — zero references) are deleted.
    - Schemas: `"calculated_indicators"` STAYS in the installed enum
      (§0 clause 2 — stored blobs parse forever), deleted from the GitHub
      enum. That deletion breaks exactly ONE import
      (`get_script_with_parameters.ts:9`) — the rest of the calculated
      plumbing compiles happily and is deleted by NAMED sweep:
      `get_script_with_parameters_calculated_indicators.ts` + its `if`
      arm, `PreparedRunInputs.scriptInputs.calculatedIndicators`
      (`prepare_inputs.ts:68,:111,:131-134,:141`), the capture num/denom
      validation (`datasets_in_project_hmis.ts:263-284` — superseded by
      the ingredient-resolution check), `calculatedIndicatorToSnapshotRow`
      (same file `:113-145`), the barrel lines (`lib/types/mod.ts:50`,
      `server/db/instance/mod.ts:21`, `server/db/project/mod.ts:15`), and
      the modules repo's `.validation/` re-sync (m008's `_core.ts` goes
      with the directories in 1c).
    - Ten-line harness: module summaries render from a manifest
      containing m007+m008. Nigeria's `nhmis_timely_and_data` still waits
      for `composite` — and cannot be an unhandled migration row: the
      `calculated_indicators` schema is strictly num + three-way denom
      (`lib/types/indicators.ts:109-126`).
12. **Migration in ONE pass** (fleet checked read-only 2026-08-30):
    - *Identity alias* (denom `none`, num = own id — ethiopia `anc4`,
      `pnc1_2days`, `anc1_under12weeks`, `anc8`): presentation fields
      onto the base common; calculated row dropped.
    - *Ratio reusing its numerator's id* (kenya
      `maternal_deaths_audited`; nigeria
      `adolescent_deliveries_10_to_19_years`, `chlorhexidine_at_birth`;
      uganda `anc1_anaemia_test`): `derived`, id suffixed `_rate`, logged.
    - *Alias of another common* (denom `none`, num ≠ own id — valid at
      every layer, none currently in the fleet): single-ingredient
      `derived` (expression = the referenced common), logged.
    - Population-denominated rows (ethiopia ×1, kenya ×6, nigeria ×5,
      somaliland ×1) → `population_rate` now; evaluation ships with 1b
      (one release, no user-visible gap).
    - Any other collision fails loudly with a listing. `central-testing`
      predates the table; migrations handle it.
13. **Version stamps** — correction of record: `getIndicatorsVersion`
    does not exist; today's stamp is `getIndicatorMappingsVersion`
    (`server/db/instance/instance.ts:92-107`, covering indicators +
    indicators_raw + indicator_mappings). It SPLITS: the full stamp (all
    indicator rows + raws + mappings; keys the indicator-manager T2 cache
    and SSE summary) and the base stamp (base rows + raws + mappings; keys
    the HMIS datatable caches so derived/pop-rate edits cost nothing).
    Client consumers switching to the base stamp (verified):
    `components/WindowingSelector.tsx:73`,
    `instance_dataset_hmis/index.tsx:38`,
    `instance_dataset_hmis/dataset_items_holder.tsx:91`,
    `instance_dataset_hmis/_delete_data.tsx:97` (cache-key sites
    `state/instance/t2_datasets.ts:48`, `t2_indicators.ts:19`).
    `getCalculatedIndicatorsVersion` goes; SSE summary fields + the count
    tile follow. `DatasetHmisInfoInProject.calculatedIndicatorsVersion`
    is a SIMPLE RENAME: its home is the manifest's `z.unknown()`
    `datasets[].info`, there is no Zod schema for the type, and nothing
    reads the key (verified) — the old key stays inert, per that type's
    own documented precedent (`lib/types/datasets_in_project.ts:20-22`).
    No transform, no skip-gate.
14. **Rejected (do not re-litigate; all evaluated against code):**
    query-time synthesis of derived indicators in any variant
    (request-shape inference AND declared-hosting fetchConfig fields); a
    flat one-entry-per-indicator series catalog with an id-only wire
    (per-row expressions vs GROUP BY are mutually exclusive in one
    SELECT; replicant machinery is dimension-shaped; retro-stamped
    catalogs invent provenance; id explosion breaks the fleet metric-id
    contract); restricting expressions to num/den; expressions on the
    wire or in SQL; metric identity on the wire; materializing expression
    RESULTS at any grain; **and read-path fallbacks or vintage
    conditionals of any kind** — where an old package lacks something,
    the v6 transform supplies it (§0 clause 1).
15. **m012 is DELIBERATELY TEMPORARY** — it folds into a redefined m003
    in [PLAN_1c](PLAN_1c_MODULE_CLEANUP.md) (trigger recorded there).
    Nothing new hard-codes m12 ids beyond ordinary PO/preset storage.
    m003, m011, the SQL builders, and the fetch wire are UNTOUCHED by
    this plan.

## 2. Build — app

- `lib/types/indicators.ts`: `CommonIndicator.type` + `definition`
  (`{type:"base"} | {type:"derived"; expression} |
  {type:"population_rate"; numeratorExpression; populationType;
  multiplier}`), `format_as`, thresholds?, `group_label`, `sort_order`.
  `CalculatedIndicator` + `lib/types/calculated_indicator_id.ts` go.
  Catalog (`IndicatorMetadata`) gains optional type/expression/slot-map/
  sort fields.
- `lib/indicator_expression/` (new): tokenizer, parser → AST, validator
  (commons-only ingredients by TYPE, cycles, depth, 8-cap after
  flattening — the editor error names the flattened set that blew the
  cap), chain-flattening substitution, and the pure post-aggregation
  evaluator (slot-record in, number|null out; NULL propagation,
  zero-guarded division). NO SQL emission; NO serving-path changes to
  `validate_fetch_config.ts` / `query_helpers.ts` PAE machinery.
- Migrations (instance): ALTERs and the one-pass data move per §1.12; DROP
  `calculated_indicators`. Gate: PROTOCOL_APP_MIGRATIONS +
  `./validate_migrations`. Project DB: the frozen
  `calculated_indicators_snapshot` table drops with PLAN_RESULTS_RUNS
  Phase 4, not here.
- Instance DB/routes/client per §1.13 (delete `calculated_indicators.ts`
  db/routes/api-routes files, the `combined.ts` spread + boot-blocking
  count term, the `main.ts` mount; delete-guard re-expressed over
  expressions).
- Run capture: extract stays base-only (join on `type='base'`); mirror
  query selects ALL commons (drops the EXISTS filter); ingredient
  resolution check (cycle/depth-aware) replaces the flat num/denom check;
  v2 mirror writer; snapshot writer deleted.
- Generation: `resolve_modules.ts` / `pipeline.ts` dispatcher arm for
  `indicator_values` executing the DuckDB step into the module's
  `outputs/` workspace (same finalize, RO stamping, memoization
  discipline; script artifact per §1.5).
- Manifest: `RUN_MANIFEST_SCHEMA_VERSION` 5→6; transform block 4 per
  §1.9; finalize stamps `commonIndicators` + catalog sort; delete
  `getCommonIndicatorsFromManifestInputs` and repoint its consumers.
- Read path: the catalog-expression evaluation step in
  `getPresentationObjectItemsFromRun` for `indicator_values` ROs (main +
  roll-up rows; emits `value`, drops ingredients); the §1.7 guards; the
  §1.11 registry-free reading (server + client + types).
- Client: `indicator_manager_hmis/` rewritten (one commons table with
  Type column; editor branches by type — base = mappings, derived =
  expression editor with live validation, population rate = numerator
  expression + type + multiplier pickers fed by 1b); `calculated_*` files
  deleted; sort modal generalised (needs a commons `reorderIndicators`
  route — none exists); axis order from catalog sort only;
  `special_chart_checks.ts` per §1.6; help lookup regenerated
  (`deno task build:help-buttons` — the `ind-calculated` target's prose
  updates; note no UI currently consumes it) and site-doc prose updated.
- Docs (same commit as the code): SYSTEM_05 (additivity-ruling
  consequences rewritten to this model; dictionaries section), SYSTEM_08
  (m012 execution, v6 + block 4, `commonIndicators` field, mirror v2,
  read-path-parses-manifest-only progress), SYSTEM_09 (short
  `indicator_values` post-aggregation note; §1.8 authoring invariant),
  SYSTEM_10 (calculated-indicator formatting mentions), SYSTEM_06 file
  inventory, PROTOCOL_APP_STATE (stamp split + T2 rows), lint:systems.

## 3. Build — modules (lockstep, APP FIRST)

`m012/`: `_core.ts` (`indicator_values`, depends on m002, the
adjustment-basis config selection), `_results_objects.ts` (§1.5 columns),
`_metrics/m12-01-01.ts` (declared evaluation, required
`indicator_common_id`, aiDescription, vizPresets incl. scorecard).
`deno task build`; `.validation/` re-sync; push after app deploy. m003 and
m011 untouched.

## 4. Verification (automated gates only)

`deno task typecheck` (incl. lint:systems); `./validate_migrations`;
expression-lib harnesses via `deno run --allow-all -c deno.json` (grammar,
NULL, ÷0, chaining, cycles, cap-after-flattening, type-rejected
ingredients); a generation harness (fixture dictionary + adjusted counts →
expected `INDICATOR_VALUES` rows through the real step); a transform
harness (a v5 fixture manifest → v6: sort stamped, `commonIndicators`
stamped, byte-stable on re-run); an items harness through the real read
path over a testing package (derived by district/quarter, roll-up
re-evaluation, filter to a derived id, missing ingredient ⇒ NULL, chained
derived, rejected PAE/func/prop requests ⇒ 400). `./validate_queries`
stays green UNTOUCHED — the engine does not change; if it goes red, this
plan was violated.
