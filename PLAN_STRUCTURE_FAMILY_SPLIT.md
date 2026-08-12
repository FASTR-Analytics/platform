# PLAN: Per-family structure — split admin areas and geojson by family

Status: drafted 2026-08-10. Supersedes the storage model of
PLAN_STRUCTURE_OPTIONS.md (PAUSED — kept untouched as the authority for
everything this plan carries over; see the carry-over list). Verified against
working tree `d749fbb4` + read-only dev-DB checks. Not started.

## The change, in one line

Everything PLAN_STRUCTURE_OPTIONS.md does (per-family `structure_schema_hmis`
/ `structure_schema_hfa` config), PLUS: the shared `admin_areas_1..4` tables
split into `admin_areas_hmis_1..4` + `admin_areas_hfa_1..4`, and
`geojson_maps` gains a `facility_family` key. The family boundary becomes
physical instead of predicate-enforced.

## Why go further than the paused plan

The paused plan kept the tables shared and paid for it in every hard section —
each item below is a verified complexity that separation deletes wholesale:

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
- **The counts-performance concern disappears.** The paused plan turned six
  `COUNT(*)`s on tiny reference tables into `DISTINCT` scans over facilities
  (flagged for `EXPLAIN`). Counts now stay `COUNT(*)` on small per-family
  reference tables.

Precedent: migration `047_split_facilities.sql` split `facilities` into
`facilities_hmis`/`facilities_hfa` with the same shape-preserving pattern
(final state in `_main_database.sql`, migration no-ops on fresh installs via
`IF NOT EXISTS`).

## Carried over unchanged from PLAN_STRUCTURE_OPTIONS.md

That file remains the authority for (do not restate; read it there):

- The config schema (`structure_schema_hmis/hfa`: `adminDepth` + 8 include
  flags + 8 labels), shared `admin_area_labels`, and the explicit-config
  ruling (derivation rejected).
- Ruling 1 (per-family depth guard; the `admin_areas_*` emptiness half is
  dropped — under this plan the check is simply the family's own tree).
- Ruling 3 (schema rows persist across deletes; seeded at instance creation;
  `importing` guard on `deleteFamilyFacilities`).
- Ruling 4 (availability + query context per family, 3-way selection, degrade
  rule), ruling 5 (R exports use the family's own depth), ruling 6 (manifest
  v5, no `adminAreaLabels`, pure-copy transform), ruling 7 (cache hashes,
  `po_detail_v8`, `PO_CACHE_VERSION "14"`), ruling 8 (editors), ruling 9
  (wizard).
- "Why the split is safe" facts (viz family scoping total; availability is
  column presence; depth immutable with data; prod uniformly 4-level).
- Migration content for the config rows (copy from legacy `max_admin_area` +
  `facility_columns`, absent-row guard, legacy rows deleted next release) and
  the `instance_config` data-transform rewrite.
- Phases 1/2/3/4/5 EXCEPT where this plan's sections below replace them
  (storage reads, geojson, deletes, counts).
- Verification rig plumbing + the manifest-transform test protocol.

REPLACED by this plan: the paused plan's "re-source the shared reads" section
(no shared reads exist any more), ruling 2 (geojson guard — now family-local),
and the delete mechanics in ruling 3's citations.

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
  cleanup; also what makes the migration exact.
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
  `_main_database.sql:517-527` — the pre-existing cascade hazard note in the
  paused plan still stands).
- **Dataset-side FKs untouched**: `dataset_hmis_facility_id_fkey` /
  `hfa_data_facility_id_fkey` reference `facilities_*(facility_id)` and their
  names stay load-bearing for `SET CONSTRAINTS` (048's comment).

### Non-geojson read sites (the paused plan's five, re-homed)

| Site | Becomes |
| --- | --- |
| `dataset_hmis.ts:303,314` (windowing tree) | `admin_areas_hmis_2/3` — HFA entries structurally gone (fixes the latent bug) |
| `geojson_maps.ts:85-86` (orphan check) | `admin_areas_{family}_{level}`, dynamic |
| `geojson_maps.ts:104-121` (picker options) | the family's tree, `getAdminAreaOptionsForLevel(family, level)` |
| `instance.ts:176-202` + `:382-400` (counts, duplicated query — collapse) | per-family `COUNT(*)` on the family trees |

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
- **Guard, family-local** (replaces paused ruling 2): save refuses `level >`
  that family's `adminDepth`; a family depth change refuses if it would drop
  below that family's own existing maps; a family facilities-delete does not
  touch maps (schema rows persist, depths don't move — orphaned `area_id`s
  are exactly what the orphan count surfaces, as today). Keep ONE
  `pg_advisory_xact_lock` on the depth-change path and both save paths — the
  check-then-write race between a family's depth change and its map save
  remains even family-scoped. Same three call sites.
- **Client cache** (`t2_geojson.ts`): keyed `(family, level)` — memory key
  `${family}:${level}`, IDB key `geojson:{family}:{level}`; one-time sweep of
  legacy `geojson:{N}` IDB keys in the load path (a `keys()` scan already
  exists in the file). `preloadGeoJson` / `evictDeletedGeoJsonLevels` /
  `clearGeoJsonMemoryCache` (`t1_sse.tsx:94,112`, `clear_caches.ts:45`)
  follow the summaries.
- **Figure selection.** `getAdminAreaLevelFromMapConfig` is unchanged; the
  five `getGeoJsonSync` call sites (complete, verified by repo grep) gain the
  family from the `resultsValue` already in scope — the same source ruling 4
  uses for labels:
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
- **Manager UI** (`instance_geojson/`): per-family sections in
  `geojson_manager.tsx`; the upload wizard takes the family as a prop from
  the section that launched it (no new step); `step_2` offers levels
  2..family depth with an empty state (currently hardcoded 2/3/4, ungated);
  `geojson_edit_modal` + `step_4` carry the family through. New t3 strings
  for section headings and the family-local guard messages.

## Migration (SQL migration 075, instance — one deploy with the config split)

Final state lands in `_main_database.sql`; 075 mirrors the 047 pattern
(`IF NOT EXISTS` + no-op on fresh installs).

1. Config-row copy + guard + parked-import reset: as PLAN_STRUCTURE_OPTIONS.md.
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
   writer) and dropped in migration 076 with the legacy config rows.
   **Rollback ruling (recorded as accepted):** after rolling back across this
   deploy, all read paths keep working, but structure IMPORTS fail loudly —
   the old image inserts facilities whose FK now targets the new trees, which
   old code never populates. Post-rollback facility DELETES leave orphan rows
   in the new trees; the family's next integrate cleanup sweeps them after
   re-upgrade. Same acceptance class as the manifest-bump rollback
   degradation; structural-migration rollback leans on the deploy-time DB
   backup (047 precedent).

## Implementation phases (delta to the paused plan's phases)

- **Phase A — schema + migration**: `_main_database.sql` final state; 075;
  076 stub. Types: `GeoJsonMapSummary.family`, SSE payloads, structure
  summary reshape.
- **Phase B — server**: staging/integration writes to family trees;
  per-family cleanup; simplified deletes; geojson db/routes/guards/lock;
  per-family counts (collapse the duplicated count query); windowing reads;
  everything in the paused plan's Phases 1–2 that isn't superseded (config
  split, query context, exports, manifest v5).
- **Phase C — client**: t2_geojson keying + legacy IDB sweep; the five
  `getGeoJsonSync` sites + family threading + hmis default; geojson manager /
  wizard; Admin areas page; paused plan's Phase 3 (labels, depth-gated UI,
  settings editor, AI prompt) unchanged.
- **Phase D — hashes/caches**: paused plan's Phase 4 verbatim.
- **Phase E — manifest transform**: paused plan's Phase 5 verbatim.

## Verification

- `deno task typecheck`; `./validate_queries` with the diverging-families rig
  case (paused plan's rig plumbing carries over).
- **Migration rehearsal on a throwaway DB restored from a dev dump** (never
  the live DB — read-only rule, PROTOCOL_ACCESS_DBS.md): run 075; assert per
  family that each tree level equals the distinct facility paths (dev
  expectation at depth 3: hmis/hfa trees mirror their facilities exactly),
  FKs repointed, geojson rows copied per the rule, legacy tables untouched.
- Execution harness (dev DB, read-only + disposable fixtures): HMIS depth 4 +
  HFA depth 2 → per-family counts diverge; HMIS windowing tree has no HFA
  entries; orphan counts computed against the right tree; map save above the
  family's depth refused; family delete clears only that family's tree and no
  maps; label edit moves no data-cache key.
- Manifest transform over copied dev packages (paused plan's protocol).
- Legacy IDB key sweep: dev IndexedDB holds `geojson:{N}` entries — confirm
  the sweep removes them and re-render works from `geojson:{family}:{level}`.

## Out of scope (carried from the paused plan)

Editor relocation onto the facilities pages; `clearFacilityColumn`;
`hfa_facility_weights` cascade hazard note; modules-repo depth-awareness
(`m001` GEOLEVEL, `m010` hardcoded headers) — one sentence into SYSTEM_08
with this work; migration 076 (drop legacy trees + legacy config rows).
