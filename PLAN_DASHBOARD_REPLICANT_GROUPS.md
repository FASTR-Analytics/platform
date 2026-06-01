# PLAN — Dashboard Replicant Groups

Status: **Design agreed (Option B); implementation not started.** Lets a replicated visualization (e.g. one chart × 40 districts) be added to a dashboard as **one manageable group** instead of 40 flat items, while still snapshotting every replicant's data. Builds on `PLAN_DASHBOARD_EDITOR_REWORK.md`.

---

## 1. Problem

A visualization can have `replicateBy` (e.g. `admin_area_2`, `admin_area_3`, `indicator`). Adding "all replicants" today creates **N independent `dashboard_items`**, each its own snapshot row with a near-identical label (`"Under-5 mortality - District A"`, `"… - District B"`, …). For 40+ replicants this floods the editor grid and the public sidebar with unmanageable, repetitive rows.

We still must **store every replicant's data** (the public viewer renders from snapshots; no live resolve). We just need the N rows to **read and behave as one unit** with a selectable replicant.

## 2. Core reframe

A replicated viz is **one logical figure with a dimension** (the source PO is a single object with `replicateBy` set). So the model and UI should treat it as one **entry** that has a selected replicant — mirroring the source. Two facts make this clean:

- Replicant values already carry display labels: `possibleValues: { id, label }[]` ([presentation_objects.ts:114](lib/types/presentation_objects.ts#L114)) — captured at add time, so the sidebar can show "District A" without the repeated title.
- `moveDashboardItems` already takes `itemIds: string[]` ([dashboards.ts:385](server/db/project/dashboards.ts#L385)) — so a group can be moved as a block of member rows.
- geojson is **shared across a group's replicants** (driven by the map's admin level in the config, not the replicant value) — so store it **once per group**, not 40×.

## 3. Storage — Option B (granular member rows + a small groups table)

One snapshot row per replicant is kept (data preserved, granular, export-friendly, easy per-replicant add/remove). A small side table gives the group a first-class identity (label / dimension / default / shared geojson) so there's no fragile derivation or fan-out for group metadata. (Rejected: a fat one-row-per-group `figureBlock` union — bigger reader churn + large rows; and live-resolve — breaks the snapshot/public model.)

### Schema — SQL migration `021_dashboard_replicant_groups.sql`

Idempotent, per `DOC_MIGRATIONS.md`; mirror it into the live base schema [_project_database.sql](server/db/project/_project_database.sql); run `./validate_migrations`.

```sql
CREATE TABLE IF NOT EXISTS dashboard_item_groups (
  id text PRIMARY KEY NOT NULL,
  dashboard_id text NOT NULL,
  label text NOT NULL,                 -- group title, shown once ("Under-5 mortality")
  replicate_by text NOT NULL,          -- admin_area_2 | admin_area_3 | indicator
  default_replicant_value text,        -- shown first; null ⇒ first member
  replicants text NOT NULL,            -- JSON: ordered [{ value, label }]
  geo_data text,                       -- shared geojson for all members (maps); null otherwise
  last_updated text NOT NULL,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_dashboard_item_groups_dashboard_id ON dashboard_item_groups(dashboard_id);

ALTER TABLE dashboard_items ADD COLUMN IF NOT EXISTS replicant_group_id text;  -- FK → dashboard_item_groups(id) ON DELETE CASCADE
ALTER TABLE dashboard_items ADD COLUMN IF NOT EXISTS replicant_value text;     -- this row's replicant id
```

- A **group member** = a `dashboard_items` row with `replicant_group_id` set, `replicant_value` set, `geo_data` NULL (shared on the group), and a normal single-replicant `figure_block`.
- A **standalone item** = `replicant_group_id` NULL — exactly as today.
- **No JSON data transform** needed: `figure_block` stays one `FigureBlock` per row, so the existing write-time `dashboardFigureBlockSchema` is unchanged. Only `DBDashboardItem` / `mapDashboardItem` gain the two columns, plus new group DB access + lib types.

### Ordering (one space, groups atomic)

All ordering stays on `dashboard_items.sort_order`. A group's members occupy a **contiguous** sort_order block (assigned at add). The dashboard is an ordered list of **entries** (standalone item | group); a group entry's position = its members' block. Reordering treats a group as **one atomic draggable entry** → move = `moveDashboardItems(allMemberIds, position)`. Replicant order *within* a group is the `replicants` list order (not draggable at the dashboard level in v1).

## 4. App model — entries

- New lib type `DashboardItemGroup = { id, dashboardId, label, replicateBy, defaultReplicantValue?, replicants: {value,label}[], geoData?, lastUpdated }`.
- `DashboardItem` gains `replicantGroupId?: string`, `replicantValue?: string`.
- `getDashboardDetail` returns `{ ...dashboard, items, groups }`.
- New shared helper `buildDashboardEntries(detail)` → ordered `DashboardEntry[]` where `DashboardEntry = { kind:"item"; item } | { kind:"group"; group; members: DashboardItem[]; defaultMember }`. Built by walking items by `sort_order`, collapsing consecutive same-group members into one group entry. This (not the raw item list) is what the editor grid, the bundle, and the viewer consume — extends the `buildDashboardBundle` work from the editor rework.
- `PublicDashboardBundle` carries entries (so the anonymous viewer gets group labels + replicant labels + shared geojson).

## 5. Add flow

- **Add single replicant** → unchanged (one standalone item).
- **Add all** → create one `dashboard_item_groups` row (label = viz label, `replicate_by`, `replicants` = `possibleValues`, `geo_data` = the shared geojson resolved **once**, `default_replicant_value` = selected/first) + N member rows (each `figure_block` resolved per replicant via `resolveFigureAndGeoFromVisualization`, `replicant_group_id` = group id, `replicant_value` set, `geo_data` NULL). Reuse the progress UI in [add_dashboard_item_modal.tsx](client/src/components/dashboards/add_dashboard_item_modal.tsx); copy becomes "Add selected replicant" vs "Add all as a group".

## 6. Editor UX — card-set

- The grid maps over **entries**. A **group** renders as one card styled as a **stack** ("card-set": layered shadow) showing the default replicant's `FigureThumbnail` + a count pill ("40 districts"). A standalone entry renders as today.
- Selection + reorder operate on **entries** (entry key = item id for standalone, group id for group). `createSelectionController` keyed by entry id; reorder via §3.
- Left pane for a selected **group**: rename group, **Switch / Edit visualization** (re-resolves *all* members — show progress), Remove group, **plus a replicant picker** to preview/spot-check a single replicant. For a standalone item: unchanged.

## 7. Viewer UX

- **Sidebar** (the main ask): two-level nav — group header (title once) then indented, replicant-label-only, selectable children; selecting renders that member's figure with the group's shared geojson. Standalone items are flat entries.

```text
Under-5 mortality          ← group header (title once)
  › District A             ← replicant labels only, indented, selectable
  › District B
  › …
ANC4 coverage              ← standalone item
```

- **Grid**: a group shows as one tile (default replicant) with a replicant dropdown — same "one unit" principle.

## 8. Back-compat & scope

- **No production dashboards** → the migration is purely additive (nullable column + new table); existing rows stay valid and render as standalone items. "Just don't crash" is satisfied; no backfill.
- Existing dev flat-replicant items remain ungrouped standalone. An optional later "Group replicants" action could merge them — **out of scope**.
- **Dashboard export** does not exist yet — **out of scope** (groups will be a natural "one page per replicant" iterator when it lands).

## 9. Implementation phases

1. **Schema + types** — migration `021` + `_project_database.sql`; `DBDashboardItem`/`mapDashboardItem` + new group DB access (create/get/update/delete); lib types (`DashboardItemGroup`, `DashboardItem` fields, bundle entries). `./validate_migrations`.
2. **Add flow** — server creates group + members (shared geojson once); modal copy.
3. **App model** — `getDashboardDetail` returns `groups`; `buildDashboardEntries`; bundle carries entries.
4. **Editor** — grid renders entries (group card-set), selection/reorder on entries, left-pane group controls + replicant picker.
5. **Viewer** — sidebar tree + grid group tile (+ public route returns grouped bundle).
6. **Polish** — empty/edge states, typecheck (`deno task typecheck`), manual check of a 40-replicant group (add → editor card-set → sidebar tree → switch/edit re-resolves all).

## 10. Resolved decisions

- **Within-group order:** fixed to the `replicants` list order (natural/alphabetical) in v1.
- **No per-replicant delete:** group membership is fixed at add time — you delete the whole group (all members + the group row), never a single replicant. Avoids the collapse-to-standalone complexity.
- **Switch/Edit on a group:** re-resolves all members, with a progress bar.
- **Public grid:** a group tile includes a replicant dropdown.

---

## 11. Summary

- **Storage:** one snapshot row per replicant + a small `dashboard_item_groups` table (Option B).
- **New columns:** `dashboard_items.replicant_group_id`, `.replicant_value` (nullable).
- **Group identity:** `dashboard_item_groups` owns label / replicate_by / default / shared geo_data.
- **geojson:** stored once on the group (shared across replicants).
- **Ordering:** one `sort_order` space; a group is a contiguous block, moved atomically.
- **App model:** `buildDashboardEntries` → entries (standalone item or group); bundle carries them.
- **Add flow:** "Add all" → one group + N members; "Add single" unchanged.
- **Editor:** group = one "card-set" card; select/reorder on entries; left-pane group controls.
- **Viewer sidebar:** title once + indented replicant labels, selectable.
- **Migration:** additive only (021 + live schema); no backfill; no JSON transform.
- **Out of scope:** export, retro-grouping existing items, per-replicant delete, within-group drag ordering.
