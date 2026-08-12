# PLAN_2: Per-family structure — split admin areas and geojson by family

Status: drafted 2026-08-10; **merged + renumbered 2026-08-12**. The physical
split was chosen over the shared-tables variant (PLAN_STRUCTURE_OPTIONS.md,
deleted 2026-08-12 — full text in git history); everything still valid from
that file is folded in below, so this file is self-contained. Originally
verified against working tree `d749fbb4` + read-only dev-DB checks; key
anchors re-verified 2026-08-12 against `c744dea7` (exactly 5 shared-tree read
sites, facilities FKs to shared `admin_areas_4`,
`RUN_MANIFEST_SCHEMA_VERSION = 4`, `po_detail_v7`, staging padding code, the
five `getGeoJsonSync` sites). Not started.

**Sequencing (ruled 2026-08-12): plan 2 of 3.**

- **After PLAN_1** (AA2 project scope): PLAN_1 takes migration 075 and the
  `PO_CACHE_VERSION` bump to "15", and adds a SIXTH shared-tree read site
  (its `listAdminArea2s` picker route) — included in the read-site table
  below.
- **Before PLAN_3** (geojson snapshot): packages are immutable, so the family
  keying of `geojson_maps` must exist BEFORE geojson capture starts — a
  package must be born with per-family geometry. Treat this plan's geojson
  section and PLAN_3 as one continuous workstream (same five `getGeoJsonSync`
  sites, same `t2_geojson` cache, same `geojson_maps` rows).

**Corrections vs the 2026-08-10 drafts** (the PAE fix + 1.66.x deploys landed
in between): `PO_CACHE_VERSION` is already "14" (the PAE fix took the "13"→"14"
bump this plan's earlier text claimed), so this plan bumps "15"→"16" after
PLAN_1; migrations are **076** (+ **077** next release) since PLAN_1 takes 075.

## The change, in one line

`max_admin_area` and `facility_columns` (today ONE global setting each,
applied to two facility registries with genuinely different shapes) become
per-family `structure_schema_hmis` / `structure_schema_hfa` config rows, PLUS:
the shared `admin_areas_1..4` tables split into `admin_areas_hmis_1..4` +
`admin_areas_hfa_1..4`, and `geojson_maps` gains a `facility_family` key. The
family boundary becomes physical instead of predicate-enforced.

```text
structure_schema_hmis / structure_schema_hfa (instance_config keys):
{
  adminDepth: 1|2|3|4,               // was the global max_admin_area
  includeNames ... includeCustom5,   // the existing 8 booleans
  labelNames ... labelCustom5,       // the existing 8 optional labels
}
```

`admin_area_labels` (label1..4) stays ONE shared key — level names are country
facts.

## Why the physical split beats shared tables (the variant decision)

The shared-tables variant kept `admin_areas_1..4` shared and paid for it in
every hard section — each item below is a verified complexity that separation
deletes wholesale:

- **The depth-gated union helper.** Shared surfaces had to union the two
  facilities tables taking each family only at levels ≤ its depth, because the
  facilities tables carry padding (verified on dev at depth 3: zero rows where
  `admin_area_4 <> admin_area_3` across 1690+904 facilities). Per-family
  tables make every read family-scoped by construction.
- **The load-bearing cleanup invariant.** Reads were only correct because
  `admin_areas_*` exactly mirrors the union of referenced paths. Per family,
  the invariant still holds (and still powers the migration) but no read
  depends on it.
- **The `max(depths)` geojson guard + cross-family race.** Maps keyed on a
  bare level that two families interpret differently forced a max-depth
  invariant and an advisory lock spanning families. Per-family maps make the
  guard family-local.
- **The lost coincidence, restored.** With one depth per tree, "hide
  everything above the family's depth" once again exactly equals "hide all the
  padding" — the property that makes today's single-depth design work,
  recovered per family instead of destroyed by two depths.
- **The registry-mismatch latent bug.** A shared map's `area_id`s must match
  BOTH registries' naming (DHIS2 org units vs survey CSVs — nothing enforces
  agreement). Family-keyed maps are matched against the one registry they were
  mapped from; `dataset_hmis` windowing reading HFA areas dies structurally.
- **The counts-performance concern disappears.** The shared variant turned six
  `COUNT(*)`s on tiny reference tables into `DISTINCT` scans over facilities
  (flagged for `EXPLAIN`). Counts now stay `COUNT(*)` on small per-family
  reference tables.

Precedent: migration `047_split_facilities.sql` split `facilities` into
`facilities_hmis`/`facilities_hfa` with the same shape-preserving pattern
(final state in `_main_database.sql`, migration no-ops on fresh installs via
`IF NOT EXISTS`).

Background on why storage is always 4 levels: staging pads levels above the
family's depth with the leaf value (`stage_structure_from_csv.ts:286-292`,
DHIS2 twin at `:102-111`), and integration inserts
`SELECT DISTINCT admin_area_1..N` from the staging table into all four levels
unconditionally (`integrate_structure_from_staging.ts:486-522`). So a depth-2
family writes `('Country','Region X','Region X')` into level 3. Today nobody
notices because every surface gates on `maxAdminArea >= n` and ONE depth means
"hide above the depth" = "hide the padding". Two depths destroys that under
shared tables; per-family tables restore it.

## Ruling: explicit config, not derivation (2026-08-10)

An earlier cut derived the include-flags from the data
(`enabled_X = EXISTS(value IS NOT NULL AND value <> '')`, recomputed after
every integration) and stamped `adminDepth` at staging time. **Rejected**, for
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
  instance could never enable any optional facility column.

Explicit config keeps today's mechanism — staging gates on the flags, the user
sets the flags — and simply makes both settings per-family. The editor is
needed anyway for the labels, so the checkbox is one more control on a form
that has to exist regardless.

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
- **Latent bugs fixed by the split**: a globally-enabled column that one family
  never imported currently offers that disaggregation over nulls for that
  family; and `dataset_hmis.ts:303,314` currently offers HFA-only admin areas
  as HMIS windowing filters — both die structurally.

## Storage model

Eight tables, `admin_areas_hmis_1..4` and `admin_areas_hfa_1..4`, each
identical in shape to today's `admin_areas_N` (same composite PKs, same
chained `ON DELETE CASCADE` FKs level N → N-1, same indexes). Each facilities
table composite-FKs its own family's level-4 table (`ON DELETE CASCADE`,
replacing today's FK to shared `admin_areas_4` — `_main_database.sql:205-247`).

- **Padding is unchanged within a family**: storage stays 4 levels, staging
  pads above the family's depth exactly as today. Every surface gates on the
  family's depth, which now hides exactly the padding — no cross-family
  predicate exists anywhere.
- **Invariant, now per family**: `admin_areas_{family}_N` = the distinct
  level-N paths in `facilities_{family}`. Maintained by the per-family
  cleanup; also what makes the migration exact. Confirmed on the dev DB
  (shared-table equivalent): `admin_areas_2/3/4` counts match the distinct
  facility paths exactly at every level, zero orphan rows
  (`cleanupUnusedAdminAreas` runs after all three integrate strategies,
  `integrate_structure_from_staging.ts:109,125,145`, and after
  `deleteFamilyFacilities`, `structure.ts:252`, inside the same transaction).
- **Integration** (`integrate_structure_from_staging.ts:486-522`) inserts into
  the staging family's four tables only. `cleanupUnusedAdminAreas`
  (`:535-590`) splits into a per-family version with NO union — each family's
  tree is checked against its own facilities table alone. The standing warning
  (every future admin-area-keyed table must be included, e.g. population)
  carries over, per family.
- **Deletes simplify.** `deleteFamilyFacilities` (`structure.ts:212-264`):
  delete the family's facilities, then plain-`DELETE` the family's four tree
  tables (4→1) — cleanup degenerates to a full clear, the other family is
  untouchable by construction. `deleteAllStructureData` (`structure.ts:146-210`)
  clears all eight. Existing dataset/weights refusal guards unchanged
  (`hfa_facility_weights` FKs `facilities_hfa` `ON DELETE CASCADE`,
  `_main_database.sql:517-527` — the pre-existing cascade hazard note in Out
  of scope still stands).
- **Dataset-side FKs untouched**: `dataset_hmis_facility_id_fkey` /
  `hfa_data_facility_id_fkey` reference `facilities_*(facility_id)` and their
  names stay load-bearing for `SET CONSTRAINTS` (048's comment).

### Read sites on the shared trees (complete set, re-homed)

| Site | Becomes |
| --- | --- |
| `dataset_hmis.ts:303,314` (windowing tree) | `admin_areas_hmis_2/3` — HFA entries structurally gone (fixes the latent bug) |
| `geojson_maps.ts:85-86` (orphan check) | `admin_areas_{family}_{level}`, dynamic |
| `geojson_maps.ts:104-121` (picker options) | the family's tree, `getAdminAreaOptionsForLevel(family, level)` |
| `instance.ts:176-202` + `:382-400` (counts, duplicated query — collapse) | per-family `COUNT(*)` on the family trees |
| `listAdminArea2s` (PLAN_1's project-scope picker route, `routes/instance/structure.ts`) | union of BOTH families' level-2 trees (project AA2 identity is registry-agnostic) |

(The geojson level-3/4 picker queries rely on PK uniqueness instead of
`DISTINCT` — still fine under per-family trees, same PKs.)

The structure summary (`InstanceDetail.structure`) becomes per family: admin
counts per family per level, "structure set up" (`instance.ts:380-382`) =
either family's tree non-empty. The Admin areas page
(`client/src/components/structure/admin_areas.tsx`) shows both families'
counts gated on each family's depth, and its prose ("the shared geography for
both facility registries") is rewritten — new t3 strings.

## Geojson model

`geojson_maps` (`_main_database.sql:694-698`, currently PK `admin_area_level
CHECK IN (2,3,4)`) gains `facility_family text NOT NULL CHECK IN
('hmis','hfa')`; PK becomes `(facility_family, admin_area_level)`. Up to six
maps. A map means "boundaries matching THIS registry's naming at THIS level".

- **Server** (`server/db/instance/geojson_maps.ts`, all functions verified
  single-table): `getGeoJsonMapSummaries` (summary gains `family`),
  `getGeoJsonForLevel`, `saveGeoJsonMap`, `deleteGeoJsonMap`,
  `countOrphanedGeoJsonAreaIds` (matches `area_id`s against the family's own
  tree), `getAdminAreaOptionsForLevel` — every one takes `family`. Routes
  (`routes/instance/geojson_maps.ts`) + `dhis2SaveGeoJsonMap` likewise;
  `GeoJsonMapSummary` (`lib/types/geojson_maps.ts`) gains `family`; SSE
  `geojson_maps_updated` payload follows (`lib/types/instance_sse.ts:41,162`).
- **Guard, family-local** (replaces the shared variant's max-depth guard):
  save refuses `level >` that family's `adminDepth`; a family depth change
  refuses if it would drop below that family's own existing maps; a family
  facilities-delete does not touch maps (schema rows persist, depths don't
  move — orphaned `area_id`s are exactly what the orphan count surfaces, as
  today). Keep ONE `pg_advisory_xact_lock` on the depth-change path and both
  save paths — the check-then-write race between a family's depth change and
  its map save remains even family-scoped. Same three call sites
  (`routes/instance/geojson_maps.ts:108-113,397-399` currently validate only
  membership in `[2,3,4]`; the picker offers levels 2..family depth with an
  empty state).
- **Client cache** (`t2_geojson.ts`): keyed `(family, level)` — memory key
  `${family}:${level}`, IDB key `geojson:{family}:{level}`; one-time sweep of
  legacy `geojson:{N}` IDB keys in the load path (a `keys()` scan already
  exists in the file). `preloadGeoJson` / `evictDeletedGeoJsonLevels` /
  `clearGeoJsonMemoryCache` (`t1_sse.tsx:94,112`, `clear_caches.ts:45`)
  follow the summaries.
- **Figure selection.** `getAdminAreaLevelFromMapConfig` is unchanged; the
  five `getGeoJsonSync` call sites (complete, re-verified by repo grep
  2026-08-12) gain the family from the `resultsValue` already in scope — the
  same source ruling 4 uses for labels:
  - `resolve_figure_from_metric.ts:73` (`resultsValueForViz`)
  - `resolve_figure_from_visualization.ts:70` (`poDetail.resultsValue`)
  - `resolve_figure_from_visualization.ts:118` (`data.resultsValue`; the
    `Pick` at `:110` gains `datasetFamily`)
  - `build_figure_inputs.ts:258` (`resolveGeoJson`, re-resolves the
    `{kind:"level"}` fallback — the variant gains `family`)
  - `visualization_editor_inner.tsx:231`
  **Ruling — absent family defaults to `hmis`.** `ResultsValue.datasetFamily`
  is optional (`lib/types/modules.ts:42`); packages synthesized before it was
  stamped lack it. The migration copies today's shared map to hmis whenever
  HMIS facilities exist (below), so legacy viz keep rendering exactly as
  today. Stored FigureBundles embed geo as data (`kind:"data"`) and are
  untouched; stored `{kind:"level"}` bundles without `family` hit the same
  hmis default — additive optional field, no force block
  (FigureInputs stays `z.unknown`-tolerant per the standing decision).
  (PLAN_3 later repoints the project-plane sites to run-captured geometry;
  instance-plane surfaces keep reading `t2_geojson` — do the family threading
  here knowing that repoint is next.)
- **Manager UI** (`instance_geojson/`): per-family sections in
  `geojson_manager.tsx`; the upload wizard takes the family as a prop from
  the section that launched it (no new step); `step_2` offers levels
  2..family depth with an empty state (currently hardcoded 2/3/4, ungated);
  `geojson_edit_modal` + `step_4` carry the family through. New t3 strings
  for section headings and the family-local guard messages.

## Design rulings (carried from the shared-tables variant; ruling 2 replaced)

1. **Per-family depth lifecycle.** `updateStructureSchema(family, …)` refuses a
   depth change while THAT family's facilities table is non-empty (today's
   `updateMaxAdminArea` guard, `config.ts:17-90`, scoped per family). The old
   guard's `admin_areas_*` emptiness half (`:44-58`) is dropped — under the
   split the check would be the family's own tree, which is implied by the
   cleanup invariant whenever the facilities table is empty. Staging reads the
   family's configured depth exactly as it reads the global one today; padding
   is unchanged.
2. *(Replaced.)* The shared variant's max-depth geojson guard + instance-wide
   advisory-lock ruling is superseded by the family-local guard in the Geojson
   model above.
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
   else. Bump `RUN_MANIFEST_SCHEMA_VERSION` 4 → 5 (still 4, re-verified
   2026-08-12). `synthesize_run.ts` writes the new fields; `run_read.ts` picks
   by `datasetFamily`; no legacy branch on the read path.

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
     `PO_CACHE_VERSION` +1 from current at landing ("14" today; "15"→"16"
     assuming PLAN_1 lands first)
     (`server/routes/caches/visualizations.ts:68,103`). Fourth-layer audit
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

## Migration (SQL migration 076, instance — one deploy with the config split)

Final state lands in `_main_database.sql`; 076 mirrors the 047 pattern
(`IF NOT EXISTS` + no-op on fresh installs).

1. **Config-row copy + guard + parked-import reset** — pure copy, no EXISTS,
   no data inspection, no behavioural delta:
   - INSERT `structure_schema_hmis` / `structure_schema_hfa`, each built from
     the legacy `max_admin_area` value plus the legacy `facility_columns` row
     (the latter is OPTIONAL — it has an absent-row default branch today,
     `config.ts:139-153`). Both families get identical content, which is
     exactly what they have today.
   - **Guard**: `max_admin_area` has NO absent-row default (`config.ts:104-108`
     errors), so a `SELECT … FROM instance_config WHERE config_key =
     'max_admin_area'` yields zero rows and silently creates no schema row if
     that row is missing. Verified against Postgres: `INSERT 0 0`, no error.
     Such an instance already cannot render `getInstanceDetail`, so
     probability is near-zero — but add `SELECT count(*) FROM instance_config
     WHERE config_key = 'max_admin_area'` to the pre-deploy check.
     (`config_json_value` is `text`; `jsonb_build_object` assigns to it
     directly — verified, no `::text` needed.)
   - **Legacy config rows are NOT deleted in 076** — deletion moves to 077
     next release, so a rollback to the previous image keeps working config
     reads.
   - Reset parked structure imports: delete `structure_upload_attempts` rows
     and `DROP TABLE IF EXISTS temp_structure_staging_{hmis,hfa}`.
   - `admin_area_labels` untouched. Fresh instances: no legacy rows → no-op;
     `db_startup` seeds both schema rows at instance creation (Phase B), so
     they exist before any import.
2. `CREATE` the eight tree tables.
3. **Populate by derivation, not by copying the legacy trees**: for each
   family, `INSERT INTO admin_areas_{family}_N SELECT DISTINCT` the level-N
   path columns `FROM facilities_{family}`, level 1→4. Exact (the cleanup
   invariant, re-verified on dev: legacy tree counts match distinct facility
   paths at every level, zero orphans) and FK-consistent by construction —
   facilities rows carry full padded NOT NULL paths.
4. Repoint each facilities table's composite FK from `admin_areas_4` to its
   family's level-4 table (`ON DELETE CASCADE`). The current FK constraint
   names are auto-generated — drop via an `information_schema` lookup in a DO
   block, not a hardcoded name; confirm the names on dev pre-deploy.
5. `geojson_maps`: add `facility_family`, repoint the PK. Existing rows are
   copied to each family that has facilities (one-time blob duplication, ≤3
   rows); if neither family has facilities, assign to `hmis`. Faithful:
   today's single map served both registries.
6. **Legacy `admin_areas_1..4` are kept this release, frozen** (no reader, no
   writer) and dropped in migration 077 with the legacy config rows.
   **Rollback ruling (recorded as accepted):** after rolling back across this
   deploy, all read paths keep working, but structure IMPORTS fail loudly —
   the old image inserts facilities whose FK now targets the new trees, which
   old code never populates. Post-rollback facility DELETES leave orphan rows
   in the new trees; the family's next integrate cleanup sweeps them after
   re-upgrade. Same acceptance class as the manifest-bump rollback
   degradation (manifests stamped v5 read as "future" on the old image);
   structural-migration rollback leans on the deploy-time DB backup (047
   precedent).
7. **The `instance_config` data-transform sweep is REWRITTEN, not deleted**:
   `server/db/migrations/data_transforms/instance_config.ts` imports the
   schema this plan deletes (`:22`) and sweeps a row 077 removes; it becomes
   the `structure_schema_hmis/hfa` sweep. It runs at `db_startup.ts:98`, after
   the SQL migrations at `:74`, so it validates 076's output on the SAME boot.

## Implementation phases

### Phase A — schema + migration

`_main_database.sql` final state; migration 076; 077 stub. Types:
`GeoJsonMapSummary.family`, SSE payloads, structure summary reshape.

### Phase B — server

- **Types/config/routes** (from the shared variant's Phase 1):
  - `lib/types/instance.ts`: add `structureSchemaSchema` + `StructureSchema`
    (+ `hashStructureSchema`); delete `instanceConfigMaxAdminAreaSchema`
    (`:121-125`), `instanceConfigFacilityColumnsSchema` (`:138-157`, keeping
    the 8 label field names inside the new schema), and
    `hashFacilityColumnsConfig` (`:203-211`). `InstanceDetail` (`:87-91`) and
    `instance_sse.ts` `InstanceConfig` (`:94-99`): `maxAdminArea` +
    `facilityColumns` → `structureSchemaHmis` / `structureSchemaHfa`
    (`StructureSchema | null`).
  - `server/db/instance/config.ts`: `getStructureSchema(mainDb, family)` /
    `setStructureSchema` with the per-family depth guard (no delete function —
    schema rows persist, ruling 3); delete `updateMaxAdminArea` (`:17-90`),
    `getMaxAdminAreaConfig` (`:93-119`), dead `getMaxAdminAreaTableName`
    (`:122-127`, zero callers), and `getFacilityColumnsConfig` /
    `updateFacilityColumnsConfig` (`:129-182`).
  - Staging: `stage_structure_from_csv.ts` (`:67-70,105`) and
    `stage_structure_from_dhis2.ts` (`:183-197`) read the family's schema
    instead of the two global configs. Behaviour otherwise unchanged. Mapping
    validation (`structure.ts:632-691`) gates on the family's depth.
  - Routes: replace `updateMaxAdminArea` + `updateFacilityColumnsConfig`
    (contract `lib/api-routes/instance/instance.ts:31-40`, handlers
    `server/routes/instance/instance.ts:80-106`) with a single
    `updateStructureSchema` `{family, schema}`; `updateAdminAreaLabelsConfig`
    (`:41-45`, handler `:107-119`) unchanged. Registration is implicit
    (`defineRoute` → `markRouteDefined`) — no tracker edit.
  - `notifyConfigUpdated` (`server/routes/instance/instance.ts:127-143`)
    payload → both schemas + `adminAreaLabels` + `countryIso3`; also fired
    after integration and both delete paths (the helper is currently private
    and must be exported/relocated). `getInstanceDetail`
    (`server/db/instance/instance.ts:365-373,490-492`) and
    `build_instance_state.ts:44-46` reshaped. `server/mcp/env.ts:48-51` and
    `client_env.ts:49-52` `getDimensionLabelConfig` gain a family parameter
    (the `DisaggregationLabelConfig` type lives in
    `lib/disaggregation_labels.ts`, not panther — the new schema satisfies its
    `facilityColumns` slot unchanged, same label field names).
  - `db_startup.ts:382-407`: seed the two schema keys in place of
    `max_admin_area` and `facility_columns`. **Keep seeding
    `admin_area_labels`.**
- **Structure writes**: staging/integration write to the family trees;
  per-family `cleanupUnusedAdminAreas`; simplified deletes (ruling 3 +
  storage model); `deleteFamilyFacilities` re-checks table emptiness inside
  the transaction.
- **Geojson**: db/routes/guards/advisory lock per the Geojson model.
- **Read paths** (from the shared variant's Phase 2, re-homed per the
  read-site table): windowing tree → `admin_areas_hmis_2/3`; orphan check +
  picker options per family; per-family counts (collapse the duplicated count
  query, `instance.ts:176-202`/`:382-400`); PLAN_1's `listAdminArea2s` →
  union of both level-2 trees.
- **Query context / availability** per ruling 4: `get_query_context.ts:85-98`,
  `get_possible_values.ts`, `get_results_value_info.ts:37-42`,
  `presentation_objects.ts:176-183`, `results_value_resolver.ts`,
  `metric_enricher.ts:47-60`, `disaggregation_availability.ts`.
- **Exports/snapshots**: `datasets_in_project_hmis.ts:171-175,244-251,375-380`
  and `datasets_in_project_hfa.ts:98-106,157-181,230-235` read the family
  schema. Delete the dead provenance stamps and their declarations —
  `facilityColumnsConfig`/`maxAdminArea` (`hmis:249-250`) and
  `facilityColumnsHash` (`hfa:234`) are written and never read (repo-wide
  grep: zero comparison sites); declarations at
  `lib/types/datasets_in_project.ts:30-31,44`. Facilities listing/CSV export
  (`structure.ts:107-128`) → the family's own depth.
- **Manifest write**: `synthesize_run.ts:178-183` reads both schema rows;
  `:480` stamps `structureSchemaHmis/Hfa` (null for families not in the
  package); `:334-337` passes the module's family schema (`familyByModuleId`
  at `:261`) to the derivation; `:545-571` threads it into
  `buildResultsObjectParquet` → `computeResultsObjectColumnsToExclude`.
- **Manifest read**: `run_read.ts:210-258` picks the family's schema;
  `iceh`/null → no enabled facility columns.
- Display-info route body field (`lib/api-routes/instance/datasets.ts:169`)
  becomes the HMIS schema.

### Phase C — client

- `t1_store.ts:25-37,106-111` (instance): schema split. Solid 1.9.10
  `reconcile` handles null↔object cleanly (`if (!isWrappable(state) ||
  !isWrappable(v)) return v` — verified in the installed version).
  `t1_sse.tsx:96-98` unchanged mechanically. Derived `maxDepth()` helper for
  the shared surfaces.
- `t2_geojson` keying + legacy IDB sweep; the five `getGeoJsonSync` sites +
  family threading + hmis default (Geojson model); geojson manager / wizard;
  Admin areas page.
- Label resolver: `_util_disaggregation_label.ts` gains a family param;
  missing family → generic default labels. Call sites:
  `_3_disaggregation.tsx`, `_2_filters.tsx`, `metric_details_modal.tsx`,
  `metric_card.tsx:63`, `step_3_configure.tsx:103`,
  `format_viz_editor_for_ai.ts:121-125`,
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
- New t3 strings: per-family section headings, geojson guard messages, Admin
  areas page prose.

### Phase D — hashes/caches

Ruling 7: `hashStructureSchema`, `t2_structure.ts:9-23`,
`t2_datasets.ts:27-45`, `po_detail_v8` prefix + `PO_CACHE_VERSION` +1.

### Phase E — manifest transform

Per ruling 6 and the PROTOCOL_APP_MIGRATIONS § "Run Manifest Transforms"
checklist (`:333-346`): new block in `server/runs/manifest_transform.ts` (pure,
signature untouched, per-family presence keyed off the manifest),
`RUN_MANIFEST_SCHEMA_VERSION = 5`, zod schema update, permanence-list edit.
Verify by running the transform over COPIES of dev packages — at minimum one
both-family, one single-family, and one backfill-synthesized package — never
the instance directory; assert the copy landed in the right slots, absent
families are null, provenance is untouched, and the block is idempotent (run
it twice).

Lockstep watch: `manifest.facilityColumnsConfig` has exactly one reader
(`run_read.ts:216` — verified); Valkey is handled by the two version bumps.

## Verification

- `deno task typecheck`; `./validate_queries` with a NEW rig case where the
  families' schemas diverge (different depth AND different flags). Rig
  plumbing: `query_rig/seed.ts:5-12` seeds both schema rows (it currently
  seeds only `facility_columns`, no depth); `fixtures.ts` gains `adminDepth`
  per fixture (fixtures already carry `family`).
- **Migration rehearsal on a throwaway DB restored from a dev dump** (never
  the live DB — read-only rule, PROTOCOL_ACCESS_DBS.md): run 076; assert per
  family that each tree level equals the distinct facility paths (dev
  expectation at depth 3: hmis/hfa trees mirror their facilities exactly),
  FKs repointed, geojson rows copied per the rule, legacy tables untouched.
- Execution harness (dev DB, read-only + disposable fixtures): HMIS depth 4 +
  custom_1, HFA depth 2 → schemas diverge; HFA viz options stop at AA2; the
  admin-areas listing AND summary counts at AA3/AA4 show only HMIS units; the
  HMIS windowing tree has no HFA entries; orphan counts computed against the
  right tree; map save above the family's depth refused; family delete clears
  only that family's tree and no maps; a depth change is refused while that
  family has facilities and allowed once it is empty; `deleteFamilyFacilities`
  / `deleteAllStructureData` leave both schema rows untouched (flags, labels
  and depth survive a delete + re-import); a label edit moves no data-cache
  key.
- Manifest transform over copied dev packages per Phase E.
- Legacy IDB key sweep: dev IndexedDB holds `geojson:{N}` entries — confirm
  the sweep removes them and re-render works from `geojson:{family}:{level}`.
- **DB access is read-only** — see PROTOCOL_ACCESS_DBS.md. `SELECT` and
  `information_schema` only against `main` and project DBs, dev or prod. To
  test a SQL shape, use a throwaway database, never temp tables shadowing real
  table names.

## Out of scope, noted for follow-up

- **Editor relocation.** Moving the per-family sections onto the facilities
  pages as toolbar panels (and the Admin areas screen for the shared labels)
  is a UX improvement, separate from this plan.
- **`clearFacilityColumn`.** A "clear this column's data" action is still
  worth having as an escape hatch, but decoupled: it nulls the column, and the
  user separately unticks the box. Not required by this plan.
- **`hfa_facility_weights` cascade hazard** (pre-existing, unrelated): the
  admin-area cascade chain reaches `facilities_hfa` → `hfa_facility_weights`
  (`_main_database.sql:524`). With datasets present the `NO ACTION DEFERRABLE`
  FKs raise at commit (`048_make_facility_fks_no_action_deferrable.sql:10-22`);
  with no datasets present, an admin-area delete can silently take HFA weights
  with it. Deserves its own note.
- **`cleanupUnusedAdminAreas` standing warning**
  (`integrate_structure_from_staging.ts:539-542`): every admin-area-keyed
  table added in future must be included in the per-family cleanup.
- **Modules repo**: the "module outputs derive admin columns from input, never
  hardcode" invariant is convention-only (`m010/script.R:169` hardcodes
  headers in its empty branch; `m001`'s GEOLEVEL param assumes AA3 — a depth-2
  family would need it depth-aware). One sentence goes into SYSTEM_08 with
  this work; the module fixes ride the next modules-repo cycle.
- **Migration 077** (next release): drop the legacy `admin_areas_1..4` trees +
  delete the legacy `max_admin_area` / `facility_columns` config rows.
