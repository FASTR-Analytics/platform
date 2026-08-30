---
system: 5
name: Facilities & Indicators
globs:
  - client/src/components/forms_editors/dhis2_credentials_form.tsx
  - client/src/components/forms_editors/edit_hfa_indicator.tsx
  - client/src/components/indicator_manager_hfa/**
  - client/src/components/indicator_manager_hmis/**
  - client/src/components/instance_geojson/**
  - client/src/components/instance_hfa_time_points/**
  - client/src/components/structure/**
  - client/src/components/structure_import/**
  - client/src/state/instance/t2_geojson.ts
  - client/src/state/instance/t2_indicators.ts
  - client/src/state/instance/t2_structure.ts
  - lib/hfa_indicator_labels.ts
  - lib/hfa_r_code_analysis.ts
  - lib/types/calculated_indicator_id.ts
  - lib/types/geojson_maps.ts
  - lib/types/hfa_types.ts
  - lib/types/iceh_strats.ts
  - lib/types/indicators.ts
  - lib/types/structure.ts
  - server/db/instance/calculated_indicators.ts
  - server/db/instance/config.ts
  - server/db/instance/geojson_maps.ts
  - server/db/instance/hfa_facility_weights.ts
  - server/db/instance/hfa_indicators.ts
  - server/db/instance/indicators.ts
  - server/db/instance/instance.ts
  - server/db/instance/structure.ts
  - server/geojson/**
  - server/routes/instance/calculated_indicators.ts
  - server/routes/instance/geojson_maps.ts
  - server/routes/instance/hfa_indicators.ts
  - server/routes/instance/hfa_time_points.ts
  - server/routes/instance/indicators.ts
  - server/routes/instance/instance.ts
  - server/routes/instance/structure.ts
  - server/server_only_funcs_importing/**
docs_absorbed:
---
# S5 — Facilities & Indicators

The instance-wide reference world everything joins against: facilities,
admin areas, HFA sampling weights, geojson boundaries, the four indicator
dictionaries, HFA time points, and instance config. Reviewed against code
2026-07-02 (first review cycle; fixes landed in `ad6bd996`, `67870f28`,
`ffd83907`). This doc also absorbs the structure-ELT mechanics of the
retired DOC_IMPORT_PIPELINE.

Boundaries: dataset stage→integrate is **S6** (it validates against S5's
dictionaries and facilities); the DHIS2 HTTP adapter is **S7** (S5 calls it
for org units); module runs that EXECUTE the HFA indicator R code and the
calculated-indicator definitions are **S8**; the query pipeline that joins
facilities/geojson at render time is **S9**. Projects never read this
system live — everything crosses into project DBs via attach-time snapshots
(S6's seam).

## Structure ELT (facility/admin import)

Unlike S6's worker-based dataset ingestion, the structure import runs
**in-process on the HTTP request**: step-3 staging streams newline-JSON
progress frames over the `streamResponse` sub-protocol; step-4 integrate is
a plain JSON route. There is no worker, no Docker, and no SSE for progress.

**Upload-attempt state machine** (`structure_upload_attempts`): one row per
family (PK `dataset_family`, hmis|hfa) — HMIS and HFA imports are fully
independent. Steps: 0 choose source (HMIS only; HFA is created at step 1
with source pinned to csv) → 1 file/credentials → 2 column mappings /
org-unit levels → 3 stage → 4 review/recode values → 5 pick strategy +
integrate. The **stored** `step` still tops out at 4: DB step 4 covers both
client screens (see **Value recoding** below). `status_type`
(configuring | importing | error) is the machine-readable discriminator
used in WHERE clauses; the `status` JSON is the client-facing detail
(`importing_dhis2` carries org-unit progress). Success at step 4 **deletes
the row**; errors keep it for resume; delete-attempt is the universal
recovery (deliberately allowed even while importing, for wedged attempts —
the running stager's conditional writes then match nothing).

**Claims.** Step-3 staging and step-4 integrate both claim the import slot
with a race-free conditional UPDATE + rowcount check
(`AND status_type <> 'importing'`; step 4 additionally requires `step = 4
AND step_3_result IS NOT NULL` under the row lock). Validation and the
claim run BEFORE the try/catch, so a claim loser returns directly and can
never release the winner's claim via the error handler;
`handleStagingSuccess`/`handleStagingError` write conditionally on still
holding the claim. Step-0/1/2 setters refuse while importing and null
`step_3_result` (plus all downstream results), so stale staging can never
be integrated after a re-upload/remap. An earlier `pg_advisory_lock`
approach was removed because acquire/release landed on different pooled
connections and wedged.

**Staging.** Fixed-name `UNLOGGED` table `temp_structure_staging_{family}`
(per-family so HMIS/HFA can run concurrently), `rowid SERIAL` as the dedup
tie-break (see **Duplicate rows** below), values inlined with `''`-doubling in
10k-row (CSV) / 5k-row (DHIS2) batches. CSV cap: 100 MB. The table is
dropped on staging error, after successful integration, and on attempt
reset/delete. `handleStagingSuccess` computes the **facilityMatch preview**
(distinct staged ids LEFT JOINed against the target family's backbone →
`{totalStaged, existing, newCount}`) into `step_3_result`; step 4 renders
it and flags `existing === 0` as the Ghana-style ID-system-mismatch tell.
Attempt reads at step 4 recompute the match live while the staging table
still exists, so the numbers reflect finalize time, not staging time.

**ODK label resolution (CSV path).** Step 1 optionally accepts an ODK
questionnaire (XLSForm) alongside the CSV, mirroring HFA ingestion's
two-file step 1 (`survey`+`choices` sheets validated on save;
`step_1_result` is `StructureCsvStep1Result` `{csv, xlsForm?}` — legacy
bare-`CsvDetails` rows are normalized on read by `parseCsvStep1Result`).
At staging, each mapped column except `facility_id` (admin areas
included) is matched to a select_one question by the HFA header
convention (exact name, else the header's post-last-`/` segment), and
matching cell values are replaced by choice labels — **labels are stored
in the facility columns, codes are discarded, no dictionary table**.
Unresolved codes stay raw and are surfaced per column in the staging
result (`labelResolution`: resolvedCount + up to 10 distinct unresolved
values), rendered in the step-4 summary. No migration, no cache-shape
change.

**Value recoding (review step).** Facility columns are free text with no
canonical list, and real HFA files classify many facilities as "Other". The
review step between staging and integrate lets the user pick a staged column,
check the values to reassign, and assign a target per facility (or in bulk,
including a brand-new category). Assignments are per-facility and **sparse** —
`StructureRecodes = Partial<Record<StructureRecodableColumn, Record<facilityId,
newValue>>>`, stored as JSON in `structure_upload_attempts.recodes` (migration
068); unassigned rows keep their file value. Recodable columns are the optional
facility columns **minus `facility_name`**, whose distinct values ≈ row count
(renaming is not recoding). Three routes serve it:
`getStructureStagedColumnValues` (distinct values + facility counts, flagged
`truncated` above 200 — accepted, real `facility_type` cardinality is tiny),
`getStructureStagedRecodeRows`, and `setStructureRecodes`.

Recodes are scoped to one attempt and die with the staging they describe:
`recodes = NULL` rides along at all **seven** writes that null `step_3_result`,
and the save is a conditional UPDATE requiring `step_3_result->>'stagingNonce'`
to still match the nonce the client authored against — so a save composed
before a re-stage is rejected, never silently applied to different rows.

**Application is a projection overlay at integrate, never a staging mutation.**
`buildRecodeJoins` emits one `LEFT JOIN (VALUES ...) ON facility_id` per recoded
column and `recodedSelectList` swaps that column for `COALESCE(rc_col.val,
col)`; all three strategy writers select through it. The dedup ORDER BY keeps
referencing raw column names and window-clause references resolve to INPUT
columns rather than select-list aliases, so **ranking runs on original values**
— the rn=1 winner the review UI showed is exactly the row integrated. This is
load-bearing: pre-applying the COALESCE in a CTE the ranking reads from would
change which duplicate wins.

Client-side the stepper runs 0–5 against a stored step that stops at 4, so a
**landing rule** decides which screen DB step 4 means: a silent refetch never
yanks a user who is on import (client 5) back to review, and attempts with
nothing recodable land straight on import.

**Duplicate rows.** Survey exports carry one row per submission attempt, so
the same `facility_id` recurs with only the consented row's metadata cells
filled. All three integrate strategies therefore keep the staged row with the
**most non-empty mapped columns** (`buildDedupOrderClause`), `rowid` breaking
ties — file order alone would pick a blank row and silently drop metadata the
file does contain. A whole row survives rather than a per-column coalesce:
admin values are only a valid hierarchy as a tuple, and duplicate rows can
disagree about it.

**Column scope contract.** Integration writes exactly the columns
physically present in the staging table (discovered via
information_schema), which staging built from the user's step-2 mappings —
only `facility_id` is required; admin areas are all-or-none as a group (a
facility-id-plus-tags file is a legal tag-only update). The DHIS2 path has
no column mapping: it stages `facility_name` only, deliberately, so blank
DHIS2 metadata never wipes existing values.

**Integrate strategies** (`StructureIntegrateStrategy`, chosen at step 4,
never stored; no default in the UI — the destructive one must be opt-in):

- `replace_all` — pre-checks refuse if dataset rows or HFA weights exist;
  then delete family + insert deduped staged rows.
- `add_and_update` — upsert; inserted/updated split via pre-count.
- `update_existing_only` — pre-validates every staged id exists (rejects
  wholesale with samples); updates mapped columns only.

All three run in one transaction, insert admin areas first with
`ON CONFLICT DO NOTHING` (admin areas are shared across families), and
finish with `cleanupUnusedAdminAreas` (level 4→1; "used" = referenced by
either facilities table — any future admin-area-keyed table must be added
to its UNION). Blank mapped cells overwrite to blank (decided).

## Facilities, admin areas, weights

Facilities are split per family: `facilities_hmis` / `facilities_hfa`
(migration 047), each with `facility_id` PK, `admin_area_1..4`, and the
optional free-text columns (`facility_name`, `facility_type`,
`facility_ownership`, `facility_custom_1..5`) — all plain text, no value
dictionary (ODK codes are resolved to labels at staging, see Structure
ELT). The 4-level admin-area model is
name-keyed and **per facility registry**: `admin_areas_{hmis,hfa}_1..4`
rows are names, and the name is the join key everywhere (S9 maps, geojson
`area_id`). Duplicate names within a level are therefore ambiguous — the
wizard warns but cannot fix. The two registries' name-spaces are
independent and are never reconciled (migration 076; the legacy shared
`admin_areas_1..4` tables are frozen, readerless, and dropped by
PLAN_REMOVE_OLD_STRUCTURE_TABLES.md). Project AA2 scope is deliberately
registry-agnostic: the name is matched against whichever registry each
results object belongs to, at read time.

FK topology: `facilities_{family} → admin_areas_{family}_4` CASCADE;
`dataset_hmis`/`hfa_data → facilities_*` are RESTRICT-behaving NO ACTION
DEFERRABLE with **named constraints** (migration 048) — note the migration
comments claim the names are load-bearing for a `SET CONSTRAINTS` call
that **no longer exists** in server code; integration now pre-checks and
refuses instead. `hfa_facility_weights → facilities_hfa` is
CASCADE-on-delete, which is why the facility delete endpoints refuse while
weights exist (mirroring `replace_all`).

**Weights** (`hfa_facility_weights`, facility × time_point): written ONLY
by the structure-import UI's weights wizard — never by HFA data ingestion.
Import is long-format (two user-mapped columns: facility id + weight), one
time point per import, wholesale replace for that time point, positive
weights only; a blank cell = not-in-sample (absence is the
representation). The export is wide (one column per time point). Unknown
facility ids, duplicates, and non-positive weights reject the whole file
pre-transaction.

**`structure_last_updated`** (JSON ISO timestamp in `instance_config`) is
the version key for the whole structure world — S6's HMIS/HFA staleness
gates read it, and the client facilities/weights caches key on it. Bumped
by: step-4 integrate, both facility-delete endpoints, all weights
mutations, and HFA time-point rename/delete (whose weight cascades were
previously invisible to the weights UI).

## The four indicator dictionaries

Three identity-space patterns, one rule everywhere: **ids are immutable
after create** (server-enforced; the UIs disable the inputs). Renames were
structurally broken by the non-cascading FKs and are not worth supporting;
label edits are always safe (Postgres skips FK checks when the key value
is unchanged).

**HMIS** is two-level: `indicators_raw` (ids as they appear in uploads —
DHIS2 indicator UIDs, data-element UIDs, or `dataElement.coc` operand ids)
M:N-mapped via `indicator_mappings` (CASCADE both directions) to
`indicators` (common ids; `is_default` marks the seeded FASTR core set,
which module R scripts reference by literal id — defaults cannot be
deleted). The mapping is editable from either side (replace-list on save).
Raw ids are S6's staging validation surface; `dataset_hmis` stores raw ids
(FK RESTRICT — data blocks raw deletion); raw→common aggregation (SUM
across mapped raws) happens at project attach. New ids are charset-checked
(no `, ; :` — they corrupt the STRING_AGG read projection and the CSV
round-trip); existing ids are grandfathered. Common-indicator deletion
refuses with a listing when calculated indicators reference the id
(`calculated_indicators.num/denom_indicator_id` have ON DELETE RESTRICT
FKs — migrations 019/024). Batch creates are all-or-nothing (one
transaction; the failing item is named in the error).

**HFA** has two disjoint namespaces that are easy to conflate:
`hfa_indicators.var_name` (definition ids, e.g. `ind001`) vs **survey
variables** (`hfa_variables`, per time point, from staged ODK data, e.g.
`fin_01a_a`). User-authored R snippets in `hfa_indicator_code`
(per var_name × time_point: `r_code` + optional `r_filter_code` — filter
requires main code) reference survey variables AND other indicator
var_names. varNames are validated as R identifiers
(`^[a-zA-Z][a-zA-Z0-9_]{0,63}$`) and checked against survey-variable
shadowing, because they are interpolated as bare R symbols. Taxonomy:
categories → sub-categories (real FKs) plus service categories stored as a
JSON string array on the indicator (no FK; rename/delete integrity is
maintained by jsonb rewrites in the service-category mutations).
`lib/hfa_indicator_labels.ts` is the single label source
(`composeHfaIndicatorLabel`, `getHfaIndicatorMeasure`).

**HFA workbook import** (`hfa_indicators_xlsx_upload_form.tsx`) has two
sources behind one flow: a picked `.xlsx`, or the **default indicator set**
fetched client-side from the FASTR resource hub
(`fastr-resource-hub/hfa_default_indicators.xlsx`, raw GitHub, cache-busted
like the prompt library). Both parse in the browser
(`detectHfaWorkbookShape`), then share the add/replace choice, the
time-point reconcile step and `importHfaIndicatorsWorkbook`. Because
`hfa_indicator_code.time_point` FKs `hfa_time_points`, code cannot be
stored before at least one time point exists — so both import buttons are
gated on time points (not on imported data; a data-less time point is
fine, validation just reports missing survey variables until data lands),
and later time points inherit the code via the create-time carry-forward.
The default file is single-column positional (`r_code_1`), so with N time
points the reconcile step offers apply-to-all / apply-to-one.

**HFA variant groups** (2026-08-04) let one indicator carry a per-item
response-option breakdown — "provides vaccination" × {campaign, routine,
both} — without the items becoming indicators. Storage is one indicator row
plus a sibling code table: `hfa_indicator_variant_groups` /
`_items` (id PK, group FK) and `hfa_indicator_variant_code`
(`var_name, time_point, item_id` → `r_code`), with a nullable
`hfa_indicators.variant_group_id`. Real variant *rows* in `hfa_indicators`
were rejected: their failure mode is a hiding rule at every surface that
iterates the dictionary (manager, xlsx, `HfaTaxonomyForAI`,
unused-variables, run capture and every run reader), and one miss leaks
item ids into user-facing indicator lists. The code table's cost is the
opposite and better shaped — a missed extension means a variant lacks a
feature, visible to the author immediately. **The feature is purely
additive**: the parent keeps its own overall `r_code` and its unchanged rows
in `M10_hfa_results.csv`; overall is never derived from items (they may
overlap or be non-exhaustive). `r_filter_code`, type, aggregation and
sentinel bindings stay the parent's and apply to every item; only the
numerator is per-item, and `time_point` stays in the key because each round
has its own questionnaire (an item with no code row for a round simply
drops out of it, with its own denominator).

Three invariants are enforced by `assertVariantIntegrity`, re-run **in full
inside every mutating transaction** that can touch them — including the
category-side CRUD, because id uniqueness is bidirectional and a category
created onto an existing item id would otherwise be accepted and then block
every later indicator write: (1) item ids are unique across ALL HFA id
namespaces (varNames, categories, sub-categories, service-categories, other
items) — labels resolve through one flat id→label map, so a collision
silently mislabels; (2) the generated per-item column `<parent>__<item>`
(`composeHfaVariantColumnName`) must not collide with an indicator varName,
a survey variable, another composed name, or `isReservedHfaVarName` (its
`/__status$/` rule especially — `script.R` collects response-status columns
by that suffix); (3) an indicator with variant code must have overall code,
else the generator's "no code" skip silently discards it. The composed name
is **never parsed back apart** — no separator is unambiguous (parent
`vacc_a` + item `b` vs parent `vacc` + item `a_b`), so parent/item routing
into R is metadata-driven only. Item ids therefore carry the strict
`^[a-z][a-z0-9_]{0,63}$` grammar. Group/item edits do not touch any
`updated_at`, so they are folded directly into `getHfaIndicatorsVersion`'s
hash the way the category label tables are — without that, variant
authoring is invisible to the SSE→cache triangle and to the project
staleness stamp.

**HFA R-code analysis has ONE source of truth**:
`lib/hfa_r_code_analysis.ts` (function whitelist, escaped-quote-safe
string/comment stripping, identifier extraction), shared by the client
editor validator and the server dependency analyzer
(`server_only_funcs/hfa_dependency_analyzer.ts`). Never re-fork these —
the previous drift (two whitelists, server not stripping comments) made
editor-green code hard-fail whole module runs. lib compiles into both
runtimes: keep it pure (no Deno/UI imports). The editor's persisted
`has_syntax_error`/`code_consistent` flags are display-only advisory
metadata: they are NOT copied into project snapshots (the snapshot reader
hardcodes them), and bulk validation updates deliberately do NOT bump
`updated_at` (a bump would spuriously flag every project's HFA dataset
stale). Warnings (lone `=`) are a distinct severity and never persist as
errors. The R-code lifecycle: instance edits → project HFA-data refresh
snapshots indicators+taxonomy+code → S8's module run builds a
cross-indicator dependency graph (topological sort, cycles rejected) and
splices each round's code into `case_when` branches;
`STOP_IF_INDICATOR_FAILS` (default TRUE) makes one invalid indicator kill
the run.

An indicator is NA when its **own expression** evaluates to NA, not when an
input is missing — R's `&`/`|` are three-valued, so a skip-logic "." on a
follow-up question still leaves a determinate 0. Two things make that sound.
Sentinel codes (`-99` / `-999999` / refusals) are ordinary numbers, so the
generator binds NA-ified copies of the referenced variables **scoped to the
expression** (`with(list(v = replace(v, v %in% codes, NA_real_)), case_when(...))`)
rather than mutating the columns — the response-status expression downstream
classifies `dont_know` off the raw values, and the sentinel set varies per
indicator (`DONT_KNOW_TREATMENT` applies to binary indicators only). `%in%`
returns FALSE rather than NA for a missing input, so it is rebound inside the
same `with()`. Filter-variable missingness stays an explicit branch, because
`!(NA)` matches nothing in `case_when`. Consequence: the value object and
`M10_hfa_response_status.csv` no longer share a denominator — a facility can
hold a determinate 0 while its per-variable status reads `missing`.

**Calculated indicators** reference common ids (FK RESTRICT both
directions) and carry the strictest id grammar
(`^[a-z][a-z0-9_]{0,63}$` — interpolated into generated R and emitted as
synthetic `indicator_common_id` values in results). Denominator = none |
another common indicator | population type × multiplier
(`assertValidPopulationType` at the write boundary). Snapshotted per
project at HMIS attach; attach refuses if a referenced common is absent
from the data. The client editor pre-checks that a chosen
numerator/denominator common id satisfies the calculated grammar (commons
are free text, so not all are usable — a structural mismatch, not a bug).

**Ruling — the additivity principle (Tim, 2026-08-19; the target model,
not yet built).** *The pipeline only ever stores, adjusts, and aggregates
additive facility-month counts. Anything non-additive is an expression over
those counts, evaluated after aggregation. Nothing non-additive is ever
stored as data.* This is the ONE authoritative statement; S6/S8/S9 carry
pointers only. Consequences that follow from it and are ruled with it:

- Calculated indicators collapse into common indicators. A common indicator
  has a `type`: `base` (mapping to raws, SUM at extract; the only type
  m001/m002 ever see) or `derived` (an expression over other commons,
  evaluated by S9 AFTER aggregation: the SAME evaluator as the metric-wide
  `postAggregationExpression`, its ingredients being row-restricted sums —
  `SUM(count) FILTER (WHERE indicator_common_id = 'anc4')` — and its
  expression coming from the run's indicator catalog). Derived ids are hosted
  on every QUALIFYING fetch, computed at the results-object level (amended
  2026-08-30: RO has `indicator_common_id`, all-SUM values, no metric-wide
  PAE — the engine never sees the metric); `formatAs: "indicator"` stays the
  metric-level formatting fact, and there is ONE such metric in the HMIS
  family, over adjusted counts, with the scorecard as a preset. Definitions are snapshotted into the run manifest,
  so a package stays standalone and an edit still means a new run. Tracking
  home: PLAN_1_COMMON_INDICATOR_TYPES.md.
  Population-denominated rates are a distinct type because their grain is
  area×month, not facility×month; population lives in its own store (see
  S8's population section) and is expanded stock→flow (interpolated annual ÷
  12 per month) at run capture, so downstream it sums like any count.
- Presentation fields (`format_as`, thresholds, group, sort) live on the
  common indicator; `format_as` is DISPLAY, the `type` carries pipeline
  semantics — "percent" is not a pipeline property, "is a ratio of counts"
  is.
- DHIS2 percent indicators are never imported as values. The importer
  decomposes `numerator`/`denominator` (already on `DHIS2Indicator`) into
  data-element operands → raws → base commons, and authors the indicator as
  a `derived` common; a yearly denominator DE routes to the population
  store. Expressions it cannot decompose (`R{}`, `OUG{}`, `C{}`, program
  indicators, `d2:` functions) are refused, not approximated.
- The scorecard is a table preset over a count metric with derived ids on
  display; it is not a module (`m008` retires under this model).

**ICEH** stratifiers (`lib/types/iceh_strats.ts`) are a hardcoded
compile-time dictionary mapping raw survey stratum labels to normalized
ids. No UI, no mutations.

## HFA time points

`hfa_time_points` (label PK, `period_id` yyyymm, `sort_order`,
`imported_at`) gate HFA data uploads and key the weights. This is the ONE
dictionary where renames genuinely work: every referencing table
(`hfa_variables`, `hfa_variable_values`, `hfa_data`,
`hfa_facility_weights`, `hfa_indicator_code`) FKs the label with
`ON UPDATE CASCADE`. Deletion cascades data/variables/weights in a single
transactional DELETE (the cascades are the implementation — no explicit
child deletes) but is RESTRICTed by indicator code, with a friendly
pre-check. Creating a time point auto-carries indicator R code forward
from the previous latest round. Time-point routes notify the **datasets**
SSE channel (they are upload-gating state), and rename/delete additionally
bump `structure_last_updated` + notify structure because of the weights
cascades.

## Geojson boundaries

Storage: one row per admin level in `geojson_maps` (`admin_area_level` PK,
CHECK 2|3|4; level 1 = country has none), `geojson text`, `uploaded_at`.
The stored FeatureCollection is processed: each feature keeps only
`geometry` plus exactly two properties — `area_id` (the admin-area NAME at
that level; `""` if unmatched) and `source_name` (the original match-prop
value; legacy rows may have `dhis2_name`, which the edit modal still
reads). Unmatched features are KEPT with `area_id: ""` and can be mapped
later via the edit modal (`remapGeoJson` does a read-modify-write of the
stored JSON; `__source__`-prefixed keys target unmatched features; `""` is
a legal target meaning unmap).

Upload flows: TUS-upload a file → `analyzeGeoJsonUpload` (property keys +
distinct values + counts, excluding features without usable geometry;
asset reads capped at 100 MB pre-parse) →
pick level + match property → case-insensitive auto-map values to admin
names → fix the rest → `saveGeoJsonMap` re-reads the asset server-side and
rewrites features via the `areaMapping`, whose wire shape is
`Record<geoJsonValue, adminAreaName>` (many-to-one capable — do not invert
it; the pre-fix inverted shape silently dropped mappings). The DHIS2 flow
splits analyze from geometry: `dhis2AnalyzeGeoJson` fetches org-unit
METADATA only (`id,name,code,parent[id,name]`, ~KBs) plus an exact
with-geometry count via `filter=geometry:!null` (`featureType` is absent
on DHIS2 2.40; `level` must be expressed as a filter); the full
FeatureCollection (~20 MB for a 200-district country) is fetched at
`dhis2SaveGeoJsonMap` with a 180 s timeout and NO retries. Two in-memory
session caches, SHA-256-keyed on url|user|pass|level: metadata (10
entries) and heavy geojson (2 entries — keeps a re-save cheap); 15-min
TTL. Both save paths refuse to store an empty map (distinct error when
the match property is absent from the features — the mapping is built
from `.json` metadata but applied against `.geojson` properties) and
return featureCount/matched/unmatched, which the wizard shows on
completion. Note the `.geojson` endpoint OMITS boundary-less units rather
than returning null geometries, so "units without boundaries" = metadata
total − geometry count.

Client caching: summaries (level + uploadedAt) live in the T1 SSE store;
payloads live in a T2 two-layer cache (module Map + IDB `geojson:{level}`)
keyed by `uploadedAt` — the `uploaded_at → geojson_maps_updated SSE →
preloadGeoJson` triangle, plus `evictDeletedGeoJsonLevels` for levels
absent from a push. Consumers read via the deliberately non-reactive
`getGeoJsonSync(level)`; figure bundles snapshot geojson as
`{kind:"data"}` when available.

## Instance config

`instance_config` is a key→JSON table. Keys owned here:

- `structure_schema_hmis` / `structure_schema_hfa` — one row per facility
  registry, each `adminDepth` (1–4) + 8 include-flags + 8 optional display
  labels. `adminDepth` gates which admin levels that registry exposes and
  parameterizes S6 ELT staging and S9 SQL; the flags drive which facility
  columns S6 ingests and S9 exposes. Label overrides are column-NAME labels
  (there is no value-label mechanism — values arrive as labels because ODK
  codes are resolved at staging, see Structure ELT), and they are
  deliberately OUT of the cache hash (`hashStructureSchema` covers the
  include-flags only, so renaming a label cannot bust a data cache).
  Written by `setStructureSchema`, which refuses a depth change while that
  family's facilities table is non-empty or while that family has a geojson
  map above the new depth (the admin_areas-emptiness half of the old guard
  was dropped: per family it is implied by the cleanup invariant). The rows
  are seeded at instance creation and survive both delete paths, so flags,
  labels and depth persist across a delete + re-import cycle.
- `admin_area_labels` — display-only label overrides carrying an `(AAn)`
  suffix convention (space-prefixed) appended/stripped by
  `structure/admin_area_labels.tsx`.
- `structure_last_updated` — see above; written by the structure world,
  not by the settings UI.

**Country is NOT here — it is `ISO_COUNTRY_CODE`**, an env var passed by the
server-cli Docker run system and read once as `_INSTANCE_COUNTRY_ISO3`
(`exposed_env_vars.ts`). It is **required**: boot fail-stops without it, because
country-less is not a legitimate instance state (Tim's ruling 2026-08-06). The
accepted values are an ISO3 code or `SOMALILAND` — the one territory FASTR
reports on that has no ISO3 code. The value is substituted into R module scripts
as `COUNTRY_ISO3` and into caption/localization, which is why it is validated as
a clean token rather than passed through. It was an editable instance setting
until 2026-08-06; migration 074 deletes the dead `country_iso3` row.

Every config mutation re-reads all configs and pushes one consolidated
`config_updated` SSE (`notifyConfigUpdated`). No Valkey at this layer.

## Client state & wizard

- T2 caches: facilities keyed
  `family + structureLastUpdated + hashStructureSchema(family schema)`;
  indicators/calculated keyed on the T1 version stamps
  (`indicatorMappingsVersion` = MD5 over MAX(updated_at)+counts of the
  three HMIS tables; `calculatedIndicatorsVersion`; `hfaIndicatorsVersion`;
  HFA dictionary rides `hfaCacheHash`). `indicatorMappingsVersion` is also
  a cache-key component for HMIS dataset views — mapping edits implicitly
  invalidate them.
- The structure wizard: server owns the step number (every save writes
  `step`; the client fetcher jumps the stepper on each silent refetch).
  Errors render as a dismissible banner over navigable steps (re-saving
  any step resets status to configuring; step 4 stays reachable to retry
  with a different strategy). In-flight imports render a progress view
  polling `getStructureUploadStatus` every 2 s — covering resumed and
  second-tab sessions. DHIS2 structure import is **saved-only**
  (PLAN_DHIS2_CREDENTIAL_STORE_CONSOLIDATION Phase 2): step 1 confirms
  the instance's stored connection (`structureStep1Dhis2_ConfirmConnection`
  — no credentials in the request body) and writes only a `{ url }`
  snapshot to `step_1_result`; staging and the org-unit browse
  route resolve the password from the encrypted store at fetch time
  (`getStructureDhis2ResolvedCredentials`), refusing loudly if the stored
  connection's URL has changed since step 1 was confirmed. The client
  panel shows the stored connection and links to the shared manage-
  connection modal to replace it — there is no per-attempt credential
  editor. A successful integrate also reports geojson `area_id`s orphaned
  by the import in the step-4 summary.
- Permissions: reads are `can_view_data` (incl. the CSV exports);
  mutations `can_configure_data`; config mutations
  `can_configure_settings`. Several manager UIs still gate their write
  buttons on `currentUserIsGlobalAdmin` instead (Open items).

## Traps

- **`COUNT(*)` comes back as a string** (no int8 parser); everything not
  cast `::int` must be coerced before strict comparison. Known uncasted
  sites: `getStructureItems.totalCount`, staging `adminAreasPreview`
  counts, several dictionary usage checks.
- **`structure_last_updated` comparison semantics differ by family**: the
  HMIS staleness gate compares with `>`, HFA with strict inequality. Both
  read the same stamp.
- A CSV-origin facility with a DHIS2-UID-shaped id falls inside S6's
  DHIS2 scoped-delete scope — there is no per-row source marker on
  facilities (also flagged in SYSTEM_06).
- `hfa_indicator_code` is not independently hashed: code changes are
  visible to project staleness only because `saveHfaIndicatorFull` bumps
  the indicator row. Any new code-mutation path must do the same.
- The named FK constraints from migration 048 are no longer used by any
  `SET CONSTRAINTS` call — the migration comments overstate; verify before
  relying on (or renaming) them.
- `lib/hfa_r_code_analysis.ts` compiles into both the Deno server and the
  Vite client — keep it dependency-free.
- Legacy HFA varNames that violate the new regex would 400 on save (dev
  DB verified clean, 232/232; a violating varName would already be
  breaking R generation — but check before assuming on other instances).

## Open items

- **Decision needed:** the M10 value object and
  `M10_hfa_response_status.csv` no longer share a denominator — a facility
  can hold a determinate 0 for an indicator while its per-variable status
  reads `missing` or `dont_know`, so a dashboard can show "22% have X
  (n=9)" beside "55% missing" for the same indicator. Either the status
  object gains an indicator-level "contributed to the denominator"
  classification, or the per-variable reading is documented as answering a
  different question.
- **Decision needed:** UI write-gates use `currentUserIsGlobalAdmin` while
  the server gates on `can_configure_data` in four slices (HMIS manager,
  HFA manager, geojson manager, weights import) — decide which contract
  wins and align.
- Server-produced wizard/staging/integration error strings are
  English-only and rendered verbatim by the client — needs a mechanism
  (error codes or translatable errs), not per-string patching.
- Geojson hardening remainder (the retired near-term plan's WS7-P2, mostly
  closed 2026-07-06: 100 MB pre-parse cap `14790e39`, SHA-256 session-cache
  keys `805f6b15`): `sampleValues` still returns ALL distinct values
  unbounded; the served payload is whole and double-encoded (also
  PLAN_3_GEOJSON_SNAPSHOT WS-EFFICIENCY); no deeper geometry validation
  (lon/lat range, polygonal types, non-unique match values). (The
  plaintext-sessionStorage credentials item is resolved — the
  sessionStorage cache was deleted by PLAN_DHIS2_CREDENTIAL_STORE_
  CONSOLIDATION; geojson now defaults to the encrypted stored connection
  with an inline one-off override.)
- `pt` is missing across most of this system's t3 literals (indicator
  managers, structure viewers, wizards) — part of the batch-by-batch PT
  rollout.

### HFA variant groups — open questions (from the 2026-08-04 review cycle)

Findings judged real but not fixed, and judgment calls left to Tim. All were
raised by adversarial review of the shipped feature; none blocks it.

- **Decision needed:** the delete-reference and unused-variable scans are
  **fail-open** — `findReferencingIndicators` returns `[]` when either code
  query is non-ready, so a failed variant-code fetch suppresses even
  main-code warnings rather than saying "references could not be checked".
  Pre-existing convention for main code; the variant union widened the
  surface.
- **Decision needed:** `handleRevalidateAll` and the AI validation tools
  compute `hasSyntaxError` from main code only, while the editor's save
  includes variant snippets — so revalidate-all can wipe a variant-only
  syntax flag. The flag is display-only advisory metadata (generation
  validates independently), so this is a badge-accuracy question, not a
  correctness one.
- A survey-dictionary import can introduce a variable equal to an existing
  composed `<parent>__<item>` column (ODK/Kobo `group__field` exports make
  `__` common). `hfa_variables` ingestion does not assert, so the collision
  lands and then blocks subsequent indicator/variant writes with a message
  naming the collision. The generation-time hard error remains the data
  backstop; the open question is whether integration should warn or refuse.
- A time-point **rename** FK-cascades into `hfa_indicator_variant_code`
  without bumping any `updated_at` or firing the indicators notify, so an
  open manager holds code keyed to the old label until remount. The
  identical hole pre-exists for `hfa_indicator_code`; fixing it means either
  hashing the code tables or firing the indicators notify from the rename
  route.
- `deleteHfaTimePoint`'s friendly guard checks only `hfa_indicator_code`, so
  a time point used solely by variant code surfaces a raw FK error instead.
- Variant items sort by `sort_order || label` across ALL groups, so a
  multi-group visualization interleaves items from different groups —
  harmless in the per-group-scoped views the presets ship, and the reason
  those presets scope by category.
- The metric-variant picker's hardcoded "Select geographic level:" caption
  (`add_visualization/metric_card.tsx`) predates non-geographic variant
  pairs and is now wrong for both HFA observed/carried pairs.

### HFA indicator authoring follow-on (from the retired HFA plans)

- **Sentinel Layer 3b — per-indicator override + authoring gate** (L, app +
  wb-fastr-modules in lockstep). Layer 3a (the per-variable generator with
  scoped sentinel bindings) is shipped; 3b is the additive escape hatch plus
  validation. Three parts: (1) a **per-indicator sentinel-treatment override
  column** in the indicator dictionary, which is what makes DK-rate indicators
  authorable at all — the scoped bindings NA-ify `-99` before any `x == -99`
  rCode could match; cheap now that the binding list is built per indicator.
  (2) An **authoring gate for NA-swallowing constructs**: indicators are gated
  on the result of their own expression, so an authored `ifelse` / `is.na` /
  `grepl` returns a determinate value where a missing input should give NA — all
  three are allowlisted and none is used today, so the validator should warn.
  (3) An **authoring-rule validation gate**: indicator R code must test
  positively for Yes (`x == 1`, `x >= 3`); negated tests (`x != 2`, `x <= 3`)
  misclassify DK under DK-as-No, and nothing enforces this today, so a
  mis-authored `!=` indicator silently inverts DK handling. The override column
  is the natural home for the gate. Touches `HfaIndicator`/`HfaIndicatorCode`
  ([lib/types/hfa_types.ts](lib/types/hfa_types.ts)), the
  `hfa_indicators`/`hfa_indicator_code` schema,
  [server/db/instance/hfa_indicators.ts](server/db/instance/hfa_indicators.ts),
  the editor UI, generator consumption in
  [get_script_with_parameters_hfa.ts](server/server_only_funcs/get_script_with_parameters_hfa.ts),
  and a per-class module parameter in `wb-fastr-modules` m010 if the override
  needs a policy knob.
- **Standalone-label surface** (on demand): compose a full "Percentage of
  facilities with {label}" for a single-indicator KPI title — the
  `getHfaIndicatorMeasure` lookup is ready, no UI consumer wired. Related: wire
  the `full` label context to tooltips / chart titles / table headers / exports,
  which get the compact label today.
