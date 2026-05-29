# PLAN — Long-Form Reports Feature

Status: **Design agreed, implementation not started.** This document captures the decisions, their justifications, and a proposed implementation path. It is the output of a design discussion + codebase/architecture/external research.

---

## 1. What we're building

A **"reports"** feature: long-form analytical documents (narrative prose + embedded **live** data figures), authored and edited by **both** the AI assistant and human users, exportable to **Word and PDF** via panther.

Management (list, folders, create/duplicate/move/delete, permissions) mirrors the existing **slide_deck** feature. The new, hard part is the **document data model** and the **editor**, which is what most of this plan addresses.

Goals, in priority order:
1. Excellent editing UX — ideally WYSIWYG eventually, easy for non-markdown users. A markdown↔preview **toggle is acceptable for v1**, *provided the architecture can evolve to WYSIWYG without a rewrite*.
2. Robust AI authoring **and** surgical editing while a human co-edits. Genuinely co-owned: AI typically drafts the whole thing, also makes targeted edits, also reacts to user edits.
3. Embedded figures are **live references** to project visualizations that re-render from current data (not static images) — same construct as figures in slide decks.
4. High-fidelity **Word/PDF export**.
5. Consistency with existing wb-fastr/panther patterns where it genuinely helps.

---

## 2. The core decision: data model

### Decision

**Store a report as a markdown `body` string + a `figures` registry (`Record<figureId, ReportFigure>`). No persisted block array.** Figures are referenced inside the markdown as `![caption](figure:<figureId>)` and resolved against the registry.

```
Report
├── id, label, folderId, lastUpdated, config
├── body:    string                              // markdown; figures referenced as ![caption](figure:id)
└── figures: Record<figureId, ReportFigure>      // live, durable, addressable figure definitions
```

### Why not a block array (the path we explicitly walked back)

We initially leaned toward storing an ordered array of typed blocks (each with a stable ID). Each of the agreed answers below removed a reason for it, and storing blocks turned out to add cost without buying anything v1 needs:

- **AI editing = scoped rewrite + accept/reject diff, not block-ID mutation** (see §4). So the AI never needs persisted block IDs.
- **Prose needs no stable IDs in v1.** The AI targets prose by content/section, not by ID. Durable per-paragraph identity only matters for things like anchored comments — a later feature.
- **WYSIWYG-readiness does NOT require stored blocks.** A ProseMirror/BlockNote-class editor parses markdown into its *own* node tree at load and serializes back on save; block identity lives in the editor at runtime, not in the DB. (This corrected an earlier overstatement that "a flat string has nothing to bind to.")
- **The only thing that must be durable and structured is figures** → that's the registry, not a block array.
- **Markdown is panther's native input** for both rendering and Word/PDF export, so export is nearly free.

Slides remain block-based because a slide is a **2-D layout** (`LayoutNode<ContentBlock>`). A report is **linear prose**, so it does not inherit the layout tree — it inherits only the **figure** construct.

### Why figures are a registry, not inline blobs

Figure *data* (a live `FigureSource`) is structured JSON. Embedding it inside the markdown string (fenced JSON / HTML comments) is fragile — easy for the AI or a future WYSIWYG editor to corrupt on round-trip. Keeping figures in a side registry keyed by a stable id means:
- The figure id lives in the `![](figure:id)` token, so it **survives any markdown round-trip exactly**.
- Figures are **addressable** (refresh-from-data, replace, validate) without parsing them out of prose.
- Referential integrity is a cheap validation/GC pass on save (orphan tokens / orphan registry entries).

---

## 3. Editor strategy

### Decision

- **v1:** a markdown **toggle** editor using panther's existing `MarkdownTextEditor`, which already has two modes:
  - `editable_text` — CodeMirror markdown source (one continuous editing surface; select/edit across paragraphs normally — there is **no per-block UI**).
  - `presentation` — rendered preview via `MarkdownPresentationJsx`, with a `renderImage` callback that resolves `figure:id` tokens to **live** figure components.
- **Future (WYSIWYG):** drop in a ProseMirror/BlockNote-class block editor over the **same storage**. It parses `body` → its node tree on load, renders figures as a custom node bound to the registry, and serializes back to markdown on save. No data migration.

### How IDs behave across editing (the question we drilled into)

- **In the block-editor future:** block IDs are node attributes maintained live by the editor through transactions (split keeps the original's ID + mints one for the new half; merge keeps the survivor's; cross-paragraph delete drops only fully-removed nodes). No text reparse → genuine retention.
- **In v1 markdown editing:** while typing it's just a string — there are no prose block IDs to lose. We don't persist prose IDs at all in v1. **Figures keep their id via their token, always.** A full markdown→structure parse only happens for whole-document inputs (AI full draft, paste/import), and there figures anchor exactly while prose is re-derived. This is acceptable because nothing durable depends on prose IDs in v1.

---

## 4. AI editing model

### Decision

AI edits operate by **scoped rewrite surfaced as an accept/reject diff** — never silent block-ID mutation of a live document.

- Whole-doc draft → returns a full markdown body (+ optional figures).
- Surgical edit → rewrites a **section** (heading-bounded) or a small region; "surgical" = the *diff* is small, not that it patches block IDs.
- Reacting to user edits → AI re-reads the current `body`, returns a scoped rewrite.
- All mutating edits render a **diff the user accepts/rejects**; the AI does not overwrite the doc the user is editing.

### Why

Notion ships block-level mutation in its *API* but deliberately does **not** let its AI agent use it — it judged live per-block mutation too conflict-prone during co-editing, and has the agent operate at page level (read page → write page). The Cursor / Anthropic `str_replace` "generate + apply, show a diff" pattern converges on the same answer: reliable AI editing of long text = scoped text rewrite + diff, reconciled by the human. This is the validated-safe mechanism and it also keeps the data model simple (prose needs no IDs).

---

## 5. Figures end-to-end

A figure is a **live reference**, reused from slides. Lift the existing types to a shared module so a figure is the same object in a slide and a report:

```ts
// from lib/types/slides.ts today — to be lifted to a shared lib/types/figures.ts
export type FigureSource =
  | { type: "from_data"; metricId: string; config: PresentationObjectConfig;
      snapshotAt: string; indicatorMetadata?: IndicatorMetadata[] }   // live + refreshable + snapshot
  | { type: "custom"; description?: string };

export type ReportFigure = {
  source: FigureSource;          // source of truth (re-renders from current data)
  figureInputs?: FigureInputs;   // optional cached render snapshot
  caption?: string;
};
```

- **Reference syntax in `body`:** `![caption](figure:<figureId>)` where `<figureId>` is the registry key.
- **Live preview:** `MarkdownTextEditor` `presentation` mode + a `renderImage(src)` callback that parses `figure:<id>`, looks up the registry, and renders a live `FigureRenderer`.
- **Export:** resolve each `FigureSource` → `FigureInputs`, build a panther `FigureMap = Map<"figure:<id>", FigureInputs>`, and hand `body` + the map to panther's browser export functions. panther rasterizes each figure via `getFigureAsDataUrlBrowser` at export time (so figures bake into the .docx/.pdf as images).

This is the same `FigureInputs` → live JSX **or** rasterized image bridge panther already provides; nothing new in panther is strictly required for v1, though panther is the right home for a shared report renderer/editor as the feature grows.

---

## 6. Research backing (brief)

- **Block model + continuous editing is the mainstream pattern.** Notion (typed blocks, stable UUIDs, Postgres), ProseMirror (schema'd node tree + marks), BlockNote (JSON block array on ProseMirror) all separate the *data structure* (blocks) from the *editing surface* (one continuous document). Confirms: blocks would be a runtime/editor concern, and the stored format can be markdown.
- **AI co-editing = page/section rewrite + diff.** Notion AI edits whole pages, not live blocks; Cursor/Anthropic use generate-then-apply with `str_replace`/diffs. Confirms §4.
- **Live figures = typed directive referencing data, rendered live and typeset for export.** Quarto/Typst/Observable all represent a figure as a directive/reference (not a static image), rendered live for preview and rasterized/typeset for export. Confirms §5 (`figure:id` token + registry).

---

## 7. Data model & API spec

### lib/types/reports.ts (new)

```ts
export type ReportConfig = { /* typography/style; can start ~empty, mirror SlideDeckConfig as needed */ };

export type ReportFigure = { source: FigureSource; figureInputs?: FigureInputs; caption?: string };

export type ReportSummary = {                 // list view
  id: string; label: string; folderId: string | null; config: ReportConfig;
};
export type ReportDetail = {                  // editor/render
  id: string; label: string; body: string;
  figures: Record<string, ReportFigure>; config: ReportConfig; lastUpdated: string;
};
export type ReportFolder = {
  id: string; label: string; color: string | null; description: string | null; sortOrder: number;
};
```

### CRUD route surface (mirror slide-decks)

| Operation | Route | Method | Body | Response |
|---|---|---|---|---|
| List | `/reports` | GET | — | `ReportSummary[]` |
| Detail | `/reports/:report_id` | GET | — | `ReportDetail` |
| Create | `/reports` | POST | `{label, folderId?}` | `{reportId, lastUpdated}` |
| Update label | `/reports/:report_id/label` | PUT | `{label}` | `{lastUpdated}` |
| Update body | `/reports/:report_id/body` | PUT | `{body}` | `{lastUpdated}` |
| Update figures | `/reports/:report_id/figures` | PUT | `{figures}` | `{lastUpdated}` |
| Update config | `/reports/:report_id/config` | PUT | `{config}` | `{lastUpdated}` |
| Move to folder | `/reports/:report_id/folder` | PUT | `{folderId\|null}` | `{lastUpdated}` |
| Duplicate | `/reports/:report_id/duplicate` | POST | `{label, folderId?}` | `{newReportId, lastUpdated}` |
| Delete | `/reports/:report_id` | DELETE | — | — |
| Folder create/update/delete | `/report-folders[/:id]` | POST/PUT/DELETE | mirror `slide-deck-folders` | `{...}` |

Optimistic concurrency: every mutation returns a fresh `lastUpdated` ISO string; client caches and round-trips it (same as `slides`).

---

## 8. Proposed implementation path

Build server→types→state→list/routing→editor→export→AI in dependency order. The plumbing (Phases 1–3) is ~80% a clone of slide_deck.

### Phase 0 — Shared figure types + confirm scaffolding
- Lift `FigureSource` / figure types from `lib/types/slides.ts` into a shared `lib/types/figures.ts`; re-export from slides to avoid breakage.
- Confirm & reuse existing scaffolding (appears already present — verify, don't assume):
  - `"reports"` in the `TabOption` union and `reports` tab icon (`client/src/state/t4_ui.ts`, `client/src/components/project/index.tsx`).
  - `can_view_reports` / `can_configure_reports` permissions (`lib/types/permissions.ts`).
  - `AIContextViewingReports` / `AIContextEditingReport` stubs (`client/src/components/project_ai/types.ts`, currently commented out).

### Phase 1 — Server (clone slide_deck plumbing)
- **Migration** `server/db/migrations/project/020_reports.sql`: `report_folders` + `reports(id, label, body, figures, config, folder_id→report_folders ON DELETE SET NULL, last_updated)` + indexes. (Confirm `020` is the next free number at implementation time.)
- **DB types** `server/db/project/_project_database_types.ts`: `DBReport`, `DBReportFolder` (figures/config stored as JSON strings).
- **DB modules** `server/db/project/reports.ts` + `report_folders.ts` (clone `slide_decks.ts` / `slide_deck_folders.ts`); zod-validate `figures`/`config` on write; `getAll`, `getDetail`, `create`, `updateLabel/Body/Figures/Config`, `moveToFolder`, `duplicate`, `delete`. Export from `server/db/project/mod.ts`.
- **Routes** `server/routes/project/reports.ts` + `report_folders.ts` (clone `slide_decks.ts`); gate with `can_configure_reports`; after each mutation call `notifyLastUpdated(projectId, "reports", [id], lastUpdated)` and the list-refresh notify.
- **SSE** `server/task_management/notify_project_v2.ts`: add `notifyProjectReportsUpdated` / `notifyProjectReportFoldersUpdated`.
- **Dirty state** `server/task_management/get_project_dirty_states.ts` + `lib/types/project_dirty_states.ts`: add `"reports"`, `"report_folders"` to the table-name union/array and query blocks.
- **Mount** routes in `main.ts`.

### Phase 2 — lib types + API registry
- `lib/types/reports.ts` (per §7); add `reports`/`reportFolders` to `ProjectState` and the `reports_updated`/`report_folders_updated` SSE message types in `lib/types/project_sse.ts`.
- `lib/api-routes/project/reports.ts` + `report-folders.ts` route registries; merge into `lib/api-routes/combined.ts` (client server-actions are codegen'd from this).

### Phase 3 — Client state, list UI, routing
- **Store** `client/src/state/project/t1_store.ts`: `reports: []` / `reportFolders: []` in empty state + reconcile cases for the two new SSE messages.
- **UI state** `client/src/state/t4_ui.ts`: `reportGroupingMode` / `reportSelectedGroup` signals + `updateProjectView` fields.
- **List + modals** (clone): `project_reports.tsx`, `add_report.tsx`, `duplicate_report_modal.tsx`, `move_report_to_folder_modal.tsx`, `edit_report_folder_modal.tsx`. Replace deck thumbnails with a text/figure preview.
- **Tab + routing** `client/src/components/project/index.tsx`: add the `reports` tab (gated on `can_view_reports`), a `<Match>` rendering `ProjectReports`, `openReport()` via `openProjectEditor()`, and an `AIContextSync` case → `viewing_reports`.
- **Server actions** `client/src/server_actions/reports.ts` (or rely on codegen).

### Phase 4 — Editor component
- `client/src/components/report/report_editor.tsx`: `MarkdownTextEditor` with mode toggle (`editable_text` ↔ `presentation`), `value=body`, debounced `onChange` → `updateReportBody`.
- `renderImage(src)` callback: parse `figure:<id>` → registry lookup → live `FigureRenderer`; fall back to `<img>` for plain URLs.
- Figure insertion UI: pick a presentation object/visualization → add `ReportFigure` to the registry → insert `![caption](figure:id)` token at the cursor.
- AI context: expose `mode: "editing_report"`, `getBody()`, `getFigures()`, plus selection.

### Phase 5 — Export (Word/PDF)
- `client/src/exports/export_report_as_pdf.ts`: `resolveFiguresToFigureMap(figures)` → `markdownToPdfBrowser(body, { figures, fontPaths: { basePath, fontMap: fontMap.ttf }, style, pageBreakRules })`. Reuse `client/src/font-map.json` exactly as the slide-deck PDF export does.
- `client/src/exports/export_report_as_word.ts`: `markdownToWordBrowser(body, { figures, wordConfig, style })`.
- `client/src/components/report/download_report.tsx`: clone `download_slide_deck.tsx` (format radio, progress, errors).

### Phase 6 — AI tools
- Uncomment/define `AIContextViewingReports` + `AIContextEditingReport` (`project_ai/types.ts`).
- `project_ai/ai_tools/tools/reports.ts`:
  - `get_available_reports` (always on, read-only list).
  - `get_report(reportId)` — fetch body+figures; "call first before editing".
  - `create_report(label, markdown, figures?)`.
  - `rewrite_report(reportId, markdown)` — whole-body rewrite → **diff preview, accept/reject**.
  - `rewrite_section(reportId, sectionHeading, newMarkdown)` — heading-bounded → diff preview.
  - `insert_figure(reportId, figureId, figureSource, caption?, position?)` — add registry entry + insert token.
  - `show_draft_report_to_user(label, markdown, figures?)` — inline rendered preview + "Create / Add to existing".
- `project_ai/ai_tools/validators/report_validators.ts`: every `![](figure:id)` resolves in the registry; unique figure ids; max body length; no unresolved tokens before persist.
- `project_ai/build_tools.ts`: register `getToolsForReports` / `getToolsForReportEditor`; add `reports` to `BuildToolsParams`.
- `project_ai/build_system_prompt.ts`: `viewing_reports` / `editing_report` mode instructions; add "Available reports: N" to project context.
- Diff/preview components: `DraftReportPreview.tsx`, `ReportMarkdownDiff.tsx`.

### Phase 7 — Future (not v1)
- WYSIWYG block editor (ProseMirror/BlockNote) over the same `body`+`figures` storage; figures as a custom node.
- Anchored comments / threads (introduces persisted prose identity — add hidden IDs or a CRDT layer then).
- Possibly build the shared report renderer/editor into panther.

---

## 9. File manifest (new = N, modify = M)

**Server:** `migrations/project/020_reports.sql` (N) · `db/project/_project_database_types.ts` (M) · `db/project/reports.ts` (N) · `db/project/report_folders.ts` (N) · `db/project/mod.ts` (M) · `routes/project/reports.ts` (N) · `routes/project/report_folders.ts` (N) · `task_management/notify_project_v2.ts` (M) · `task_management/get_project_dirty_states.ts` (M) · `main.ts` (M)

**lib:** `types/reports.ts` (N) · `types/figures.ts` (N, lifted) · `types/slides.ts` (M, re-export) · `types/project_sse.ts` (M) · `types/project_dirty_states.ts` (M) · `api-routes/project/reports.ts` (N) · `api-routes/project/report-folders.ts` (N) · `api-routes/combined.ts` (M)

**client:** `state/project/t1_store.ts` (M) · `state/t4_ui.ts` (M) · `components/project/index.tsx` (M) · `components/project/project_reports.tsx` (N) · `add_report.tsx` (N) · `duplicate_report_modal.tsx` (N) · `move_report_to_folder_modal.tsx` (N) · `edit_report_folder_modal.tsx` (N) · `components/report/report_editor.tsx` (N) · `components/report/download_report.tsx` (N) · `exports/export_report_as_pdf.ts` (N) · `exports/export_report_as_word.ts` (N) · `server_actions/reports.ts` (N) · `components/project_ai/types.ts` (M) · `ai_tools/tools/reports.ts` (N) · `ai_tools/validators/report_validators.ts` (N) · `build_tools.ts` (M) · `build_system_prompt.ts` (M) · `DraftReportPreview.tsx` (N) · `ReportMarkdownDiff.tsx` (N)

Rough scope: ~15 new + ~12 modified files; most plumbing is mechanical cloning of slide_deck.

---

## 10. Open questions / to confirm before/while building

1. **Prose granularity at parse time** — when we do need structure (export pagination, future editor), are blocks one-markdown-element-each or coarse regions? Leaning fine (panther's parser already splits into `ParsedMarkdownItem[]`), but it's an internal detail, not a storage change.
2. **`ReportConfig` scope** — does v1 need styling/theme/header-footer config, or start minimal and reuse slide-deck style presets later?
3. **Figure picker source** — reuse the slide "create figure from visualization/metric" flow directly, or a report-specific picker?
4. **Section addressing for `rewrite_section`** — by heading text (simple, ambiguous if duplicate headings) vs. a more robust anchor.
5. **Naming hygiene** — keep new public types named `Report*`; note `lib/types/slides.ts` `DeckSummary.reportId` is an unrelated existing field — ensure no type/identifier collisions when wiring AI context.
6. **Permissions** — confirm `can_view_reports` / `can_configure_reports` exist and are seeded for roles; otherwise add them like the slide-deck pair.

---

## 11. Risks

- **Export fidelity gap** — what the live editor preview shows vs. what panther's paginated Word/PDF produces (page breaks, figure sizing, fonts) will differ; budget time to tune `style` / `pageBreakRules` and figure DPI.
- **Figure resolution cost** — exporting re-renders/rasterizes every figure; large reports may need batching/progress UI (the download modal already has a progress pattern).
- **Referential integrity** — orphan `figure:id` tokens or orphan registry entries; add a validate/GC step on save and on AI edits.
- **Editor evolution** — v1 markdown toggle must not bake in assumptions that block the later WYSIWYG swap; keep `body`+`figures` as the only persisted truth.
