# PLAN: Per-family facility columns + relocated labels

Status: planned 2026-08-04, not started. Do after the 2026-08-06
tim-branch→main merge AND after `PLAN_ADMIN_AREA_DEPTH.md` (shared files:
`step_2_csv.tsx`, staging, `instance_settings.tsx`).

Out of scope: countryIso3 → env var — deliberately the LAST move, done
together with deleting the instance settings page.

## Goal

1. `facilityColumns` splits into two per-family configs (HMIS / HFA). The
   **include-flags stop being a user setting** — they become facts derived
   from each family's imported data. Only the **labels** stay user-editable,
   on each family's facilities page.
2. `adminAreaLabels` stay ONE shared set (the `admin_areas_1..4` hierarchy is
   physically shared — both facilities tables FK it), but the editor moves to
   the shared Admin areas screen, and the labels get snapshotted into the run
   manifest.
3. Both sections leave `instance_settings.tsx`; edit permission moves from
   `can_configure_settings` to `can_configure_data`.

## Why per-family (rulings from 2026-08-04 discussion)

- Two facilities pages exist (`<Facilities family="hmis|hfa">` from
  `instance_data.tsx`); a shared config edited from either page would
  silently change the other family's query options — trap. If the options sit
  on family pages they must be family-scoped.
- `facility_custom_1` in `facilities_hmis` and in `facilities_hfa` are the
  same concept only by convention; nothing enforces it. One label/flag over
  two independent columns is the wrong model.
- Latent bug today: a globally-enabled column that one family never imported
  still offers that disaggregation over nulls for that family. Deriving flags
  from data fixes this.
- The 1.54.0 update-modes redesign already made **mapping own column scope**:
  step 2 optional-column mapping is per-column optional, and integration
  drives off the staging table's real columns. This plan completes that
  direction: config stops gating the wizard; data determines the flags.

## Design rulings

1. **Storage:** two `instance_config` keys, `facility_columns_hmis` and
   `facility_columns_hfa`, keeping the existing zod shape
   (`instanceConfigFacilityColumnsSchema`: 8 include-booleans + 8 optional
   labels) so consumer types don't churn. Include-flags written only by
   integration; labels written only by the new label editor.
2. **Flag derivation:** after every structure integration (any intent),
   recompute that family's flags from the table itself:
   `enabled_X = EXISTS(value IS NOT NULL AND value <> '')` per optional
   column. This handles all three intents with no union bookkeeping:
   `replace_all` naturally shrinks, update intents naturally accumulate, and
   the blank-overwrite rule ("blank mapped cell → overwrite to blank")
   correctly disables a fully-blanked column.
3. **Wizard offers all 8 optional columns at step 2** (drop the
   `getEnabledOptionalFacilityColumns(config)` gate in `step_2_csv.tsx` ~L33
   and `stage_structure_from_csv.ts` ~L117). Unlabeled columns show generic
   names ("Custom 1"); existing labels show where set.
4. **Labels editor** lives on each family's facilities page
   (`client/src/components/structure/index.tsx` screen), listing only that
   family's enabled columns. Route: replace
   `POST /update_facility_columns_config` with
   `POST /update_facility_labels` `{ family, labels }`, guarded
   `can_configure_data`.
5. **Cache-hash hygiene (do in the same pass):** `hashFacilityColumnsConfig`
   currently hashes labels too, so a label rename spuriously busts data
   caches (known display-knob-in-hash antipattern). New hash covers
   include-flags only. Labels flow to display code outside fetch configs.
6. **Run manifest** (`lib/types/run_manifest.ts` — shape spec in
   SYSTEM_08): replace the single `facilityColumnsConfig` with
   `facilityColumnsConfigHmis` + `facilityColumnsConfigHfa` (zod-optional;
   keep the legacy field optional so old immutable runs still parse).
   `synthesize_run.ts` writes both; `run_read.ts
   buildQueryContextFromManifest` picks by `datasetFamily`, falling back to
   the legacy field for old manifests. Add `adminAreaLabels` (optional) to the
   manifest at the same time — one additive field, written at synthesis.
7. **adminAreaLabels stay shared.** Editor relocates to
   `client/src/components/structure/admin_areas.tsx`; route guard changes to
   `can_configure_data`. Keep the `" (AAn)"` suffix convention
   (`stripAdminSuffix`/`withAdminSuffix` in `instance_settings.tsx` ~L26-33 —
   move the helpers). Rows filter by the depth fact from
   `PLAN_ADMIN_AREA_DEPTH.md`.

## Migration (startup data-transform, PROTOCOL_APP_MIGRATIONS.md)

Seed both family rows from live data + the legacy shared row, then delete the
legacy `facility_columns` key:

- flags: derived per family via the EXISTS rule (this silently fixes prod's
  orphaned-label rows — Kenya `labelCustom1` with flag off, Afghanistan
  `labelTypes` with `includeTypes` off — and the HFA-nulls latent bug);
- labels: copied from the legacy row, but only for columns enabled in that
  family.

Needs a real DB connection during transforms (the transform runner is
JSON-row-based) — if the runner can't query `facilities_*`, do flags=copy of
legacy row at transform time + recompute on first boot via a one-shot startup
step instead. Decide at implementation; the end state is identical after the
next import either way.

## Consumer threading (the bulk of the work)

Every reader of the single config picks a family. From the 2026-08-04 sweep,
the sites that matter:

**Server — family already in hand (mechanical):**
- `stage_structure_from_csv.ts` ~L73 (has `family`)
- `stage_structure_from_dhis2.ts` ~L187 (HMIS-only path)
- `structure.ts` `getStructureItems` ~L113 + CSV export route
- `dataset_hmis.ts` ~L348+ (HMIS), `datasets.ts` display-info route
- `datasets_in_project_hmis.ts` ~L174/249/372 (HMIS snapshot + `hmis.csv`
  export), `datasets_in_project_hfa.ts` ~L88/199 (hash stamp — becomes the
  flags-only hash of the HFA config)
- `get_query_context.ts` ~L93 `buildQueryContext` (takes `datasetFamily`),
  `get_possible_values.ts`, `get_results_value_info.ts` ~L35,
  `presentation_objects.ts` ~L176, `results_value_resolver.ts`,
  `metric_enricher.ts` (has `datasetFamily`)
- `synthesize_run.ts` ~L176/321/473/537 + `write_results_object_parquet.ts`
  (results object → module → family known)
- `prepare_inputs.ts` writes the fixed full column list — unaffected.

**Client:**
- `t1_store.ts`: `facilityColumns` → `facilityColumnsHmis/Hfa`; SSE payload
  (`instance_sse.ts` types + `instance-sse.ts` + `notifyConfigUpdated` in
  `server/routes/instance/instance.ts` ~L142) carries both.
- **Label resolver gains a family param** — `lib/disaggregation_labels.ts`
  and `client/src/state/instance/_util_disaggregation_label.ts`; ~8 call
  sites all have `resultsValue.datasetFamily` or a viz-editor family:
  `_3_disaggregation.tsx`, `_2_filters.tsx`, `metric_details_modal.tsx`,
  `results_package_compatibility_modal.tsx`, `add_visualization/*`, AI
  formatters (`format_viz_editor_for_ai.ts`, `format_figure_config_for_ai.ts`).
- Wizard: `structure/index.tsx` passes the family's config;
  `_column_labels.ts` unchanged in shape; `step_2_csv.tsx` offers all 8;
  `step_4_recode.tsx` / `step_5_import.tsx` labels follow.
- `WindowingSelector.tsx` + `hmis_windowing_validation.ts` → HMIS config.
- `t2_structure.ts` / `t2_datasets.ts` keys → per-family flags-only hash
  (keys already carry `family`, so this slots in).
- Facilities-page label editor (new, small); delete the facility-columns and
  admin-labels sections from `instance_settings.tsx`.
- `query_rig/fixtures.ts` + `seed.ts`: seed both family rows.

## Phasing

1. Server storage split + derivation + migration + new routes (old routes
   deleted in the same commit — registry `route-tracker.ts` updated).
2. Server read-path threading incl. manifest fields + fallback.
3. Client store/SSE split + label-resolver threading.
4. Wizard un-gating + facilities-page label editor + admin-areas label editor
   + settings-page section removals.
5. Hash change + cache-key updates (note: HFA's stored `facilityColumnsHash`
   stamps flip stale once per project — harmless, self-heals on next read).

Lockstep watch: manifest shape change ⇒ check whether any authored module
`definition.json` or the results-package catalogue reads
`facilityColumnsConfig` (believed no — it's read only by
`buildQueryContextFromManifest`); no Valkey payload shape changes expected
(config was never Valkey-cached — SSE + client keys only), but re-verify the
`po_detail` payload doesn't embed the config before shipping.

## Verification

- `deno task typecheck`; `./validate_queries` (fixtures updated; add a case
  where HMIS and HFA flags differ — asserts the per-family selection).
- Execution harness: seed a dev DB, import HMIS with custom_1 + HFA without →
  flags diverge; blank-overwrite a column → flag drops; label edit → no data
  cache key change (hash stable).
- Browser walkthrough (Tim): both facilities pages, label edits, viz editor
  labels per family, run generation + manifest inspection.

## Open items

- Exact label-editor UX on the facilities page (inline table header edit vs a
  small panel) — Tim's call at implementation.
- Whether a per-column "clear column data" action (clears + auto-disables) is
  wanted on the facilities page — nice-to-have, not required by the model.
- `ItemsHolderDatasetHmisDisplay.facilityColumns` travels in a request body
  (`lib/api-routes/instance/datasets.ts` ~L151) — becomes the HMIS config;
  confirm no client caller passes a stale shared value.
