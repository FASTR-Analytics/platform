# PLAN — Dashboard Replicant Groups

Status: **Implemented — `deno task typecheck` green (server + client), `validate_migrations` passed. Runtime smoke-test pending.** (Design: Option B, hardened against two adversarial reviews.) Lets a replicated visualization (e.g. one chart × 40 districts) be added to a dashboard as **one manageable group** instead of 40 flat items, while still snapshotting every replicant's data. Builds on `PLAN_DASHBOARD_EDITOR_REWORK.md`. (1st-review mechanics: transactional add §5, entry→anchor mapping §3, group-geoData injection §4; label/cap notes §5/§8. "2nd review" findings: new server actions §5, entry-aware reorder rewrite §3, the **second (server-side) bundle builder** §4, `selectedEntry`/group-delete dispatch §4/§5, transactional group switch/edit §6.)

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

**Contiguity is editor-enforced, not DB-enforced** (review fix). Nothing in the schema stops a standalone item from being dropped between two members, so the editor must never offer that drop: a group is one atomic entry, and an entry dropped **after** a group maps to `{after: <last member id>}`, **before** a group to `{before: <first member id>}`. `moveDashboardItems` + `reSequence` already place a moved id-list contiguously and in order, so a group move stays intact.

**The client move computation is a rewrite, not reuse** (2nd review). Today `computeSingleItemMove` ([dashboard_editor.tsx:73](client/src/components/dashboards/dashboard_editor.tsx#L73)) operates on raw item ids, returns a single id, and **only emits `{toStart}`/`{after}` — never `{before}`** (the `{before}` branch of `moveDashboardItems` is currently dead code). The plan needs a new `computeEntryMove(oldEntries, newEntries)` that (a) returns the moved entry's **full member-id list** + position, (b) covers the `{before}` case above, and (c) drives a grid that renders **one sortable node per entry** (not one per item card — the `order` mirror + `SortableVendor` children in [dashboard_item_grid.tsx](client/src/components/dashboards/dashboard_item_grid.tsx) currently key on `{id}` per item).

## 4. App model — entries

- New lib type `DashboardItemGroup = { id, dashboardId, label, replicateBy, defaultReplicantValue?, replicants: {value,label}[], geoData?, lastUpdated }`.
- `DashboardItem` gains `replicantGroupId?: string`, `replicantValue?: string`.
- `getDashboardDetail` returns `{ ...dashboard, items, groups }`.
- New shared helper `buildDashboardEntries(detail)` → ordered `DashboardEntry[]` where `DashboardEntry = { kind:"item"; item } | { kind:"group"; group; members: DashboardItem[]; defaultMember }`. Built by walking items by `sort_order`, collapsing consecutive same-group members into one group entry. This (not the raw item list) is what the editor grid, the bundle, and the viewer consume — extends the `buildDashboardBundle` work from the editor rework.
- **geoData injection** (review fix): members store `geo_data = NULL` (it lives on the group), but `build_dashboard_bundle` currently reads `geoData: item.geoData` ([build_dashboard_bundle.ts:27](client/src/components/dashboards/build_dashboard_bundle.ts#L27)). The entry/bundle transform must inject the **group's** `geoData` into each member's bundle entry — otherwise map members render blank.
- **There are TWO bundle builders** (2nd review — biggest miss). The anonymous public viewer does **not** use the client `build_dashboard_bundle`; it has a *separate* server-side mapping at [routes/public/dashboard.ts:53](server/routes/public/dashboard.ts#L53) (`geoData: item.geoData`), fed by `getDashboardBySlug` ([dashboards.ts:109](server/db/project/dashboards.ts#L109)) — which **does not load groups**. So **both** `getDashboardBySlug` *and* `getDashboardDetail` must load `dashboard_item_groups`, and **both** the server public mapping *and* the client transform must inject the group's geojson + emit entries. Best: a shared `buildDashboardEntries`/bundle helper used by client and server so they can't diverge. Without this, every map member renders blank for logged-out viewers.
- `PublicDashboardBundle` carries entries (so the anonymous viewer gets group labels + replicant labels + shared geojson).
- **Selection resolves entries, not items** (2nd review): `selectedItem()` currently does `items().find(i => i.id === selectedId())` ([dashboard_editor.tsx:145](client/src/components/dashboards/dashboard_editor.tsx#L145)) → returns `undefined` for a selected **group** (a group id is not a row id), so the left pane would blank out. Add a `selectedEntry()` that resolves item-vs-group; the left pane (§6) branches on entry kind.

## 5. Add flow

- **Add single replicant** → unchanged (one standalone item).
- **Add all** → a **single transactional server action `addDashboardItemGroup`** (review fix). The existing per-item `addDashboardItem` is reused only for single adds — it makes N non-transactional calls with partial-failure recovery ("Added 3 of 40", [add_dashboard_item_modal.tsx:58-82](client/src/components/dashboards/add_dashboard_item_modal.tsx#L58)) and has no group columns, so a half-created group would have no identity. Instead: the client resolves the N member `figureBlock`s + the shared geojson **once** (via `resolveFigureAndGeoFromVisualization`), then sends one payload `{ group: { label, replicateBy, replicants: [{value,label}], defaultReplicantValue, geoData }, members: [{ replicantValue, figureBlock }] }`; the server inserts the group row + N member rows (contiguous `sort_order`, `geo_data` NULL on members) in **one `projectDb.begin(...)`** — all-or-nothing. Keep the progress UI; copy becomes "Add selected replicant" vs "Add all as a group".
- **Replicant labels** (review note, refined): the **group** stores `{value,label}` pairs (its `replicants` JSON), threaded from `possibleValues` — today `allReplicants` is `string[]` of ids ([dashboard_editor.tsx:282](client/src/components/dashboards/dashboard_editor.tsx#L282)). This powers the indented sidebar. **Single-replicant adds stay unchanged** (id-based label, per §10) — so this is *not* a single-add regression; only the add-all/group path threads labels. The modal currently receives `selectedReplicant: string` with no label map, so the `{value,label}` list must be passed into the group path (confirm `SelectVisualizationForSlide`'s return can resolve the label).

### New server actions (2nd review — must be specified, not implied)

Each needs a route + `lib/api-routes/project/dashboards.ts` registry entry + the `notifyLastUpdated` / `notifyProjectDashboardsUpdated` wiring every dashboard mutation already does ([routes/project/dashboards.ts:148](server/routes/project/dashboards.ts#L148)):

- **`addDashboardItemGroup`** — group row + N members in one `projectDb.begin` (contiguous `sort_order` = `maxSort + 10·(i+1)`; members `geo_data` NULL; validate the group's `replicants` JSON at write time, mirroring `dashboardFigureBlockSchema`).
- **`deleteDashboardItemGroup`** — delete the **group row** (members cascade via the members→group FK `ON DELETE CASCADE`) in one `begin`. **Required:** the existing `deleteDashboardItem` does `DELETE WHERE id = itemId` ([dashboards.ts:351](server/db/project/dashboards.ts#L351)) and would **silently no-op** on a group id; the client `deleteItems` must dispatch by entry kind. (Deleting members individually would orphan the group row — group deletion always targets the group row.)
- **`updateDashboardItemGroup`** (Switch/Edit) — re-resolve all N members + recompute the shared geojson, persisted in one `begin` (see §6).

## 6. Editor UX — card-set

- The grid maps over **entries**. A **group** renders as one card styled as a **stack** ("card-set": layered shadow) showing the default replicant's `FigureThumbnail` + a count pill ("40 districts"). A standalone entry renders as today.
- Selection + reorder operate on **entries** (entry key = item id for standalone, group id for group). `createSelectionController` keyed by entry id; reorder via §3; the left pane resolves a `selectedEntry()` and branches on kind (§4).
- Left pane for a selected **group**: rename group, **Switch / Edit visualization**, Remove group (→ `deleteDashboardItemGroup`), **plus a replicant picker** to preview/spot-check a single replicant. For a standalone item: unchanged.
- **Switch / Edit on a group is transactional** (2nd review): re-resolving N members must go through `updateDashboardItemGroup` (one `begin`), not N separate `updateDashboardItem` calls (same partial-failure risk the add path eliminates). Show progress (the ≤500 cap bounds it). If the new viz changes the map admin level, **recompute the group's shared `geoData`** too (it's a function of `mapArea` level — see §2 invariant).

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
- **>500 replicants** (review note): grouping/add-all is only offered when the replicant lookup status is `"ok"`; above `MAX_REPLICANT_OPTIONS` (500, [consts.ts:2](server/server_only_funcs_presentation_objects/consts.ts#L2)) the status is `too_many_values` → neither add-all nor grouping is available. Acceptable — the target case is ≤40 — but the "too many flat rows" problem is, by construction, unsolvable for >500-replicant vizzes.

## 9. Implementation phases

1. **Schema + types** — migration `021` + `_project_database.sql` (new table + the two columns added **inline** in the base DDL, matching style); `DBDashboardItem`/`mapDashboardItem` + new group DB access; lib types (`DashboardItemGroup`, `DashboardItem` fields, entries). `./validate_migrations`.
2. **Server actions** — `addDashboardItemGroup`, `deleteDashboardItemGroup`, `updateDashboardItemGroup` (each: one `begin`, route + registry entry + notify wiring; write-time validation of the group `replicants` JSON). Make **both** `getDashboardDetail` and `getDashboardBySlug` load groups.
3. **Add flow** — client resolves N figureBlocks + shared geojson once → one `addDashboardItemGroup` payload; thread `{value,label}`; modal copy. Single adds unchanged.
4. **App model** — shared `buildDashboardEntries` (client + server); inject group `geoData` per member; `PublicDashboardBundle` carries entries; `selectedEntry()` resolver.
5. **Editor** — grid renders **entries** (one sortable node per entry; group card-set); new `computeEntryMove` (incl. `{before}`) → member-block move; delete dispatches by entry kind; left-pane group controls + replicant picker.
6. **Viewer** — sidebar two-level tree + grid group tile; **server public route** emits the grouped bundle with injected geojson (not just the client).
7. **Polish** — empty/edge states, typecheck (`deno task typecheck`), manual check of a 40-replicant **map** group: add → editor card-set → reorder among standalone items → sidebar tree → switch/edit re-resolves all → **open in incognito and confirm map members render** (geojson via group).

## 10. Resolved decisions

- **Within-group order:** fixed to the `replicants` list order (natural/alphabetical) in v1.
- **No per-replicant delete:** group membership is fixed at add time — you delete the whole group via `deleteDashboardItemGroup` (targets the group row; members cascade), never a single replicant. Avoids the collapse-to-standalone complexity.
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
