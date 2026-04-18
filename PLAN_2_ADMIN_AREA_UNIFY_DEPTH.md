# PLAN 2: Unify admin area depth to always-4 (TENTATIVE — revisit later)

Remove `maxAdminArea` as a per-instance configurable. Treat every instance as having 4 admin levels. For the ~5% of countries with only 3 real levels, duplicate level 3 into level 4 so the schema is uniform everywhere.

**Status: not approved. Captured here so the reasoning survives until we come back to it.**

---

## Motivation

1. **Multi-country analysis** — uniform schema across instances makes cross-country queries trivial.
2. **Certainty / fewer invariants to reason about** — every module author writes against a fixed schema; no "what if AA3 is missing" branches.
3. **Simpler code paths** — the `maxAdminArea` config read, loop bounds, UI `<Show when>` guards, and R-side dynamic column detection all collapse.

The 95/5 split matters: optimizing the common case with a small cost in the rare case is usually a good trade.

---

## What's already uniform (baseline)

- `facilities` table is always 4 columns wide ([server/db/instance/_main_database.sql:113-176](server/db/instance/_main_database.sql#L113-L176)).
- All four `admin_areas_N` tables exist.
- CSV import already pads `facilities` rows by duplication for 3-level countries ([stage_structure_from_csv.ts:205-216](server/server_only_funcs_importing/stage_structure_from_csv.ts#L205-L216)).
- Defensive `Math.min(maxAdminArea, 4)` already appears in dataset queries.

## What's NOT uniform today

- `admin_areas_3` / `admin_areas_4` tables are only populated up to `maxAdminArea`.
- Code paths that iterate `1..maxAdminArea`.
- Client UI `<Show when={maxAdminArea >= N}>` guards.
- R scripts in `wb-fastr-modules` that dynamically detect columns or take `ANALYSIS_LEVEL`-style parameters.

---

## Proposed scope

### Server / data

1. **Always populate admin_areas_3 and admin_areas_4** — extend [stage_structure_from_csv.ts](server/server_only_funcs_importing/stage_structure_from_csv.ts) and [stage_structure_from_dhis2.ts](server/server_only_funcs_importing/stage_structure_from_dhis2.ts) to insert duplicated rows into levels above the real depth.
2. **Delete `max_admin_area` config** — drop the config key, the `updateMaxAdminArea` validation, and the `getMaxAdminAreaTableName` helper ([server/db/instance/config.ts](server/db/instance/config.ts)).
3. **One-time migration** for existing sub-4-level instances: fill `admin_areas_3` / `admin_areas_4` with duplicated rows derived from existing data; then remove the config key.
4. **Replace `1..maxAdminArea` loops with `1..4`** across [stage_structure_from_csv.ts](server/server_only_funcs_importing/stage_structure_from_csv.ts), [stage_structure_from_dhis2.ts](server/server_only_funcs_importing/stage_structure_from_dhis2.ts), [server/db/instance/structure.ts:67-94](server/db/instance/structure.ts#L67-L94), [datasets_in_project_hmis.ts:394-397](server/db/project/datasets_in_project_hmis.ts#L394-L397), [datasets_in_project_hfa.ts:73](server/db/project/datasets_in_project_hfa.ts#L73).

### Client UI

1. **Remove the max-admin-area radio** from [instance_settings.tsx:243-265](client/src/components/instance/instance_settings.tsx#L243-L265).
2. **Remove `<Show when={maxAdminArea >= N}>` guards** from [instance_data.tsx:131-158](client/src/components/instance/instance_data.tsx#L131-L158) and any other site.
3. **Hide AA4 in UI when unused** — relies on Plan 1 (labels) being live: if `adminAreaLabels.label4` is empty, suppress AA4 in filters, disaggregation, column-mapping, stats cards. No separate `real_depth` config needed. The labels config carries the "does this country use level 4?" signal implicitly.

### R modules (`wb-fastr-modules`)

This is where the cleanup actually lands. Concrete targets:

1. **m001 / m002** — replace dynamic column detection with static list:
   - [m001/script.R:90,119-123](../wb-fastr-modules/m001/script.R): `geo_cols <- colnames(data)[grepl("^admin_area_", ...)]` → `geo_cols <- c("admin_area_1", "admin_area_2", "admin_area_3", "admin_area_4")`.
   - [m002/script.R:38,188-192](../wb-fastr-modules/m002/script.R): same pattern.

2. **m004** — delete the `ANALYSIS_LEVEL` parameter (`NATIONAL_ONLY` / `_PLUS_AA2` / `_PLUS_AA2_AA3`) and its fallback logic at lines 117-155. Always run all levels. Remove the `has_admin2` / `has_admin3` guards at line 224 etc.

3. **m003** — keep `RUN_DISTRICT_MODEL` / `RUN_ADMIN_AREA_4_ANALYSIS`. These are **user opt-ins for expensive analyses**, not depth checks. Unrelated to this refactor.
   - Note: for 3-level countries that run `RUN_ADMIN_AREA_4_ANALYSIS`, the AA4 output CSV will contain rows where AA4 values equal AA3 values. That's "correct but redundant." Accepted.

4. **Module outputs** — no schema changes. Result tables keep their column shapes. For 3-level countries, AA4 columns just contain duplicated AA3 values.

---

## Trade-offs

### Gains
- R scripts: static column lists, fewer parameters, fewer fallback branches, less cognitive load when writing new modules.
- Server: one config key gone, several loops become literals, query builders simplify.
- Client: fewer conditional rendering paths; label config alone drives "is AA4 shown."
- Cross-country analysis: uniform schema.

### Costs
- One-time migration for existing sub-4-level instances (backfill duplicated rows).
- 3-level countries running deep analyses produce duplicate rows at AA4 in result CSVs. Cosmetic in results files; suppressed in UI if `label4` is empty.
- Small compute waste on modules that run AA4 analysis for 3-level countries (analysis runs but outputs duplicate AA3). Mitigatable by making `RUN_ADMIN_AREA_4_ANALYSIS` auto-skip when `label4` is empty.

---

## Open questions to resolve before starting

1. **Migration strategy for existing instances with `maxAdminArea < 4`** — how many exist, and is the backfill safe (unique constraint on the duplicated rows in `admin_areas_4`)? `admin_areas_4` PK is `(admin_area_4, admin_area_3, admin_area_2, admin_area_1)` — duplicating AA3 into AA4 gives `(X, X, AA2, AA1)` which remains unique as long as AA3 was unique. Should be fine.

2. **DHIS2 import depth handling** — [stage_structure_from_dhis2.ts:21-90](server/server_only_funcs_importing/stage_structure_from_dhis2.ts#L21-L90) currently takes `maxAdminArea` and handles variable-depth paths. Need a deliberate rule for "what is level N for this org unit?" — likely: use the first 4 levels of the org unit hierarchy, duplicating the last one if the hierarchy is shallower.

3. **GeoJSON map matching** — polygons are uploaded per level. For 3-level countries, are AA4 polygons expected? Need to check [client/src/components/instance_geojson/](client/src/components/instance_geojson/). Probably: if no AA4 polygons uploaded, AA4 map visualizations aren't selectable. Fine.

4. **Coordination with Plan 1** — labels plan must ship first, since AA4 suppression relies on `label4` being the signal. Order: Plan 1 → Plan 2.

5. **`maxAdminArea=2` instances** — currently allowed by the server (UI only exposes 2/3/4 since [instance_settings.tsx:258](client/src/components/instance/instance_settings.tsx#L258)). Backfill for these is more invasive (duplicate AA2 into both AA3 and AA4). Check if any prod instance is at 2; if not, this case is theoretical.

---

## Rough order if we proceed

1. Ship Plan 1 (labels).
2. Audit existing instances: how many are at `maxAdminArea < 4`? What countries? Does the label-suppression UX actually look okay in those?
3. Write migration + backfill script, test on a cloned instance.
4. Update server code (import, config, queries) to drop `maxAdminArea`.
5. Update client UI (remove radio, remove `<Show>` guards, rely on labels for AA4 visibility).
6. Update R modules module-by-module. Test each before moving to next.
7. Delete `max_admin_area` config key.

## Decision

Deferred. Revisit after Plan 1 ships and we've seen how the label-driven suppression feels in practice.
