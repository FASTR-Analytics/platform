# PLAN — Dashboard Editor Rework (preview-driven editing)

Status: **Design agreed, implementation not started.** Output of a design discussion grounded in the existing slide-editor and dashboard code. Builds on `PLAN_DASHBOARD.md` (the original feature build).

---

## 1. What we're changing and why

The shipped dashboard editor adds items to a list and stops there: you **can't switch an item's visualization, edit its chart config, or navigate items from the preview.** The left panel is an `EditableList` ([dashboard_item_list.tsx](client/src/components/dashboards/dashboard_item_list.tsx)) whose pencil only renames.

We're reworking the editor to mirror the **slide editor's interaction model**:

- **The preview drives selection.** Click an item in the dashboard preview → it becomes selected.
- **The left pane is contextual.** It edits the *selected* item: rename / switch visualization / edit visualization / remove. (The slide-editor analog is the figure branch of [editor_panel_content.tsx:608-659](client/src/components/slide_deck/slide_editor/editor_panel_content.tsx#L608).)
- **No `EditableList`.** Selection and reorder happen in the preview itself.

This is purely an **editor UX + a small server extension**. The data model (`DashboardItem` = a `FigureBlock`), public viewer, routing, SSE, and permissions are unchanged.

---

## 2. Design decisions

### 2.1 Preview-driven selection (no EditableList)

A dashboard item is already its own DOM card with its own `ChartHolder`/canvas ([dashboard.tsx:195](client/src/components/public_viewer/dashboard.tsx#L195)). So "select an item" is a plain `onClick` on the card wrapper + a CSS highlight ring — **no canvas hit-testing** (unlike slides, where one canvas holds all blocks).

Selection state (`selectedItemId` / `setSelectedItemId`) exists in the orchestrator ([dashboard_editor.tsx:52](client/src/components/dashboards/dashboard_editor.tsx#L52), [dashboard_editor.tsx:407](client/src/components/dashboards/dashboard_editor.tsx#L407)) and is consumed today **only by `SidebarLayout`** (via its `SelectList`). `GridLayout` ignores it entirely — no click, no selection ([dashboard.tsx:192-209](client/src/components/public_viewer/dashboard.tsx#L192)). So preview-driven selection in **grid** mode is genuinely new work, delivered by the editor variant in §2.2; sidebar selection already works and is reused.

### 2.2 Editor-side preview variant (don't make the public viewer interactive)

`DashboardViewer` is shared with the **public, read-only** viewer and must not gain drag/select chrome. The editor's grid (sortable) and sidebar (sortable nav) diverge enough from the public versions that we build a **thin editor variant** rather than branching the shared component on an `editable` flag.

- **New: `dashboard_editor_preview.tsx`** — `DashboardEditorPreview` with internal `EditorGridLayout` / `EditorSidebarLayout`.
- **Reuses the leaf renderer** `DashboardItemChart` (already exported, [dashboard.tsx:218](client/src/components/public_viewer/dashboard.tsx#L218)) — no chart-rendering duplication; only the layout shells are re-implemented with selection + drag.
- **Reuses the bundle, doesn't rebuild it.** The `layoutItems` → `PublicDashboardBundle` transform lives in `DashboardEditorInner` ([dashboard_editor.tsx:348-377](client/src/components/dashboards/dashboard_editor.tsx#L348)). `DashboardEditorPreview` takes the same `bundle` (or shares the transform) so the editor and public renderings can't silently diverge.
- The public [public_viewer/dashboard.tsx](client/src/components/public_viewer/dashboard.tsx) is left untouched.

### 2.3 Drag-to-reorder in the preview (via SortableJS)

`slide_list` already does exactly the target behavior — a flex/grid of live-canvas cards where **click selects and drag reorders in the same component** ([slide_list.tsx:449-490](client/src/components/slide_deck/slide_list.tsx#L449)), using the vendored `SortableVendor` (`panther/_303_components/form_inputs/solid_sortablejs_vendored.tsx`).

- **Grid layout** → wrap cards in `SortableVendor`, same props as `slide_list` (`idField`, `items`/`setItems`, `ghostClass`, `chosenClass`, `animation`). Reorder callback → existing `moveDashboardItems`.
- **Sidebar layout** → replace the read-only `SelectList` ([dashboard.tsx:137](client/src/components/public_viewer/dashboard.tsx#L137)) with a `SortableVendor` nav list (click selects, drag reorders); the main area shows the selected item's chart as today.
- **Click-vs-drag disambiguation** must be carried over explicitly, not left to "polish": a card has to tell a select-click from a reorder-drag. `slide_list` solves this with `onCardClick` + `fallbackTolerance={3}` ([slide_list.tsx:465](client/src/components/slide_deck/slide_list.tsx#L465)); use the same.
- Canvas-in-drag-ghost is a non-issue — `SlideCard` is a canvas thumbnail and drags fine.
- **Rejected:** up/down buttons (bad UX), and a "Reorder items" modal (unnecessary once in-preview drag works).

### 2.4 Persistence: keep immediate per-item save (NOT the slide temp-store model)

The slide editor uses a `tempSlide` store + explicit Save + conflict resolution because a slide is one large multi-field document. A dashboard item is **its own DB row**, and each action (rename, switch viz, edit viz, delete, reorder) is **atomic**. We keep the dashboard's current immediate-save + SSE-refresh pattern ([dashboard_editor.tsx:65](client/src/components/dashboards/dashboard_editor.tsx#L65)) — no draft store, no Save button, no conflict modal.

### 2.5 Server: `updateDashboardItem` must accept a new figureBlock

Today it only takes `{ label }` end-to-end ([db fn](server/db/project/dashboards.ts#L294), [route body type](lib/api-routes/project/dashboards.ts#L70)). Switch/edit produce a new `FigureBlock` client-side; the server must persist it.

- Extend the body type to `{ label?: string; figureBlock?: FigureBlock; geoData?: unknown }`.
- DB fn: when `figureBlock` present, validate with `dashboardFigureBlockSchema.parse` (same as `addDashboardItem`, [dashboards.ts:266](server/db/project/dashboards.ts#L266)) and `UPDATE` `figure_block` / `geo_data`.
- The route handler already forwards `body` verbatim — only the schema/db change is needed.

### 2.6 geoData must be captured for map items (fixes a pre-existing bug)

`updateDashboardItem({ figureBlock, geoData })` only works if the client actually produces `geoData` — and today **nothing does**, for maps, anywhere in the dashboard flow:

- `resolveFigureFromVisualization` computes the geojson internally then **discards it**, returning only a `FigureBlock` ([resolve_figure_from_visualization.ts:47-75](client/src/components/slide_deck/slide_ai/resolve_figure_from_visualization.ts#L47)).
- The add flow passes no `geoData` ([add_dashboard_item_modal.tsx:40](client/src/components/dashboards/add_dashboard_item_modal.tsx#L40)).
- `stripFigureInputsForStorage` deliberately nulls `mapData.geoData` ([strip_figure_inputs.ts:16](client/src/generate_visualization/strip_figure_inputs.ts#L16)) — geojson is large, so it's stripped for storage and must be re-injected at render.
- `hydrateFigureInputsForPublicRendering` only re-injects when an external `geoData` is supplied ([strip_figure_inputs.ts:85-90](client/src/generate_visualization/strip_figure_inputs.ts#L85)) — and it receives `null`.

So **map dashboard items render without their geojson today** — and not only in the public viewer: the editor preview renders through the *same* `DashboardItemChart` → `hydrateFigureInputsForPublicRendering` path, fed `item.geoData` ([dashboard.tsx:218](client/src/components/public_viewer/dashboard.tsx#L218), [dashboard_editor.tsx:365](client/src/components/dashboards/dashboard_editor.tsx#L365)). This is a latent bug independent of this rework.

**Decision: capture the geojson (option b), don't paper over it.** There is already a precedent — the single-visualization **share** flow captures `geoData: ih.data.geoJson` ([visualization_editor_inner.tsx:489](client/src/components/visualization/visualization_editor_inner.tsx#L489), [share_visualization_modal.tsx:73](client/src/components/visualization/share_visualization_modal.tsx#L73)); dashboards simply omitted it.

- Extend `resolveFigureFromVisualization` to also return the `geoData` it already computes (e.g. `{ figureBlock, geoData }`), so **switch** and **add** both persist it. Fix the add flow at the same time so map behavior doesn't diverge by how an item was created.
- For **edit**, the geojson is already in scope in the slide-editor port (`geoJson` at [slide_editor/index.tsx:521-525](client/src/components/slide_deck/slide_editor/index.tsx#L521)) — pass it straight through.
- The server accepting an optional `geoData` (§2.5) is harmless regardless; this decision is about the client actually producing it.

---

## 3. Component responsibilities (after rework)

```text
dashboards/
  dashboard_editor.tsx          orchestrator: data fetch (unchanged), selectedItemId,
                                add/switch/edit/remove/reorder handlers, header (Settings, + Add)
  dashboard_editor_preview.tsx  NEW: DashboardEditorPreview → EditorGridLayout / EditorSidebarLayout
                                (SortableVendor + click-select + highlight; wraps DashboardItemChart)
  dashboard_item_editor.tsx     NEW: left pane for the selected item —
                                label field, Switch viz, Edit viz, Remove (figure branch analog)
  dashboard_item_list.tsx       DELETE
  add_dashboard_item_modal.tsx  unchanged (single/all-replicants confirm + progress)
  dashboard_settings_modal.tsx  unchanged (title/slug/public/layout)
  create_dashboard_modal.tsx    unchanged
  index.tsx                     unchanged
```

### Handlers in `dashboard_editor.tsx`

- **attemptAddItem** — keep the existing add+confirm flow, but now persist `geoData` too (see §2.6).
- **handleSwitchVisualization(itemId)** — open `SelectVisualizationForSlide` → `resolveFigureFromVisualization` (extended to return `{ figureBlock, geoData }`, [resolve_figure_from_visualization.ts](client/src/components/slide_deck/slide_ai/resolve_figure_from_visualization.ts)) → `updateDashboardItem({ figureBlock, geoData })`.
- **handleEditVisualization(itemId)** — port the slide editor's `handleEditVisualization` ([slide_editor/index.tsx:446](client/src/components/slide_deck/slide_editor/index.tsx#L446)): open `VisualizationEditor` (ephemeral) on `figureBlock.source.config`, regenerate via `getPresentationObjectItemsFromCacheOrFetch` + `getFigureInputsFromPresentationObject` (+ `getAdminAreaLevelFromMapConfig` / `getGeoJsonSync` for maps) → `updateDashboardItem({ figureBlock, geoData })`. Uses `projectState` from `~/state/project/t1_store`.
- **updateLabel / handleReorder / attemptDeleteItem** — keep existing logic; `handleReorder` already computes the moved block + `moveDashboardItems` ([dashboard_editor.tsx:183](client/src/components/dashboards/dashboard_editor.tsx#L183)).

---

## 4. Implementation phases

1. **Server + geoData plumbing** — (a) extend `updateDashboardItem` (lib route body type + db fn validation/UPDATE for `figureBlock`/`geoData`); verify client `serverActions.updateDashboardItem` picks up the new body type (auto-generated). (b) extend `resolveFigureFromVisualization` to return `{ figureBlock, geoData }` and update the **add** flow to persist `geoData` (§2.6 — fixes the pre-existing map bug, so do it first and independently verifiable).
2. **Preview variant** — `dashboard_editor_preview.tsx`: `EditorGridLayout` (SortableVendor cards, click-select via `onCardClick` + `fallbackTolerance`, highlight ring) and `EditorSidebarLayout` (SortableVendor nav + selected chart). Reuse `DashboardItemChart` and the existing `bundle` transform (§2.2).
3. **Left item editor** — `dashboard_item_editor.tsx`: label field + Switch/Edit/Remove buttons; empty-state hint when nothing selected.
4. **Rewire orchestrator** — `dashboard_editor.tsx`: left panel → `dashboard_item_editor`; main → `dashboard_editor_preview`; add `handleSwitchVisualization` / `handleEditVisualization` (both persisting `geoData`); auto-select after add. Delete `dashboard_item_list.tsx`.
5. **Polish** — selection highlight, empty dashboard state, sidebar-drag feel, verify a **map** item renders correctly in editor + public, typecheck (`deno task typecheck`).

---

## 5. Out of scope

- Public viewer changes (stays read-only).
- The slide editor's temp-store/Save/conflict machinery (see §2.4).
- New layouts beyond grid/sidebar, theming, logos — already tracked in `PLAN_DASHBOARD.md` §"Future Enhancements".
- Creating brand-new visualizations from the dashboard (slide's `onCreateVisualization`) — can add later; switch/edit covers the immediate gap.

---

## 6. Summary

| Aspect            | Decision                                                               |
|-------------------|------------------------------------------------------------------------|
| Interaction model | Preview-driven selection + contextual left pane (slide-editor style)   |
| Left panel        | `dashboard_item_editor.tsx` (label / switch / edit / remove)           |
| Preview           | New editor variant `dashboard_editor_preview.tsx`; public untouched    |
| Reorder           | Drag in preview via `SortableVendor` (grid cards + sidebar nav)        |
| Persistence       | Immediate per-item save + SSE (no draft store / Save button)           |
| Server change     | `updateDashboardItem` also accepts `figureBlock?` + `geoData?`         |
| Switch viz        | `SelectVisualizationForSlide` + `resolveFigureFromVisualization`       |
| Edit viz          | Port slide `handleEditVisualization` (ephemeral `VisualizationEditor`) |
| geoData           | Capture geojson on add/switch/edit (option b) — fixes map bug          |
| Removed           | `dashboard_item_list.tsx`, up/down buttons, reorder modal              |
