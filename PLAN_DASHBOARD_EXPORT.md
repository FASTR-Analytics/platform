# PLAN — Dashboard PDF / PPTX Export (v2)

Status: **proposed** (awaiting build). Owner: client/export. **No panther changes required.**

> v2 supersedes v1 after two adversarial reviews. Key change: **PDF and PPTX both use the panther
> *page pipeline*** (not the markdown pipeline for PDF). This fixes the two defects the reviews found —
> silently-wrong figure fonts (D1) and About-heading page-break shredding (D2) — and unifies both
> formats behind one `PageInputs[]` builder, with zero panther changes. See §10 for the review log.

## 1. Goal

The public dashboard viewer ([`client/src/components/public_viewer/dashboard.tsx`](client/src/components/public_viewer/dashboard.tsx))
currently downloads **one figure as PNG**. Add **PDF** and **PPTX** download, where:

- **PDF** — all dashboard figures as separate pages, OR just the currently-shown viz; optional
  "About" frontmatter (a title-only cover + the About summary/body).
- **PPTX** — multiple figures on separate slides, OR a single figure as a one-slide deck; same
  optional frontmatter.
- **PNG** — unchanged (single figure), now reached through the same unified modal.

## 2. Locked product decisions (from two rounds of Q&A)

1. **One modal with a scope toggle.** Format (PNG / PDF / PPTX) + Scope (This viz / All figures) +
   "Include About". No second "download all" modal.
2. **No table of contents.** Frontmatter = About content only.
3. **Title-only cover, no logos** (branding logos out of scope for v1).
4. **Replicant groups in "All figures" export every variant** (one page/slide per member). The modal
   shows the total figure count and **requires a confirm above a threshold** (e.g. > 50 figures).
5. **A figure that fails to render becomes a placeholder page** ("Figure X failed to render") and the
   export continues — one bad chart never discards the whole export.

## 3. Background — the panther page pipeline (the one we use for both formats)

Both PDF and PPTX consume a `PageInputs[]` array:

- `pagesToPdfBrowser(pages, width, height, fonts, fontPaths)` → vector PDF (figures drawn as native
  jsPDF ops via `PageRenderer`, [`panther/_122_pdf/pages_to_pdf.ts:27-33`](panther/_122_pdf/pages_to_pdf.ts#L27-L33)).
- `pagesToPptxBrowser(pages, width, height)` → native `.pptx`; figures rasterized to PNG-on-slide at
  DPI 96 ([`panther/_122_pptx/render_freeform_slide.ts:409-422`](panther/_122_pptx/render_freeform_slide.ts#L409-L422)).

Verified facts (file:line):

- A `PageContentItem` can **be** a `FigureInputs` directly, or a markdown block —
  `PageContentItem = MarkdownRendererInput | FigureInputs | PageImageInputs | PageSpacerInputs`
  ([`panther/_121_page/types.ts:74-88`](panther/_121_page/types.ts#L74-L88)).
  `MarkdownRendererInput = { markdown: string; style?; images?; autofit? }`
  ([`panther/_105_markdown/types.ts:57-62`](panther/_105_markdown/types.ts#L57-L62)).
- `FreeformPageInputs.content: LayoutNode<PageContentItem>`
  ([`types.ts:141-150`](panther/_121_page/types.ts#L141-L150)); `CoverPageInputs` has `{title, …}`
  ([`types.ts:124-138`](panther/_121_page/types.ts#L124-L138)). **`style` is optional** on every page
  type; `measurePage` fills merged defaults, so a page with no `style` does **not** throw.
- `createItemNode(data, options?)` (alias `cItem`) builds an item node with an auto UUID
  ([`panther/_008_layouter/id.ts:19-60`](panther/_008_layouter/id.ts#L19-L60)). Under strict TS, use
  `createItemNode(figureInputs as PageContentItem)`.
- **Fonts for the vector PDF** are explicit: `getFontsForPage(page)` walks figure nodes and returns
  the real `CustomFigureStyle` fonts ([`panther/_121_page/extract_fonts.ts`](panther/_121_page/extract_fonts.ts),
  exported via `mod.ui.ts`). `deduplicateFonts` is exported from `_001_font`. `getAllSlideFontVariants`
  ([`lib/types/_slide_fonts.ts:39`](lib/types/_slide_fonts.ts#L39)) gives a baseline family's variants.
  An unmapped font throws a **catchable** "Font not found in map" at registration
  ([`create_pdf_render_context_browser.ts:62-68`](panther/_301_util_funcs/create_pdf_render_context_browser.ts#L62-L68)).
- Markdown→pages helpers exist (for paginating long About text): `buildMarkdownPageContents`
  ([`panther/_105_markdown`](panther/_105_markdown/build_markdown_pages.ts)) + `buildFreeformPages`
  ([`panther/_121_page/build_freeform_pages.ts`](panther/_121_page/build_freeform_pages.ts)), both exported.
- Page model is size-agnostic. PDF uses A4-ish `1000 × 1414`; PPTX uses `PAGE_WIDTH_DU=1400 × PAGE_HEIGHT_DU=787`
  (16:9). One `PageInputs[]` renders at either geometry (content fits the passed bounds).
- `/fonts` is served to the public route ([`client/public/fonts/`](client/public/fonts/) via Vite);
  `font-map.json` is a bundle import (`~/font-map.json` → `client/src/font-map.json`, `fontMap.ttf` is
  `Record<fontId,path>`). Dashboard figures default to "International Inter"
  ([`get_style_from_po/_0_common.ts:28`](client/src/generate_visualization/get_style_from_po/_0_common.ts#L28)),
  covered by `fontMap.ttf`.
- The dashboard **already hydrates every figure client-side** (`itemFigureInputs →
  hydrateFigureInputsForPublicRendering`, [`dashboard.tsx:370-376`](client/src/components/public_viewer/dashboard.tsx#L370-L376)) →
  **zero new fetches, zero drift.**
- **Ordering/completeness is safe:** `buildPublicDashboardBundle` filters non-`from_data` items
  upstream of both screen and export ([`lib/types/dashboard.ts:187-233`](lib/types/dashboard.ts#L187-L233)),
  and `entries[]`/`items[]` come from the same sorted pass — the export sees exactly the on-screen set,
  in order, dropping nothing. (Keep the model **bundle-only** to preserve this.)

## 4. Architecture — unified page pipeline

```text
buildDashboardExportModel(bundle, scope, currentItemId?)   →  { title, summary, about, figures[] }
        │
buildDashboardPages(model, { includeAbout })               →  PageInputs[]   (shared by both formats)
        ├── exportDashboardAsPdf   → pagesToPdfBrowser(pages, 1000, 1414, fonts, fontPaths)
        └── exportDashboardAsPptx  → pagesToPptxBrowser(pages, 1400, 787)

(PNG, single figure only)          → getFigureAsBase64 → downloadBase64Image
```

## 5. Components

### 5.1 Shared model — `client/src/exports/_dashboard_export_model.ts` (new)

```ts
type DashboardExportFigure = { id: string; label: string; figureInputs: FigureInputs };
type DashboardExportModel = {
  title: string;
  summary: string;      // bundle.about.summary  (was dropped in v1 — M3)
  about: string;        // bundle.about.body
  figures: DashboardExportFigure[];
};

buildDashboardExportModel(bundle, scope: "all" | "current", currentItemId?): DashboardExportModel
```

- `scope:"all"` → walk `bundle.entries[]` in order; `kind:"item"` → one figure (label = item label);
  `kind:"group"` → one figure per member, **label = `${group.label} — ${replicantLabel(group, member)}`**
  (lift `replicantLabel` out of [`dashboard.tsx:360-368`](client/src/components/public_viewer/dashboard.tsx#L360-L368)
  into this module).
- `scope:"current"` → single figure for `currentItemId`.
- `figureInputs` from the existing `itemFigureInputs(item)` — **no fetch, no re-hydration.**
- `aboutMarkdown(model)` helper → `[summary, about].filter(s => s.trim()).join("\n\n")`.

### 5.2 Shared page builder — `client/src/exports/_dashboard_pages.ts` (new)

```ts
buildDashboardPages(model, opts: { includeAbout: boolean }): PageInputs[]
```

- If `scope=all` (model has cover context): push `{ type:"cover", title: model.title }` (title-only).
- If `includeAbout` && `aboutMarkdown(model).trim()`: append About page(s). v1: a single
  `{ type:"freeform", content: createItemNode({ markdown: aboutMarkdown(model), style: {…Inter…} }) }`.
  (If About proves to overflow in practice, paginate via `buildMarkdownPageContents` +
  `buildFreeformPages` — both exported — without changing callers.)
- Per figure: `{ type:"freeform", header: label, content: createItemNode(figureInputs as PageContentItem), style: <explicit Inter page style> }`,
  baking white background + margin onto the figure via the `figureInputsForDownload` surrounds pattern
  ([`dashboard.tsx:382-398`](client/src/components/public_viewer/dashboard.tsx#L382-L398)).
- **Render guard (decision §2.5):** wrap each figure's page construction in try/catch; on throw,
  substitute a placeholder page (`{ type:"freeform", header: label, content: createItemNode({ markdown:
  "_Figure failed to render._" }) }`). (Most figure errors surface at render time, so the placeholder is
  produced by catching during `pagesToPdf/Pptx`; if panther renders lazily, pre-measure each figure with
  `FigureRenderer.getIdealHeight` to detect failures up front — confirm during build.)

### 5.3 PDF — `client/src/exports/export_dashboard_as_pdf.ts` (new)

```ts
exportDashboardAsPdf(model, opts: { includeAbout }, progress): Promise<APIResponseNoData>
```

- `const pages = buildDashboardPages(model, opts);`
- `const fonts = deduplicateFonts([...getAllSlideFontVariants("International Inter"), ...pages.flatMap(getFontsForPage)]);`
- `const pdf = await pagesToPdfBrowser(pages, 1000, 1414, fonts, { basePath: "/fonts", fontMap: fontMap.ttf });`
- `pdf.save(`${filename}.pdf`)`. Try/catch → `APIResponseNoData`; the "Font not found in map" throw is
  now **catchable** here → surface "a chart uses a font not available for PDF export (X)".

### 5.4 PPTX — `client/src/exports/export_dashboard_as_pptx.ts` (new; mirrors [`export_slide_deck_as_pptx.ts`](client/src/exports/export_slide_deck_as_pptx.ts))

```ts
exportDashboardAsPptx(model, opts: { includeAbout }, progress): Promise<APIResponseNoData>
```

- `const pages = buildDashboardPages(model, opts);`
- `const pptx = pagesToPptxBrowser(pages, PAGE_WIDTH_DU, PAGE_HEIGHT_DU);`
- `pptx.write({ outputType: "blob" })` → `saveAs(blob, filename + ".pptx")`. No fonts needed
  (canvas raster + native text) → immune to the font caveat.

### 5.5 PNG — unchanged logic, relocated into the modal

`figureInputsForDownload(transparent, padding)` → `getFigureAsBase64(fi, FIGURE_EXPORT_WIDTH_PX)` →
`downloadBase64Image`. Single figure only (Scope forced to "This viz"); keeps Background/Margin radios.

### 5.6 Modal — `client/src/components/public_viewer/download_dashboard_modal.tsx` (new; replaces `download_figure_modal.tsx`)

`EditorComponentProps<{ bundle: PublicDashboardBundle; currentItemId?: string }, undefined>`. Reuses
the [`download_report.tsx`](client/src/components/report/download_report.tsx) progress pattern
(pct/err signals; buttons hidden while `pct>0`; progress bar; `StateHolderFormError`). Runs the export
**internally**, `p.close(undefined)` on success.

Controls & rules:

- **Format**: PNG / PDF / PPTX. **Default is context-dependent** — PNG when opened with a current item
  (per-figure / sidebar entry, preserving the 1-chart common case); PDF when opened with no current item
  (grid header, where PNG-all is impossible).
- **Scope**: This viz / All figures. **When `currentItemId` is undefined, the "This viz" option is
  omitted** (RadioGroup has no per-option disable — reviewer #1 §9). PNG forces Scope = This viz.
- **Include About**: shown only when Format ∈ {PDF, PPTX} **and** Scope = All; hidden/no-op when
  `aboutMarkdown` is empty. Default ON.
- **Background / Margin**: shown only when Format = PNG.
- **Figure-count confirm (decision §2.4):** when Scope = All, show "This will export N figures"; if
  N > 50, require an explicit confirm before running.

Filename: scope=all → sanitized `bundle.title`; scope=current → sanitized item label. Use a strict
sanitizer (allowlist `[\w\-]+`, collapse runs, fallback `"dashboard"`/`"figure"`) — the current
`.replace(/\s+/g,"_")` ([`dashboard.tsx:408`](client/src/components/public_viewer/dashboard.tsx#L408))
leaves `/`, `:`, emoji, and RTL marks (m4).

### 5.7 Wiring in `dashboard.tsx`

Every download button opens `DownloadDashboardModal` (`openComponent`; `AlertProvider` already mounted
at [`dashboard.tsx:64`](client/src/components/public_viewer/dashboard.tsx#L64)).

- **Sidebar** — **reuse the existing header Download button**
  ([`dashboard.tsx:122-132`](client/src/components/public_viewer/dashboard.tsx#L122-L132)); open the modal
  with `currentItemId = currentItem().id`, default Scope = This viz. **No second button.**
- **Grid** — per-tile buttons (`ItemTile`, `GroupTile`) open the modal with that tile's current item id
  (`GroupTile` passes its locally-selected replicant member's id), Scope = This viz. **Add one**
  header-level Download button (the only genuinely new button), `currentItemId` undefined, default
  Scope = All. **Hide it when `bundle.items.length === 0`** (m1).

## 6. Files

New: `_dashboard_export_model.ts`, `_dashboard_pages.ts`, `export_dashboard_as_pdf.ts`,
`export_dashboard_as_pptx.ts`, `download_dashboard_modal.tsx`.
Modified: `dashboard.tsx` (swap modal; sidebar reuse; grid header button + per-tile repoint).
Removed/folded: `download_figure_modal.tsx`.

Reused as-is: `pagesToPdfBrowser`, `pagesToPptxBrowser`, `getFontsForPage`, `deduplicateFonts`,
`getAllSlideFontVariants`, `createItemNode`/`cItem`, `saveAs`, `downloadBase64Image`,
`getFigureAsBase64`, `FIGURE_EXPORT_WIDTH_PX`, `PAGE_WIDTH_DU`, `PAGE_HEIGHT_DU`, `font-map.json`,
`figureInputsForDownload`, `replicantLabel`, `itemFigureInputs`.

## 7. Risks & mitigations (post-review)

- **PDF font coverage** — figure fonts are now explicitly registered via `getFontsForPage`; a font
  outside `fontMap.ttf` throws a **catchable** error at registration (we surface it cleanly). Default
  Inter is covered. PPTX is immune.
- **About markdown images** — a real `![](url)` in the About body is dropped (no ImageMap passed;
  panther drops unmatched image src). v1: document it / strip; (future) build an ImageMap like
  [`_report_export_maps.ts:31-65`](client/src/exports/_report_export_maps.ts#L31-L65). Links render as text.
- **Large groups** — "all" can be hundreds of pages/slides + a multi-second main-thread render. Mitigated
  by the count + confirm (§2.4) and per-figure progress yields (`setTimeout(0)`), and bounded only by the
  user's confirm.
- **One bad figure** — placeholder-and-continue (§2.5) instead of aborting.
- **PPTX raster fidelity** capped at DU size × DPI 96; dense tables may look soft (future: panther
  `dpi?` param). Adequate at 1400px for v1.
- **About length** — single freeform page may clip a very long About; switch to
  `buildMarkdownPageContents`+`buildFreeformPages` pagination if needed (no caller change).

## 8. Out of scope (future)

Page-numbered/clickable TOC (needs a `_105_markdown` heading-collector); branding logos on the cover
(`CoverPageInputs.titleLogos`, async load); per-figure-aspect single-viz PDF page; higher PPTX DPI;
About-image ImageMap.

## 9. Build order

1. `_dashboard_export_model.ts` (+ lift `replicantLabel`, add `summary`, "Group — Replicant" labels).
2. `_dashboard_pages.ts` (cover + About page(s) + per-figure pages + placeholder guard).
3. `export_dashboard_as_pdf.ts` (`getFontsForPage` + `deduplicateFonts` + `pagesToPdfBrowser`).
4. `export_dashboard_as_pptx.ts` (`pagesToPptxBrowser`).
5. `download_dashboard_modal.tsx` (format/scope/About + count-confirm + progress; context-dependent
   defaults; omit "This viz" when no current item; strict filename sanitizer).
6. Wire `dashboard.tsx` (sidebar reuse; grid header button hidden on empty; per-tile repoint).
7. Verify: PDF (vector figures incl. a non-default-font chart → confirm correct render or catchable
   error; About summary+body; page count) and PPTX (cover + figure slides) across all/current × About
   on/off, incl. a map figure, a large replicant group (count-confirm path), and a deliberately broken
   figure (placeholder path).

## 10. Adversarial review log

Two independent reviewers (technical-contract + product/data) stress-tested v1.

- **D1 (both, MAJOR/BLOCKER):** `markdownToPdfBrowser` registered only style fonts, not embedded figure
  fonts → non-default-font charts silently rendered in Helvetica; v1's "Font not found" mitigation
  guarded a throw that never fired. **Fixed** by the page pipeline + `getFontsForPage`.
- **D2 (product, BLOCKER):** `h2AlwaysNewPage` also broke on `##` inside the author's About body →
  shredded frontmatter. **Fixed** by dropping the markdown-for-PDF approach (figures are one-per-page by
  construction).
- Corrected a reviewer claim: page-pipeline PDF figures are **vector**, not rasterized — the font fix is
  explicit registration, not rasterization.
- **M3** (export `summary`, not just `body`), **M4** (context-dependent default + omit "This viz"),
  **M1/M2** (group-scope = every-variant + count/confirm — user decision), **M6** (placeholder-and-continue
  — user decision), **m1** (hide header button on empty), **m3** ("Group — Replicant" labels), **m4**
  (strict filename), **m5** (About images dropped — documented): all folded into v2.
- **m8 (good news):** ordering/silent-drop already safe — bundle filters upstream of both screen and export.
