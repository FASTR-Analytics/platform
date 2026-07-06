# Plan: System 9 (Viz Query & Cache) — Review Findings & Fixes

## Status: REVIEW COMPLETE — two adversarial rounds done; F3 since FIXED, rest pending go-ahead

> 2026-07-06 (S9 doc cycle re-verification): **F3 is fixed** — all four options
> callers now pass `excludeReplicantFilter: true` (`resolveDefaultReplicant`,
> `ReplicateByOptions` ×2, dashboards `resolve_replicant_structure`, AI
> `assert_replicant_valid`), landed with the effective-config work (1af6b191 +
> follow-ups); the server no longer self-strips and `PO_CACHE_VERSION` is "3",
> so this plan's F3 mechanism description reflects the pre-fix code. All other
> non-dropped findings re-verified still open. Open items now indexed in
> [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md); this plan stays
> as the implementation-detail record.

Output of the S9 review cycle (review → triage → fix → document, SYSTEMS.md §5),
**after two adversarial hardening passes**: round 1 (21 agents — refute-first
verification + fix critique on F1–F9 + a 3-lens completeness sweep), round 2 (7 agents
— refute-first verification of the completeness-sweep findings N1–N5, 2 independent
skeptics each on N1/N2). Runnable harnesses backed every pure-function claim. Verdicts
below are the *post-adversarial* state, not the original review's.

Nothing is implemented until you give an explicit per-finding go-ahead. The one
cross-cutting fix (N1) warrants a dedicated fix-design + critique pass first.

S9 surface: `SYSTEM_09_viz_query_cache.md` frontmatter (lint-enforced manifest).

### Verdict summary

| ID | Title | Verdict | Severity | Fix status |
|----|-------|---------|----------|-----------|
| F1 | getPeriodBounds malformed SQL on quarter_id-only + year filter | **CONFIRMED** | HIGH | fix wording was a trap — corrected below |
| F2 | MiniDisplay stale after module re-run | **REFUTED** | — | dropped |
| F3 | Replicant selection fragments replicant-options cache | **CONFIRMED** | MED | fix correct but incomplete (4 call sites) |
| F4 | Div-by-zero guard misses paren/func denominators | **PARTIAL** | LOW | recommend DROP or validator-tighten |
| F5 | Multi-`=` PAE silently drops middle term | **CONFIRMED** | MED | fix correct & complete |
| F6 | Stale-response race in MiniDisplay effect | **CONFIRMED** | LOW | fix correct; do NOT bundle with F2 |
| F7 | Dead code `cache_class_B_in_memory_map.ts` | **CONFIRMED** | LOW | fix incomplete (manifest line) |
| F8a | Ethiopian last-quarter identical-branch ternary | **CONFIRMED** | LOW | original fix was BACKWARDS — corrected below |
| F8b | HMIS version hash `undefined_undefined` | **REFUTED** | — | dropped (cosmetic only) |
| F8c | HFA `VersionParams.hash` vs payload `cacheHash` | **CONFIRMED** | LOW | fix wording DANGEROUS — constrained below |
| F9 | Doc drift (DOC_VALKEY_CACHE version source) | confirmed doc-only | — | + see N1: code is *also* under-complete |
| N1 | Facility-columns config absent from 4 PO cache version keys | **CONFIRMED** | HIGH | **PENDING → PLAN_PROJECT_SNAPSHOT** (project self-containment) |
| N2 | `col IN (NaN)` from non-numeric integer-column filter | **CONFIRMED** | LOW (downgraded from MED) | validator + Zod superRefine; coordinate w/ F1/F3 |
| N3 | ReplicateByOptions effect under-tracks periodFilter | **CONFIRMED** | LOW | track nested periodFilter fields |
| N4 | hashFetchConfig values-array unstable sort | **CONFIRMED** | LOW | fragmentation only; fix optional |
| N5 | hashFetchConfig filter-value delimiter collision | **PARTIAL** | LOW | narrower than claimed; defensive encoding |

---

## F1 — `getPeriodBounds` emits invalid SQL on quarter_id-only tables filtered by a derived period column — CONFIRMED [HIGH]

**Location:** [get_period_bounds.ts:21-23](server/server_only_funcs_presentation_objects/get_period_bounds.ts#L21-L23), quarter_id branch [:106-121](server/server_only_funcs_presentation_objects/get_period_bounds.ts#L106-L121).

**Verified mechanics & reachability (CONFIRMED).** The CTE guard
`needsPeriodCTE = hasPeriodId && …` is always false on a quarter_id-only table
(`hasPeriodId === false`), so no derived-`year` CTE is built; `buildWhereClause`
emits a **bare** `year IN (...)` for a `year`-dimension filter; the quarter_id
branch then runs `SELECT MIN(quarter_id) … WHERE year IN (...)` against a table
with no physical `year` column → Postgres throws → swallowed by
`tryCatchDatabaseAsync` → `{success:false}` envelope, viz fails to load.

Reachability is **proven**, not theoretical: the enricher offers `year` as a
disaggregation option on quarter_id-only metrics ([metric_enricher.ts:169-177](server/db/project/metric_enricher.ts#L169-L177)); the editor lets the user set `year` as a `disaggregateBy` with `disDisplayOpt="replicant"` → `getReplicateByProp` returns `"year"` → `getFiltersWithReplicant` injects `{disOpt:"year", values:[…]}` into the **regular** fetch config sent to `getPresentationObjectItems`. `firstPeriodOption = mostGranular = "quarter_id"` → quarter_id branch. `validateFetchConfig` accepts a `year` filter disOpt.

**Refinements from the adversarial pass:**
- The symptom is an **error envelope** ("viz fails to load"), not literal silent-stale.
- The `month` half of the guard is **unreachable** on quarter_id-only tables (enricher offers only `{quarter_id, year}`) — reachability rests entirely on `year`, which is sufficient.
- `periodFilterExactBounds` is **confirmed unset** at the `buildWhereClause`→`getPeriodBounds` call ([get_presentation_object_items.ts:83-86](server/server_only_funcs_presentation_objects/get_presentation_object_items.ts#L83-L86); it's computed later at :107) — so the year-as-replicant filter is the sole trigger; the original plan's candidate-2 (period bounds → `year>=X`) is correctly N/A.
- The finding cited a **second caller** ([get_results_value_info.ts:109](server/server_only_funcs_presentation_objects/get_results_value_info.ts#L109)) as "same pattern" — **inaccurate**: it passes `whereStatements=[]`, so it can never reference `year`. Not a trigger.

**CORRECTED FIX — the original "eliminate the hand-written guard entirely" wording was a trap.** Naively killing the guard and selecting `MIN(year)` over `sourceTable` *regresses* the currently-working year-option branches (period_id+po=year, quarter_id+po=year), which today derive `year` via `PERIOD_COLUMN_EXPRESSIONS.year` / `QUARTER_ID_COLUMN_EXPRESSIONS.year` **without** a CTE ([get_period_bounds.ts:65-91](server/server_only_funcs_presentation_objects/get_period_bounds.ts#L65-L91)). Calling `CTEManager.fromQueryConfig` + `emitWITHClause()` wholesale also pulls in an irrelevant `facility_subset` CTE and forces a `QueryConfig` onto the no-filter caller. **Do this instead:**
1. Extract the period-CTE-body builder from `CTEManager.fromQueryConfig` ([cte_manager.ts:72-98](server/server_only_funcs_presentation_objects/cte_manager.ts#L72-L98)) into a shared helper `buildPeriodCTE(tableName, {hasPeriodId, hasQuarterId, neededPeriodColumns})` → `{ctePrefix, sourceTable}`.
2. In `getPeriodBounds`, compute `needsPeriodCTE` with the **same rule as the main path** ([get_query_context.ts:64-66](server/server_only_funcs_presentation_objects/get_query_context.ts#L64-L66)): `(hasPeriodId && needed.size>0) || (hasQuarterId && needed.has("year"))` — drop the brittle substring sniff.
3. **Keep** the existing three branches' SELECT expressions; the year branch chooses `"year"` when using the CTE, else the existing direct expressions.
4. Pass `neededPeriodColumns` (already available in the query context built at [get_presentation_object_items.ts:47](server/server_only_funcs_presentation_objects/get_presentation_object_items.ts#L47)); for `get_results_value_info.ts` pass an empty set (where=[] never needs a CTE) so it needs no `buildQueryContext`.

This is value- and throw-equivalent on every reachable path (harness-verified), kills the CTE-shape drift at its single source, and stays server-only.

**Why no duplicate-column risk:** `run_module_iterator.ts:424-428` drops physical `month`/`quarter_id`/`year` columns by time-family, so `SELECT *, (quarter_id/10)::int AS year` can't collide.

**Persistence note (extends the byte-equivalence requirement):** `getPeriodBounds`
resolves `dateRange`, which **is** part of the cached `ItemsHolderPresentationObject`
payload and is baked into stored figure snapshots. SHAPE is unchanged and the broken
quarter_id-only path currently throws (nothing was ever cached, so no stale snapshot
to drift). **But** the implementer must prove the fix is **`dateRange`-value-equivalent
on the working period_id / plain-year paths**, not just SQL-string-equivalent — a silent
`dateRange` change there would propagate into stored figure inputs with no cache-prefix
bump. (`dateRange`/`periodFilterExactBounds` are *not* in `hashFetchConfig`, so no key
drift — verified.)

---

## F2 — MiniDisplay misses module-data version → stale after module re-run — REFUTED [dropped]

The finding's premise (that `lastUpdated.presentation_objects[id]` does **not** bump
on a module re-run, making `moduleLastRun` an independent untracked version source) is
**false**. On every successful module re-run, [set_module_clean.ts:81-137](server/task_management/set_module_clean.ts#L81-L137) calls `setAllModuleDependentsLastUpdatedAndNotify`, which **SQL-UPDATEs `presentation_objects.last_updated`** for every dependent PO ([get_dependents.ts:78-91](server/task_management/get_dependents.ts#L78-L91)) and broadcasts `notifyLastUpdated(… 'presentation_objects' …)`. The client installs it ([t1_store.ts:160-164](client/src/state/project/t1_store.ts#L160-L164)), and the MiniDisplay effect tracks exactly that path → it re-runs. FIFO ordering on the single `project_updates_v2` BroadcastChannel guarantees `module_dirty_state` (→ `moduleLastRun` install) is processed **before** the PO bump, so the non-reactive version-key read computes the new key → cache miss → fresh fetch. Dataset re-integration is covered transitively (dirty → re-run → same bump).

**Consequence:** there is no stale-render bug, and the awkward "resolve module id reactively in MiniDisplay" wrinkle disappears. F6 below remains (it's a *separate* concurrency concern) and must **not** be bundled with this (now-dropped) fix.

---

## F3 — Replicant selection fragments the replicant-options cache — CONFIRMED [MED]

**Location:** [t2_presentation_objects.ts:336-342](client/src/state/project/t2_presentation_objects.ts#L336-L342).

**Verified (CONFIRMED, certain).** The replicant-options lookup passes
`resFetchConfig.data` (built with no options → includes the `selectedReplicantValue`
pin), so `_REPLICANT_OPTIONS_CACHE`'s `hashFetchConfig` key fragments per replicant
value visited → a fresh fetch per pane/value switch. Harness over 6 cases confirmed
the server (`get_possible_values.ts:44-46`) strips the self-filter **by dimension on
every path producing `possibleValues`** (single `filteredFilters` source; raw `filters`
never re-read), so the returned options are byte-identical with or without the pin →
this is **pure perf/fragmentation, not wrong data**. The auto-select
([:343-368](client/src/state/project/t2_presentation_objects.ts#L343-L368)) reads only
`possibleValues`/`status` (invariant), and `_PO_ITEMS_CACHE` keys on the *separate*
`finalFetchConfig` (untouched) → worst case after the fix is one cold miss.

**FIX:** pass a dedicated config with `{ excludeReplicantFilter: true }` (matching the
canonical [ReplicateByOptions.tsx:84](client/src/components/ReplicateByOptions.tsx#L84)):
```
const resReplicantFetchConfig = getFetchConfigFromPresentationObjectConfig(
  poDetail.resultsValue, config, { excludeReplicantFilter: true },
);
if (resReplicantFetchConfig.success === false) { /* yield error — REQUIRED guard */ }
// pass resReplicantFetchConfig.data to getReplicantOptionsFromCacheOrFetch
```

**Adversarial refinements:**
- **Incompleteness:** the finding undercounts fragmentation. [resolve_figure_from_metric.ts:28](client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts#L28) has the **same** bug, and [resolve_replicant_structure.ts](client/src/components/dashboards/resolve_replicant_structure.ts) uses a **third** key shape (`"UNSELECTED"` sentinel). For full cache convergence/reuse, **all four** call sites must align on the `excludeReplicantFilter:true` key. Decide: fix just `t2` (closes the per-value churn, the worst case) or all four (full convergence).
- **Required guard:** the illustrative snippet must handle `resReplicantFetchConfig.success === false` before `.data` (it can throw on missing `timeseriesGrouping`).
- **Mechanism wording fix:** `getFiltersWithoutReplicant` does **not** "remove the replicant filter"; it returns base `filterBy` *without appending* the replicant pin that `getFiltersWithReplicant` adds. Net sets differ only by that pin (fix still correct); the description should say "omits the appended pin."
- Status (`too_many_values`/`ok`/`no_values_available`) can't flip (server strips → identical count). No persistence crossing (client cache **key** change only; orphaned fragmented entries just expire).

---

## F4 — Division-by-zero guard misses parenthesized/function denominators — PARTIAL [recommend DROP or validator-tighten] 

**Location:** [query_helpers.ts:315](server/server_only_funcs_presentation_objects/query_helpers.ts#L315).

**Verified PARTIAL.** PAE strings are **definition-driven**, not user free-text
([get_fetch_config_from_po.ts:67](lib/get_fetch_config_from_po.ts#L67)). **All authored
PAEs use a bare-identifier denominator**, every one correctly NULLIF-wrapped today. The
unguarded case arises **only** from a hand-crafted route body, and the impact is a
Postgres div-by-zero **error vs NULL** (not injection — the validator blocks the
dangerous shapes). So real-world severity is **LOW**.

**The original proposed fix is INCOMPLETE and should not be implemented as written:** it
adds paren-group handling but still mangles **function-call denominators** —
`a/ABS(b)`, `a/COALESCE(...)`, `a/NULLIF(...)` all pass the validator (those funcs are
whitelisted) and both the current *and* proposed transform emit invalid SQL
`a / NULLIF(ABS, 0)(b)`. Also missed: **decimal denominators** `a/2.5` are currently
corrupted to `NULLIF(2,0).5`; and the title's "numeric denominators" is wrong (`a/2`
works fine).

**Recommendation:** **DROP for now** (no authored/planned metric hits it; the validator
already blocks injection; worst case on a crafted config is an error, not wrong data).
**If we do fix it**, prefer tightening `isSafePostAggregationExpression` to require a
bare `SQL_IDENTIFIER` after any top-level `/` (consistent with the validator-as-boundary
posture; incidentally refuses every mangle-able shape) over hand-rolling a paren/func
scanner. No persistence crossing either way (transient query-build string; SQL text is
not in the cache key; the case previously threw so nothing was cached).

---

## F5 — Multi-`=` PAE silently drops the middle term — CONFIRMED [MED]

**Location:** [query_helpers.ts:303-307](server/server_only_funcs_presentation_objects/query_helpers.ts#L303-L307).

**Verified CONFIRMED + fix correct & complete.** `a = b = c` passes the validator
but the transform keeps only `a` and `c`, silently dropping `b` → valid-but-wrong SQL.
Hand-crafted only (all 9 authored PAEs have exactly one `=`), but a silent
miscomputation. Harness confirmed the proposed fix rejects **0** legitimate PAEs and
all bug inputs.

**FIX:** in `isSafePostAggregationExpression`, reject when the `=` count `!= 1` (one
line; both the Zod `.refine` boundary and the imperative `validateFetchConfig` inherit
it). With exactly one `=`, `split("=")` yields exactly 2 chunks — no middle term can
exist. **Place it in the validator, not as an assert in `applyPostAggregationExpression`**
(an assert there would throw mid-assembly and surface as a generic swallowed DB error).

**Bonus (verified):** `==` currently slips through `SAFE_EXPRESSION` (two `=` chars);
the `!= 1` guard also rejects it. (`>=`/`<=`/`<>`/`!=` are already impossible — no
`<`/`>`/`!` in the charset.) No persistence crossing.

---

## F6 — Stale-response race in the MiniDisplay effect — CONFIRMED [LOW]

**Location:** [PresentationObjectMiniDisplay.tsx:26-40](client/src/components/PresentationObjectMiniDisplay.tsx#L26-L40).

**Verified CONFIRMED** (harness reproduces older-resolves-last clobber). Two rapid
effect re-runs (PO `last_updated` bursts) run two async-generator loops both writing
`setFigureInputs`; the older can commit last.

**FIX:** monotonic version guard — `let version = 0` at component scope; take
`const thisVersion = ++version` synchronously before the first await; check
`if (version !== thisVersion) return;` **inside the `for await` loop** before each
`setFigureInputs`. An `AbortController` is **not** needed (the only other side effect is
beneficial cache-warming, keyed on content). Template: [visualization_editor_inner.tsx:142-191](client/src/components/visualization/visualization_editor_inner.tsx#L142-L191) (same generator shape) — **not** `preset_preview.tsx` (that guards a single promise; MiniDisplay is a generator with multiple yields, so a final-resolve-only guard is wrong).

**Critical: do NOT bundle with F2 (now dropped).** The bundling regression the critic
found (loading-flash across thumbnail grids on every module re-run) only arose from
F2's proposed `moduleDataVersionKey` tracking, which we are **not** adding. Standalone,
the effect still re-runs only on the (rare) PO `last_updated` bump, so F6 is a clean,
low-risk hardening. No persistence crossing (transient signal state).

---

## F7 — Dead code `lib/cache_class_B_in_memory_map.ts` — CONFIRMED [LOW / cleanup]

**Verified CONFIRMED, certain.** `TimCacheB` has **zero** instantiations repo-wide
(`new TimCacheB`/import = 0); kept alive only by the `export *` at [lib/mod.ts:3](lib/mod.ts#L3). In-use classes are `TimCacheC` (server) and `TimCacheD` (client). No stranded types (`ResolvedPayload`/`UnresolvedPayload` aren't exported and are redefined elsewhere). Lint stays green post-deletion.

**FIX (3 deletions in one commit — the original "file + re-export" was incomplete):**
1. delete [lib/cache_class_B_in_memory_map.ts](lib/cache_class_B_in_memory_map.ts);
2. delete the [lib/mod.ts:3](lib/mod.ts#L3) re-export;
3. delete the dead glob at `SYSTEM_09_viz_query_cache.md:8` (the lint-enforced S9 manifest — leaving it makes the manifest reference a non-existent file);
4. tick the dead-code entry off `SYSTEM_09_viz_query_cache.md` Open items.

Run `lint_systems.ts` + `deno task typecheck` to confirm green. No persistence crossing
(never instantiated → never produced a stored value).

---

## F8a — Ethiopian last-full-quarter identical-branch ternary — CONFIRMED [LOW] — original fix was BACKWARDS

**Location:** [get_fetch_config_from_po.ts:223-225](lib/get_fetch_config_from_po.ts#L223-L225): `const quarterYear = maxMonth === 1 ? maxYear - 1 : maxYear - 1;` (both branches identical).

**Verified CONFIRMED, and the original fix direction was WRONG.** Two independent
harnesses (deriving the intended semantic from the verified-correct Gregorian branch,
12/12, and from the Ethiopian quarter layout) agree: the bug bites at **`maxMonth` 11
and 12**, where the code returns the quarter window **one full year too early**;
`maxMonth === 1` is **accidentally correct** (month 1 belongs to the previous fiscal
year's Q-window). The original plan guessed "`maxMonth===1` branch should be `maxYear`" —
**backwards**. Correct fix:
```
const quarterYear = maxMonth === 1 ? maxYear - 1 : maxYear;
```
Verified **0/132 failures** (months 2010–2020) vs current code's 22 failures (and the
original wrong fix's 33). **Reachable**: Ethiopian instance (`INSTANCE_CALENDAR=ethiopian`)
+ monthly (period_id) data + `last_calendar_quarter`/`last_n_calendar_quarters` filter,
latest data in month 11/12/1. (The `quarter_id` early-return at [:134-142](lib/get_fetch_config_from_po.ts#L134-L142) does not gate monthly data.)

**Confidence: likely, not certain.** Residual: (a) the Ethiopian quarter boundaries were
inferred from the code's own branch structure (no external confirmation); (b) month-13
(pagume) handling. **Get a domain owner to confirm the Ethiopian fiscal-quarter
definition before patching.** No persistence crossing (`periodFilterExactBounds` is
request-time, not stored/keyed; only a stale-value-until-next-cache-bump caveat).

---

## F8b — HMIS version hash `undefined_undefined` — REFUTED [dropped]

`versionId`/`indicatorMappingsVersion` are undefined **only** in the pristine 0-row
state; every data mutation writes a `dataset_hmis_versions` row, and the wire schema
requires `z.number()`/`z.string()` (400 otherwise). Harness confirmed no two distinct
data states share the hash. **No stale-serve.** Cosmetic at most; dropped.

---

## F8c — HFA `VersionParams.hash` vs payload `cacheHash` field-name divergence — CONFIRMED [LOW] — fix must be CONSTRAINED

**Verified CONFIRMED** (both resolve to the same `computeHfaCacheHash` today; latent
trap if a future one-sided edit diverges them → the `cache_class_C.ts:116` guard logs
"THE VERSION HASHES DON'T MATCH" and silently no-ops the cache — a perf regression, not
wrong data). Severity **LOW**.

**The original "align names" wording is DANGEROUS and must be constrained.** The
**payload** `cacheHash` field is part of the wire type, is stored inside the Valkey
payload JSON, and its sibling `hfaCacheHash` is persisted in **project DB JSON**
(`datasets.info`, backfilled by migration 011) and cross-process-compared for staleness.
**Renaming the payload field crosses all three persistence layers → STOP-and-escalate.**

**Only-safe action:** rename the **in-memory** `VersionParams { hash }` → `{ cacheHash }`
(3 server sites: [caches/dataset.ts:45](server/routes/caches/dataset.ts#L45) + two `{ hash }` literals at `routes/instance/datasets.ts:350,364`), payload untouched. **Cheaper and equally good:** skip the code change and add a one-line doc-comment invariant at the `VersionParams`/`parseData` boundary — the hard guard already self-announces any divergence. **Recommend: keep deferred** (matches original triage).

---

## F9 — Doc drift (DOC_VALKEY_CACHE version source) — confirmed doc-only

The catalog lists the PO/metric/replicant caches' version source as `moduleLastRun`
only; the code also folds in `datasetsVersion`. Fix the doc. **But N1 below shows the
code is *also* under-complete** (facility config) — so once N1 lands, the doc's version
source should list `moduleLastRun + datasetsVersion + facilityColumnsFlags`.

---

## NEW findings from the completeness sweep — round-2 verified

Surfaced by the 3-lens completeness critics, then put through a refute-first round
(2 independent skeptics on N1/N2, harnesses throughout). Verdicts:

### N1 — Facility-columns config absent from all 4 PO cache version keys — CONFIRMED [HIGH]
**Status: closed here, deferred to `PLAN_PROJECT_SNAPSHOT.md`.** N1 is the canonical
instance of the cross-level drift class: facility config is instance-only and the
project caches can't version on it. The decided fix is *not* a cross-DB version-fold
patch but to make the project self-contained — snapshot the config into the project
(matching the datasets pattern) and version the PO caches off the project-local stamp.
That's the project-snapshot plan's job. **The cache-versioning half still applies after
the snapshot**: the 4 PO caches must fold the project-local facility-columns version
stamp (a flags-only token — labels are display-only), or they drift just the same.
Detail below retained as the evidence record.

Both skeptics confirmed (certain). An admin with `can_configure_settings` saves
facility columns → `updateFacilityColumnsConfig` ([config.ts:152-167](server/db/instance/config.ts#L152-L167)) does a bare UPSERT on `instance_config` only + a `config_updated` SSE; it bumps **no** module/dataset/PO version and clears **no** Valkey cache. The four viz caches version only on `presentationObjectLastUpdated` (`_PO_DETAIL`) or `PO_CACHE_VERSION|moduleLastRun|datasetsVersion` (items/metric/replicant) — **none fold facility config**. Yet `getEnabledOptionalFacilityColumns(facilityConfig)` gates `needsFacilityJoin` + the facility/non-facility filter split ([get_query_context.ts:34-89](server/server_only_funcs_presentation_objects/get_query_context.ts#L34-L89)) **and** which `facility_*` disaggregation options exist ([metric_enricher.ts:121-148](server/db/project/metric_enricher.ts#L121-L148)). So after a toggle: `_PO_ITEMS` serves a **stale figure**, `_METRIC_INFO` a **stale option list**, until `moduleLastRun`/`datasetsVersion` next changes. Client mirrors it (`moduleDataVersionKey`, no facility fold). The dataset & structure caches *do* fold a facility hash — the PO caches are the inconsistent outlier. Harness proved the version hash is byte-identical across a toggle while the enabled-set flips.

**Severity: HIGH** — silent wrong *data* is the worst class. Mitigating caveats (noted, but they don't lower the tag): the trigger is an infrequent admin action and it self-heals on the next data/module bump.

**FIX (both skeptics converged):** fold a **flags-only** hash — the 8 `include*` booleans, e.g. `getEnabledOptionalFacilityColumns(config).join(",")` — into all 4 PO cache version inputs, **server** (`caches/visualizations.ts` `versionHashFromParams` + `parseData`) **and client** (`t2_presentation_objects.ts` + `t2_replicant_options.ts` `versionKey`), byte-identical on both sides. Do **NOT** use the full `hashFacilityColumnsConfig` — its 8 `label*` fields are display-only and never reach a PO payload, so folding them would spuriously invalidate every PO cache on a label rename (the "no display-only prefs in a cache hash" rule). Version-KEY change → one-time mass miss then steady-state hits; **no payload-shape change, no migration, no stored-FigureInputs sweep.** Caveat: the version-param build site must add the `getFacilityColumnsConfig` read (mainDb is in scope there).

### N2 — `col IN (NaN)` from a non-numeric integer-column filter — CONFIRMED [LOW, downgraded from MED]
Both skeptics confirmed the mechanism (harness: `validateFetchConfig` passes `{disOpt:"year", values:["UNSELECTED"]}`; `buildWhereClause` → `year IN (NaN)` → invalid SQL → swallowed → viz error). **But severity is LOW**, not MED: the common path **self-corrects** — `get_possible_values.ts:44-46` strips the replicant's own filter so the options query is well-formed and normally returns `"ok"`, and the auto-select then replaces `"UNSELECTED"`. The sentinel only survives on `too_many_values` (>500 distinct periods — unrealistic for `year`), `no_values_available` (zero-row data that'd render "no data" anyway), or a transient `replicantRes.success===false`. Net effect: degrades a clean empty/error state into a *swallowed SQL error*. Not injection. **Interacts with F1/F3** (same year-as-replicant path; fixing F3 reduces but doesn't remove the `no_values_available` trigger). **FIX:** in `validateFetchConfig`, reject non-finite (`Number.isFinite(Number(v))`) values on integer/period columns, mirrored in `genericLongFormFetchConfigSchema` via a cross-field `superRefine` so boundary + imperative guard stay in sync. No persistence crossing.

### N3 — ReplicateByOptions effect under-tracks periodFilter — CONFIRMED [LOW]
Effect tracks `trackDeep(filterBy)` + `moduleDataVersionKey` but **not** `periodFilter`,
which the server uses (as `periodFilterExactBounds`) to narrow `possibleValues`. In the
editor, replacing the whole `periodFilter` object doesn't re-run the effect → **stale
picker list** (chart data stays correct — bounded, editor-only). **FIX:** explicitly read
the `periodFilter` bound fields before the await (mirror [visualization_editor_inner.tsx:233-252](client/src/components/visualization/visualization_editor_inner.tsx#L233-L252)) or `trackDeep(config.d)`. No persistence crossing.

### N4 — hashFetchConfig values-array unstable sort — CONFIRMED [LOW, practically unreachable]
Sort key is `v.prop` only → same-prop/different-func entries can hash two ways →
**fragmentation only** (distinct key = distinct *correct* slot, never a wrong hit).
Confirmed unreachable via the real app: the non-PAE path forces a single `valueFunc`,
and across all 39 authored metrics / 9 PAEs there are **zero** same-prop/different-func
or duplicate-prop values; only a hand-crafted body (not rejected by the validator) could
trigger it, still benignly. **Fix optional/cosmetic** (normalize the sort to
`${prop}&${func}`). No persistence crossing (key only).

### N5 — hashFetchConfig filter-value delimiter collision — PARTIAL [LOW]
Mechanism real and load-bearing (`hashFetchConfig` *is* the `_PO_ITEMS`/`_REPLICANT_OPTIONS`
uniqueness key), **but narrower than claimed**: `getSortedAlphabetical` sorts values
**before** the `,`-join, so a wrong-data collision needs a single **bare-comma** value
(no space) whose comma-parts are already in sorted order — `["a,b"]` vs `["a","b"]`
collides, but `["Public, Tertiary"]` (space) and `["07","062"]` (reorders) do **not**.
Only uncontrolled free-text facility columns (`facility_type`/`ownership`/`custom_1..5`
from user CSV) can hold such values, **and** it needs two live configs on the same
project+metric — a contrived flow. **FIX (defensive):** change the join in the single
shared `hashFetchConfig` to an unambiguous encoding (length-prefixed / `JSON.stringify`
the sorted array). One function, all call sites covered, self-heals on version turnover.
Worth doing as hardening, not urgent. No persistence crossing.

---

## Corrected "Confirmed solid" (with the adversarial caveats)

Genuinely solid: query-assembly ordering (UNION ALL → PAE wrap → WITH → LIMIT); roll-up
SQL gating + sentinel mechanics; status/limit envelope; the new
`isSafePostAggregationExpression` structural rules (F4/F5 are about the *transform*, not
the validator); the replicant auto-select copy-not-mutate; the
`ResultsValueForVisualization` projection; `*FromParams`↔`parseData` hash consistency;
`po_detail_v2`/`PO_CACHE_VERSION` prefix discipline; **TEXT-column** filter escaping.

**Two overstatements the original review made — corrected:**
- `buildWhereClause` numeric coercion is **not** fully solid: the **integer-column path
  silently yields `NaN`** on non-numeric input (N2). Only the text path is bulletproof.
- The PO cache version keys are **not** complete: they omit the **facility-columns
  config** (N1); `_PO_DETAIL_CACHE` versions on PO `last_updated` **only** (no
  module/dataset/facility dimension), yet its payload is facility-config-derived.

---

## Implementation order (CONFIRMED findings only; awaiting your per-finding go-ahead)

**Tier 0 — deferred to PLAN_PROJECT_SNAPSHOT.md:**
0. **N1** — closed here; folded into the project-snapshot plan (snapshot facility config to project + version the PO caches off the project-local stamp). Do NOT implement the interim cross-DB version-fold; the snapshot plan supersedes it.

**Tier 1 — highest value / lowest risk:**
1. **F5** — one-line validator guard (`=`-count `!= 1`). Lowest risk; builds on code we just shipped.
2. **F1** — `getPeriodBounds` via the extracted `buildPeriodCTE` helper (preserve per-branch SELECT exprs; prove `dateRange`-value-equivalence on the working paths).

**Tier 2 — contained:**
4. **F3** — replicant-options `excludeReplicantFilter` (decide: `t2` only vs all 4 call sites).
5. **F7** — dead-code deletion (3 deletions + manifest line). Independent, anytime.
6. **F6** — MiniDisplay in-loop version guard (standalone; do NOT bundle with the dropped F2).
7. **N2 / N3** — N2 (validator + Zod `superRefine`) coordinated with F1/F3; N3 a contained editor fix.

**Tier 3 — after a gate:**
8. **F8a** — Ethiopian ternary (`maxMonth === 1 ? maxYear-1 : maxYear`) — **after a domain owner confirms** the Ethiopian fiscal-quarter boundaries (+ month-13/pagume).

**Deferred / dropped:** F2 (refuted), F8b (refuted), F4 (drop, or validator-tighten if
ever needed), F8c (deferred; in-memory `VersionParams` rename only if elevated — payload
rename is the STOP line), N4 (optional/cosmetic), N5 (defensive delimiter hardening,
not urgent). F9 doc-fix folds into the SYSTEM-doc Phase-2 inlining.

Each lands as its own focused commit, verified before the next.

**N1 is deferred to `PLAN_PROJECT_SNAPSHOT.md`** (project self-containment — snapshot
instance data to project, version caches off project-local stamps). Everything else
above is contained enough to implement directly under per-finding go-ahead.

## Hard rules (from CLAUDE.md — restated; this is delicate code)
- **Verify by executing, not reading** — every claim got a harness or a code-trace; keep that bar for the fixes.
- **No stored-data / cache-payload-SHAPE change is in scope.** N1 touches a cache **version key** (not shape) — allowed, but treat it like a `PO_CACHE_VERSION` bump and keep server/client inputs identical. F8c's payload rename is the explicit STOP line — do not cross it.
- **Check `git status` for parallel WIP before staging.**
- **Report-only until per-finding go-ahead** — this doc is the report.
