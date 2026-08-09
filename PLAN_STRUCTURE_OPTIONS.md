# PLAN: Per-family structure registry schema (replaces maxAdminArea + facilityColumns settings)

Status: planned 2026-08-04 (unified from two earlier plans, Tim's ruling).
Re-verified and fleshed out 2026-08-09 against working tree `bdba2d2d`; then
stress-tested by five independent adversarial reviewers and their findings
folded in (same day). Not started.

## Review outcomes 2026-08-09 (verification pass)

1. **There is no explicit admin-depth gate on disaggregation availability
   anywhere.** Availability is pure physical column presence
   (`metric_enricher.ts:120-190` probes the results-object table via
   `detectColumnExists`; `disaggregation_availability.ts:12-32` is the pure
   twin over manifest column names). The R-facing exports truncating admin
   columns at `maxAdminArea` is what makes columns absent. So ruling 6
   (per-family export depth) **implies** ruling 5's admin half for free; only
   the facility-column include-flags need threading. The claimed
   "`dataset_hmis.ts` AA3 gate" is real but is the dataset-browser admin
   tree (`dataset_hmis.ts:306-318`), not a disaggregation gate.
2. **Ruling 7's DB lookup is unnecessary — amended to a pure transform.**
   Nothing on the package read path consumes admin depth: the manifest's only
   config reader is `buildQueryContextFromManifest` (`run_read.ts:216`), which
   uses the include-flags alone; admin gating is column presence;
   `availableDisaggregationOptions` are stamped at generation. So legacy
   packages can leave `adminDepth` **null** — exactly the protocol's own
   "knowable only at generation time is nullable forever" rule
   (PROTOCOL_APP_MIGRATIONS.md:224). This deletes the signature widening and
   the late-arrival failure mode the 2026-08-06 lookup ruling was accepting.
3. **The `datasets_in_project` provenance stamps are dead.** HMIS
   `facilityColumnsConfig`/`maxAdminArea` (`datasets_in_project_hmis.ts:249-250`)
   and HFA `facilityColumnsHash` (`datasets_in_project_hfa.ts:234`) are written
   and never read — repo-wide grep finds zero comparison sites. Resolved: stop
   writing them, delete the optional field declarations. Explicit written
   exception to the skip-gate rule: safe because no reader exists (verified),
   and zod strip drops the stale keys harmlessly on read.
4. **Label-rename cache busting is client-side**: `hashFacilityColumnsConfig`
   (`lib/types/instance.ts:203-211`) hashes all 16 keys including labels, and
   it appears in client IndexedDB keys (`t2_structure.ts:21`,
   `t2_datasets.ts:39`) — not in any server data path.
5. Misc corrections: route registration is implicit (`defineRoute` →
   `markRouteDefined`; the contract lives in `lib/api-routes/`);
   `update_admin_area_labels_config` already exists (only its UI moves); the
   AI system prompt states admin depth/labels but NOT facility columns
   (`lib/ai_tools/build_system_prompt.ts:76-137`); the geojson level picker is
   currently **ungated** (hardcoded 2/3/4,
   `geojson_upload_wizard/step_2.tsx:129-133`); the query rig seeds
   `facility_columns` but not `max_admin_area` (`query_rig/seed.ts:5-12`);
   `RUN_MANIFEST_SCHEMA_VERSION` is now **4** (new block stamps 5).
6. Dead code found in passing, delete with this work:
   `getMaxAdminAreaTableName` (`server/db/instance/config.ts:122-127`, zero
   callers) and `client/src/components/_shared/hmis_windowing_validation.ts`
   (zero callers).

## Adversarial-review outcomes 2026-08-09 (five agents; all folded in below)

The model and both amendments above survived attack (every constructed
wrong-number path dies at column presence). What changed:

- **A. DHIS2 depth source corrected** — `selectedLevels` is "which DHIS2
  levels contain facilities", NOT admin depth; today's DHIS2 admin mapping
  depth is `maxAdminArea`, and `stage_structure_from_dhis2.ts:88-99` exists
  precisely so users can pick a SHALLOWER admin depth than the org tree. The
  DHIS2 wizard gains an explicit admin-depth choice (ruling 1).
- **B. Transform also recomputes the stamps** — recomputed flags without
  recomputed `availableDisaggregationOptions` turn blank-group POs into
  DuckDB binder errors on the plan's own prod-real flag-vs-data mismatches.
  Both are on the protocol's recomputable list (ruling 7).
- **C. Single-family packages exist** — the facilities-parquet writes are
  per-family conditional (`prepare_inputs.ts:114,144`); "every package
  carries both" was false and would have fail-stopped boot. Presence keys
  off the manifest; absence → null schema (ruling 7).
- **D. Guards move to claim time** — the import intent is chosen at step
  4/5, so no step-2 check can enforce intent-dependent rules, and attempts
  park indefinitely; every ruling-2/4 rule is enforced inside the
  integrate/delete transactions, with advisory UX gating in the wizard
  (ruling 2).
- **E. `deleteAllStructureData` was missing** (`structure.ts:146-210`, live
  route) — it clears both schema rows and honors the geojson guard
  (ruling 2).
- **F. The mirror filter needs four surfaces, not one** — structure summary
  counts, the HMIS dataset-browser tree, and geojson area matching/orphan
  counts all read the shared admin tables raw (ruling 4).
- **G. Labels are retained dormant, not dropped** — the drop rule destroyed
  preferences on any DHIS2 replace round-trip; dormant labels never surface
  (options are only offered when the flag is on), so orphaned labels are
  harmless-by-design (ruling 1).
- **H. Rollback recorded; legacy-row deletion deferred one release** —
  manifests stamped v5 read as "future" on the old image (standing property
  of every manifest bump); keeping the legacy config rows one release keeps
  the old image's config reads working (Migration).
- **I. Cache bumps completed** — `PO_CACHE_VERSION` `"13"→"14"` joins the
  `po_detail_v7→v8` prefix; three more caches version on it (ruling 8).
- **J. Concurrency: one structure advisory lock** — integrate, family
  delete, delete-all, and geojson save all take it; closes the
  delete-vs-integrate race (populated family, no schema row) and the
  cross-family max-depth write skew (ruling 2/4).
- **K. Live-instance degrade rule** — stored POs referencing an option whose
  flag flips off at migration degrade gracefully (option no longer offered;
  query construction drops facility dimensions that are neither enabled nor
  present on the source table) instead of erroring (ruling 5).
- Plus: migration edge rules (phantom rows, missing legacy row, sweep
  rewrite, parked attempts), staging stamps its depth, wizard defaults,
  `can_configure_settings` deleted, geojson server-side guard + picker empty
  state, transform idempotency + failure classes — all specified below.

## The model (the unifying insight)

`maxAdminArea` and `facilityColumns` are the same question asked of different
columns: **does this family's facility registry carry real data in this
column?** `admin_area_1..4` and the 8 optional columns are all just columns on
`facilities_hmis` / `facilities_hfa`, and both options have the same
consequence — which disaggregation options that family's visualizations offer.

So both settings dissolve into one per-family **registry schema fact**,
established by what each family's import actually delivered:

```text
structure_schema_hmis / structure_schema_hfa (instance_config keys):
{
  adminDepth: 1|2|3|4,               // real admin levels, contiguous from 1
  includeNames ... includeCustom5,   // existing 8 booleans
  labelNames ... labelCustom5,       // existing 8 optional labels
}
```

- `adminDepth` + include-flags: written ONLY by integration (facts).
- facility-column labels: written ONLY by a label editor on that family's
  facilities page (preference). Labels for currently-disabled columns are
  retained dormant — they never surface (options are offered only when the
  flag is on) and survive source round-trips (outcome G).
- `admin_area_labels` (label1..4) stay ONE shared key — level names are
  country facts and the `admin_areas_1..4` hierarchy is physically shared
  (both facilities tables composite-FK `admin_areas_4`,
  `_main_database.sql:205-247`). Editor moves to the Admin areas screen.
- The three settings-page sections, `update_max_admin_area`,
  `update_facility_columns_config`, and `updateMaxAdminArea`'s guard
  transaction are all deleted. Edit permission for the label editors:
  `can_configure_data`. With no remaining consumer, the
  `can_configure_settings` instance permission is deleted from the
  permission set and users UI (`lib/types/permissions.ts:41`,
  `permission_labels.ts:6`; check the stored-permission shape at
  implementation).
- Absence of a family's schema row = family never imported / deleted.
  Emptiness checks that gate behavior (first-import detection, delete
  guards) key off the family TABLE, not schema-row presence — the row is
  derived state, the table is the fact. `db_startup.ts:386-407` stops
  seeding the legacy defaults.

## Why this is safe (verified 2026-08-04, mechanism corrected 2026-08-09)

- Prod sweep (~40 instances): 6 real countries at max=3, rest 4, none lower.
  Storage is already uniformly 4-level: in every max=3 instance
  `admin_areas_4` is a 1:1 mirror of `admin_areas_3` (staging pads levels
  above the mapped depth with the leaf — `stage_structure_from_csv.ts:286-292`,
  DHIS2 twin at `stage_structure_from_dhis2.ts:102-111`). Mirrored rows are
  already normal at prod scale.
- The `maxAdminArea` setting is already immutable once data exists
  (`config.ts:17-90`) — every live instance can only change it by
  delete + re-import, which is exactly the flow that remains.
- **Family scoping of viz values is even stronger than the draft claimed**:
  admin-area disaggregation values come from the results-object table's own
  `admin_area_N` columns (module output — `admin_area_*` is not an
  `OptionalFacilityColumn`, so it never enters `columnPrefixes` and never gets
  the `f.` facilities-join prefix; `get_possible_values.ts:242-243`). The
  module's input CSV carried admin columns only up to the family's export
  depth, so a depth-2 HFA next to a depth-4 HMIS means HFA results objects
  simply have no AA3/AA4 columns, and column-presence detection offers
  nothing. Adversarial review confirmed: no engine path reads admin values
  through the facilities join or the shared chain; roll-up and
  post-aggregation hold under divergence. The shared-chain mirror rows DO
  reach four non-engine surfaces — handled by ruling 4.
- Divergence cannot go stale inside a package: at migration both families are
  depth-equal; divergence requires a new structure import, which bumps
  `structure_last_updated`, so new captures/packages see it while old
  packages stay internally consistent.
- The 1.54.0 update-modes redesign already made mapping own column scope
  (per-column optional mapping; integration drives off the staging table's
  real columns — `integrate_structure_from_staging.ts:44-48`; three transient
  intents). This plan completes that direction: config stops gating the
  wizard; the import determines the schema.
- Latent bug fixed by derivation: a globally-enabled column one family never
  imported currently offers that disaggregation over nulls for that family.
- Per-family custom columns are the right model anyway: `facility_custom_1`
  in the two tables is the same concept only by convention.

## Design rulings

1. **Derivation.**
   - Include-flags: after EVERY integration (any intent), recompute from the
     family table itself: `enabled_X = EXISTS(value IS NOT NULL AND value <>
     '')` per optional column. Handles all three intents with no bookkeeping:
     `replace_all` naturally shrinks, updates accumulate, blank-overwrite of
     a whole column correctly disables it. Labels are NEVER dropped by
     recompute — they go dormant with their flag (outcome G).
   - `adminDepth`, CSV: deepest mapped admin level, contiguity validated (if
     level n is mapped, 1..n-1 must be). **The depth actually used for
     padding is stamped into `StructureStagingResult` at staging time** and
     integration reads THAT (it is nonce-coupled and claim-returned like
     `step_3_result` — closes the staged-under-old-rules window and the
     `step_2_result` staleness gap, outcome A/lifecycle).
   - `adminDepth`, DHIS2: an explicit **admin-depth selector** in the DHIS2
     step (defaulting from the org-unit tree), NOT `selectedLevels` — that
     field is "which levels contain facilities" and users legitimately pick
     an admin depth shallower than the tree
     (`stage_structure_from_dhis2.ts:88-99`). Staging pads/truncates to the
     chosen depth and stamps it, same as CSV. Mixed-level facility
     selections keep today's synthetic-filler behavior below the chosen
     depth; the chosen depth bounds what is stamped as real.
2. **Per-family depth lifecycle — enforced at claim time.** The intent
   (`replace_all` / `add_and_update` / `update_existing_only`) exists only at
   step 4/5, and attempts can park indefinitely, so NO intent-dependent rule
   lives at step 2. All of the following run inside the integrate transaction
   (which claims the attempt), against then-current state, under the
   structure advisory lock (ruling 4):
   - First import into an empty family table (or `replace_all`) → admin
     mapping REQUIRED (today's all-or-none check permits zero and fails late
     on NOT NULL); sets that family's `adminDepth` from the stamped staging
     depth.
   - `add_and_update` / `update_existing_only` with admin columns staged →
     stamped depth must equal the family's current depth (else rows would
     mix real and mirrored values at the same level). Tag-only files (no
     admin columns — existing group-optional rule,
     `stage_structure_from_csv.ts:112-114`) always allowed, depth unchanged.
   - Geojson guard (ruling 4) re-evaluated here for any depth-lowering
     outcome.
   - `deleteFamilyFacilities` (`structure.ts:212-264`) → also deletes that
     family's schema row, refuses while the family's attempt is
     `status_type='importing'`, and re-checks table emptiness inside the
     transaction (closes the delete-vs-integrate race that could leave a
     populated family with no schema row).
   - `deleteAllStructureData` (`structure.ts:146-210`) → deletes BOTH schema
     rows and honors the geojson guard (max depth goes to 0: any existing
     geojson blocks it with "delete those boundaries first").
   - The wizard mirrors these as advisory UX: step 5's intent availability
     (`step_5_import.tsx:104-118` already gates on mapping facts) becomes
     schema-depth-aware with t3'd explanations, so users don't discover a
     violation only at integrate time.
3. **Padding unchanged**: levels above the family's stamped depth are filled
   with the leaf value at staging, exactly as today (both CSV and DHIS2
   paths).
4. **Shared surfaces key off `max(hmisDepth, hfaDepth)`; mirror rows are
   kept out by two locked-in mechanisms (resolved 2026-08-09):**
   - The HMIS dataset-browser/windowing admin tree
     (`dataset_hmis.ts:300-316`) stops reading the shared table entirely —
     it reads `SELECT DISTINCT admin_area_3, admin_area_2 FROM
     facilities_hmis` (family-scoped source, mirrors structurally
     impossible; otherwise phantom AA3 entries whose selection silently
     matches nothing, including for deletes).
   - The three genuinely shared surfaces use ONE helper-built predicate —
     an admin-area row counts at level n only if referenced by a family
     whose schema depth ≥ n: `qualifyingFamilies(level)` is computed from
     the two schema rows at query-build time, and the helper emits one
     `EXISTS(SELECT 1 FROM facilities_X f WHERE f.admin_area_1 =
     a.admin_area_1 AND … AND f.admin_area_n = a.admin_area_n)` per
     qualifying family, OR-ed; zero qualifying families → empty result.
     Applied at:
     - the Admin areas listing page;
     - `getInstanceStructureSummary` counts
       (`server/db/instance/instance.ts:186-203` — feeds both
       `admin_areas.tsx:60-71` and `instance_data.tsx:168-183`);
     - geojson area matching + orphan detection
       (`geojson_maps.ts:63-125` — otherwise features bind to mirror names
       and render permanently empty).
   GeoJSON level picker: levels 2..max (fixes the ungated hardcoded 2/3/4),
   with a sensible empty state when no family has depth ≥ 2. The depth/geojson
   invariant is enforced server-side in BOTH directions:
   imports/deletes refuse to drop max(depths) below an existing
   `geojson_maps.admin_area_level` (ruling 2), and `saveGeoJsonMap` /
   `dhis2SaveGeoJsonMap` refuse levels above current max(depths)
   (`routes/instance/geojson_maps.ts:108-113,397-399` currently validate
   only membership in [2,3,4]).
   **Concurrency**: one instance-wide structure advisory lock
   (`pg_advisory_xact_lock`) taken by integrate, both delete paths, and
   geojson save — structure mutations are rare, and this closes the
   cross-family write-skew on the max-depth guard (outcome J).
5. **Availability stays column-presence-driven; flags go per family.** Admin
   options need no new gate — ruling 6's export depth is the single lever.
   `getEnabledFacilityDisaggregationOptions` / `buildDisaggregationOptions`
   (`metric_enricher.ts:47-60,120-190`), `deriveAvailableDisaggregationOptions`
   (`disaggregation_availability.ts:12-32`), and `buildQueryContext`
   (`get_query_context.ts:85-98`) take the FAMILY's schema instead of the
   global config. **Degrade rule (outcome K)**: query construction drops a
   requested facility groupBy/filter that is neither enabled nor present on
   the source table — matching today's blank-group tolerance — so stored POs
   referencing an option whose flag flips off (at migration 075 or a
   shrinking re-import) degrade instead of emitting broken SQL.
6. **R-facing exports**: admin columns `1..family.adminDepth` — the loops at
   `datasets_in_project_hmis.ts:375-380` and `datasets_in_project_hfa.ts:157-161`
   read the family schema instead of `max_admin_area`. Same rule for the
   facilities listing + CSV export (`structure.ts:107-128` — the family's
   OWN depth, never `maxDepth()`, else the shallow family shows mirror
   columns). File shapes are proven identical for admin columns on every
   existing instance; include-flag recomputation MAY change optional-column
   sets where prod flags disagree with data (see Migration — sweep first).
7. **Run manifest** (`lib/types/run_manifest.ts`, shape spec SYSTEM_08):
   `facilityColumnsConfig` is REPLACED by `structureSchemaHmis` +
   `structureSchemaHfa` (each `structureSchemaSchema.nullable()`, null =
   family not in the package, with `adminDepth` itself nullable for pre-v5
   packages) — not shadowed. Add shared `adminAreaLabels` (optional,
   additive). Bump `RUN_MANIFEST_SCHEMA_VERSION` 4 → 5. `synthesize_run.ts`
   writes the new fields; `buildQueryContextFromManifest`
   (`run_read.ts:210-258`) picks by `datasetFamily` (null → no enabled
   facility columns); **no legacy branch on the read path**.

   Existing packages are carried forward by a **pure** manifest transform
   block (signature `(manifest, runDir)` unchanged). Per family:
   - **Presence**: the family's facilities parquet listed in
     `manifest.facilitiesTables`/`inputFiles` → schema present; not listed →
     schema **null** (single-family and ICEH-only packages exist —
     `prepare_inputs.ts:114,144`; backfill skips absent tables,
     `synthesize_run.ts:438-449`).
   - **Flags**: EXISTS per optional column over the parquet. Listed parquet
     with zero rows → schema present, all flags false (pinned
     representation).
   - **Stamps**: re-derive every results object's
     `availableDisaggregationOptions` from `ro.columns` × the new family
     flags (`deriveAvailableDisaggregationOptions` is exactly this), and
     recompute `metricAvailability[]` — both on the protocol's recomputable
     list. Without this, stale stamps offer options the flags no longer
     support → binder errors (outcome B).
   - **Labels**: copied from the legacy `facilityColumnsConfig` key ONLY
     when that key is present; otherwise existing `structureSchema*` fields
     are preserved untouched (idempotency — blocks re-run on every future
     forced pass; an unconditional copy would wipe labels at v6).
   - **`adminDepth`: null** (generation-only fact; the parquet lies —
     mirror-padding shows four real-looking levels regardless of depth).
     `adminAreaLabels`: absent for legacy packages.
   - **Failure class**: a listed-but-missing/unreadable parquet maps to the
     OPERATIONAL class (degrade that package, keep booting — same as
     `RunInputReadError` for JSON mirrors, `manifest_transform.ts:176-179`);
     it must NOT rethrow into fail-stop, or a half-restored package kills
     the boot sweep (`db_startup.ts:212-221`).
   - The block deletes the legacy `facilityColumnsConfig` key and stamps
     `manifestSchemaVersion = 5`.

   PROTOCOL_APP_MIGRATIONS.md's permanence list (:224-227) is edited in the
   same commit: `facilityColumnsConfig` leaves the never-invent list;
   `structureSchemaHmis/Hfa` enter it with "flags recomputable per family
   from the facilities parquets (when present); adminDepth generation-only,
   nullable forever; labels copied from the legacy key".
8. **Cache-hash hygiene in the same pass**: new `hashStructureSchema` covers
   `adminDepth` + include-flags ONLY — labels out (fixes label-rename
   busting data caches). `hashFacilityColumnsConfig` deleted with its
   callers. Client keys:
   - `t2_structure.ts`: versionKey `family_structureLastUpdated_schemaHash`.
   - `t2_datasets.ts` (HMIS display cache): uniquenessKeys
     `[rawOrCommon, schemaHash]`; versionKey
     `versionId_indicatorMappingsVersion_structureLastUpdated` (guard the
     undefined case with a token) — also closes today's latent hole where
     facility re-imports change the admin tree without any key moving.
     Accepted: `structure_last_updated` is instance-wide, so an HFA import
     spuriously refetches the HMIS display cache (rare, correct, cheap);
     and integration's two SSE messages (`structure_updated` +
     `config_updated`) cause one wasted fetch per import (both components
     are in the key — never wrong data).
   - Server: `_PO_DETAIL_CACHE` prefix `po_detail_v7` → `po_detail_v8` AND
     `PO_CACHE_VERSION` `"13"` → `"14"` (`server/routes/caches/
     visualizations.ts:64` — `po_items`, `metric_info`, `replicant_opts`
     version on it; every prior manifest bump minted it too). Fourth-layer
     audit (stored FigureBundles): figures store rendered labels/options as
     data, no schema-shaped field — no force block needed.
   - Dev-only, named honestly: dev has no deploy bust, so pre-family
     IndexedDB payloads (`metric_info`, `po_detail`) serve ghost generic
     labels until a run repoint or PO edit; clear IndexedDB in dev after
     deploying this. Prod self-heals on deploy.
9. **Wizard**: step 2 shows all 4 admin rows and all 8 optional columns.
   - Optional-column toggle defaults: family schema flags → on; null schema
     (first import) → all OFF (opt-in — the current default-all-enabled +
     must-map validation would make every fresh import error,
     `step_2_csv.tsx:52-62,117-129`).
   - Admin rows: prefilled/defaulted to the family's current depth; the
     all-or-nothing admin group toggle (`:100-114`) is reworked to express
     contiguous-prefix ("mapped through level n") with inline feedback.
   - Blocking validations that ruling 2 enforces server-side get client-side
     t3'd twins (contiguity, intent-vs-depth at step 5) so FR/PT users are
     not blocked by English server `err` strings.
   - The config props threaded into `structure_import/` become the family's
     schema (labels/prefill), not a gate. `family` is already threaded to
     every step (`structure_import/index.tsx:58-66`).

## Migration (SQL migration 075, instance)

Plain SQL (`jsonb_build_object` + EXISTS subqueries):

- INSERT `structure_schema_hmis` / `structure_schema_hfa`, each gated on
  **that family's table being non-empty** (`EXISTS(SELECT 1 FROM
  facilities_X)`) — no phantom rows for never-imported families — and keyed
  off the `max_admin_area` row alone (the `facility_columns` row is
  OPTIONAL: it has an absent-row default branch today, `config.ts:139-153`;
  treat the labels source as best-effort).
  - `adminDepth`: the legacy `max_admin_area` value (accurate — the old
    guard kept it locked to the data, and both families were forced equal).
  - include-flags: EXISTS per optional column over that family's table.
  - labels: ALL labels copied from the legacy `facility_columns` row
    (dormant where the flag is off — outcome G).
- **Legacy rows are NOT deleted in 075.** Deletion moves to migration 076
  next release, so a rollback to the previous image keeps working config
  reads (outcome H). Recorded: rollback across THIS deploy is still
  package-degraded — every manifest stamped v5 reads as "future" on the old
  image; that is the standing property of every manifest bump, accepted.
- Reset parked structure imports: delete `structure_upload_attempts` rows
  and drop their staging tables (an attempt staged under the old rules must
  not integrate under the new ones — its padding depth was never stamped).
- Behavioral delta, bounded before deploy: EXISTS-derivation re-enables
  deliberately-disabled columns with data and disables enabled-but-empty
  ones; both directions change the next capture's export CSV → `inputKey`
  churn → one module re-run. Run the read-only prod sweep (flag vs EXISTS
  per column per family) pre-deploy and record acceptance. (The disable
  direction is covered at runtime by ruling 5's degrade rule.)
- `admin_area_labels` key untouched. Fresh instances: no legacy rows →
  no-op → schema rows appear at first import.
- **The `instance_config` data-transform sweep is REWRITTEN, not deleted**:
  `server/db/migrations/data_transforms/instance_config.ts` imports the
  schema this plan deletes (`:22`) and sweeps a row 076 removes; it becomes
  the `structure_schema_hmis/hfa` sweep — which is also the only zod
  validation the raw-SQL-built JSON ever gets (catches a 075 shape mistake
  at next boot instead of at runtime).

## Implementation

### Phase 1 — schema fact (server write side)

- `lib/types/instance.ts`: add `structureSchemaSchema` + `StructureSchema`
  (+ `hashStructureSchema`); delete `instanceConfigMaxAdminAreaSchema`,
  `instanceConfigFacilityColumnsSchema` (keep the 8-label field names inside
  the new schema), delete `hashFacilityColumnsConfig` (:203-211).
  `InstanceState` / `instance_sse.ts` `InstanceConfig` (:30-34, :94-99):
  `maxAdminArea` + `facilityColumns` → `structureSchemaHmis: StructureSchema
  | null` + `structureSchemaHfa: StructureSchema | null`.
- `server/db/instance/config.ts`: `getStructureSchema(mainDb, family)` /
  `setStructureSchema` / `deleteStructureSchema`; delete `updateMaxAdminArea`
  (:17-90), `getMaxAdminAreaConfig` (:93-119), dead `getMaxAdminAreaTableName`
  (:122-127), `getFacilityColumnsConfig` / `updateFacilityColumnsConfig`
  (:129-182).
- Staging: `stage_structure_from_csv.ts` (:67-70,105) derives staged admin
  columns from the mapping and **stamps the padding depth into
  `StructureStagingResult`**; `stage_structure_from_dhis2.ts`
  (:23,57-91,399) takes the wizard's new admin-depth field (route body
  `lib/api-routes/instance/structure.ts:154` area) and stamps likewise.
  Mapping validation (`structure.ts:632-691`): contiguous-prefix (advisory;
  hard rules run at claim time).
- Integration: `recomputeStructureSchema(sql, family, stagedDepth | null)`
  inside the integrate transaction alongside the `structure_last_updated`
  stamp (`integrate_structure_from_staging.ts:150-158`; staged-column facts
  at :44-48), plus ALL ruling-2 claim-time checks and the geojson guard,
  under the advisory lock. `deleteFamilyFacilities` + `deleteAllStructureData`
  per ruling 2 (schema-row deletes, importing-attempt refusal, emptiness
  re-check, geojson guard, advisory lock). `saveGeoJsonMap` /
  `dhis2SaveGeoJsonMap` gain the depth guard + lock.
- Routes: delete `updateMaxAdminArea` + `updateFacilityColumnsConfig`
  (contract `lib/api-routes/instance/instance.ts:31-40`, handlers
  `server/routes/instance/instance.ts:80-106`); add `updateFacilityLabels`
  `{family, labels}` (`can_configure_data`); add `clearFacilityColumn`
  `{family, column}` — column restricted to the 8 OPTIONAL columns (never
  `facility_id`/admin columns), `can_configure_data`, under the advisory
  lock: `UPDATE facilities_X SET col = NULL` + schema recompute (flag flips
  off via EXISTS, label stays dormant) + `structure_last_updated` bump +
  config SSE (resolved 2026-08-09: the escape hatch for "tried a custom
  column, want it gone" — otherwise the only lever is a full re-import);
  `updateAdminAreaLabelsConfig` (:41-45, handler :107-119) stays,
  permission → `can_configure_data`.
  Delete the `can_configure_settings` permission (types, labels, users UI;
  stored-permission shape checked at implementation). Registration is
  implicit — no tracker edit.
- `notifyConfigUpdated` (`instance.ts:127-142`) payload → both schemas +
  `adminAreaLabels` + `countryIso3`; also fired after integration recompute
  and both delete paths. `getInstanceDetail`
  (`server/db/instance/instance.ts:365-373,490-492`) and
  `build_instance_state.ts:44-46` reshaped. `server/mcp/env.ts:48-51`
  `getDimensionLabelConfig` gains a family parameter.
- `db_startup.ts:386-407`: remove legacy seeding. Migration 075 + the
  rewritten `instance_config` sweep as above.

### Phase 2 — server read paths

- Query context: `get_query_context.ts:85-98` reads the family's schema;
  `get_possible_values.ts`, `get_results_value_info.ts:37-42`,
  `presentation_objects.ts:176-183`, `results_value_resolver.ts:15-42`
  thread it to `enrichMetric`. Ruling-5 degrade rule in
  `computeFacilityContext`/query construction (drop, don't emit, unknown
  facility dimensions).
- Availability: `metric_enricher.ts:47-60` + `disaggregation_availability.ts`
  take `StructureSchema`; admin options remain column-presence.
- Mirror handling (ruling 4): re-source the browser tree
  (`dataset_hmis.ts:300-316` → DISTINCT from `facilities_hmis`, depth gate →
  HMIS schema) and apply the `qualifyingFamilies` predicate helper at
  `server/db/instance/instance.ts:186-203`, `geojson_maps.ts:63-125`, and
  the admin-areas listing.
- Exports/snapshots: `datasets_in_project_hmis.ts:171-175,211-213,244-251,
  371-383` and `datasets_in_project_hfa.ts:98-106,157-181,230-235` read the
  family schema; delete the dead provenance stamps and their field
  declarations (`lib/types/datasets_in_project.ts:29-31,44`). Facilities
  listing/CSV export (`structure.ts:107-128`) → the family's own depth.
- Manifest write: `synthesize_run.ts:178-183` reads both schema rows; :480
  stamps `structureSchemaHmis/Hfa` (null for families not in the package) +
  `adminAreaLabels`; :334-337 passes the module's family schema
  (`familyByModuleId` at :261) to the derivation; :545-571 threads it into
  `buildResultsObjectParquet` → `computeResultsObjectColumnsToExclude`
  (`write_results_object_parquet.ts:46-62` — family threaded in from the
  call site).
- Manifest read: `run_read.ts:210-258` picks the family's schema; null → no
  enabled facility columns.
- Display-info route body field (`lib/api-routes/instance/datasets.ts:169`)
  becomes the HMIS schema (senders are compile-time-typed; the response echo
  is client-dead — verified; null unreachable on that page since
  `deleteFamilyFacilities` refuses while `dataset_hmis` rows exist — guard
  cheaply at the senders).

### Phase 3 — client

- `t1_store.ts:25-37,106-111`: schema split (verified: Solid `reconcile`
  handles null↔object transitions cleanly); `t1_sse.tsx:96-98` unchanged
  mechanically. Derived `maxDepth()` helper for shared surfaces.
- Label resolver: `lib/disaggregation_labels.ts` keeps its shape (the family
  schema satisfies the `facilityColumns` slot — same label field names);
  `_util_disaggregation_label.ts` gains a family param; missing family →
  generic default labels (degrades politely; see ruling 8's dev note). Call
  sites: `_3_disaggregation.tsx`, `_2_filters.tsx`,
  `metric_details_modal.tsx`, `add_visualization/` (`metric_card.tsx:63`,
  `step_3_configure.tsx:103`), `format_viz_editor_for_ai.ts:121-125`,
  `format_figure_config_for_ai.ts:151-154` (via `client_env.ts:49-52` /
  `server/mcp/env.ts` family param). Two sites need `datasetFamily` ADDED to
  their types (server builds both and knows it):
  `results_package_compatibility_modal.tsx:144` →
  `ResultsPackageCompatibilityIssue` (`lib/types/run_generation.ts:129-139`)
  and `_custom_value_order.tsx:235,262` →
  `ResultsValueInfoForPresentationObject`
  (`lib/types/presentation_objects.ts:104`).
- Depth-gated UI: `WindowingSelector.tsx:41,71-90,353,371`,
  `dataset_items_holder.tsx:36,58-64`, and the prop chains feeding them
  (`instance_dataset_hmis/index.tsx:48,178`, `_delete_data.tsx:28,103`)
  pass the HMIS schema; delete dead `_shared/hmis_windowing_validation.ts`.
  Shared surfaces on `maxDepth()`: `admin_areas.tsx:60-71`,
  `instance_data.tsx:168-183` (counts now server-filtered per ruling 4),
  geojson picker `step_2.tsx:129-133` (+ empty state).
- Wizard: `structure/index.tsx:69-77` passes the family schema;
  `structure_import/index.tsx`; `step_2_csv.tsx` per ruling 9 (defaults,
  contiguous-prefix admin UI); DHIS2 step gains the admin-depth selector
  (`step_2_dhis2.tsx`); `step_5_import.tsx:104-118` intent gating becomes
  schema-depth-aware with t3'd explanations; `step_4_recode.tsx` /
  `step_5_import.tsx` labels; `_column_labels.ts:7-57` takes the schema.
- AI prompt: `lib/ai_tools/build_system_prompt.ts:76-137` emits a block per
  family with data (it already knows which families the project has).
- Label editors (UX resolved 2026-08-09: toolbar button → small panel, NOT
  inline header editing — the existing settings-section forms port into the
  panels nearly verbatim, and the button lives on the page toolbar because
  panther's `openComponent` replaces open modals): facilities page panel
  per family (enabled columns only; each row also carries the destructive
  "Clear data" action → `clearFacilityColumn`, with confirm), Admin areas
  screen panel for shared labels (move `stripAdminSuffix` /
  `withAdminSuffix` from `instance_settings.tsx:26-33`; `label1` stays
  non-editable). Delete the three settings-page sections
  (`instance_settings.tsx:250-423`); the page is then empty — delete page +
  nav entry (`instance/index.tsx:169-178,411-422`, tab guard :198,202).
- `with_csv.tsx:47-58`: cache-key inputs → schema hash.
- New t3 strings: contiguity feedback, intent-disabled explanations, label
  editors, geojson guard messaging (client-side twins for blocking rules).

### Phase 4 — hash + cache keys

Ruling 8: `hashStructureSchema`, `t2_structure.ts:9-23`,
`t2_datasets.ts:26-93`, `po_detail_v8` prefix + `PO_CACHE_VERSION "14"`.

### Phase 5 — manifest transform block

Per ruling 7 and the PROTOCOL_APP_MIGRATIONS § "Run Manifest Transforms"
add-a-block checklist (:333-346): new block in
`server/runs/manifest_transform.ts` (pure — signature untouched; per-family
presence keyed off the manifest; operational failure class for unreadable
parquets), `RUN_MANIFEST_SCHEMA_VERSION = 5`, zod schema update, stamp +
`metricAvailability`/`availableDisaggregationOptions` recompute, protocol
permanence-list edit. Verify by running the transform over COPIES of dev
packages — at minimum one both-family, one single-family, and one
backfill-synthesized package — never the instance directory; assert flags
and stamps recomputed, depth null, provenance untouched, and idempotency
(run the block twice).

Lockstep watch: `manifest.facilityColumnsConfig` has exactly one reader
(`run_read.ts:216` — verified); the Valkey caches are handled by the two
version bumps in ruling 8.

## Verification

- `deno task typecheck`; `./validate_queries` with a NEW rig case where the
  families' schemas diverge (different depth AND different flags — asserts
  per-family selection end to end). Rig plumbing: `query_rig/seed.ts` seeds
  both schema rows (currently seeds only `facility_columns`, no depth);
  `fixtures.ts` gains `adminDepth` per fixture (fixtures already carry
  `family`).
- Execution harness (dev DB): HMIS import depth 4 + custom_1, HFA import
  depth 2 → schemas diverge; HFA viz options stop at AA2; admin-areas
  listing AND summary counts at AA3/AA4 show only HMIS units; the HMIS
  dataset-browser AA3 tree contains no HFA mirrors; blank-overwrite drops a
  flag; tag-only update leaves depth; label survives a flag going off and
  returns when it comes back (dormant rule); `clearFacilityColumn` nulls an
  optional column, drops its flag, keeps its label dormant, and refuses
  admin/`facility_id` columns; `deleteFamilyFacilities` clears
  one schema, other family unaffected; `deleteAllStructureData` clears both
  and is blocked by existing geojson; geojson save above max(depths) is
  refused; label edit changes no data-cache key.
- Manifest transform over copied dev packages per Phase 5.
- Prod, pre-deploy: read-only flag-vs-EXISTS sweep per column per family;
  record acceptance of any deltas (each is one module re-run + the ruling-5
  degrade on affected POs). Migration 075 itself: zero data work beyond the
  seeding (all instances currently family-equal).

## Out of scope, noted for follow-up

- Modules repo: the "module outputs derive admin columns from input, never
  hardcode" invariant is convention-only (`m010/script.R:169` hardcodes
  headers in its empty branch; `m001`'s GEOLEVEL param assumes AA3 — a
  depth-2 family would need it depth-aware). One sentence goes into
  SYSTEM_08 with this work; the module fixes ride the next modules-repo
  cycle.
- Migration 076 (next release): delete the legacy `max_admin_area` +
  `facility_columns` rows (outcome H).

No open items — the last three (mirror-filter approach, label-editor UX,
clear-column action) were resolved 2026-08-09 and folded into rulings 4, the
Phase 1 routes, and the Phase 3 editors.
