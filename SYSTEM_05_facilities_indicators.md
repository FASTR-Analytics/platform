---
system: 5
name: Facilities & Indicators
globs:
  - client/src/components/forms_editors/dhis2_credentials_form.tsx
  - client/src/components/forms_editors/edit_hfa_indicator.tsx
  - client/src/components/indicator_manager_hfa/**
  - client/src/components/indicator_manager_hmis/**
  - client/src/components/instance/instance_settings.tsx
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
2026-07-02 (first review cycle; fixes landed in `599dacc9`, `a9cab9ae`,
`4a8800fc`). This doc also absorbs the structure-ELT mechanics of the
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
org-unit levels → 3 stage → 4 pick strategy + integrate. `status_type`
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
(per-family so HMIS/HFA can run concurrently), `rowid SERIAL` for
first-occurrence dedup ordering, values inlined with `''`-doubling in
10k-row (CSV) / 5k-row (DHIS2) batches. CSV cap: 100 MB. The table is
dropped on staging error, after successful integration, and on attempt
reset/delete. `handleStagingSuccess` computes the **facilityMatch preview**
(distinct staged ids LEFT JOINed against the target family's backbone →
`{totalStaged, existing, newCount}`) into `step_3_result`; step 4 renders
it and flags `existing === 0` as the Ghana-style ID-system-mismatch tell.
The preview describes staging time, not finalize time (Open items).

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
dictionary (see the ODK open item). The 4-level admin-area model is
name-keyed: `admin_areas_1..4` rows are names, and the name is the join
key everywhere (S9 maps, geojson `area_id`). Duplicate names within a
level are therefore ambiguous — the wizard warns but cannot fix.

FK topology: `facilities_* → admin_areas_4` CASCADE;
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
splices each round's code into `case_when` branches with auto-generated
missingness guards; `STOP_IF_INDICATOR_FAILS` (default TRUE) makes one
invalid indicator kill the run.

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
distinct values + counts, excluding features without usable geometry) →
pick level + match property → case-insensitive auto-map values to admin
names → fix the rest → `saveGeoJsonMap` re-reads the asset server-side and
rewrites features via the `areaMapping`, whose wire shape is
`Record<geoJsonValue, adminAreaName>` (many-to-one capable — do not invert
it; the pre-fix inverted shape silently dropped mappings). The DHIS2 flow
is the same shape with the FeatureCollection fetched from the org-unit API
(15-min/10-entry in-memory cache keyed on hash(url|user|pass|level)).

Client caching: summaries (level + uploadedAt) live in the T1 SSE store;
payloads live in a T2 two-layer cache (module Map + IDB `geojson:{level}`)
keyed by `uploadedAt` — the `uploaded_at → geojson_maps_updated SSE →
preloadGeoJson` triangle, plus `evictDeletedGeoJsonLevels` for levels
absent from a push. Consumers read via the deliberately non-reactive
`getGeoJsonSync(level)`; figure bundles snapshot geojson as
`{kind:"data"}` when available.

## Instance config

`instance_config` is a key→JSON table. Keys owned here:

- `max_admin_area` — gates which admin levels exist everywhere;
  parameterizes S6 ELT staging and S9 SQL. Changeable only while
  facilities + all admin_areas tables are empty AND no geojson map exists
  above the new max.
- `facility_columns` — 8 include-flags + optional display labels; drives
  which facility columns S6 ingests and S9 exposes; part of the
  facility-columns cache hash. Label overrides are column-NAME labels
  (there is no value-label mechanism — see the ODK open item).
- `country_iso3` — validated `^[A-Z]{3}$` (trim/uppercase; empty = unset):
  it is substituted into R module scripts as `COUNTRY_ISO3` and into
  caption/localization, so a stray quote would break every generated
  script.
- `admin_area_labels` — display-only label overrides carrying an `(AAn)`
  suffix convention (space-prefixed) appended/stripped by
  `instance_settings.tsx`.
- `structure_last_updated` — see above; written by the structure world,
  not by the settings UI.

Every config mutation re-reads all configs and pushes one consolidated
`config_updated` SSE (`notifyConfigUpdated`). No Valkey at this layer.

## Client state & wizard

- T2 caches: facilities keyed
  `family + structureLastUpdated + maxAdminArea + facilityColumnsHash`;
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
  second-tab sessions. The DHIS2 attempt payload is **redacted**
  (`Dhis2CredentialsRedacted` — url/username/hasPassword); full
  credentials stay server-side (`getStructureDhis2Credentials`), and the
  client persists them to sessionStorage only after a successful
  connection test.
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

- **ODK label resolution for structure import (Tim, 2026-07-02 — decided,
  not yet implemented):** structure columns like `facility_type` typically
  originate as ODK select_one codes; today they arrive verbatim and raw
  codes flow into charts, filters, AI context, and exports. Decision:
  mirror the HFA ingestion pattern — step 1 (CSV path) accepts an optional
  ODK questionnaire (XLSForm), and select_one codes are resolved to labels
  once at staging via the existing `parse_xlsform.ts` (group-prefix
  stripping to match mapped CSV headers). **Store the labels themselves in
  the facility columns — no value dictionary, codes are discarded.**
  Unresolved codes stay raw with a warning count in the staging result. No
  migration, no cache-shape change; ~7 files (step-1 result type gains
  optional xlsForm, route body, step-1 store, staging substitution, wizard
  step 1 second file selector + resolution summary in steps 3/4).
- Post-integration bookkeeping (staging-table drop, stamp bump, attempt
  delete) runs after the integrate transaction commits — a crash in
  between leaves S6's staleness gates unaware and the attempt wedged at
  `importing` (recoverable via delete-attempt).
- DHIS2 staging admits empty-string admin areas (a root-level org unit
  selected as a facility level yields `''` rows in `admin_areas_1..4`);
  the CSV path drops such rows as invalid.
- facilityMatch preview can be stale at finalize (computed once at
  staging; facilities can change in between). `update_existing_only`
  re-validates server-side; the other two proceed on stale numbers.
  Cheap fix: recompute at step-4 load.
- The DHIS2 step-1 connection cannot be changed without discarding the
  attempt (the editor hides once step1Result exists).
- UI write-gates use `currentUserIsGlobalAdmin` while the server gates on
  `can_configure_data` in four slices (HMIS manager, HFA manager, geojson
  manager, weights import) — decide which contract wins and align.
- Server-produced wizard/staging/integration error strings are
  English-only and rendered verbatim by the client; `pt` is missing across
  most of the system's t3 literals (part of the PT rollout batch list);
  `POPULATION_TYPES` labels and the "... per 10k" preview are EN-only.
- HMIS manager: the two version-effects don't reset to loading on re-run
  and lack a stale-response guard (Variant A drift); the batch-upload
  "select existing CSV" Select renders the first option while state is
  empty; concurrent edits are last-write-wins everywhere (accepted,
  app-wide).
- HFA manager: AI batch label/category updates fire one route call + SSE
  notify per indicator (N racing refetches — a bulk endpoint would fix
  both); the XLSX upload help text says "three sheets" then lists four;
  `routes/instance/hfa_indicators.ts` has no `log()` middleware on any
  route (inconsistent with HMIS); the `as HfaIndicatorCode[]` casts there
  are load-bearing because the zod schema infers optional keys while the
  lib type requires present-`undefined` keys — aligning schema and type is
  a small contract change.
- Time points: reorder failures are silently swallowed client-side;
  renaming to a duplicate label surfaces a raw unique-violation.
- Geojson: `updateMaxAdminArea` is check-then-write without a transaction;
  a structure re-import that renames admin areas silently orphans stored
  `area_id`s (maps render "no data"; repairable in the edit modal, but
  nothing tells the admin); duplicate admin-area names are unresolvable by
  design (name = join key); no size cap anywhere on the pipeline (analyze
  parses the whole file in memory, `sampleValues` returns ALL distinct
  values, the payload is served whole and double-encoded); the analyze
  route echoes JSON.parse error snippets of real assets; the DHIS2 session
  cache key is a 32-bit non-crypto hash (collision ≈ serving another
  admin's cached org units — theoretical at 10 entries/15 min).
- Weights import buffers all rows in memory with no size cap (files are
  small in practice), and its facility-existence check is outside the
  write transaction (TOCTOU → raw FK error, funneled).
- Instance-level DHIS2 credentials remain plaintext in
  `structure_upload_attempts.step_1_result` at rest (the API projection is
  now redacted; at-rest encryption would be a separate decision — S6 has
  the same pattern for dataset imports, still unredacted there).
