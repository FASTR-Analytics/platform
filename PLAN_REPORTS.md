# PLAN — Long-Form Reports Feature

Status: **Design agreed, implementation not started.** This document captures the decisions, their justifications, and a proposed implementation path. It is the output of a design discussion + codebase/architecture/external research. **Claims were code-verified against the repo (2026-06-01) via parallel + adversarial review; corrections are folded inline — notably the §4 server-side conflict check, the §5 figure render/export mechanism, and Phases 1/4/5.**

---

## 1. What we're building

A **"reports"** feature: long-form analytical documents (narrative prose + embedded **live** data figures), authored and edited by **both** the AI assistant and human users, exportable to **Word and PDF** via panther.

Management (list, folders, create/duplicate/move/delete, permissions) mirrors the existing **slide_deck** feature. The new, hard part is the **document data model** and the **editor**, which is what most of this plan addresses.

Goals, in priority order:
1. Excellent editing UX — ideally WYSIWYG eventually, easy for non-markdown users. v1 delivers a **single CodeMirror surface with live inline figure widgets** (figures never shown as raw markdown; §3), evolvable to a full block editor without a storage rewrite.
2. Robust AI authoring **and** surgical editing while a human co-edits. Genuinely co-owned: AI typically drafts the whole thing, also makes targeted edits, also reacts to user edits.
3. Embedded figures are **live references** to project visualizations that re-render from current data (not static images) — same construct as figures in slide decks.
4. High-fidelity **Word/PDF export**.
5. Consistency with existing wb-fastr/panther patterns where it genuinely helps.

---

## 2. The core decision: data model

### Decision

**Store a report as a markdown `body` string + two embed registries (`figures` and `images`). No persisted block array.** Embeds are referenced inside the markdown as `![caption](figure:<id>)` / `![alt](image:<id>)` and resolved against the registries. Both reuse the slide types (`FigureBlock` / `ImageBlock`) verbatim — see §5.

```
Report
├── id, label, folderId, lastUpdated, config
├── body:    string                          // markdown; embeds as ![caption](figure:id) / ![alt](image:id)
├── figures: Record<figureId, FigureBlock>   // live data figures (slides' FigureBlock)
└── images:  Record<imageId, ImageBlock>     // uploaded images (slides' ImageBlock)
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

### Decision — client-side CodeMirror 6 editor with live, atomic figure widgets

**v1 is a single continuous CodeMirror 6 markdown surface where figures render as live inline widgets — never as raw `![](figure:id)` markdown.** This replaces the earlier "markdown↔preview toggle" idea: editing the prose *and* seeing the figures at the same time is the whole point, and the toggle showed confusing raw tokens in edit mode.

- **Built in the client, not in panther's `TextEditor`.** CM6 is already a direct client dependency (`codemirror`, `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-markdown`, `@codemirror/merge`). We drive an `EditorView` directly so we can add a **decoration extension**; panther's `TextEditor` wrapper exposes no way to pass extensions, and the figure widget is inherently client-coupled (it calls client-side `hydrateFigureInputsForRendering` + project state and mounts `<ChartHolder>`). *Not* "forget panther" wholesale — we still reuse panther's `parseMarkdown` (to locate `![](…)` token ranges), `ChartHolder` (live figures), and `MarkdownPresentationJsx` (the read-only / "preview" render and export-fidelity preview).
- **Figures as atomic widgets.** Each `![caption](figure:<id>)` / `![alt](image:<id>)` token range is replaced by a CM `Decoration.replace({ widget, block: true })` whose `WidgetType.toDOM()` returns a container we mount a Solid component into (`render(() => <ChartHolder chartInputs={…}/>, el)` for figures; `<img>` for images), disposed in the widget's `destroy()`. The token text still lives in the doc underneath (so `body` round-trips byte-stable); the widget is just its *rendering*. Widget identity via `eq()` keyed on id + inputs so the chart isn't torn down/re-rendered on every keystroke; `updateDOM()` for in-place updates; the range is atomic so the cursor skips it cleanly.
- **Each figure widget carries its own controls** (the "full-fledged figure editor"): change source (re-pick visualization / metric preset), edit caption, refresh-from-data, delete — wired to the `figures` registry. Delete removes the token (registry entry kept until load-time GC, per §11).
- **Body is a constrained markdown vocabulary — no arbitrary HTML.** Panther renders a fixed element set (`ParsedMarkdownItem`: headings, paragraphs, inline marks, lists, blockquotes, hr, code, math, image, table) identically across preview/PDF/Word; there is **no raw-HTML node**, and PDF/Word are a canvas page-renderer / docx-builder, not HTML engines. So raw `<div>`/`<iframe>` typed into the body will not render consistently and is not supported. **Embeds (figures/images) are the only escape hatch**, and they render only where we supply a renderer (the editor widget + the export resolver). Arbitrary DOM *inside a figure widget* is unrestricted (it's our `toDOM`); arbitrary HTML *as document content* is not.
- **Preview fidelity:** the in-editor widgets are an approximate (screen) render; they won't match paginated PDF/Word exactly (page breaks, figure sizing, fonts). A **"Preview as PDF"** button renders the real export output on demand. Accepted for v1.
- **Editor chrome conformance:** mounts in the existing editor shell (`getEditorWrapper()` / `FrameTop` toolbar, as the slide editor does); insert-figure / insert-image / "Preview as PDF" are `Button`s with `iconName`; figure picker via `openComponent()`. Bound by **§8.0 UI conformance**.
- **No in-house precedent + a small dep nit:** nothing in panther/client uses CM decorations today (net-new), and `@codemirror/view` should be added to `client/package.json` + the vite alias (currently only resolvable transitively).
- **Future (WYSIWYG, Phase 7):** promote the generic CM-widget shell into panther (figure resolution injected as a `renderEmbed` callback, mirroring `renderImage`), and/or swap to a ProseMirror block editor over the **same** `body`+registry storage. No data migration either way.

### How IDs behave across editing (the question we drilled into)

- **Figures keep their id via their token, always** — the `figure:<id>` text is the durable anchor; the widget is only its rendering, so the id survives every edit and round-trips byte-stable.
- **Prose needs no IDs in v1.** It's just the string between tokens; we don't persist per-paragraph identity. A full markdown→structure parse only happens for whole-document inputs (AI full draft, paste/import), where figures anchor exactly while prose is re-derived. Durable prose identity (for anchored comments) is a Phase-7 concern.
- **In the block-editor future:** block IDs would be node attributes maintained through transactions (split keeps the original's id + mints one for the new half; merge keeps the survivor's). Out of scope for v1.

---

## 4. Editing, persistence & concurrency model

### Decision

Human edits **autosave**; AI edits operate by **scoped rewrite, staged as a proposal the user accepts/rejects** — never silent mutation of the doc the user is editing. Both reach the document through **one write path** (the `body` signal → `updateReportBody`); the server is dumb persistence guarded by `lastUpdated`.

This is **not** a verbatim clone of the slide editor. The slide editor is a **modal, manual-Save** surface (open → edit, with AI writing into a shared `createStore` temp buffer → click Save / discard; `expectedLastUpdated` conflict modal). A long-form prose doc needs autosave (an explicit Save button is the wrong instinct), so the editing/persistence/concurrency layer below is net-new design; only the figure pipeline, export, data model, and CRUD plumbing clone slides.

### Why we still gate all AI edits (even though we own the `EditorView`)

Because we drive CM6 directly (§3), an AI edit is **no longer forced through a destructive full-document replace** — we *can* apply it as a targeted transaction (replace just the changed range, preserving cursor/selection/history). We nonetheless **gate every AI edit behind an explicit accept** (stage → diff → accept/reject), not because the editor forces it but because that's the correct co-editing model for long prose: the human may be typing in the seconds the AI takes to generate, so silently mutating the live doc is unacceptable regardless of editor capability. (Earlier drafts justified gate-all by a panther full-replace limitation; that limitation is gone, the *decision* stands on co-editing safety.) Silent small in-place AI edits remain deliberately out of scope for v1.

### Human editing — autosave

- Debounced `onChange` → `updateReportBody`; every save returns a fresh `lastUpdated` the client round-trips. **Decided: last-write-wins + non-blocking banner** (not hard-block). Mechanically, clone the `slides.ts` `expectedLastUpdated`/`overwrite` plumbing but drive it in **two modes on one endpoint**: **human autosave passes `overwrite: true`** → server compares stored `last_updated`, *writes anyway*, and returns a `conflicted` flag when the base was stale → client shows the banner (keystrokes are never blocked or lost); **the AI-apply path passes `overwrite: false`** → server hard-rejects a stale write with `{ success:false, err:"CONFLICT", data:{ currentLastUpdated } }` → AI re-reads (`get_report`) and regenerates. The plain `slide_decks.ts` unconditional `UPDATE` is insufficient — it can't detect the stale write the banner needs.
- **No lock for v1.** True multi-human simultaneous editing is out of scope. The realistic case is one author per report; design for it with the `lastUpdated` guard + a **non-blocking "someone else may be editing this report" banner** shown when a save sees an unexpected `lastUpdated` bump. Real presence/soft-locking is Phase 7 (net-new — nothing in wb-fastr locks today; the slide editor only shows a conflict modal).

### AI editing — own tools, staged, anchor-guarded

Tools are **our own** `createAITool` definitions (consistent with `project_ai`'s existing tool registry — we are **not** wiring panther's `createTextEditorHandler`/Anthropic str_replace schema, which doesn't fit our tool set). `rewrite_report` / `rewrite_section` / `insert_figure` stage a proposal; the editor renders a **diff**; **accept** applies the change as a **targeted CM transaction** (replace only the changed range → cursor/history preserved) and persists via `updateReportBody`, **reject** discards. Whole-doc `rewrite_report` also returns optional figures.

**The collision window is real even with gate-all — the anchor guard is load-bearing, not belt-and-suspenders.** AI generation takes seconds, and the human can keep typing in that latency between the tool reading the doc and the proposal landing. So every apply re-validates against the live body before committing:

- `rewrite_report` (whole-doc) → guard on **doc-level `lastUpdated`** (no per-section anchor possible). Advanced since the read → refuse, AI re-reads (`get_report`) and regenerates.
- `rewrite_section` → **address by heading** (per §10.4: heading + disambiguation index), but **guard on a snapshot/hash of that section's *content*** that the AI actually read — **not the heading.** A heading-only guard is a false negative: the heading can still match while the human rewrote the section body underneath, and accept would silently clobber their edits. Content-anchoring also gives the "no doc-level false positives" win — it refuses only when *that* section moved, not when a far-away paragraph changed.
- `insert_figure` → its `position` is **anchored to a heading / after-paragraph / live cursor, never a raw offset** (offsets shift when the human edits above — identical staleness problem). Adds a registry entry + inserts the token.

On any anchor/guard mismatch the tool **refuses and tells the AI the doc changed** → `get_report` → regenerate against the fresh base. Worst case is a "document changed, regenerating" reprompt; **never silent data loss.**

### Undo/redo

We own the `EditorView`, so human typing and accepted AI edits share **one CM history** — undo/redo just works, and an accepted AI edit is a clean transaction (one undo step, cursor preserved). The history covers the **body string only**: the **figure/image registry is not undoable** — a figure insert is two writes (token into the doc + registry entry) and only the token is in history; undoing the token leaves a harmless **orphan registry entry, pruned at next report load, not on autosave** (§11). Do not promise registry mutations are undoable.

### Net-new build flags (not free clones)

- `ReportMarkdownDiff.tsx` — **net-new** (nothing in the codebase renders an accept/reject diff today), **but `@codemirror/merge` is already a client dep** (`unifiedMergeView`) — prototype the markdown accept/reject diff on it rather than hand-rolling.
- The autosave + presence-banner + anchor-guard wiring — net-new (slides are modal/manual-Save with no anchor guard).

### Why

Notion ships block-level mutation in its *API* but deliberately does **not** let its AI agent use it — too conflict-prone during co-editing; the agent operates at page level (read page → write page). The Cursor / Anthropic `str_replace` "generate + apply, show a diff" pattern converges on the same answer: reliable AI editing of long text = scoped rewrite + diff, reconciled by the human. We keep that *shape* with our own tools. It also keeps the data model simple (prose needs no IDs).

---

## 5. Figure lifecycle — identical to slides (verified against the code)

**A report figure IS a slide `FigureBlock`.** Reuse the type and every function verbatim. There is no report-specific figure logic to design — only the markdown-token glue (3 small pieces below). Lift the types to a shared `lib/types/figures.ts` and re-export from slides.

The figure registry holds slide `FigureBlock`s: `figures: Record<figureId, FigureBlock>`. A figure's source is `FigureSource.from_data` (live/refreshable — the main case) or `FigureSource.custom` (static). **Images are a separate type, NOT a kind of figure** — reports keep `FigureBlock` and `ImageBlock` distinct exactly as slides do in `ContentBlock = TextBlock | FigureBlock | ImageBlock`. Images are covered in their own subsection below.

```ts
// lib/types/slides.ts today
export type FigureSource =
  | { type: "from_data"; metricId: string; config: PresentationObjectConfig;
      snapshotAt: string; indicatorMetadata?: IndicatorMetadata[] }   // live ref + snapshot
  | { type: "custom"; description?: string };

export type FigureBlock = {
  type: "figure";
  figureInputs?: FigureInputs;   // STORED, stripped for storage (no style/geoData) — the render payload
  source?: FigureSource;         // the live reference — enables refresh-from-data
};
```

Every stage reuses existing slide code (file paths are the real functions):

| Stage | Reuse | What it does |
|---|---|---|
| Pick from a saved visualization | `slide_deck/slide_ai/resolve_figure_from_visualization.ts` → `resolveFigureFromVisualization(projectId, block: AiFigureFromVisualization)` where `block = { type:"from_visualization"; visualizationId; replicant? }` (the literal `type` field is **required**) | fetch PO config+data → `getFigureInputsFromPresentationObject` → returns a `FigureBlock` |
| Pick from a metric/preset (AI) | `slide_deck/slide_ai/resolve_figure_from_metric.ts` → `resolveFigureFromMetric(projectId, block, metrics)` | same, building config from a preset |
| Store | `generate_visualization/strip_figure_inputs.ts` → `stripFigureInputsForStorage(fi)` | drops heavy `style` + map `geoData`; persist stripped `figureInputs` + `source` |
| Render live (editor) | one reusable **`ReportFigureEmbed`**: `await hydrateFigureInputsForRendering(fi, figureSourceToHydrationSource(source, formatAs), …)` → `<ChartHolder chartInputs={…} height="ideal" />` (reflow is the **default** — see sizing note) | a report embed is a **single figure** → `ChartHolder`, **NOT** slides' `PageHolder` / `convertSlideToPageInputs` (that's whole-page layout, wrong altitude). Hydration recomputes `style` from `source` + re-attaches map `geoData` (passing `source` is load-bearing). Wrap in panther `StateHolderWrapper` for loading/error. Copy-source: `DraftVisualizationPreview`'s private `FigureStateWrapper`/`fetchMetricFigure`. (`FigureRenderer` is a canvas Renderer object, not a JSX component.) |
| Refresh from current data | re-run `resolveFigureFrom*` | re-fetch items, regenerate `figureInputs`, new `snapshotAt` |
| Export (Word/PDF) | hydrate each figure → put the **hydrated `FigureInputs`** into a `FigureMap` (`Map<"figure:<id>", FigureInputs>`) | **Do NOT pre-rasterize.** `FigureMap` holds `FigureInputs`, not data URLs — the export rasterizes internally (Word) / vector-renders (PDF). `getFigureAsDataUrlBrowser(fi, widthPx)` returns an **`ImageMap`** value (`{dataUrl,width,height}`), so it belongs to the image path, not figures. Hand `body` + `figures` (FigureMap) + `images` (ImageMap) to `markdownToPdfBrowser`/`markdownToWordBrowser` |

The only **new** (report-specific) glue:
1. **Reference token** `![caption](figure:<figureId>)` in `body`; `<figureId>` is the registry key. Displayed caption comes from the figure's own config (as in slides); the markdown alt is decorative/fallback.
2. **`renderImage(src, alt)`** callback for `MarkdownPresentationJsx` — **synchronous** (`(src, alt) => JSX.Element | undefined`). It returns **`<ReportFigureEmbed>`** (the one reusable component), which self-manages the **async** hydration (`createSignal` + `onMount` → `await hydrateFigureInputsForRendering` → `<ChartHolder height="ideal" />` when ready). Flow: parse `figure:<id>` → registry lookup → `<ReportFigureEmbed>`. (Not a synchronous `<FigureRenderer>` — no such component.)
3. **Export resolver**: walk the `figures` registry, **hydrate** each entry, and put the hydrated `FigureInputs` into a `FigureMap` keyed by `"figure:<id>"` (export rasterizes). Separately walk the `images` registry → fetch asset → `{dataUrl,width,height}` into an `ImageMap` keyed by `"image:<id>"`. No manual figure rasterization.

**Figure embed sizing (decided):** `ReportFigureEmbed` uses panther's **`reflow`** mode (the default — pass no `sizing` prop) + `height="ideal"` in a `w-full` content column. Per `PROTOCOL_ALL_SIZING.md` rule 5 + `DOC_SIZING_MODEL.md`, the **editor is a reflow/readable surface** (alongside dashboards, public viewer): figures render at their authored, legibility-tuned DU sizes (1 DU = 1 CSS px), consistent across surfaces. **`zoom` is for thumbnails/grid-previews/pages only** — using it on a readable surface re-introduces the per-surface text-size drift the sizing refactor deleted. Note: export (PDF/Word) is a *separate* renderer (§5 export row), so the editor's sizing mode has **no** bearing on export — this is a readability choice, not a fidelity one.

Figure **picker** (net-new UI, **not** a clone): `create_slide_from_visualization_modal.tsx` returns `{ deckId }` and creates a whole *slide in a deck* — it is deck-coupled (`DeckSelector`, `convertAiInputToSlide`, `createSlide`, navigates to the deck on close) and does **not** produce a `FigureBlock`. Build a small report figure picker around `resolveFigureFromVisualization(projectId, block)` (the real `FigureBlock` producer), then add the registry entry + insert the token.

### Images — a separate type, reused verbatim from slides

An image is **not** a figure. Reports reuse the slide `ImageBlock` (`{ type:"image"; imgFile: string; style? }`) as-is, in a **separate** `images: Record<imageId, ImageBlock>` registry, referenced as `![alt](image:id)`. `imgFile` is an uploaded asset via the **existing asset/upload pipeline** (same as slides).

- **Preview:** the `renderImage(src)` callback also handles `image:<id>` → resolve the asset → `<img>` at content width.
- **Export:** images go through panther's `images` **`ImageMap`** keyed by the token src `"image:<id>"` → `{ dataUrl, width, height }` (fetch the asset from `imgFile`) — no figure rendering/rasterization; they are already images.
- **Inline only:** images flow at content width like every embed; `ImageBlock.style` (cover/contain/align) is slide-layout decoration not used in linear long-form — positioning arrives with the WYSIWYG/layout phase.

So embeds in a report are exactly the two non-text slide block types — `FigureBlock` (live data) and `ImageBlock` (uploaded image) — kept distinct, each with its own registry and token (`figure:id` / `image:id`).

### Tables & the supported markdown surface (decided)

Reports support the full markdown surface panther renders **consistently across all three outputs** — preview (`MarkdownPresentationJsx`), PDF (`buildMarkdownPageContents` → page renderer), Word (`word_builder`): headings, paragraphs, bold/italic/links/inline-code, bullet/numbered lists, blockquotes, horizontal rules, code blocks, inline/block math, images, and **tables**. (All three confirmed to render tables; `markdown_renderer.ts` auto-scales wide tables for PDF.)

**Markdown tables are allowed and always rendered — never blocked.** With 700+ users, a markdown table (human- or AI-authored) *will* occur, so it must simply work everywhere. We deliberately do **not** copy the slide `validateNoMarkdownTables` rule, and do **not** add a "detect data-looking table and reject" validator — that's brittle at scale (false positives), and a data table that slips through still renders correctly, just static (degraded, not broken).

**Figures remain the recommended path for data tables** (live, disaggregated, conditionally formatted, refreshable) — *encouraged, not enforced*. The AI system prompt guides: "tables of project/metric data → use a `from_metric` table figure; use markdown tables only for small static content (definitions, sources, keys)." The editor offers an obvious "insert data table (figure)" affordance. The robust principle: make the better path easy, never mandatory, and keep the worst case correct.

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

// Embeds reuse slides' FigureBlock and ImageBlock verbatim (see §5) — kept as distinct types.
export type ReportSummary = {                 // list view
  id: string; label: string; folderId: string | null; config: ReportConfig;
};
export type ReportDetail = {                  // editor/render
  id: string; label: string; body: string;
  figures: Record<string, FigureBlock>;       // live data figures (slides' FigureBlock)
  images: Record<string, ImageBlock>;         // uploaded images (slides' ImageBlock)
  config: ReportConfig; lastUpdated: string;
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
| Update images | `/reports/:report_id/images` | PUT | `{images}` | `{lastUpdated}` |
| Update config | `/reports/:report_id/config` | PUT | `{config}` | `{lastUpdated}` |
| Move to folder | `/reports/:report_id/folder` | PUT | `{folderId\|null}` | `{lastUpdated}` |
| Duplicate | `/reports/:report_id/duplicate` | POST | `{label, folderId?}` | `{newReportId, lastUpdated}` |
| Delete | `/reports/:report_id` | DELETE | — | — |
| Folder create/update/delete | `/report-folders[/:id]` | POST/PUT/DELETE | mirror `slide-deck-folders` | `{...}` |

Optimistic concurrency: every mutation returns a fresh `lastUpdated` ISO string; client caches and round-trips it (same as `slides`).

---

## 8. Proposed implementation path

Build server→types→state→list/routing→editor→export→AI in dependency order. The plumbing (Phases 1–3) is ~80% a clone of slide_deck.

### Phase 8.0 — UI conformance (binding — applies to every client component below)

All UI must satisfy the project's five UI docs; they are **binding, not advisory**:
`DOC_DESIGN_SYSTEM.md` (wb-fastr) + `panther/protocols/PROTOCOL_UI_COMPONENTS.md`, `PROTOCOL_UI_STYLING.md`, `PROTOCOL_UI_SOLIDJS.md`, `PROTOCOL_UI_STATE.md`.

Non-negotiables from those docs: **panther primitives over raw HTML** (`Button`, `Input`, `Select`, `TextArea`, `ButtonGroup`, `ModalContainer`/`AlertFormHolder`, `SelectList`, `DisplayTable`, `IconRenderer`, `FrameTop`/`HeadingBar`/`FrameLeftResizable`); **semantic colors only** (`primary`/`success`/`danger`/`neutral`, `base-100/200/300`, `base-content`) — never arbitrary `bg-[#…]`; **`ui-*` spacing** (`ui-pad`, `ui-gap`, `ui-spy`, …) — never `p-[23px]`; **sentence case** for all text ("Create report", not "Create Report"); borders `border-base-300`, `border-primary` only for selected/active; icons by name string; async mutations via `timActionForm`/`timActionDelete`/`timActionButton`; async data via `StateHolderWrapper`; modals via `openComponent()` returning `close(result?)`.

- **Cloned components conform by inheritance** (copy the slide_deck source, adjust types): `project_reports.tsx`, `add_report.tsx`, `duplicate_report_modal.tsx`, `move_report_to_folder_modal.tsx`, `edit_report_folder_modal.tsx`, `download_report.tsx`. No new design — match `project_decks.tsx` / its modals / `download_slide_deck.tsx` exactly (Pattern C list: `FrameTop`+`HeadingBar` → `FrameLeftResizable` grouping → `SelectionCircle` card grid + muted empty state).
- **Net-new components have no clone source — spec their primitives explicitly so they don't drift:**
  - `report_editor.tsx` — client-side CM6 editor (§3) mounted in `getEditorWrapper()`/`FrameTop` shell; toolbar insert-figure/insert-image/"Preview as PDF" = `Button` + `iconName`; figure picker = a **net-new** report picker around `resolveFigureFromVisualization` via `openComponent()` (not the deck-coupled slide modal). No mode toggle — figures render live in the edit surface.
  - `ReportMarkdownDiff.tsx` — build on `@codemirror/merge` `unifiedMergeView` (already a client dep; no hand-rolled diff primitive needed). Accept/reject = `Button` with `success`/`danger` intents; added/removed lines use semantic tokens (additions `success`-tinted, deletions `danger`-tinted), never literal green/red hex; labels sentence case; spacing `ui-*`.
  - `DraftReportPreview.tsx` — render via `MarkdownPresentationJsx` (same `renderImage` as the editor); "Create / Add to existing" actions = `Button`s via `timActionButton`.
  - **Presence banner** (§4) — a `neutral`-toned strip using semantic tokens + `ui-pad`/`ui-gap`; not an arbitrary-colored bar.

### Phase 0 — Shared figure types + confirm scaffolding
- Lift `FigureSource` / figure types from `lib/types/slides.ts` into a shared `lib/types/figures.ts`; re-export from slides to avoid breakage.
- Confirm & reuse existing scaffolding (appears already present — verify, don't assume):
  - `"reports"` is in the `TabOption` union (`client/src/state/t4_ui.ts`) — **but that's the only piece present.** There is **no** tab item or `<Match>` for reports in `client/src/components/project/index.tsx` yet (union order ≠ render order — the rendered order is the `tabItems()` array). Wiring the tab is Phase 3, not pre-existing.
  - `can_view_reports` / `can_configure_reports` permissions (`lib/types/permissions.ts`).
  - `AIContextViewingReports` / `AIContextEditingReport` (`client/src/components/project_ai/types.ts`) — the **type aliases exist** but are **commented out of the `AIContext` union**. ⚠️ Uncommenting them triggers a `never`-exhaustiveness compile error in `getModeInstructions` (`build_system_prompt.ts` — the `const _exhaustive: never` default) until the matching `case "viewing_reports"` / `"editing_report"` arms exist, so do the union uncomment + those cases together (Phase 6). `AIContextSync` (`project/index.tsx`) switches on **tab**, not `mode`, and has no exhaustiveness guard — it compiles regardless, but still needs a `reports` case added so the AI context syncs.

### Phase 1 — Server (clone slide_deck plumbing)
- **Migration** `server/db/migrations/project/020_reports.sql` (use `CREATE TABLE IF NOT EXISTS` — migrations re-run on fresh DBs): `report_folders` + `reports(id, label, body, figures, images, config, folder_id→report_folders ON DELETE SET NULL, last_updated)` + indexes. (`020` confirmed next free number.) **Also add the same two tables to the base schema `server/db/project/_project_database.sql`** — every project table is dual-homed there *and* in a migration (see `slide_decks`/`dashboards`). New project DBs run the base schema then all migrations, so a migration-only addition still creates the tables; but the base schema is the canonical snapshot and skipping it causes drift.
- **DB types** `server/db/project/_project_database_types.ts`: `DBReport`, `DBReportFolder` (`figures`/`images`/`config` stored as JSON strings).
- **DB modules** `server/db/project/reports.ts` + `report_folders.ts` (clone `slide_decks.ts` / `slide_deck_folders.ts`); zod-validate `figures`/`images`/`config` on write; `getAll`, `getDetail`, `create`, `updateLabel/Body/Figures/Images/Config`, `moveToFolder`, `duplicate`, `delete`. Export from `server/db/project/mod.ts`.
- **Routes** `server/routes/project/reports.ts` + `report_folders.ts` (clone `slide_decks.ts`); gate **reads** with `can_view_reports` and **mutations** with `can_configure_reports`; after mutations call `notifyLastUpdated(projectId, "reports", [id], lastUpdated)` + the list-refresh notify. ⚠️ The clone source is **inconsistent**: slide_decks calls `notifyLastUpdated` only on create/updateLabel/updatePlan/updateConfig (**not** move/duplicate/delete), and `deleteSlideDeck` returns no `lastUpdated`. Clone deliberately per-mutation; don't assume uniformity.
- **SSE** `server/task_management/notify_project_v2.ts`: add `notifyProjectReportsUpdated` / `notifyProjectReportFoldersUpdated`.
- **Dirty state** `server/task_management/get_project_dirty_states.ts` + `lib/types/project_dirty_states.ts`: add **only `"reports"`** to the `LastUpdateTableName` union/array + init/query blocks. **Do not add `"report_folders"`** — `slide_deck_folders` is deliberately *not* dirty-tracked (folders rely on the SSE list-refresh only); mirror that precedent.
- **Mount** routes in `main.ts`.

### Phase 2 — lib types + API registry
- `lib/types/reports.ts` (per §7); add `reports`/`reportFolders` to `ProjectState` and the `reports_updated`/`report_folders_updated` SSE message types in `lib/types/project_sse.ts`.
- `lib/api-routes/project/reports.ts` + `report-folders.ts` route registries; merge into `lib/api-routes/combined.ts` (client server-actions are codegen'd from this).

### Phase 3 — Client state, list UI, routing
- **Store** `client/src/state/project/t1_store.ts`: `reports: []` / `reportFolders: []` in empty state + reconcile cases for the two new SSE messages.
- **UI state** `client/src/state/t4_ui.ts`: `reportGroupingMode` / `reportSelectedGroup` signals + `updateProjectView` fields.
- **List + modals** (clone): `project_reports.tsx`, `add_report.tsx`, `duplicate_report_modal.tsx`, `move_report_to_folder_modal.tsx`, `edit_report_folder_modal.tsx`. Replace deck thumbnails with a text/figure preview.
- **Tab + routing** `client/src/components/project/index.tsx`:
  - Add the reports entry to `tabItems()` **as the first tab — above "Slide decks"** — gated on `can_view_reports`: `{ id: "reports", label: t3({ en: "Reports", fr: "Rapports" }), iconName: "report" }`.
  - Add the matching `<Match>` case **first in the Switch** (mirroring the `tabItems()` order), gated on `can_view_reports`, rendering `ProjectReports`.
  - `openReport()` via `openProjectEditor()`, and an `AIContextSync` case → `viewing_reports`.
- **Server actions** `client/src/server_actions/reports.ts` (or rely on codegen).

### Phase 4 — Editor component (client-side CM6, per §3)
- **Skeleton built + typechecks** (`client/src/components/report/`: `report_editor.tsx`, `figure_widget_extension.tsx`, `ReportFigureEmbed.tsx`). Compiling confirmed all the type-level API choices (StateField→block `Decoration.replace`, `WidgetType` overrides, `EditorView.decorations.from`/`atomicRanges`, Solid `render` mount, `ChartHolder`/hydration wiring). **Still runtime-unproven (needs a browser):** block-decoration line-boundary layout, atomic cursor/backspace/undo, Solid mount-in-widget reattach + `destroy()` disposing ChartHolder's ResizeObserver/GPU, `requestMeasure` after async settle, and the `@codemirror/view` duplicate-instance dedup (a runtime issue invisible to typecheck).
- Add `@codemirror/view` to `client/package.json` + the vite alias — a **runtime** requirement (avoids a 2nd `@codemirror/state`/`view` copy); typecheck resolves it transitively, so this only bites when it runs.
- `client/src/components/report/report_editor.tsx`: drive a CM6 `EditorView` directly (markdown language, `value=body`, debounced doc-change → `updateReportBody`). **Not** panther's `MarkdownTextEditor` wrapper — we need to attach a decoration extension.
- **Figure/image widget extension:** a `ViewPlugin`/`StateField` that scans for `![…](figure:<id>)` / `![…](image:<id>)` token ranges (via panther `parseMarkdown` or a token regex) and emits `Decoration.replace({ widget, block: true })`. The `WidgetType`:
  - `toDOM()` → container; mount **`<ReportFigureEmbed>`** (figures) / `<img>` (images) via Solid `render(() => …, el)`. `ReportFigureEmbed` self-hydrates and renders `<ChartHolder height="ideal" />` (reflow default — §5 sizing note). Dispose the Solid root in `destroy()`. Call `view.requestMeasure()` when the figure's height settles (ChartHolder lays out async; block widgets need a measure on height change).
  - `eq(other)` keyed on id + (hydrated) inputs so the chart isn't rebuilt on unrelated keystrokes; `updateDOM()` for in-place updates; atomic range so the cursor skips it.
  - Widget chrome = the figure controls (change source / caption / refresh / delete), wired to the `figures` registry.
- Embed insertion: figure picker (net-new UI around `resolveFigureFromVisualization`, **not** the deck-coupled slide modal — see §5) adds a `FigureBlock` + inserts `![caption](figure:id)`; image upload (existing asset pipeline) adds an `ImageBlock` + inserts `![alt](image:id)`.
- Read-only / preview render reuses panther `MarkdownPresentationJsx` + the `renderImage(src, alt)` callback (sync → returns an async wrapper that hydrates → `<ChartHolder>`; `image:<id>` → `<img>`).
- AI context: expose `mode: "editing_report"`, `getBody()`, `getFigures()`, `getImages()`, plus selection (CM `onSelectionChange`).

### Phase 5 — Export (Word/PDF)
- `client/src/exports/export_report_as_pdf.ts`: resolve `figures`→`FigureMap` (**hydrated `FigureInputs`, not rasterized**) and `images`→`ImageMap`, then `markdownToPdfBrowser(body, { figures, images, fontPaths: { basePath: "/fonts", fontMap: fontMap.ttf }, style, pageBreakRules })`. `fontPaths` is **required**. Reuse `client/src/font-map.json` (the `{ basePath, fontMap.ttf }` shape matches the slide-deck export). ⚠️ Keep `asSlides` unset/false — when true, panther splits the body on `\n---\n`, turning markdown horizontal rules into page breaks.
- `client/src/exports/export_report_as_word.ts`: `markdownToWordBrowser(body, { figures, images, wordConfig, style })`. ⚠️ Word `style` is `CustomMarkdownStyleOptions`; PDF `style` is `CustomStyleOptions` (a wrapper with `.markdown` / `.page`) — **different types, do not share one `style` object** across the two exports.
- **Note: reports are the *first* code in the app to call `markdownToPdfBrowser` / `markdownToWordBrowser`.** The existing slide-deck exports use `convertSlideToPageInputs` + `PageRenderer` (PDF) — *not* these functions; only the `fontPaths` shape is shared. Treat this whole export path as **net-new and unproven here**, not a mechanical clone (budget integration + fidelity time — see §11).
- `client/src/components/report/download_report.tsx`: clone `download_slide_deck.tsx` (format radio, progress, errors).

### Phase 6 — AI tools
- Uncomment/define `AIContextViewingReports` + `AIContextEditingReport` (`project_ai/types.ts`).
- `project_ai/ai_tools/tools/reports.ts`:
  - `get_available_reports` (always on, read-only list).
  - `get_report(reportId)` — fetch body + figures + images; "call first before editing".
  - `create_report(label, markdown, figures?)`.
  - `rewrite_report(reportId, markdown)` — whole-body rewrite → **diff preview, accept/reject**.
  - `rewrite_section(reportId, sectionHeading, newMarkdown)` — heading-bounded → diff preview.
  - `insert_figure(reportId, figureId, figureSource, caption?, position?)` — add registry entry + insert token.
  - `show_draft_report_to_user(label, markdown, figures?)` — inline rendered preview + "Create / Add to existing".
- `project_ai/ai_tools/validators/report_validators.ts`: every `![](figure:id)` / `![](image:id)` resolves in its registry; unique ids; max body length; no unresolved/orphan tokens before persist. (Images are user-uploaded, not AI-generated — the AI references existing image ids but doesn't create images.)
- `project_ai/build_tools.ts`: register `getToolsForReports` / `getToolsForReportEditor`; add `reports` to `BuildToolsParams`.
- `project_ai/build_system_prompt.ts`: `viewing_reports` / `editing_report` mode instructions; add "Available reports: N" to project context.
- Diff/preview components: `DraftReportPreview.tsx` (reuses `MarkdownPresentationJsx` + `renderImage`); `ReportMarkdownDiff.tsx` (build on `@codemirror/merge` `unifiedMergeView` — already a client dep).

### Phase 7 — Future (not v1)
- WYSIWYG block editor (ProseMirror) over the same `body`+`figures`+`images` storage; figures/images as custom nodes. (v1 already owns a CM6 `EditorView`, so this is an editor swap, not a new integration.)
- Anchored comments / threads (introduces persisted prose identity — add hidden IDs or a CRDT layer then).
- Promote the v1 CM6 figure-widget editor shell into panther (figure resolution injected as a `renderEmbed` callback, mirroring `renderImage`) so other apps reuse it.

---

## 9. File manifest (new = N, modify = M)

**Server:** `migrations/project/020_reports.sql` (N) · `db/project/_project_database_types.ts` (M) · `db/project/reports.ts` (N) · `db/project/report_folders.ts` (N) · `db/project/mod.ts` (M) · `routes/project/reports.ts` (N) · `routes/project/report_folders.ts` (N) · `task_management/notify_project_v2.ts` (M) · `task_management/get_project_dirty_states.ts` (M) · `main.ts` (M)

**lib:** `types/reports.ts` (N) · `types/figures.ts` (N, lifted) · `types/slides.ts` (M, re-export) · `types/project_sse.ts` (M) · `types/project_dirty_states.ts` (M) · `api-routes/project/reports.ts` (N) · `api-routes/project/report-folders.ts` (N) · `api-routes/combined.ts` (M)

**client:** `state/project/t1_store.ts` (M) · `state/t4_ui.ts` (M) · `components/project/index.tsx` (M) · `components/project/project_reports.tsx` (N) · `add_report.tsx` (N) · `duplicate_report_modal.tsx` (N) · `move_report_to_folder_modal.tsx` (N) · `edit_report_folder_modal.tsx` (N) · `components/report/report_editor.tsx` (N) · `components/report/download_report.tsx` (N) · `exports/export_report_as_pdf.ts` (N) · `exports/export_report_as_word.ts` (N) · `server_actions/reports.ts` (N) · `components/project_ai/types.ts` (M) · `ai_tools/tools/reports.ts` (N) · `ai_tools/validators/report_validators.ts` (N) · `build_tools.ts` (M) · `build_system_prompt.ts` (M) · `DraftReportPreview.tsx` (N) · `ReportMarkdownDiff.tsx` (N) · `components/report/ReportFigureEmbed.tsx` (N, the one reusable FigureBlock→live-`ChartHolder` component) · `package.json` (M, add `@codemirror/view`) · `vite.config.ts` (M, alias)

Rough scope: ~15 new + ~14 modified files. Phases 1–3 (server/types/state/list) are mostly mechanical slide_deck clones; the **editor (CM6 figure widgets), export (`markdownTo*Browser`), and AI diff are net-new** — not clones (see §3/§5/§11).

---

## 10. Open questions / to confirm before/while building

1. **Prose granularity** — *Decided: non-blocking, no storage impact.* When structure is needed (export pagination, future editor) use panther's `ParsedMarkdownItem[]` element split. Revisit only at the WYSIWYG phase.
2. **`ReportConfig` scope** — *Decided: fixed minimal style, no per-report config in v1.* Reports export with one built-in style — **A4, standard margins, default typography from `font-map.json`**; no theme picker. Per-report theming/header-footer (reusing slide-deck style presets) is a later phase.
3. ~~Figure picker source~~ — **settled: figure/image *data* works exactly like slides** (`FigureBlock` via `resolveFigureFrom*`; `ImageBlock` via the asset-upload pipeline). See §5. **Correction:** the picker *UI* is net-new — `create_slide_from_visualization_modal.tsx` is deck-coupled and returns `{ deckId }`; it does **not** yield a `FigureBlock`. Wrap `resolveFigureFromVisualization` in a small report picker instead.
4. **`rewrite_section` addressing vs. guarding** — *Decided:* two distinct roles (see §4). **Address** by heading text; non-unique heading → require a disambiguating index (Nth occurrence) or fall back to whole-doc `rewrite_report`; never guess. **Guard** staleness on a snapshot/hash of the section's *content* (not the heading — heading-only is a false negative that silently clobbers edits made under an unchanged heading).
5. **Naming hygiene** — *Verify at build:* keep new public types named `Report*`; `lib/types/slides.ts` `DeckSummary.reportId` is an unrelated existing field — avoid type/identifier collisions when wiring AI context.
6. **Permissions** — *Confirmed (no action):* `can_view_reports` / `can_configure_reports` already exist in `lib/types/permissions.ts` and are seeded in `project_user_roles` + presets server-side.
7. **Resolved (decisions round):** **Editor** — client-side CM6 with live atomic figure widgets (§3). **Folders** — included in v1 (clone slide-deck folders). **Conflicts** — last-write-wins + non-blocking banner (§4). **AI authoring** — AI always stages a diff/preview (never silent create/mutate) and may author `from_metric`/`from_visualization` figures; images are user-upload only (AI references existing ids). **Captions** — rendered from the markdown `![caption]` alt, falling back to the figure's own title. **Figure sizing** — `reflow` (default) + `height="ideal"` in a `w-full` content column; editor is a reflow/readable surface per `PROTOCOL_ALL_SIZING.md` (zoom is for thumbnails/pages). No per-figure controls (defer to WYSIWYG). One reusable `ReportFigureEmbed` (`ChartHolder`, **not** slides' `PageHolder`) used by the CM widget, the preview `renderImage`, and `DraftReportPreview`. **Starting content** — new report scaffolds `# {label}` + empty intro. **Diff** — `@codemirror/merge` (`unifiedMergeView`), no new dependency. **Figure GC** — orphans pruned at report load, not autosave (§11). **No arbitrary HTML** — body is the fixed markdown vocabulary; embeds are the only escape hatch (§3).

---

## 11. Risks

- **Export fidelity gap** — what the live editor preview shows vs. what panther's paginated Word/PDF produces (page breaks, figure sizing, fonts) will differ; budget time to tune `style` / `pageBreakRules` and figure DPI.
- **Figure resolution cost** — exporting re-renders/rasterizes every figure; large reports may need batching/progress UI (the download modal already has a progress pattern).
- **Referential integrity / figure GC** — two cases, handled asymmetrically. A **broken token** (a `figure:id`/`image:id` token in `body` with no registry entry) must *never* be persisted → validate before every save; if the AI emits one, refuse. An **orphan entry** (registry entry no token references) is harmless — not rendered, not exported — and must **NOT** be GC'd on autosave: doing so breaks undo (delete figure → autosave prunes entry → Ctrl+Z restores the token → broken token = lost figure). **Decided: prune orphan entries only at report load** (fresh session ⇒ empty undo history ⇒ any orphan is truly unreachable); keep them for the whole editing session. They're cheap (stripped `figureInputs`).
- **Editor evolution** — the v1 CM6 widget editor must not bake in assumptions that block the later ProseMirror swap or the promote-to-panther move; keep `body`+`figures` as the only persisted truth.
- **Export path is net-new, not a proven clone** — reports are the first code to call `markdownToPdfBrowser`/`markdownToWordBrowser`; the slide exports use a different mechanism (`PageRenderer` / `convertSlideToPageInputs`). Only the `fontPaths` shape is shared. Expect more integration/fidelity work than "clone slides".
- **The figure-widget editor is net-new (no in-house precedent)** — nothing in panther/client uses CM decorations today. The real work is widget lifecycle (`eq`/`updateDOM`/atomic ranges so charts don't rebuild on every keystroke), cursor behavior around atomic widgets, and the async-hydrate-inside-`toDOM` mount/dispose. Prototype this slice first to de-risk.
- **`asSlides` footgun** — the report PDF/Word calls must keep `asSlides` false; otherwise markdown horizontal rules (`---`, an explicitly supported element) silently become page breaks.
