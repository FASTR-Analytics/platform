# PLAN — Dashboard Editor Rework (card editor + external preview)

Status: **Implemented — `deno task typecheck` green (server + client).** Card editor (reorderable multi-select cards + contextual left pane reusing the slide visualization flows), Preview opens the dashboard URL in a new tab, and the `isPublic` access rule is enforced server-side (public → anyone; not-public → authenticated). Builds on `PLAN_DASHBOARD.md`. Runtime smoke-test (esp. a live map item) still recommended.

---

## 1. What we're building

The dashboard editor becomes a proper **item editor**, not an embedded preview:

- **Main area** — a set of **reorderable cards**, each = the item's chart + label. Drag to reorder, **circle multi-select**, **right-click context menu**.
- **Click a card** → the **left pane** reveals visualization controls **reused from the slide editor**: Edit / Switch / Create / Remove.
- **Header "Preview" button** opens the real dashboard in a **new browser tab** — nothing rendered inline.

**Guiding principle: a dashboard item should feel like a slide in a deck.** The card grid mirrors `slide_list` — same multi-select (click / shift-range / cmd-toggle / circle), same drag-reorder, same right-click batch ops. The one deliberate difference: clicking a card reveals an inline **left edit pane** (items are a single visualization, so no separate full-screen editor like slides need).

The data model (`DashboardItem` = a `FigureBlock`), SSE, and permissions are unchanged.

---

## 2. Design decisions

### 2.1 Editor = reorderable card grid, NOT a preview (decision walked into)

We explicitly **dropped the embedded-preview idea.** An in-editor preview can't both mirror the public **grid** layout *and* support clean drag-reorder (the hardened reorder engine `Reorderable` is `_internal`/unexported; `SortableList` is vertical-only), and it just duplicates the public viewer. The editor is a **management surface**:

- Reorderable cards via `SortableVendor` (vendored SortableJS, grid/flow container) — the proven `slide_list` pattern ([slide_list.tsx:449](client/src/components/slide_deck/slide_list.tsx#L449)), incl. its optimistic order-sync effect and `fallbackTolerance` click-vs-drag handling.
- `SelectionCircle` + `createSelectionController` (`mode: "multi"`) — exactly as the dashboard **list** already does ([index.tsx:39](client/src/components/dashboards/index.tsx#L39), [index.tsx:186](client/src/components/dashboards/index.tsx#L186)). `computeMove(oldIds, newIds)` yields the positional move for `moveDashboardItems`, replacing the hand-rolled block-move math.
- Right-click context menu (`showMenu`) per card (Remove; later Duplicate).
- **Single-card drag-reorder** — `SortableVendor` *without* `multiDrag`. This sidesteps the SortableJS multi-drag ↔ DOM selection sync that kept `slide_list` out of the list-selection extraction ([PLAN_LIST_SELECTION_EXTRACTION.md:13](PLAN_LIST_SELECTION_EXTRACTION.md#L13)). Multi-select drives batch ops (e.g. delete); dragging several at once is deferred (would need a `syncWithExternalSelection` controller option + migrating `slide_list` too).

The dashboard's public **grid/sidebar** layout is irrelevant to the editor — it only affects the public render.

### 2.2 No embedded preview — "Preview" opens the dashboard URL in a new tab

There is **one** dashboard URL, `/d/:projectId/:slug`, rendered by the existing `DashboardViewer`. "Copy link" copies it; the header **"Preview"** button opens that same URL in a new tab (`window.open(publicUrl, "_blank")`). Nothing is rendered inline, and no separate preview page/route exists.

**Access rule (`isPublic`):**

- `isPublic: true` → **anyone** can see it (logged-out included).
- `isPublic: false` → **only authenticated users** can see it.

The bug was that the public route gated on `isPublic` for *everyone* and never checked auth, so an editor (or the creator) got a 404 on a not-public dashboard. Fix (implemented):

- `/api/d/*` now runs Clerk middleware so the route can **read** the session without rejecting anonymous requests ([main.ts](main.ts)).
- The route serves a not-public dashboard only when there is a **real Clerk session** — `getAuth(c)?.userId`, deliberately **not** `_BYPASS_AUTH` — else 404 ([server/routes/public/dashboard.ts](server/routes/public/dashboard.ts)). Public dashboards serve to everyone as before.
- **Dev gotcha:** under `BYPASS_AUTH=true` there is no Clerk session at all, so a not-public dashboard 404s for **everyone, including the dev browser** — i.e. the editor's Preview button on a not-public dashboard 404s locally. To exercise the real "editor sees / anonymous doesn't" flow, run with real Clerk (`BYPASS_AUTH` off). This is why the gate excludes `_BYPASS_AUTH`: it must not treat an anonymous request as authenticated.
- The client `/d/` page fetch sends `credentials: "include"` so the session cookie reaches the server (needed cross-origin in dev).

`buildDashboardBundle(detail)` is extracted to [build_dashboard_bundle.ts](client/src/components/dashboards/build_dashboard_bundle.ts) as the canonical transform, used by the editor grid.

*(Separate, not addressed: `createDashboard` defaults `is_public = true` ([dashboards.ts:177](server/db/project/dashboards.ts#L177)) while `PLAN_DASHBOARD.md` said default-false. Orthogonal; flag for the owner.)*

### 2.3 Left pane reuses the slide visualization flows

Clicking a card selects it and reveals the left edit pane (`dashboard_item_editor.tsx`): a **Label** field + **Edit / Switch / Create / Remove** — the same set as the slide editor's figure branch ([editor_panel_content.tsx:608-659](client/src/components/slide_deck/slide_editor/editor_panel_content.tsx#L608)), backed by handlers **ported from the slide editor**:

- **Edit** — port `handleEditVisualization` ([slide_editor/index.tsx:446](client/src/components/slide_deck/slide_editor/index.tsx#L446)): open `VisualizationEditor` (ephemeral) on `figureBlock.source.config`, regenerate.
- **Switch** — `SelectVisualizationForSlide` → `resolveFigureAndGeoFromVisualization` (Phase 1).
- **Create** — `AddVisualization` ([slide_editor/index.tsx:674](client/src/components/slide_deck/slide_editor/index.tsx#L674)).

Each produces a new `FigureBlock` (+ `geoData`) → `updateDashboardItem`. Uses `projectState` from `~/state/project/t1_store`. The left pane is **ever-present** (fixed left column): with nothing selected it shows a "Select an item" placeholder; with multiple selected, a "multiple selected" hint (edits act on a single item).

### 2.4 Persistence — immediate per-item save (NOT the slide temp-store model)

Each item is its own DB row; rename/switch/edit/create/remove/reorder are atomic mutations + SSE refetch ([dashboard_editor.tsx:65](client/src/components/dashboards/dashboard_editor.tsx#L65)). No draft store, no Save button, no conflict modal.

### 2.5 Server — `updateDashboardItem` accepts a new figureBlock — **DONE (Phase 1)**

Body type now `{ label?; figureBlock?; geoData? }` ([lib/api-routes/project/dashboards.ts:70](lib/api-routes/project/dashboards.ts#L70)); db fn validates with `dashboardFigureBlockSchema` and `UPDATE`s `figure_block`/`geo_data` ([server/db/project/dashboards.ts:294](server/db/project/dashboards.ts#L294)). Route forwards `body` verbatim.

### 2.6 geoData capture (fixes a pre-existing map bug) — **DONE (Phase 1)**

`resolveFigureAndGeoFromVisualization` returns `{ figureBlock, geoData }`; the original `resolveFigureFromVisualization` delegates (6 slide callers untouched). The add flow now persists `geoData` ([add_dashboard_item_modal.tsx:34](client/src/components/dashboards/add_dashboard_item_modal.tsx#L34)). Switch/Edit/Create do the same. Fixes maps rendering without geojson. `stripFigureInputsForStorage` nulls `mapData.geoData` for storage ([strip_figure_inputs.ts:16](client/src/generate_visualization/strip_figure_inputs.ts#L16)); `hydrateFigureInputsForPublicRendering` re-injects from the stored `geoData` ([strip_figure_inputs.ts:85](client/src/generate_visualization/strip_figure_inputs.ts#L85)).

---

## 3. Component responsibilities (after rework)

```text
dashboards/
  dashboard_editor.tsx        orchestrator: selection controller (multi), handlers
                              (edit/switch/create/remove/reorder/label), header
                              (Preview ↗, Settings, + Add). main = card grid, left = item editor
  dashboard_item_grid.tsx     NEW: reorderable cards (SortableVendor) + SelectionCircle +
                              right-click menu; each card = DashboardItemChart + label
  dashboard_item_editor.tsx   NEW: left pane for the selected item — Label + Edit / Switch /
                              Create / Remove (slide viz flows)
  build_dashboard_bundle.ts   NEW: DashboardDetail → PublicDashboardBundle (canonical transform)
  dashboard_item_list.tsx     DELETED
  (modals + index.tsx unchanged)
public_viewer/dashboard.tsx   DashboardViewer reused for the Preview tab; DashboardItemChart
                              reused for card thumbnails. Fetch now sends credentials.
```

---

## 4. Implementation phases — all DONE; `deno task typecheck` green (server + client)

1. **Server + geoData plumbing** — `updateDashboardItem` accepts `figureBlock?`/`geoData?`; `resolveFigureAndGeoFromVisualization`; add flow persists `geoData`. **DONE.**
2. **Card grid** — `dashboard_item_grid.tsx`: `SortableVendor` reorderable cards (order-sync effect), each card = `DashboardItemChart` + label, `SelectionCircle`, right-click menu. **DONE.**
3. **Left item editor** — `dashboard_item_editor.tsx`: debounced Label field + Edit/Switch/Create/Remove; empty/multi-select hint. **DONE.**
4. **Orchestrator rewire** — `dashboard_editor.tsx`: `createSelectionController` (multi), ported Edit/Switch/Create + remove/reorder (`computeMove`)/label, all persisting `geoData`; header gains **Preview** + Settings + Add; main → grid, left → item editor. `dashboard_item_list.tsx` deleted. **DONE.**
5. **`isPublic` access fix** — `/api/d/*` reads the Clerk session; not-public dashboards require auth, public serve to all; client sends credentials. Preview just opens the copyable URL. **DONE.** (Replaced the originally-planned separate preview route.)
6. **Typecheck** — server + client green. Manual verification of a live map item in the Preview tab still recommended at runtime.

---

## 5. Out of scope

- **Embedded/in-editor live preview** — replaced by open-in-tab preview (§2.1/2.2).
- The slide editor's temp-store/Save/conflict machinery (§2.4).
- **Migrating `slide_list` to `createSelectionController`** + multi-drag (`syncWithExternalSelection`) — explicitly deferred by the extraction plan ([PLAN_LIST_SELECTION_EXTRACTION.md:13](PLAN_LIST_SELECTION_EXTRACTION.md#L13)); a separate task, only worth it if we want drag-multiple-at-once parity.
- Changing the `is_public` default (§2.2 note) — separate decision.
- New public layouts beyond grid/sidebar, theming, logos — tracked in `PLAN_DASHBOARD.md` §"Future Enhancements".

---

## 6. Summary

| Aspect             | Decision                                                                   |
|--------------------|----------------------------------------------------------------------------|
| Editor surface     | Reorderable card grid (slide_list pattern) — a manager, not a preview      |
| Card interactions  | Drag-reorder + circle multi-select + right-click menu                      |
| Left pane          | Click a card → Label + Edit / Switch / Create / Remove (slide viz flows)   |
| Preview            | Header button opens the copyable dashboard URL in a new tab (no new route) |
| isPublic semantics | public → anyone; not-public → authenticated only (enforced server-side)    |
| Reorder            | Inline drag (`SortableVendor`) → `computeMove` → `moveDashboardItems`      |
| Selection          | `createSelectionController` (multi) + `SelectionCircle`                    |
| Persistence        | Immediate per-item save + SSE (no draft store / Save button)               |
| Server change      | `updateDashboardItem` accepts `figureBlock?` + `geoData?` — DONE           |
| geoData            | Captured on add/switch/edit/create — fixes map bug                         |
| Removed            | `dashboard_item_list.tsx`, embedded preview, reorder modal                 |
