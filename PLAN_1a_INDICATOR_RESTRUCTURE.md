# PLAN_1a — Indicator restructure (typed commons, arbitrary expressions, m012, m007/m008 drop)

Status: **BUILT 2026-09-01, all gates green — see §5 for the verified
state and §6 for the release steps that remain.** **AMENDED 2026-09-02 by
[PLAN_1c_POPULATION_IN_EXPRESSIONS.md](PLAN_1c_POPULATION_IN_EXPRESSIONS.md)
(ships in the same release): the `population_rate` type in §1.2, the
multiplier, and the population branch of §1.12 are superseded — a
population type is an expression ingredient `[population:<type>]`, and
`format_as` is display-only with base forced to `number` (§1.4). Where
this file and PLAN_1c disagree, PLAN_1c wins.** Design ruled 2026-08-30
(Tim). Amended same day after a
code-verified review round (every claim in it was independently verified
against code before adoption), then amended again 2026-08-30 (Tim) to
make m012 an ORDINARY R MODULE rather than an app-executed DuckDB step
(§1.5, §1.14 item 6 — the reversal and its reasons are recorded there so
they are not re-litigated). **All design decisions are made — there are
no open rulings.** This file, with
[PLAN_1b_POPULATION_STORE.md](PLAN_1b_POPULATION_STORE.md) and
[PLAN_1e_MODULE_CLEANUP.md](PLAN_1e_MODULE_CLEANUP.md), replaced the
deleted `PLAN_1_COMMON_INDICATOR_TYPES.md`, whose query-time "hosting"
mechanism is REJECTED (§1.14).

**Release stipulation: 1a and 1b are ONE release.** Nothing ships until
both are green. 1a is testable alone first on a testing instance
(`./deploy_testing`) with throwaway generated packages.

Repos: app = `/Users/timroberton/projects/apps/wb-fastr` (all relative
paths below); modules = `/Users/timroberton/projects/apps/wb-fastr-modules`
(authored `_metrics/*.ts` etc.; `deno task build` there regenerates
`definition.json`; its `.validation/` schema copy re-syncs with the app's).
Deploy order: **modules push FIRST, app second** — and the modules push must
NOT yet delete the `m007/` and `m008/` directories (that deletion is 1c).
The app's metric schema requires `catalogExpressionEvaluation`, so a deployed
new app cannot parse a pre-push `definition.json` at all; conversely the
currently-deployed app still resolves every registry entry, including m007 and
m008, in one `Promise.all` that throws on the first failure
(`server/runs/generation_wizard_reads.ts`), so a push that removed those
directories would take the generation wizard down from the other side. Pushing
modules first with both directories intact is a no-op for the old app (it
strips the unknown metric field), m012 is simply not offered until the app
lands, and an app rollback afterwards stays safe.

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
2. **Types on a common indicator:** *(amended by PLAN_1c (2026-09-02):
   two types only — `population_rate` is gone; a population is the
   expression ingredient `[population:<type>]`, an ordinary leaf under the
   uniform 8-slot cap.)*
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
   **Id charset.** Bracket quoting has no escape, so `[` and `]` are
   FORBIDDEN in an indicator id (`getNewIndicatorIdIssue`,
   `lib/types/indicators.ts`, which today bans only `,;:`), and instance
   migration 079 `RAISE`s with a listing on any legacy id carrying one.
   Verified read-only across all 40 fleet instances 2026-09-01: no
   `indicator_common_id`, `calculated_indicator_id` or `indicator_raw_id`
   contains `[ ] " \`, so the guard costs no rename anywhere
   (`central-testing` has no `indicators` table at all, per §1.12).
   An escape rule was REJECTED: the grammar is typed by admins, and a
   permanent escape tax buys a character with no legitimate use in an id.
   Two neighbours of the same class, neither needing a ruling: a numeric
   literal must be written back in plain decimal, never via `String()`
   (which emits `1e-7` for `0.0000001` and `1e+21` for large values —
   neither re-parses), and an id equal to `abs`/`coalesce`/`nullif` must
   be bracket-quoted by `writeIdentifier`, not emitted bare. Every one of
   these is the same failure: authoring accepts it, generation stores it,
   and the read path throws re-parsing its own output.
4. **Presentation fields on commons**: `format_as`
   (`percent|number|rate_per_10k`; base = `number`), thresholds?,
   `group_label`, `sort_order`. *(amended by PLAN_1c (2026-09-02):
   `format_as` is display-only and the SOLE scale; base is FORCED to
   `number` by the editor and the server, derived chooses freely.)*
5. **m012 — the indicator-values module (new, an ORDINARY R MODULE).**
   `scriptGenerationType: "template"`, exactly like m003 and m011: a
   static, reviewable `script.R` in the modules repo, executed by
   `runRScript` like every other module. **No new generation type, no
   generated script text, no DuckDB step, no second script-artifact file
   name** — `indicator_values` does not exist in either module-definition
   schema, `_MODULE_SCRIPT_FILE_NAME` stays a constant, and
   `server/runs/package_internals.ts` is untouched.
   - **Prerequisites: `["m002"]`, and nothing else.** `dataSources` is a
     single `results_object` entry, `M2_adjusted_data.csv` from m002 —
     no HMIS dataset source (M2's output carries everything m012 needs).
     m002's own prerequisite on m001 is m002's business.
   - One results object, id `M12_indicator_values.csv` (results-object
     ids are file names — m008's is `M8_output_scorecard.csv`), columns
     `indicator_common_id, period_id, admin_area_2..4, ing1..ing8` —
     **area×month grain, uniformly** (rows summed across facilities at
     the finest admin level; NO `facility_id`, no facility columns;
     facility analysis stays on m3-01-01 and the quality metrics; m008
     parity, so no shipped capability is lost). One row per indicator ×
     month × finest area, ingredient slots per the catalog's slot-map;
     base rows put their count in `ing1`. This wide layout IS m008's
     shipped `numerator`/`denominator` shape generalised from two columns
     to eight, and it is what makes expression-over-sums exact at every
     grouping: `indicator_common_id` is a required GROUP BY (§1.8), so a
     row only ever carries ONE indicator, and a long-format row could
     never hold the ingredients its own formula needs.
   - **The ingredient table is SUBSTITUTED INTO the script as a data
     literal — there is no second input and no new vocabulary anywhere.**
     `script.R` carries the token `INDICATOR_INGREDIENTS`, and
     `getScriptWithParameters`
     (`server/server_only_funcs/get_script_with_parameters.ts`) replaces it
     with an R tribble of
     `indicator_common_id, slot, ingredient_common_id` rows built from the
     resolved catalog — ONE `replaceAll`, beside the `COUNTRY_ISO3` line
     that already does exactly this for every module. No file in `inputs/`,
     no `dataSources` member, no staging step, no `assetsToImport` change:
     m012 keeps `dataSources` as the single `results_object` entry above
     and `assetsToImport: []`.
     - The emitter is a pure function in `lib/`, and it ESCAPES `\` and
       `"` when writing an id into an R string literal, exactly as
       `csvCell` escapes for CSV. Combined with the §1.3 id-charset rule,
       no dictionary content can break the script.
     - **The literal is SINGLE-LINE, and every substituted value must
       stay so.** Substitution is a `replaceAll` over the whole script, so
       it also rewrites the token where a COMMENT mentions it; a
       multi-line value puts its second line onward outside that comment
       and the script no longer parses. Every pre-existing substitution
       (`COUNTRY_ISO3`, each parameter, each dataset path) is single-line
       for the same reason — this is a property of the mechanism, not a
       style choice.
     - Rows are emitted **sorted by `(indicator_common_id, slot)`**, never
       in catalog order. Sort order is a display preference and must not
       reach a memo key (the roll-up-position lesson, CLAUDE.md), and this
       is the whole of what keeps a reorder from re-running the module.
     - The flattening and slot assignment stay in TypeScript, where the
       expression library lives: **R never parses an expression**, it only
       sums the columns the literal names. §0's ruling is untouched — this
       generates DATA into a static, reviewable script, never logic
       (§1.14).
   - **The memo key needs NOTHING added.** The dictionary rides in
     `scriptText`, which `computeModuleKey`
     (`worker_routines/generate_run/resolve_reuse.ts`) already hashes, so
     "edit an indicator → regenerate" re-runs m012 by construction and
     "edit a label" or "reorder" does not. The run package stores the
     SUBSTITUTED script, so what actually executed stays reviewable per
     run.
   - **One adjustment basis**, a module `select` parameter with the four
     `count_final_*` options and `defaultValue: "count_final_outliers"`,
     matching m003's `SELECTEDCOUNT` (correction of record: there is no
     instance-level count-variable setting — verified, nothing in
     `server/`, `lib/` or `client/` defines one). Adjustment-scenario
     comparison stays m3-01-01's job; a different basis means
     regenerating, the system's normal lifecycle.
   - **"Unresolvable" means an EXPRESSION naming something the data cannot
     supply, and it fails loudly in TypeScript at capture (§2, run
     capture), before R ever runs. A base common that simply has no data
     is NOT that** — it is omitted from the ingredient table and produces
     no rows, and any expression over it yields NULL (§4). The distinction
     is load-bearing: `server/db_startup.ts` seeds all 14
     `_COMMON_INDICATORS` on every instance whether or not the country
     maps them, so treating an unmapped base common as a failure would
     block generation on essentially every instance in the fleet.
     Concretely, `resolveCommonIndicatorCatalog` emits an ingredient row
     for a `base` common ONLY when it is in `baseIdsInData` (the same set
     the derived/population_rate check already uses), and m012's
     `script.R` carries **no** "ingredient has no data" `stop()` — its
     join and pivot already yield `NA`, which is the correct answer.
   - The memo key keeps folding `R_DOCKER_IMAGE_TAG` (`computeModuleKey`,
     `worker_routines/generate_run/resolve_reuse.ts:192`) — spurious m012
     re-runs on image bumps are accepted, as they are for every other
     module.
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
7. **Server-side guards on catalog-evaluated ROs — validations of a
   DECLARED fact, never inference.** With `indicator_values` gone as a
   generation type (§1.5), the trigger is the METRIC declaration itself:
   an RO is catalog-evaluated iff a metric over it declares
   `catalogExpressionEvaluation` (§1.6) — a manifest lookup over
   `manifest.metrics`, not a module-type lookup and not a shape guess, so
   §0 clause 4 holds unchanged. On such an RO: reject any client-sent
   `postAggregationExpression` (PAE acceptance is otherwise unconditional
   — `lib/validate_fetch_config.ts:286-291` — so this is a real bypass
   without the guard), any `values[].func` other than SUM, and any prop
   outside the declared ingredient set.
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
     vocabulary (the metric's `catalogExpressionEvaluation` field and the
     v2 mirror rows; there is no new generation-type enum value to roll
     back, §1.5): a rolled-back server sees version 6 and refuses gracefully
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
    *(amended by PLAN_1c (2026-09-02): the population branch writes
    `derived` with `(num) / ([population:p] * f)`, m008-faithful; 079/080
    are unreleased and were rewritten, not followed by a compat step.)*
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
    Also REJECTED (2026-08-30, Tim, reversing the first cut of §1.5):
    **m012 as an app-executed DuckDB SQL step, and generated module
    LOGIC.** A module's logic belongs in the modules repo, versioned by
    gitRef, pinned per run, reviewable and changeable by the people who
    own the methodology without an app deploy. The retired design's own
    precedent is the argument against it: `calculated_indicators` script
    generation emitted ~25 lines of R text PER catalog row, so a
    40-indicator instance ran a ~1000-line machine-written script nobody
    reviewed. Swapping generated R for generated SQL keeps that shape and
    adds a second executor, a second script-artifact file name, a
    generation-type enum member in two schemas, and a
    `package_internals.ts` change — to save a container start. It also
    makes PLAN_1e harder: m012 folds into m003, and R→R is a merge where
    DuckDB-step→R is a rewrite.
    **The line this draws, and it is the one that has always been drawn:
    generated LOGIC is rejected; a generated DATA LITERAL substituted into
    an otherwise static, hand-written script is not** (ruled 2026-09-01,
    Tim). Every module already receives substituted data — `COUNTRY_ISO3`,
    every `select`/`text` parameter, every dataset path — and m012's
    ingredient tribble (§1.5) is one more of those: the join, group-by and
    pivot are identical in every country and live in the modules repo,
    and R still never parses an expression. This is also what the SQL step
    got for free and what a separate ingredient FILE would have had to pay
    for explicitly — the dictionary rides in `scriptText`, which
    `computeModuleKey` already hashes, so no declared input class exists
    to get wrong. Three delivery mechanisms were weighed and the other two
    REJECTED (do not re-litigate): a new `dataSources` `dictionary` member
    with a path substituted into the script, and staging a generated file
    through `assetsToImport`. Both add one enum member plus its branches
    in the schemas, the substituter, the reuse hasher and the workspace
    writer; the literal adds one `replaceAll` and nothing else.
15. **m012 is DELIBERATELY TEMPORARY** — it folds into a redefined m003
    in [PLAN_1e](PLAN_1e_MODULE_CLEANUP.md) (trigger recorded there).
    Nothing new hard-codes m12 ids beyond ordinary PO/preset storage.
    m003, m011, the SQL builders, and the fetch wire are UNTOUCHED by
    this plan.

## 2. Build — app

*(amended by PLAN_1c (2026-09-02): the `population_rate` member, its
fields and columns, and `MAX_POPULATION_RATE_NUMERATOR_INGREDIENTS` were
deleted everywhere; the editor gained the expression palette.)*

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
- Generation: NO dispatcher arm, no new executor, no new input file, no
  new declared vocabulary — m012 is a `template` R module and runs down
  the existing path. The ONLY change is one line in
  `get_script_with_parameters.ts` replacing `INDICATOR_INGREDIENTS` with
  an R tribble built from the resolved catalog, beside the
  `COUNTRY_ISO3` line that already does this (§1.5). `prepare_inputs.ts`,
  `pipeline.ts`, `execute_module.ts`, `resolve_reuse.ts` and
  `resolve_modules.ts` are UNTOUCHED by the ingredient table; finalize, RO
  stamping and memoization discipline are untouched throughout.
- Manifest: `RUN_MANIFEST_SCHEMA_VERSION` 5→6; transform block 4 per
  §1.9; finalize stamps `commonIndicators` + catalog sort; delete
  `getCommonIndicatorsFromManifestInputs` and repoint its consumers.
- Read path: the catalog-expression evaluation step in
  `getPresentationObjectItemsFromRun` for catalog-evaluated ROs (main +
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
  (m012 as an ordinary R module + its staged ingredient table and memo
  input, v6 + block 4, `commonIndicators` field, mirror v2,
  read-path-parses-manifest-only progress), SYSTEM_09 (short
  catalog-expression post-aggregation note; §1.8 authoring invariant),
  SYSTEM_10 (calculated-indicator formatting mentions), SYSTEM_06 file
  inventory, PROTOCOL_APP_STATE (stamp split + T2 rows), lint:systems.

## 3. Build — modules (lockstep, MODULES FIRST — see Repos, above)

`m012/`:

- `_core.ts` — `scriptGenerationType: "template"`, `prerequisites:
  ["m002"]` and nothing else, `dataSources` a single `results_object`
  entry for `M2_adjusted_data.csv`, `assetsToImport: []`.
- `_parameters.ts` — `SELECTEDCOUNT`, the four `count_final_*` options,
  `defaultValue: "count_final_outliers"` (m003's parameter, verbatim).
- `script.R` — STATIC and reviewable, in dplyr/readr/tidyr like every
  other module: read `M2_adjusted_data.csv`, take the ingredient table
  from the `INDICATOR_INGREDIENTS` token (the app substitutes a tribble
  literal there, §1.5), sum the selected count column to
  admin_area_2/3/4 × `period_id` × `indicator_common_id`, then join the
  ingredient table and pivot each indicator's ingredients into
  `ing1..ing8`. It never parses an expression — the table names the
  columns. Unused slots are written as `NA`. It carries **no** guard on
  an ingredient having no data (§1.5): the join and pivot already yield
  `NA`, which is the answer.
- `_results_objects.ts` — §1.5 columns.
- `_metrics/m12-01-01.ts` — declared `catalogExpressionEvaluation`,
  `valueProps: ["value"]`, required `indicator_common_id`, aiDescription,
  vizPresets incl. scorecard.

`deno task build`; `.validation/` re-sync; **push BEFORE the app deploy,
keeping `m007/` and `m008/` in place** (see Repos, above). m003 and m011
untouched.

## 4. Verification (automated gates only)

`deno task typecheck` (incl. lint:systems); `./validate_migrations`;
expression-lib harnesses via `deno run --allow-all -c deno.json` (grammar,
NULL, ÷0, chaining, cycles, cap-after-flattening, type-rejected
ingredients); a generation harness (fixture dictionary + adjusted counts →
expected `INDICATOR_VALUES` rows through m012's REAL `script.R`, run with
the local `Rscript` — verified present, R 4.3.2 with dplyr/readr/tidyr, and
the same binary the dev generation path invokes when `_IS_PRODUCTION` is
false); a memoization check over `computeModuleKey` (an indicator
expression edit changes m012's key; a label edit and a reorder do NOT —
§1.5's sorted-rows requirement is what makes the second half true); a
transform
harness (a v5 fixture manifest → v6: sort stamped, `commonIndicators`
stamped, byte-stable on re-run); an items harness through the real read
path over a testing package (derived by district/quarter, roll-up
re-evaluation, filter to a derived id, missing ingredient ⇒ NULL, chained
derived, rejected PAE/func/prop requests ⇒ 400). `./validate_queries`
stays green UNTOUCHED — the engine does not change; if it goes red, this
plan was violated.

## 5. Status (2026-09-01): BUILT, verified, no code work outstanding

The full §2/§3 build is in the working trees of both repos, including
every correction from the 2026-09-01 implementation review (the
substituted-tribble mechanism, the expression round-trip fixes,
client-cache name bumps `instance_indicators_v2`/`po_detail_v2`/
`po_items_v2`, authoring-integrity guards, and all ride-alongs). The
design questions that review raised are RULED and folded into §1.3, §1.5,
§1.14, §3 and Repos above. §0–§4 plus this section are the complete
current description; nothing in this plan is unfinished code work.

Verified 2026-09-01, all green in one pass:

- App repo: `deno task typecheck` (incl. `lint:systems`),
  `./validate_migrations`, `./validate_queries` — all exit 0.
- Modules repo: `deno task build` exits 0 (10 authored modules; see the
  m007/m008 ruling below).
- The §4 harnesses were executed against the real code, not stubs: the
  generation path through m012's actual `script.R` under local Rscript
  (an unmapped base common does not abort; facilities are summed away;
  ingredients land in their slot-map slots), the read path through
  `applyCatalogExpressionsToItems` (per-area values, NULL on a missing
  ingredient, and a roll-up row evaluates the formula over SUMMED
  ingredients — 65/230 = 28.26%, not the 27.5 mean of rates), the
  expression round-trip (every writer output re-parses: extreme numeric
  literals via the AST's `raw` field, `[bracket-quoted]` ids, the
  reserved names `abs`/`coalesce`/`nullif`; ids containing `[` or `]`
  rejected at authoring; a multiplicative substitution chain rejected at
  the 1000-node cap `MAX_INDICATOR_EXPRESSION_NODES`), and the v1
  indicators-mirror schema rejecting a row that carries `type` (so a
  drifted v2 row fail-stops instead of degrading). Harnesses are session
  artifacts, deliberately not kept; §4 says how to rebuild each.

**m007/m008 — RULED 2026-09-01. CLOSED. Do not re-raise.** The `m007/`
and `m008/` directories STAY in the modules repo, byte-frozen at HEAD,
until [PLAN_1e](PLAN_1e_MODULE_CLEANUP.md) deletes them. Reason: every
still-deployed pre-restructure app resolves its WHOLE registry — m007
and m008 included — from the repo's HEAD at wizard time
(`server/runs/generation_wizard_reads.ts` on the old app), so removing
them before the fleet runs the new app takes the old generation wizard
down. They are FROZEN ARTIFACTS, not authored modules:
`build_definitions.ts` skips them via `FROZEN_MODULE_DIRS` (their
sources no longer validate under the current authoring schema — m008's
`calculated_indicators` generation type left the GitHub enum in §1.11,
by design), and PLAN_1e deletes the directories and that skip list in
one commit. Never rebuild them, never edit them, never delete them
before 1e.

## 6. What remains: release steps only, in order

1. **Commit, both repos plus the site** (Tim's call). Everything is
   uncommitted: the app working tree, the modules working tree (m012,
   schema re-sync, build guard; `git status` shows m007/m008 clean), and
   three site files in
   `/Users/timroberton/projects/apps/wb-fastr-site/src/content/docs/`
   (`admin-guide/indicators.md`, `fr/admin-guide/indicators.md`, and the
   `help#` prefix fix in `fr/admin-guide/data-hmis.md`). The site must
   deploy with the app whenever it does — the regenerated help-button
   anchors (`derived-indicators`) point into it.
2. **Testing instance any time**: 1a is testable alone via
   `./deploy_testing` with throwaway generated packages (Release
   stipulation, top of this file).
3. **The modules push can go first at any point** — with m007/m008
   intact it is a no-op for deployed old apps (they strip the unknown
   metric field; m012 is simply not offered until the new app lands).
   The new app CANNOT deploy before it (Repos section, top of file).
4. **Production ships ONLY as one release with 1b**
   ([PLAN_1b_POPULATION_STORE.md](PLAN_1b_POPULATION_STORE.md), BUILT
   2026-09-02 — its own §Status has the verified state). Order on release day:
   modules push first, app second; a later app rollback stays safe
   (§1.9's version stamp).
5. **After the fleet runs the new app**:
   [PLAN_1e](PLAN_1e_MODULE_CLEANUP.md) — delete m007/m008 +
   `FROZEN_MODULE_DIRS`, fold m012 into m003.

