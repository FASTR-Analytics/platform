# PLAN: Remove the maxAdminArea setting — depth becomes an import-derived fact

Status: planned 2026-08-04, not started. Do after the 2026-08-06 tim-branch→main
merge. Sequence BEFORE `PLAN_STRUCTURE_OPTIONS_SPLIT.md` (both touch
`step_2_csv.tsx` and the staging path; this one is smaller and establishes the
derive-from-import pattern).

Out of scope: countryIso3 → env var. That is deliberately the LAST move, done
together with deleting the instance settings page.

## Goal

Delete the user-facing `maxAdminArea` instance setting. Storage is already
uniformly 4-level; the number of *real* admin levels becomes `admin_area_depth`
— a read-only fact written by structure imports, exactly as `structure_last_updated`
is today. Nothing about query/display behavior changes for any existing
instance.

## Why this is safe (verified 2026-08-04)

- **Prod sweep (all ~40 instances):** 6 real countries at max=3 (Zimbabwe,
  Tanzania, Somaliland, Sierra Leone, Liberia, Malawi), rest at 4, none at 1
  or 2. In every max=3 instance `admin_areas_4` is a 1:1 mirror of
  `admin_areas_3` (verified on Zimbabwe: 72/72 rows join on name equality).
- **Padding already exists:** staging fills levels above `maxAdminArea` with
  the leaf value — `server/server_only_funcs_importing/stage_structure_from_csv.ts`
  ~L286-292. Both facilities tables always FK `admin_areas_4`.
- **The setting is already immutable in practice:** `updateMaxAdminArea`
  (`server/db/instance/config.ts` ~L19-92) refuses any change while structure
  data exists. Every live instance can only "change" it by deleting all
  structure and re-importing. So converting it to an import-derived fact loses
  zero capability.
- `maxAdminArea` is never passed to R; modules see depth only via which
  `admin_area_N` columns carry real (non-mirrored) values.

## Design rulings

1. **One instance-wide depth, consistent across families.** Admin areas are a
   single shared `admin_areas_1..4` chain upserted by both HMIS and HFA
   imports. Today the config forces both families to map exactly N levels;
   keep that invariant: the first structure import (either family) sets
   `admin_area_depth`; subsequent imports of either family must map exactly
   that many levels (error message states the registered depth), except
   tag-only files which map no admin columns at all (existing group-optional
   rule, `stage_structure_from_csv.ts` ~L112-114 — preserve it). Per-family
   divergent depth is REJECTED: it would mix real and mirrored AA4 rows in one
   shared table.
2. **Changing depth = delete all structure (both families) + re-import.**
   Identical to today's flow minus the settings-knob step. The fact's
   lifecycle tracks the SHARED hierarchy, not a button: admin areas are a
   by-product of the two facilities imports (integration upserts them; orphan
   cleanup removes areas neither family references), so the depth fact clears
   whenever the chain empties — via `deleteAllStructureData`, or via
   `deleteFamilyFacilities` on the last family followed by orphan cleanup.
   While either family's facilities still reference the chain, the fact
   stays and the other family's imports validate against it.
3. **Depth is stored, not derived per-read:** `instance_config` key
   `admin_area_depth`, same `{ maxAdminArea: number }`-style shape renamed
   (`{ adminAreaDepth: number }`), written inside the integration transaction.
   Seeded by a startup data-transform from the existing `max_admin_area` row
   (guaranteed accurate — the guard kept it in lockstep with the data); old
   row deleted in the same transform.
4. **The geojson protection moves to the new decision point.** Today
   `config.ts` ~L72 blocks *lowering the setting* while higher-level geojson
   exists. New equivalent: structure integration (when it would establish a
   depth lower than an existing `geojson_maps.admin_area_level`) fails with
   "delete the level-N boundaries first". Also fix the known inconsistency:
   the geojson upload wizard hardcodes levels 2/3/4
   (`client/src/components/instance_geojson/`) — filter to `<= depth`.

## Phases

### Phase 1 — server: fact + import path

- `lib/types/instance.ts`: rename schema/type (`adminAreaDepth`); keep the
  1–4 range check server-side.
- `server/db/instance/config.ts`: `getAdminAreaDepth` (read),
  `setAdminAreaDepthFromImport` (write, called only by integration and
  delete-all). Delete `updateMaxAdminArea` and its guard transaction.
- Wizard mapping validation (`server/db/instance/structure.ts` ~L643):
  replace "exactly maxAdminArea levels" with: contiguous from level 1; if a
  depth fact exists, mapped count must equal it; if none exists (fresh
  instance), the mapped count becomes the fact at integration. Group-optional
  (zero admin columns) stays allowed for update intents.
- `stage_structure_from_csv.ts`: pad above the *deepest mapped level* instead
  of above `maxAdminArea` (~L104-111, ~L286-292).
- DHIS2 path: the wizard's existing `selectedLevels` choice becomes the depth
  source for `stage_structure_from_dhis2.ts` (~L183-187) instead of the config
  read; same equal-to-fact validation.
- `integrate_structure_from_staging.ts`: write the depth fact; add the geojson
  depth check (ruling 4). Clear the fact wherever the shared chain can empty:
  `deleteAllStructureData`, and after `deleteFamilyFacilities` + orphan
  cleanup when no admin areas remain (ruling 2).
- Startup data-transform: seed `admin_area_depth` from `max_admin_area`, drop
  the old row. (PROTOCOL_APP_MIGRATIONS.md; check the skip-gate gotcha.)

### Phase 2 — re-point consumers (behavior identical)

Replace every `getMaxAdminAreaConfig` / `instanceState.maxAdminArea` read with
the depth fact. Known sites (from the 2026-08-04 sweep):

- Server: `structure.ts` ~L107-123 (facility column SELECT),
  `dataset_hmis.ts` ~L370 (AA3 options gate),
  `datasets_in_project_hmis.ts` ~L375 / `datasets_in_project_hfa.ts` ~L95
  (admin column lists in R-facing CSV exports — keep exporting `1..depth`,
  NOT always 4, so module-facing file shapes don't change),
  `lib/types/datasets_in_project.ts` ~L31 (snapshot provenance field —
  rename).
- Routes/SSE: `lib/api-routes/instance/instance.ts` — delete
  `update_max_admin_area`; `instance-sse.ts` + `lib/types/instance_sse.ts` —
  rename the payload field (depth still broadcast; the client needs it for
  display).
- Client: `t1_store.ts` (~L27, 99, 149), `t2_structure.ts` / `t2_datasets.ts`
  cache keys — **drop depth from the keys entirely**: it only changes via an
  import, which already bumps `structure_last_updated`. `admin_areas.tsx`
  ~L63-69, `instance_data.tsx` ~L173-181, `with_csv.tsx` ~L48,
  `structure_import/index.tsx` + `step_2_csv.tsx` (render 4 admin rows, apply
  the contiguity/equal-to-fact rules client-side for early feedback),
  `WindowingSelector.tsx` ~L76, `project_ai/build_system_prompt.ts` ~L78,
  geojson wizard level picker.

### Phase 3 — delete the setting UI

- `instance_settings.tsx` ~L292-315 (RadioGroup section) removed. The
  admin-area-labels editor there filters rows by `maxAdminArea` (~L377) — it
  reads the depth fact until `PLAN_STRUCTURE_OPTIONS_SPLIT.md` relocates it.

## Verification

- `deno task typecheck`.
- Execution harness (`deno run --allow-all -c deno.json`): import a 3-level
  fixture CSV on a fresh dev DB → depth fact = 3, AA4 mirrors AA3, second
  family import with 4 mapped levels rejected, delete-all clears the fact.
- `./validate_queries` (rig fixtures seed `max_admin_area` — update seeds).
- Prod needs no data work: the transform seeds depth from the existing value.

## Open items

- `datasets_in_project.maxAdminArea` provenance field rename: old stored
  snapshots keep the old key — zod-optional both, read either.
- Level-1-only instances (server previously accepted 1; UI never offered it;
  prod has none): allow depth 1 in validation or floor at 2? Default: keep
  accepting 1–4, no UI special-casing.
