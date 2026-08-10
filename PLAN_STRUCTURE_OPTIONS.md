# PLAN: Per-family structure config (replaces global maxAdminArea + facilityColumns)

Status: planned 2026-08-04. Re-cut 2026-08-10 after review — the derivation
approach ("infer the schema from the data") was **rejected**; see the ruling
below. Second verification pass 2026-08-10: all claims re-verified (incl.
read-only dev-DB checks) and four corrections applied — shared-read depth
gate, schema-row persistence across deletes, no manifest `adminAreaLabels`,
depth-guard rationale. Verified against working tree `d749fbb4`. Not started.

**PAUSED 2026-08-10 (Tim):** considering going further — physically separating
`admin_areas_*` and `geojson_maps` by family (per-family admin trees, maps
keyed family+level) instead of shared tables + depth-gated reads. That would
delete this plan's re-source helper, cleanup-invariant dependency, and
`max(depths)` guard/advisory lock wholesale. Re-cut before implementing.

## The change, in one line

`max_admin_area` and `facility_columns` are today ONE global setting each,
applied to two facility registries with genuinely different shapes. Split each
into two explicit per-family settings. Nothing else about how they work changes.

```text
structure_schema_hmis / structure_schema_hfa (instance_config keys):
{
  adminDepth: 1|2|3|4,               // was the global max_admin_area
  includeNames ... includeCustom5,   // the existing 8 booleans
  labelNames ... labelCustom5,       // the existing 8 optional labels
}
```

`admin_area_labels` (label1..4) stays ONE shared key — level names are country
facts and the `admin_areas_1..4` hierarchy is physically shared (both facilities
tables composite-FK `admin_areas_4`, `_main_database.sql:205-247`).

## Ruling: explicit config, not derivation (2026-08-10)

An earlier cut of this plan derived the include-flags from the data
(`enabled_X = EXISTS(value IS NOT NULL AND value <> '')`, recomputed after
every integration) and stamped `adminDepth` at staging time. Rejected, for
four reasons established during review:

- **A wrong flag is cosmetic, not dangerous.** `blankFoldedRef`
  (`query_helpers.ts:47-48`) folds NULL and whitespace-only cells onto
  `BLANK_SENTINEL`, a first-class displayed value. A flag left on over an empty
  column yields one group labelled "Blank" — not an error, not broken SQL. The
  derivation spent an enormous amount of machinery preventing a wart.
- **EXISTS is itself a heuristic.** One junk row makes a column "enabled"; a
  column that is 99.9% blank is "enabled". It is not "the data is the truth",
  it is "any single row is the truth".
- **It removes a legitimate power** — deliberately suppressing a column that
  has data but is garbage. There is no way to express that under derivation.
- **It could not bootstrap.** Staging stages only columns that are already
  enabled (`stage_structure_from_csv.ts:116-128`,
  `stage_structure_from_dhis2.ts:189-197`), so off → not staged → no data →
  off. With the settings page deleted there would be no lever at all; a fresh
  instance could never enable any optional facility column. The derivation's
  own proposed acceptance test ("label survives a flag going off and returns
  when it comes back") could not have passed.

Explicit config keeps today's mechanism — staging gates on the flags, the user
sets the flags — and simply makes both settings per-family. The editor is
needed anyway for the labels, so the checkbox is one more control on a form
that has to exist regardless.

## Ruling: re-source the shared reads, don't filter them (2026-08-10)

Storage is always 4 levels. Staging pads levels above the family's depth with
the leaf value (`stage_structure_from_csv.ts:286-292`, DHIS2 twin at
`:102-111`), and integration inserts `SELECT DISTINCT admin_area_1..N` from the
staging table into all four levels unconditionally
(`integrate_structure_from_staging.ts:486-522`). So a depth-2 family writes
`('Country','Region X','Region X')` into the shared `admin_areas_3`.

This is already true today: at global depth 3, `admin_areas_4` is 100% padding.
Nobody notices because every surface gates on `maxAdminArea >= n`, and with ONE
depth "hide everything above the depth" exactly equals "hide all the padding".
Two depths destroys that coincidence — `max(depths)` unhides a level where
padding rows and real rows coexist, and `admin_areas_3` has no family column to
tell them apart.

The fix is not a row-level filter. **Almost nothing reads those tables.** The
complete read set is five sites:

| Site | Purpose |
| --- | --- |
| `geojson_maps.ts:85-86` | orphan detection (dynamic table name) |
| `geojson_maps.ts:104-121` | geojson area-mapping picker |
| `dataset_hmis.ts:303,314` | HMIS dataset-browser / windowing tree |
| `instance.ts:176-202` | `getInstanceStructureSummary` counts |
| `instance.ts:382-400` | `getInstanceDetail` counts (the same query, duplicated) |

Every one moves to `SELECT DISTINCT … FROM facilities_hmis` / `facilities_hfa`.
The family-scoped site (`dataset_hmis.ts`) reads its own table only — clean by
construction, since staging never pads at or below a family's own depth. The
four shared sites (both geojson reads, both count queries) union the two
facilities tables, and the union MUST take a family only at levels ≤ its
configured depth: the facilities tables carry the same padding (all four admin
columns are NOT NULL and staging pads them — verified on dev at depth 3: zero
rows where `admin_area_4 <> admin_area_3` across both tables, 1690+904
facilities), so an ungated union re-admits it. A level-N read is the union of
families with `adminDepth >= N`, empty when none reaches N. Build the
per-level source list in ONE shared helper so the depth gate is written once,
not remembered per surface.

This rests on an invariant that holds: `admin_areas_*` is exactly the set of
distinct paths referenced by the two facilities tables, because
`cleanupUnusedAdminAreas` runs after all three integrate strategies
(`integrate_structure_from_staging.ts:109,125,145`) and after
`deleteFamilyFacilities` (`structure.ts:252`), inside the same transaction as
the inserts. Confirmed on the dev DB: `admin_areas_2/3/4` counts match the
distinct facility paths exactly at every level, zero orphan rows.

`admin_areas_1..4` then remain purely as FK anchors and cascade-delete
machinery. The padding rows still get written; nothing displays them.

## Why the split is safe

- **Family scoping of viz values is already total.** Admin-area disaggregation
  values come from the results-object table's own `admin_area_N` columns —
  `admin_area_*` is not an `OptionalFacilityColumn`, so it never enters
  `columnPrefixes` and never gets the `f.` facilities-join prefix
  (`get_possible_values.ts:178-183,242-243`). A module's input CSV carries admin
  columns only up to its family's export depth, so a depth-2 HFA next to a
  depth-4 HMIS means HFA results objects simply have no AA3/AA4 columns.
- **Availability is pure column presence.** `admin_area_2/3/4` are in
  `PHYSICAL_DISAGGREGATION_COLUMNS` (`metric_enricher.ts:26-45`), probed via
  `detectColumnExists` (`:120-190`), with the pure twin at
  `disaggregation_availability.ts:12-32`. Per-family export depth is therefore
  the single lever for admin options — no new gate is needed.
- **`maxAdminArea` is already immutable once data exists** (`config.ts:17-90`).
  Every live instance can only change it by delete + re-import. Per-family, the
  guard becomes per-family — strictly more correct than today.
- **Prod is uniformly 4-level in storage.** In every depth<4 instance the
  deeper `admin_areas_*` tables are 1:1 mirrors. Directly observed on dev
  (`aa3 = aa4 = 40` at depth 3).
- **Latent bug fixed by the split**: a globally-enabled column that one family
  never imported currently offers that disaggregation over nulls for that
  family. Also `dataset_hmis.ts:303,314` currently offers HFA-only admin areas
  as HMIS windowing filters — the re-source fixes that too.

## Design rulings

1. **Per-family depth lifecycle.** `updateStructureSchema(family, …)` refuses a
   depth change while THAT family's facilities table is non-empty (today's
   `updateMaxAdminArea` guard, `config.ts:17-90`, scoped per family; the
   `admin_areas_*` emptiness half of that guard, `:44-58`, is dropped — per
   family it is WRONG, not redundant: the shared `admin_areas_*` tables hold
   the other family's rows, so the check would block a depth change whenever
   the other family has data; with both families empty it is implied by the
   cleanup invariant anyway). Staging reads the family's
   configured depth exactly as it reads the global one today; padding is
   unchanged.
2. **Depth/geojson invariant, enforced both directions.** A depth change
   refuses if it would drop `max(hmisDepth, hfaDepth)` below an existing
   `geojson_maps.admin_area_level` (deletes never change a depth under ruling
   3, so no delete-path guard is needed); `saveGeoJsonMap` /
   `dhis2SaveGeoJsonMap` refuse levels above the current max
   (`routes/instance/geojson_maps.ts:108-113,397-399` currently validate only
   membership in `[2,3,4]`). The picker offers levels 2..max with an empty
   state when no family reaches depth 2. **One instance-wide advisory lock**
   (`pg_advisory_xact_lock`) on the depth-change path and both geojson-save
   paths — two families lowering depth concurrently can otherwise skew the
   max-depth guard. Three call sites.
3. **Schema rows persist across deletes.** Neither `deleteFamilyFacilities`
   (`structure.ts:212-264`) nor `deleteAllStructureData`
   (`structure.ts:146-210`) touches the schema rows — matching today, where
   `max_admin_area` and `facility_columns` survive facility deletion — so
   flags/labels/depth survive a delete + re-import cycle, and today's
   depth-change flow (delete, edit depth, re-import) keeps working without
   reconfiguring the rest. Both rows are seeded at instance creation
   (`db_startup.ts:66`) and exist from then on; row presence carries no
   meaning — every behaviour gate keys off the family TABLE's emptiness. New
   guard: `deleteFamilyFacilities` refuses while that family's attempt is
   `status_type='importing'` (no such guard exists today).
4. **Availability and query context go per family.**
   `getEnabledFacilityDisaggregationOptions` / `buildDisaggregationOptions`
   (`metric_enricher.ts:47-60,120-190`),
   `deriveAvailableDisaggregationOptions` (`disaggregation_availability.ts`),
   and `buildQueryContext` (`get_query_context.ts:85-98`) take the FAMILY's
   schema. Selection is 3-way: `hmis` → HMIS schema, `hfa` → HFA schema,
   `iceh`/undefined → no enabled facility columns (`DatasetType` is
   `"hmis"|"hfa"|"iceh"`; `iceh_data` has no facility dimension, so this branch
   is defensive, not live). **Degrade rule**: query construction drops a
   requested facility groupBy/filter that is neither enabled nor present on the
   source table, so a stored PO referencing an option whose flag is later
   turned off degrades instead of emitting broken SQL.
5. **R-facing exports use the family's own depth**, never `max()`. The loops at
   `datasets_in_project_hmis.ts:375-380` and
   `datasets_in_project_hfa.ts:157-161` read the family schema, as does the
   facilities listing + CSV export (`structure.ts:107-128`). File shapes are
   identical to today on every existing instance — the migration is a pure
   copy, so there is **no `inputKey` churn and no module re-runs**.
6. **Run manifest.** `facilityColumnsConfig` is REPLACED by
   `structureSchemaHmis` + `structureSchemaHfa` (each nullable; null = family
   not in the package). **`adminDepth` is NOT carried in the manifest** —
   nothing on the read path consumes admin depth (the only manifest config
   reader is `buildQueryContextFromManifest`, `run_read.ts:210-258`, which uses
   the flags alone), and a field nobody reads should not exist. By the same
   principle, NO shared `adminAreaLabels` key is added — every admin-label
   consumer reads live instance state (`instanceState.adminAreaLabels`),
   nothing reads labels from a manifest. The per-family labels ride along in
   the slots only because the slot reuses the schema shape and the legacy
   `facilityColumnsConfig` already carried them — keeping the transform a pure
   copy. The manifest schema is therefore flags + labels per family, nothing
   else. Bump `RUN_MANIFEST_SCHEMA_VERSION` 4 → 5.
   `synthesize_run.ts` writes the new fields; `run_read.ts` picks by
   `datasetFamily`; no legacy branch on the read path.

   Existing packages are carried by a **pure copy** transform block: for each
   family whose facilities parquet is listed in
   `manifest.facilitiesTables`/`inputFiles`, copy the legacy
   `facilityColumnsConfig` into that family's slot; families not present get
   null. That is exactly faithful — every artefact in a legacy package was
   built from that one global config (the export CSV,
   `datasets_in_project_hmis.ts:174`; the `availableDisaggregationOptions`
   stamps, `synthesize_run.ts:334-337`; the manifest stamp, `:480`). So there
   is **no stamp recompute, no parquet read, no DuckDB, no failure class, and
   zero behavioural change to any existing package**. Idempotent by
   construction: copy only when the legacy key is present. Delete the legacy
   key and stamp `manifestSchemaVersion = 5`.

   `PROTOCOL_APP_MIGRATIONS.md`'s permanence list (`:224-227`) is edited in the
   same commit: `facilityColumnsConfig` leaves the never-invent list;
   `structureSchemaHmis/Hfa` enter it as generation-only, copied forward from
   the legacy key.
7. **Cache-hash hygiene, in the same pass.** New `hashStructureSchema` covers
   the include-flags ONLY — labels out (fixes label renames busting data
   caches). `hashFacilityColumnsConfig` (`lib/types/instance.ts:203-211`)
   deleted with its callers.
   - `t2_structure.ts:9-23`: versionKey `family_structureLastUpdated_schemaHash`.
   - `t2_datasets.ts:27-45`: uniquenessKeys `[rawOrCommon, schemaHash]`;
     versionKey `versionId_indicatorMappingsVersion_structureLastUpdated`
     (guard the undefined case with a token) — also closes today's hole where
     facility re-imports change the admin tree without any key moving.
     Accepted: `structure_last_updated` is instance-wide, so an HFA import
     spuriously refetches the HMIS display cache. Rare, correct, cheap.
   - Server: `_PO_DETAIL_CACHE` prefix `po_detail_v7` → `po_detail_v8` AND
     `PO_CACHE_VERSION` `"13"` → `"14"`
     (`server/routes/caches/visualizations.ts:64,99`). Fourth-layer audit
     (stored FigureBundles): figures store rendered labels/options as data, no
     schema-shaped field — no force block needed.
   - Dev-only: dev has no deploy bust, so pre-split IndexedDB payloads serve
     ghost generic labels until a run repoint or PO edit. Clear IndexedDB in
     dev after deploying. Prod self-heals on deploy.
8. **Editors.** Today's settings page splits into two per-family sections
   (facility columns + labels + depth) plus the existing shared admin-area
   labels section. The forms port nearly verbatim
   (`instance_settings.tsx:243-423`); `stripAdminSuffix` / `withAdminSuffix`
   (`:26-33`) stay put. The page and the `can_configure_settings` permission
   both survive — no permission deletion, no nav change. Moving these onto the
   facilities pages as panels is a nicer UX and is **separate work**, not part
   of this plan.
9. **Wizard.** `step_2_csv.tsx` keeps showing enabled optional columns only
   (`:33`) and gates admin rows on the family's depth instead of the global
   one. The DHIS2 step is unchanged — staging reads the family's configured
   depth exactly as it reads the global one today, so no depth selector is
   needed. `structure_import/index.tsx` and `structure/index.tsx:69-77` pass
   the family's schema in place of the two global props.

## Migration (SQL migration 075, instance)

Pure copy — no EXISTS, no data inspection, no behavioural delta.

- INSERT `structure_schema_hmis` / `structure_schema_hfa`, each built from the
  legacy `max_admin_area` value plus the legacy `facility_columns` row (the
  latter is OPTIONAL — it has an absent-row default branch today,
  `config.ts:139-153`). Both families get identical content, which is exactly
  what they have today.
- **Guard**: `max_admin_area` has NO absent-row default (`config.ts:104-108`
  errors), so a `SELECT … FROM instance_config WHERE config_key =
  'max_admin_area'` yields zero rows and silently creates no schema row if that
  row is missing. Verified against Postgres: `INSERT 0 0`, no error. Such an
  instance already cannot render `getInstanceDetail`, so probability is
  near-zero — but add `SELECT count(*) FROM instance_config WHERE config_key =
  'max_admin_area'` to the pre-deploy check.
  (`config_json_value` is `text`; `jsonb_build_object` assigns to it directly —
  verified, no `::text` needed.)
- **Legacy rows are NOT deleted in 075.** Deletion moves to migration 076 next
  release, so a rollback to the previous image keeps working config reads.
  Recorded: rollback across THIS deploy is still package-degraded — manifests
  stamped v5 read as "future" on the old image, the standing property of every
  manifest bump.
- Reset parked structure imports: delete `structure_upload_attempts` rows and
  `DROP TABLE IF EXISTS temp_structure_staging_{hmis,hfa}`.
- `admin_area_labels` untouched. Fresh instances: no legacy rows → no-op;
  `db_startup` seeds both schema rows at instance creation (Phase 1), so they
  exist before any import.
- **The `instance_config` data-transform sweep is REWRITTEN, not deleted**:
  `server/db/migrations/data_transforms/instance_config.ts` imports the schema
  this plan deletes (`:22`) and sweeps a row 076 removes; it becomes the
  `structure_schema_hmis/hfa` sweep. It runs at `db_startup.ts:98`, after the
  SQL migrations at `:74`, so it validates 075's output on the SAME boot.

## Implementation

### Phase 1 — types, config, routes

- `lib/types/instance.ts`: add `structureSchemaSchema` + `StructureSchema`
  (+ `hashStructureSchema`); delete `instanceConfigMaxAdminAreaSchema`
  (`:121-125`), `instanceConfigFacilityColumnsSchema` (`:138-157`, keeping the
  8 label field names inside the new schema), and `hashFacilityColumnsConfig`
  (`:203-211`). `InstanceDetail` (`:87-91`) and `instance_sse.ts`
  `InstanceConfig` (`:94-99`): `maxAdminArea` + `facilityColumns` →
  `structureSchemaHmis` / `structureSchemaHfa` (`StructureSchema | null`).
- `server/db/instance/config.ts`: `getStructureSchema(mainDb, family)` /
  `setStructureSchema` with the per-family depth guard (no delete function —
  schema rows persist, ruling 3); delete `updateMaxAdminArea` (`:17-90`),
  `getMaxAdminAreaConfig`
  (`:93-119`), dead `getMaxAdminAreaTableName` (`:122-127`, zero callers), and
  `getFacilityColumnsConfig` / `updateFacilityColumnsConfig` (`:129-182`).
- Staging: `stage_structure_from_csv.ts` (`:67-70,105`) and
  `stage_structure_from_dhis2.ts` (`:183-197`) read the family's schema instead
  of the two global configs. Behaviour otherwise unchanged. Mapping validation
  (`structure.ts:632-691`) gates on the family's depth.
- Integration / deletes: ruling 3, plus the geojson guard and advisory lock of
  ruling 2. `deleteFamilyFacilities` re-checks table emptiness inside the
  transaction.
- Routes: replace `updateMaxAdminArea` + `updateFacilityColumnsConfig`
  (contract `lib/api-routes/instance/instance.ts:31-40`, handlers
  `server/routes/instance/instance.ts:80-106`) with a single
  `updateStructureSchema` `{family, schema}`; `updateAdminAreaLabelsConfig`
  (`:41-45`, handler `:107-119`) unchanged. Registration is implicit
  (`defineRoute` → `markRouteDefined`) — no tracker edit.
- `notifyConfigUpdated` (`server/routes/instance/instance.ts:127-143`) payload →
  both schemas + `adminAreaLabels` + `countryIso3`; also fired after
  integration and both delete paths (the helper is currently private and must
  be exported/relocated). `getInstanceDetail`
  (`server/db/instance/instance.ts:365-373,490-492`) and
  `build_instance_state.ts:44-46` reshaped. `server/mcp/env.ts:48-51` and
  `client_env.ts:49-52` `getDimensionLabelConfig` gain a family parameter (the
  `DisaggregationLabelConfig` type lives in `lib/disaggregation_labels.ts`, not
  panther — the new schema satisfies its `facilityColumns` slot unchanged,
  same label field names).
- `db_startup.ts:382-407`: seed the two schema keys in place of
  `max_admin_area` and `facility_columns`. **Keep seeding `admin_area_labels`.**

### Phase 2 — server read paths

- Query context / availability per ruling 4: `get_query_context.ts:85-98`,
  `get_possible_values.ts`, `get_results_value_info.ts:37-42`,
  `presentation_objects.ts:176-183`, `results_value_resolver.ts`,
  `metric_enricher.ts:47-60`, `disaggregation_availability.ts`.
- **Re-source the five `admin_areas_*` reads** per the ruling above. Two
  mechanical notes: the geojson level-3/4 queries currently omit `DISTINCT`
  (safe only because the PK makes the tuples unique) — **add it**; and
  `instance.ts:176-202` / `:382-400` are the same query twice, worth collapsing
  while you are in there.
  **Check performance first**: six `COUNT(*)`s on tiny reference tables become
  `DISTINCT` scans over the facilities tables, on every structure SSE notify
  and every instance-detail page load. Per-level indexes exist
  (`_main_database.sql:224-227,250-253`), but migration
  `003_add_cache_warming_indexes.sql:13` explicitly declines an index on the
  premise that these are "small reference tables" — an assumption that inverts.
  `EXPLAIN` on a large instance before committing.
- Exports/snapshots: `datasets_in_project_hmis.ts:171-175,244-251,375-380` and
  `datasets_in_project_hfa.ts:98-106,157-181,230-235` read the family schema.
  Delete the dead provenance stamps and their declarations —
  `facilityColumnsConfig`/`maxAdminArea` (`hmis:249-250`) and
  `facilityColumnsHash` (`hfa:234`) are written and never read (repo-wide grep:
  zero comparison sites); declarations at
  `lib/types/datasets_in_project.ts:30-31,44`. Facilities listing/CSV export
  (`structure.ts:107-128`) → the family's own depth.
- Manifest write: `synthesize_run.ts:178-183` reads both schema rows; `:480`
  stamps `structureSchemaHmis/Hfa` (null for families not in the package);
  `:334-337` passes the module's family schema
  (`familyByModuleId` at `:261`) to the derivation; `:545-571` threads it into
  `buildResultsObjectParquet` → `computeResultsObjectColumnsToExclude`.
- Manifest read: `run_read.ts:210-258` picks the family's schema; `iceh`/null →
  no enabled facility columns.
- Display-info route body field (`lib/api-routes/instance/datasets.ts:169`)
  becomes the HMIS schema.

### Phase 3 — client

- `t1_store.ts:25-37,106-111`: schema split. Solid 1.9.10 `reconcile` handles
  null↔object cleanly (`if (!isWrappable(state) || !isWrappable(v)) return v`
  — verified in the installed version). `t1_sse.tsx:96-98` unchanged
  mechanically. Derived `maxDepth()` helper for the shared surfaces.
- Label resolver: `_util_disaggregation_label.ts` gains a family param; missing
  family → generic default labels. Call sites: `_3_disaggregation.tsx`,
  `_2_filters.tsx`, `metric_details_modal.tsx`, `metric_card.tsx:63`,
  `step_3_configure.tsx:103`, `format_viz_editor_for_ai.ts:121-125`,
  `format_figure_config_for_ai.ts:151-154`. `ResultsValue.datasetFamily`
  already exists (`lib/types/modules.ts:42`, optional), so only two sites need
  the field ADDED to their types: `results_package_compatibility_modal.tsx:144`
  → `ResultsPackageCompatibilityIssue`
  (`lib/types/run_generation.ts:129-139`) and `_custom_value_order.tsx:235,262`
  → `ResultsValueInfoForPresentationObject`
  (`lib/types/presentation_objects.ts:104`). `getAdminAreaLabel` sites need no
  family (shared labels).
- Depth-gated UI: `WindowingSelector.tsx:76`, `dataset_items_holder.tsx:36,63`,
  `instance_dataset_hmis/index.tsx:48,178`, `_delete_data.tsx:28,103` pass the
  HMIS schema. Shared surfaces on `maxDepth()`: `admin_areas.tsx:63,69`,
  `instance_data.tsx:173,181`, geojson picker `step_2.tsx:129-133`
  (+ empty state — currently hardcoded 2/3/4 and ungated).
  Delete dead `client/src/components/_shared/hmis_windowing_validation.ts`
  (zero callers).
- Settings page per ruling 8: two family sections + the shared admin-area
  labels section. `_column_labels.ts:7-57` takes the family schema.
- `with_csv.tsx:47-58`: cache-key inputs → schema hash.
- AI prompt: `lib/ai_tools/build_system_prompt.ts:76-137` emits a block per
  family with data (it states admin depth/labels today, not facility columns).
- New t3 strings for the per-family section headings and the geojson guard
  message.

### Phase 4 — hash + cache keys

Ruling 7: `hashStructureSchema`, `t2_structure.ts:9-23`,
`t2_datasets.ts:27-45`, `po_detail_v8` prefix + `PO_CACHE_VERSION "14"`.

### Phase 5 — manifest transform block

Per ruling 6 and the PROTOCOL_APP_MIGRATIONS § "Run Manifest Transforms"
checklist (`:333-346`): new block in `server/runs/manifest_transform.ts` (pure,
signature untouched, per-family presence keyed off the manifest),
`RUN_MANIFEST_SCHEMA_VERSION = 5`, zod schema update, permanence-list edit.
Verify by running the transform over COPIES of dev packages — at minimum one
both-family, one single-family, and one backfill-synthesized package — never
the instance directory; assert the copy landed in the right slots, absent
families are null, provenance is untouched, and the block is idempotent (run it
twice).

Lockstep watch: `manifest.facilityColumnsConfig` has exactly one reader
(`run_read.ts:216` — verified); Valkey is handled by the two version bumps.

## Verification

- `deno task typecheck`; `./validate_queries` with a NEW rig case where the
  families' schemas diverge (different depth AND different flags). Rig
  plumbing: `query_rig/seed.ts:5-12` seeds both schema rows (it currently seeds
  only `facility_columns`, no depth); `fixtures.ts` gains `adminDepth` per
  fixture (fixtures already carry `family`).
- Execution harness (dev DB): HMIS depth 4 + custom_1, HFA depth 2 → schemas
  diverge; HFA viz options stop at AA2; the admin-areas listing AND summary
  counts at AA3/AA4 show only HMIS units; the HMIS dataset-browser AA3 tree
  contains no HFA entries; a depth change is refused while that family has
  facilities and allowed once it is empty; `deleteFamilyFacilities` /
  `deleteAllStructureData` leave both schema rows untouched (flags, labels and
  depth survive a delete + re-import); geojson save above `max(depths)` is
  refused; a
  label edit changes no data-cache key.
- Manifest transform over copied dev packages per Phase 5.
- `EXPLAIN` the re-sourced counts on a large instance.
- **DB access is read-only** — see PROTOCOL_ACCESS_DBS.md. `SELECT` and
  `information_schema` only against `main` and project DBs, dev or prod. To
  test a SQL shape, use a throwaway database, never temp tables shadowing real
  table names.

## Out of scope, noted for follow-up

- **Editor relocation.** Moving the per-family sections onto the facilities
  pages as toolbar panels (and the Admin areas screen for the shared labels) is
  a UX improvement, separate from this plan.
- **`clearFacilityColumn`.** A "clear this column's data" action is still
  worth having as an escape hatch, but decoupled: it nulls the column, and the
  user separately unticks the box. Not required by this plan.
- **`hfa_facility_weights` cascade hazard** (pre-existing, unrelated): the
  `admin_areas` cascade chain reaches `facilities_hfa` → `hfa_facility_weights`
  (`_main_database.sql:524`). With datasets present the `NO ACTION DEFERRABLE`
  FKs raise at commit (`048_make_facility_fks_no_action_deferrable.sql:10-22`);
  with no datasets present, an admin-area delete can silently take HFA weights
  with it. Deserves its own note.
- **`cleanupUnusedAdminAreas` standing warning**
  (`integrate_structure_from_staging.ts:539-542`): every admin-area-keyed table
  added in future must be UNIONed into it.
- **Modules repo**: the "module outputs derive admin columns from input, never
  hardcode" invariant is convention-only (`m010/script.R:169` hardcodes headers
  in its empty branch; `m001`'s GEOLEVEL param assumes AA3 — a depth-2 family
  would need it depth-aware). One sentence goes into SYSTEM_08 with this work;
  the module fixes ride the next modules-repo cycle.
- **Migration 076** (next release): delete the legacy `max_admin_area` +
  `facility_columns` rows.
