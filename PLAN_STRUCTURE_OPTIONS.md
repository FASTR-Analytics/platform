# PLAN: Per-family structure registry schema (replaces maxAdminArea + facilityColumns settings)

Status: planned 2026-08-04 (unified from two earlier plans, Tim's ruling), not
started. Do after the 2026-08-06 tim-branch→main merge.

Out of scope: countryIso3 → env var — deliberately the LAST move, done
together with deleting the instance settings page.

## The model (the unifying insight)

`maxAdminArea` and `facilityColumns` are the same question asked of different
columns: **does this family's facility registry carry real data in this
column?** `admin_area_1..4` and the 8 optional columns are all just columns on
`facilities_hmis` / `facilities_hfa`, and both options have the same
consequence — which disaggregation options that family's visualizations offer.

So both settings dissolve into one per-family **registry schema fact**,
established by what each family's import actually delivered:

```
structure_schema_hmis / structure_schema_hfa (instance_config keys):
{
  adminDepth: 1|2|3|4,          // real admin levels, contiguous from 1
  includeNames ... includeCustom5,   // existing 8 booleans
  labelNames ... labelCustom5,       // existing 8 optional labels
}
```

- `adminDepth` + include-flags: written ONLY by integration (facts).
- facility-column labels: written ONLY by a label editor on that family's
  facilities page (preference).
- `admin_area_labels` (label1..4) stay ONE shared key — level names are
  country facts and the `admin_areas_1..4` hierarchy is physically shared
  (both facilities tables FK it). Editor moves to the Admin areas screen.
- The settings-page sections, `update_max_admin_area`,
  `update_facility_columns_config`, and `updateMaxAdminArea`'s guard
  transaction are all deleted. Edit permission for the label editors:
  `can_configure_data`.

## Why this is safe (verified 2026-08-04)

- Prod sweep (~40 instances): 6 real countries at max=3, rest 4, none lower.
  Storage is already uniformly 4-level: in every max=3 instance
  `admin_areas_4` is a 1:1 mirror of `admin_areas_3` (staging pads levels
  above the mapped depth with the leaf —
  `stage_structure_from_csv.ts` ~L286-292; both facilities tables FK
  `admin_areas_4` NOT NULL). Mirrored rows are already normal at prod scale.
- The `maxAdminArea` setting is already immutable once data exists
  (`config.ts` guard) — every live instance can only change it by
  delete + re-import, which is exactly the flow that remains.
- **Family-scoped queries never read the shared chain for values**:
  disaggregation dropdowns, filters, `get_possible_values` all build from the
  family's facilities CTE. A depth-2 HFA next to a depth-4 HMIS means HFA viz
  simply never offers AA3/AA4, and HMIS AA4 lists only HMIS wards. HFA's
  mirrored AA3/AA4 rows sit in the shared tables but appear in no
  family-scoped query.
- The 1.54.0 update-modes redesign already made mapping own column scope
  (step-2 per-column optional mapping; integration drives off the staging
  table's real columns; three transient intents `replace_all` /
  `add_and_update` / `update_existing_only`; DHIS2 has no column mapping —
  stages `facility_name` only, with a `selectedLevels` wizard choice). This
  plan completes that direction: config stops gating the wizard; the import
  determines the schema.
- Latent bug fixed by derivation: a globally-enabled column one family never
  imported currently offers that disaggregation over nulls for that family.
- Per-family custom columns are the right model anyway: `facility_custom_1`
  in the two tables is the same concept only by convention (nothing enforces
  it).

## Design rulings

1. **Derivation.**
   - Include-flags: after EVERY integration (any intent), recompute from the
     family table itself: `enabled_X = EXISTS(value IS NOT NULL AND value <>
     '')` per optional column. Handles all three intents with no
     bookkeeping: `replace_all` naturally shrinks, updates accumulate, and
     blank-overwrite of a whole column correctly disables it.
   - `adminDepth`: recorded from the MAPPING, not the data (mirror-padding
     makes data-derivation unreliable). CSV: deepest mapped admin level
     (contiguity validated at step 2: if level n is mapped, 1..n-1 must be).
     DHIS2: the wizard's `selectedLevels`.
2. **Per-family depth lifecycle** (uniformity within a family, no
   cross-family coupling):
   - First import into an empty family table (or `replace_all`) with admin
     columns mapped → sets that family's `adminDepth`.
   - `add_and_update` / `update_existing_only` with admin columns mapped →
     must map exactly the family's current depth (else the family's rows
     would mix real and mirrored values at the same level). Tag-only files
     (no admin columns — existing group-optional rule,
     `stage_structure_from_csv.ts` ~L112-114) always allowed, depth
     unchanged.
   - `deleteFamilyFacilities` → clears that family's schema fact.
3. **Padding unchanged**: levels above the family's mapped depth are filled
   with the leaf value at staging, exactly as today.
4. **Shared surfaces key off `max(hmisDepth, hfaDepth)`** (0 families → the
   surface is empty anyway):
   - Admin areas listing page: show level tabs up to the max. Per-level
     listing filters to areas referenced by a family whose depth ≥ that
     level, so the shallower family's mirrors don't pollute the deeper
     family's real units. (Join through the qualifying families' facilities.)
   - GeoJSON upload wizard level picker: levels 2..max (also fixes the
     current hardcoded-2/3/4 inconsistency). The old "can't lower while
     higher-level geojson exists" guard (`config.ts` ~L72) moves to the new
     decision points: `replace_all`/first-import validation and
     `deleteFamilyFacilities` refuse to drop the instance max below an
     existing `geojson_maps.admin_area_level` (error: delete those
     boundaries first).
5. **Viz gating goes per family through the SAME paths as facility columns**
   (the unification payoff): wherever enabled-column availability is
   computed per family (`metric_enricher` / `deriveAvailableDisaggregationOptions`
   / `buildQueryContext`), admin options become levels 2..family.adminDepth.
   Replaces today's scattered gates (e.g. `dataset_hmis.ts` ~L370 AA3 gate).
6. **R-facing exports** (`datasets_in_project_hmis.ts` ~L375,
   `datasets_in_project_hfa.ts` ~L95): admin columns `1..family.adminDepth`
   — identical file shapes to today for every existing instance (depths are
   currently equal by construction).
7. **Run manifest** (`lib/types/run_manifest.ts`, shape spec SYSTEM_08):
   replace `facilityColumnsConfig` with `structureSchemaHmis` +
   `structureSchemaHfa` (zod-optional; legacy field kept optional so old
   immutable runs parse). `synthesize_run.ts` writes both;
   `run_read.ts buildQueryContextFromManifest` picks by `datasetFamily`,
   falls back to the legacy field (legacy manifests: adminDepth falls back
   to 4 / the legacy behavior). Add shared `adminAreaLabels` (optional,
   additive) at the same time.
8. **Cache-hash hygiene in the same pass**: the staleness hash covers
   adminDepth + include-flags ONLY — labels out (fixes label-rename busting
   data caches). `hashFacilityColumnsConfig` → per-family
   `hashStructureSchema`. Client T2 keys already carry `family`
   (`t2_structure.ts`, `t2_datasets.ts`); `maxAdminArea` drops out of keys
   (schema changes only via imports, which bump `structure_last_updated`).
   HFA's stored `facilityColumnsHash` stamps flip stale once per project —
   harmless, self-heals.
9. **Wizard**: step 2 shows all 4 admin rows (map what your CSV has,
   contiguous) and all 8 optional columns (generic names where unlabeled).
   The config props threaded into `structure_import/` become the family's
   schema (for labels/prefill), not a gate.

## Migration (startup data-transform, PROTOCOL_APP_MIGRATIONS.md)

Seed both family rows, then delete the legacy `max_admin_area` and
`facility_columns` rows:

- `adminDepth`: from the legacy `max_admin_area` value for both families
  (accurate — the old guard kept it locked to the data, and both families
  were forced equal).
- include-flags: derived per family via the EXISTS rule (silently fixes
  prod's orphaned-label rows — Kenya `labelCustom1`, Afghanistan
  `labelTypes` — and the HFA-nulls latent bug).
- labels: copied from the legacy row, only for columns enabled in that
  family.
- `admin_area_labels` key untouched.

If the transform runner can't query `facilities_*` (it's JSON-row-based),
seed flags as a copy of the legacy row and recompute via a one-shot startup
step; end state identical after the next boot.

## Consumer threading

Every reader picks a family. From the 2026-08-04 sweep:

**Server — family already in hand (mechanical):**
`stage_structure_from_csv.ts` ~L73; `stage_structure_from_dhis2.ts` ~L183-194
(HMIS-only path); `structure.ts` `getStructureItems` ~L107-128 + mapping
validation ~L643 (exactly-N → contiguity/lifecycle rules) + CSV export;
`dataset_hmis.ts` ~L348+; `datasets.ts` display-info route;
`datasets_in_project_hmis.ts` ~L171-383 (snapshot + `hmis.csv`);
`datasets_in_project_hfa.ts` ~L88-199 (hash stamp → new schema hash);
`get_query_context.ts` ~L93 (takes `datasetFamily`); `get_possible_values.ts`;
`get_results_value_info.ts` ~L35; `presentation_objects.ts` ~L176;
`results_value_resolver.ts`; `metric_enricher.ts` (has `datasetFamily`);
`synthesize_run.ts` ~L176/321/473/537; `write_results_object_parquet.ts`
(results object → module → family); `prepare_inputs.ts` writes the fixed full
facilities-parquet column list — unaffected.

**Deleted server surface:** `updateMaxAdminArea` + guards,
`update_max_admin_area` + `update_facility_columns_config` routes
(`route-tracker.ts` updated); new routes `update_facility_labels`
`{family, labels}` and the relocated `update_admin_area_labels_config`, both
`can_configure_data`.

**Client:**
- `t1_store.ts`: `maxAdminArea` + `facilityColumns` → `structureSchemaHmis` /
  `structureSchemaHfa`; SSE payload (`lib/types/instance_sse.ts`,
  `instance-sse.ts`, `notifyConfigUpdated` in
  `server/routes/instance/instance.ts` ~L142) carries both + shared admin
  labels.
- Label resolver gains a family param — `lib/disaggregation_labels.ts`,
  `_util_disaggregation_label.ts`; ~8 call sites all have
  `resultsValue.datasetFamily` or viz-editor family: `_3_disaggregation.tsx`,
  `_2_filters.tsx`, `metric_details_modal.tsx`,
  `results_package_compatibility_modal.tsx`, `add_visualization/*`, AI
  formatters (`format_viz_editor_for_ai.ts`, `format_figure_config_for_ai.ts`).
- Depth-gated UI goes per family where the family is known
  (`WindowingSelector.tsx`, windowing validation, dataset browser), and
  max-of-depths on shared surfaces (`admin_areas.tsx` ~L63-69 with the
  ruling-4 listing filter, `instance_data.tsx` ~L173-181 counts, geojson
  wizard picker).
- Wizard: `structure/index.tsx` passes the family schema;
  `structure_import/index.tsx`, `step_2_csv.tsx` (4 admin rows + all 8
  optional), `step_4_recode.tsx` / `step_5_import.tsx` labels;
  `_column_labels.ts` unchanged in shape.
- `project_ai/build_system_prompt.ts` ~L65-92: per-family depth/labels where
  the project context knows the family; otherwise state both.
- New label editors: facilities page (per family, enabled columns only),
  Admin areas screen (shared labels; move `stripAdminSuffix` /
  `withAdminSuffix` helpers from `instance_settings.tsx` ~L26-33). Delete
  the three settings-page sections (country stays until the ISO move).
- `query_rig/fixtures.ts` + `seed.ts`: seed per-family schema rows.

## Phasing

1. Server: schema fact (types, config accessors, integration
   derivation + lifecycle, migration transform, route add/delete).
2. Server read paths: query context / disaggregation availability /
   manifest + fallback / exports / geojson+delete guards.
3. Client: store/SSE split, label-resolver threading, per-family gating,
   wizard un-gating, label editors, settings-page removals.
4. Hash + cache-key changes.

Lockstep watch: manifest shape change — verify nothing else reads
`facilityColumnsConfig` (believed only `buildQueryContextFromManifest`) and
that no Valkey payload embeds the config (`po_detail` check) before shipping.

## Verification

- `deno task typecheck`; `./validate_queries` with a NEW rig case where the
  families' schemas diverge (different depth AND different flags — asserts
  per-family selection end to end).
- Execution harness (dev DB): HMIS import depth 4 + custom_1, HFA import
  depth 2 → schemas diverge, HFA viz options stop at AA2, admin-areas
  listing at AA3/AA4 shows only HMIS units; blank-overwrite drops a flag;
  tag-only update leaves depth; `deleteFamilyFacilities` clears one schema,
  other family unaffected; label edit changes no data-cache key.
- Prod: zero data work; transform seeds from existing values (all instances
  currently family-equal).

## Open items

- Exact ruling-4 SQL for the admin-areas listing filter (join through
  qualifying families) — settle at implementation.
- Label-editor UX (inline header edit vs small panel) — Tim's call.
- Optional "clear column data" action (clears + auto-disables) — nice-to-
  have, not required by the model.
- `datasets_in_project` provenance fields (`maxAdminArea`,
  `facilityColumnsConfig/Hash`) — zod-optional old + new, read either.
- `ItemsHolderDatasetHmisDisplay.facilityColumns` travels in a request body
  (`lib/api-routes/instance/datasets.ts` ~L151) — becomes the HMIS schema;
  confirm no stale client caller.
