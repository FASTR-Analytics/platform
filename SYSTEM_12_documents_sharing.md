---
system: 12
name: Documents & Sharing
globs:
  - client/src/components/PasswordGate.tsx
  - client/src/components/_markdown_guide.tsx
  - client/src/components/_shared/**
  - client/src/components/dashboards/**
  - client/src/components/forms_editors/edit_label.tsx
  - client/src/components/layout_editor/**
  - client/src/components/project/add_deck.tsx
  - client/src/components/project/add_report.tsx
  - client/src/components/project/fastr_theme_mock.tsx
  - client/src/components/project/report_style_picker.tsx
  - client/src/components/project/report_style_editor.tsx
  - client/src/components/project/duplicate_deck_modal.tsx
  - client/src/components/project/duplicate_report_modal.tsx
  - client/src/components/project/edit_deck_folder_modal.tsx
  - client/src/components/project/edit_report_folder_modal.tsx
  - client/src/components/project/move_deck_to_folder_modal.tsx
  - client/src/components/project/move_report_to_folder_modal.tsx
  - client/src/components/project/project_dashboards.tsx
  - client/src/components/project/project_decks.tsx
  - client/src/components/project/project_reports.tsx
  - client/src/components/public_viewer/**
  - client/src/components/report/**
  - client/src/components/slide_deck/*.ts
  - client/src/components/slide_deck/*.tsx
  - client/src/components/slide_deck/slide_editor/**
  - client/src/components/slide_deck/slide_transforms/**
  - client/src/components/slide_deck/style_editor/**
  - client/src/state/project/t2_dashboards.ts
  - client/src/state/project/t2_slide_decks.ts
  - client/src/state/project/t2_slides.ts
  - lib/types/_dashboard_config.ts
  - lib/types/_slide_config.ts
  - lib/types/_slide_deck_config.ts
  - lib/types/dashboard.ts
  - lib/types/reports.ts
  - lib/types/report_fastr_themes.ts
  - lib/types/report_styles.ts
  - lib/report_sections.ts
  - lib/fastr_markdown_blocks.ts
  - lib/fastr_markdown_edits.ts
  - lib/fastr_live_regions.ts
  - lib/fastr_markdown_spec.ts
  - lib/report_fastr_css.ts
  - lib/report_fastr_markdown.ts
  - lib/fastr_markdown_pages.ts
  - lib/report_fastr_paged.ts
  - lib/report_document_shell.ts
  - lib/types/slides.ts
  - server/db/instance/dashboard_slugs.ts
  - server/db/instance/report_styles.ts
  - server/db/project/dashboards.ts
  - server/db/project/move_slides.ts
  - server/db/project/report_folders.ts
  - server/db/project/reports.ts
  - server/db/project/slide_deck_folders.ts
  - server/db/project/slide_decks.ts
  - server/db/project/slides.ts
  - server/routes/project/dashboards.ts
  - server/routes/project/emails.ts
  - server/routes/project/report_folders.ts
  - server/routes/project/reports.ts
  - server/report_pdf/**
  - server/routes/project/slide_deck_folders.ts
  - server/routes/project/slide_decks.ts
  - server/routes/project/slides.ts
  - server/routes/public/dashboard.ts
  - server/tests/fastr_live_regions_test.ts
  - server/tests/fastr_markdown_pages_test.ts
  - server/tests/fastr_markdown_edits_test.ts
  - server/tests/report_fastr_markdown_test.ts
  - server/tests/report_format_helpers_test.ts
  - server/tests/report_html_sanitize_test.ts
  - server/tests/report_pdf_render_test.ts
  - server/tests/report_sections_test.ts
  - server/utils/id_generation.ts
docs_absorbed:
---
# S12: Documents & Sharing

The three figure-snapshot-embedding artifact types (slide decks, markdown
reports, and dashboards), plus the public slug-addressed viewer and the
SendGrid email egress. The render/export engines themselves are S10's; S12
owns the artifacts, their storage, and the export *triggers*.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
Client: `components/slide_deck/**` minus `slide_ai/` (S13), `layout_editor/`
(one file, imported only by the slide editor), `components/report/**`,
`components/dashboards/**`, `components/public_viewer/**`, the
deck/report/dashboard list pages + modals in `components/project/`,
`state/project/{t2_slides,t2_slide_decks,t2_dashboards}.ts`. Server: CRUD for
all three families + folders, `db/instance/dashboard_slugs.ts`,
`routes/public/dashboard.ts` **and** the `/api/d/*` CORS + populate-only-Clerk
mounts plus the `/d/:slug` SPA-HTML in root `main.ts` (the actual auth
boundary), `routes/project/emails.ts`, `server/utils/id_generation.ts`
(hardcodes 7 tables, Open item). Lib: slide/report/dashboard types incl.
`buildPublicDashboardBundle` and `buildReportPreview`. Custody wrinkle: the
`_shared/**` glob also carries `dhis2_credentials/` (all consumers are
S5/S6/S7 surfaces, documented in SYSTEM_07) and `sort_control.tsx`
(shell furniture, flagged in SYSTEM_14); the three logo files are genuinely
S12's (Open item: settle the manifest).

## Contract

All three families persist CLIENT-built `FigureBlock` bundles (the server
never recomputes figures); the figure-snapshot lifecycle is owned upstream by
S10. **Three concurrency philosophies, one per family**: slides = per-row
**opt-in optimistic lock** (`expectedLastUpdated` → `err: "CONFLICT"`; both
the human editor and the AI tools send it); reports body = **always-write
last-write-wins** returning an advisory `conflicted` flag → non-blocking
banner; dashboards = **no conflict detection at all** (zero
`expectedLastUpdated` in the family). **S16 overlays the first two**: when a
live collab room exists for a slide or report, the mutating routes offer the
save to the room first (`applySlideToLiveRoom` / `applyReportToLiveRoom`) and
the CRDT merge is the conflict resolution. The philosophies below engage only
when no room is live. The collab checkpoint functions and additive columns
(`saveSlideCheckpoint` / `saveReportCheckpoint`, `crdt_state` /
`crdt_state_last_updated` / `body_authors`) ride this system's
`server/db/project/{reports,slides,slide_decks}.ts`, and the version-history
routes ride its route files. S12 owns the files, S16 the feature (SYSTEMS.md
§4.1; [SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)). Reads are
guarded by `can_view_*`,
mutations by `can_configure_*` + `preventAccessToLockedProjects`. Dashboards
have no flags of their own and ride the slide-deck pair (Open item). The
public viewer is the app's only unauthenticated product surface (cross-cutting
audit SYSTEMS.md §4.3.9).

## Slide decks

**Data model.** A deck row (`label`, free-text `plan` for the AI planning
scratchpad, JSON `config` = deck style) + one row per slide (JSON `config` =
one `Slide`, integer `sort_order`; FK cascade on deck delete). Deck and slide
ids are 3-char nanoids. `getSlideDeckDetail` returns only ordered `slideIds`;
slide bodies fetch per-slide through `_SLIDE_CACHE`. Sort orders are
**gap-numbered** (append = max+10, insert = target±5) with `reSequence`
(`ROW_NUMBER()*10`) run inside the create/delete/duplicate transactions;
`moveSlides` ([db/project/move_slides.ts](server/db/project/move_slides.ts))
is **within-deck reorder only**: no cross-deck slide move exists.

**The deck-touch rule.** Every slide mutation bumps
`slide_decks.last_updated` with the same timestamp in the same transaction,
and that touch is what drives the SSE push and t2 cache versioning. Exceptions
(Open item): `duplicateSlides` runs its shift-UPDATE and per-slide INSERT
loop **outside** any transaction, and `duplicateSlideDeck` has no transaction
at all, so a mid-loop failure leaves partial rows.

**Validation at write.** Deck config is validated at both the route body
(`slideDeckConfigSchema`) and the DB layer; slide bodies are **`z.unknown()`
at the route**, blocked on a real gap: panther's `PatternType` includes
`"none"` but the split-fill Zod enum doesn't
([lib/api-routes/project/slides.ts:16-18](lib/api-routes/project/slides.ts#L16-L18)),
with `slideConfigSchema.parse` as the DB-layer backstop. The layout tree is
a recursive Zod union embedding the strict `figureBlockSchema`; layout item
`style` is `z.record(z.unknown())`. Duplicates copy stored config text
without re-validation.

**The slide editor**
([slide_editor/index.tsx](client/src/components/slide_deck/slide_editor/index.tsx),
~1,370 LOC) opens via `openEditor` with `snapshotForSlideEditor`
(structuredClone-severed projectState + instanceState + deckConfig). Left
panel switches per slide type (cover/section/content; content = header/footer
tab + a per-block Content tab with text/figure/image editors); right side is
a live preview through S10's `convertSlideToPageInputs` debounced 100ms off
`trackStore(tempSlide)`. Slide-type switching keeps a per-type cache so
switching back restores prior state (same idiom per-block for block-type
switches). The layout tree is manipulated exclusively through panther node
ops via `buildLayoutContextMenu`
([layout_editor/build_context_menu.ts](client/src/components/layout_editor/build_context_menu.ts)):
split/add/move/delete/convert, reachable from both the panel button and
canvas right-click. Figure blocks resolve through the S10 shared resolvers
(select existing viz → `resolveFigureBundleFromVisualization`; edit →
ephemeral S11 editor + rebuild; create → `AddVisualization` + build). Local
edits notify the AI (`edited_slide_locally`) and the editor registers the
`editing_slide` view's mutator context on the AI view controller (S13).

**The per-slide save loop** (the no-room/offline path: while a collab
session is live the editor never explicit-saves; the room checkpoints
continuously, S16): editor seeds `lastKnownServerTimestamp` from
props → `updateSlide({slide, expectedLastUpdated, overwrite})` → DB compares
`last_updated` and returns `CONFLICT` unless `overwrite`
([db/project/slides.ts:175-184](server/db/project/slides.ts#L175-L184)) →
`ConflictResolutionModal` offers overwrite / save-as-new (inserts after the
current slide) / view-theirs / cancel → on success the editor pre-warms
`_SLIDE_CACHE.setPromise` with the fresh version before SSE arrives. The
lock is **opt-in** at the DB layer, but both writers send it: the S13 AI
slide tools pass `expectedLastUpdated` from a pre-write `getSlide` fetch
and rethrow `CONFLICT` to the model as a "re-read via get_slide and retry"
error (no overwrite path: the human editor's modal is the only override).

**Lists & operations.** `ProjectDecks` reads T1 (`projectState.slideDecks`,
SSE-maintained), groups `folders | flat` with a "General" pseudo-group,
sorts client-side (`sortBySortMode`, not the server ORDER BY), multi-selects
via `createSelectionController`, and batches move/duplicate/delete. The deck
view's `SlideList` renders cards in the vendored SortableJS wrapper
(multiDrag; optimistic local order; reorder diffs the moved run and calls
`moveSlides`). Deck cards track both the deck's and the first slide's
`lastUpdated`. Folders have **no GET route**: they ride the project-state
payload and SSE pushes only (same for report folders).

## Reports

**One-row model.** `reports` = `label` + `body` (markdown, **FASTR Markdown**
or **html**) +
`figures` / `images` (JSON registries `Record<id, Block>` — validated by the
**strict** `figureBlockSchema` at both route and DB) + `config` (passthrough
`{version, format?}`) + `folder_id`. **Format is fixed at creation**
(`createReport` body `format`, the Create-report form's radio); absent ⇒
markdown (`getReportFormat` is total — the stored config is a raw cast — and an
unknown value reads as markdown, which is what makes adding a format a
no-migration change). `reportRendersAsHtml(format)` names the two formats that
go through the sanitize → iframe → `.html`/print funnel (html, fastr) rather
than panther's markdown IR. html
reports additionally carry `htmlStyle?` — one of the `REPORT_HTML_STYLES`
presets (default, minimal, corporate, ministry, classic, executive, clinical,
editorial, swiss, monochrome, bauhaus, blueprint, broadsheet, risograph,
artdeco, japanese, terminal, brutalist; also fixed at creation,
also total via `getReportHtmlStyle`) — it changes ONLY the S13 AI authoring
brief, never the render path. Creation is a two-step wizard (panther has ONE
alert slot, so the steps can't stack — `attemptAddReport` in
[project_reports.tsx](client/src/components/project/project_reports.tsx) owns
the loop): the form creates markdown directly but closes with a draft carrying
the chosen format for the two styled ones ("Next"), then
[report_style_picker.tsx](client/src/components/project/report_style_picker.tsx)
owns the `createReport` call; Back re-opens the form seeded with the draft.
The picker is format-aware: for html it shows hand-authored CSS mini-report
mockups (real Google Fonts loaded on open, greeked bars for
language-neutrality — deliberate impressions, because the real output is AI
output and unknowable); for fastr it renders the REAL theme sheet over the REAL
`fm-*` markup, scoped per tile
([fastr_theme_mock.tsx](client/src/components/project/fastr_theme_mock.tsx)). **Custom styles**: user-authored briefs live in the
MAIN-db `report_styles` table (075; visibility per style — this/selected
projects via a `project_ids` JSON list, or NULL = instance-wide;
[server/db/instance/report_styles.ts](server/db/instance/report_styles.ts),
CRUD on the reports routes, mutations `can_configure_reports` + logged). They
render in the picker as color-skinned generic tiles and are created/edited via
[report_style_editor.tsx](client/src/components/project/report_style_editor.tsx)
(a wizard step; delete lives there because openConfirm would replace the picker
modal). A style saved from a report also carries the source report's
`<style>` CSS verbatim (`reference_css`, 076) — the prose brief alone proved
lossy, so the AI is instructed to REUSE that stylesheet rather than re-derive
one. A report snapshots `{id,label,brief,referenceCss,colors}` into
`config.customStyle` at creation (server-resolved + visibility-checked); the editor prefers the LIVE
library brief when the style still exists and is visible (live ref + snapshot
fallback), and `updateReportConfig` re-imposes the stored snapshot. S13's
"Save this report's style…" distillation writes into this library; `updateReportConfig` re-imposes both
stored fields; duplicate / copy-from-version carry `config`. Embeds are per-format tokens — markdown
`![caption](figure:<uuid>)` / `![caption](image:<uuid>)`, html
`<img src="figure:<uuid>" alt="caption">` (other attributes are the author's
and survive every rewrite) — the caption IS the alt text. **Every token
read/write goes through the format-aware helpers in
[lib/types/reports.ts](lib/types/reports.ts)** (`findReportEmbeds`,
`parseReportEmbedLine`, `buildReportEmbedToken`, `rewriteReportEmbedToken`,
`replaceReportEmbedTokens`); the load-time orphan prune uses the loosest
`referencedReportEmbedIds(body, "any")` substring scan (over-retention is
harmless, a miss deletes a figure). Deleting an embed removes only the token, so
undo restores a working embed.

**Summary derivation.** `getAllReports` deliberately never loads the heavy
registries; the list card's `preview` (`buildReportPreview(body, format)`)
derives from the body alone — up to 8 lines/300 chars, heading levels,
figure/image counts via `findReportEmbeds`; the card shows an "HTML" badge for
html reports.

**HTML format.** Rendering = DOMPurify with the pure-data
`REPORT_PURIFY_CONFIG` (lib; `FORCE_BODY`, explicit `FORBID_TAGS`, the default
URI regexp plus the `figure:`/`image:` schemes — pinned by
`server/tests/report_html_sanitize_test.ts` on jsdom) → materialize embeds →
base CSS ([report_html.ts](client/src/components/report/report_html.ts), the
one builder for preview, version-history preview, `.html` download and
print). The editor preview is a `sandbox="allow-same-origin"` srcdoc iframe
([report_html_preview.tsx](client/src/components/report/report_html_preview.tsx))
— scripts browser-blocked, the report's `<style>` scoped to its own document,
blob:/asset URLs load because the frame keeps the parent origin; in-page
`#` links scroll in-frame, everything else opens a new tab; pointer events are
re-dispatched on the iframe element so live cursors / click-to-deselect work.
Figures are TRANSPARENT PNG rasters (`getFigureAsCanvas` at
`FIGURE_EXPORT_WIDTH_PX` → blob URL; embed `<img>`s carry NO default
background, so whatever the report paints behind a figure — page color,
texture, image, panel — shows through automatically, and a style sets a
figure background only for a distinct card. Chart ink follows each figure's
DETECTED ground, not the style: the preview measures the effective computed
background behind every embed (`isDarkGroundBehind` — first opaque color up
the ancestor chain; probe pass → measure → re-render) and requests a
light-ink raster only on dark grounds (`figureInkThemeForStyle` palette per
style, `GENERIC_LIGHT_INK` fallback, `applyInkTheme` at raster time); the
`.html`/print export measures grounds by mounting the sanitized document in a
hidden iframe (`measureFigureGrounds`); ink is part of the raster key) from a
**content-keyed** cache
([report_figure_raster.ts](client/src/components/report/report_figure_raster.ts):
`metricId|snapshotAt|canonicalJson(config)`, NOT object identity — collab
materializes fresh block objects on every remote update), serial with a frame
yield, pending → placeholder, failure → "Missing visualization". Structural
operations (headings index, `rewrite_section`'s wrapper/flat sections, line
anchors, well-formedness incl. unclosed elements) all read one `@lezer/html`
tree in [lib/report_sections.ts](lib/report_sections.ts)
(`server/tests/report_sections_test.ts`). Exports: markdown → PDF/Word as
before; html → standalone `.html` (figures as data URLs, images inlined) or a
hidden `allow-same-origin allow-modals` print frame
([export_report_as_html.ts](client/src/exports/export_report_as_html.ts)).

**FASTR Markdown format.** Markdown's ergonomics with HTML's look: the body is
CommonMark plus `:::` container blocks, and the design is a REAL hand-authored
stylesheet rather than an AI brief — so the format needs no AI at all, and what
you type is what you get. Syntax primitives are pure and Deno-testable in
[lib/fastr_markdown_blocks.ts](lib/fastr_markdown_blocks.ts)
(`parseContainerFence`, `parseContainerAttrs`, `containerHtmlFor` — the
`fm-*` class taxonomy is defined ONCE there — and `listFastrContainerDefects`);
[lib/report_fastr_markdown.ts](lib/report_fastr_markdown.ts) is the markdown-it
compiler (one generic block rule, depth-counted so `:::tiles`/`:::card`/`:::`
nests at the same marker length; `stat` is a LEAF block taking no close). Blocks:
`callout` (5 kinds), `tiles`/`card`, `stat`, `columns`/`col`, `quote`, `band`,
`contents` (a LEAF: a table of contents whose content is the DOCUMENT, not
the author's lines — `fastrDocumentOutline` in fastr_markdown_blocks is the
one authority, skipping code fences and a cover's title page, and
`renderFastrTocHtml` the one markup, so the renderer's `fm_toc` core rule and
the editor's leaf widget cannot drift; the core rule also stamps `id=` on the
heading tokens with the same slug function, only when the document has a
contents block, and the slug is spent even for headings the depth omits so a
deeper `depth=` never renumbers anchors. In the editor an entry cannot
navigate, so a click parks the CARET on its heading; the widget's eq keys on
the serialized outline, so it re-renders when a heading changes and not on any
other edit),
`cover` (both taking `kicker`/`sub` masthead lines; a cover also takes
`layout=classic|centered|poster|spine|frame|split|minimal|block`, the
compositions `FASTR_COVER_LAYOUTS` in fastr_markdown_blocks names and the
`.fm-cover--*` rules in report_fastr_css draw — every layout on every tone,
masthead lines kept as DIRECT children for the editor's islands) and `steps` (a process list
numbered by a CSS counter, so inserting a step never renumbers by hand); an
unknown name still groups its content (a typo must never swallow the document)
and is reported as a defect. Two things the html format cannot do, because we
own the renderer: `data-line` anchors come from markdown-it's own `token.map`
(so scroll sync points at MARKDOWN lines and `injectReportHtmlLineAnchors` is
not used), and an embed alone on a line becomes a `<figure>` + `<figcaption>`
from its alt text — captions for free. Raw HTML passes through the compiler and
is made safe by the same DOMPurify pass, not by the compiler.

**Themes** ([lib/types/report_fastr_themes.ts](lib/types/report_fastr_themes.ts),
[lib/report_fastr_css.ts](lib/report_fastr_css.ts)): ONE structure sheet plus a
per-theme token block — **18 presets, one per `REPORT_HTML_STYLES` name**, so a
report can be moved between formats without losing its look. A theme is ~700
chars of tokens plus 0-195 chars of its own rules against a shared 12k sheet,
which is why every block, tone and background added since landed on all of them
at once. Two are DARK pages (blueprint, terminal), and that is what forced the
callout/delta colours out of the sheet: they carry MEANING so they cannot come
from the palette, but a fixed light-page set is unreadable on a dark ground.
Each theme declares `scheme: "light" | "dark"`, which picks which of its two
status sets the page reads, and every rule that establishes a ground of the
other darkness (a tone the theme paints dark, `fm-ink--light`) re-points the
set locally — pinned by a test, since the first attempt missed the ink tone
and nothing else would have caught it. Tokens are
projected into `--fm-*` custom properties;
`buildFastrReportCss(theme, colors?, scope?, opts?)` is a pure string builder, so
the same call serves the preview, the export AND the creation picker's tiles —
which therefore show the real design, not an impression. Everything is in `em`
so a tile shrinks the whole sheet by dropping its root font-size. `@import` must
LEAD a sheet, hence `fastrAllFontImportsCss()` + `omitFontImport` for the
concatenated multi-theme tile sheet. **The theme is changeable after creation**
(unlike `htmlStyle`) — the body carries no CSS, so nothing can be invalidated;
the editor's theme `Select` writes `config.fastrTheme` through
`updateReportConfig`, which re-imposes format and (for both styled formats) the
custom-style snapshot but lets the theme through. A custom `report_styles` row
contributes only its `colors` here — its `reference_css` targets AI-authored
class names, not `fm-*`. Sections are the markdown `#`-line scan with a
top-level mask (`fastrTopLevelLineMask`): headings inside a container or a code
fence are NOT indexed, so `rewrite_section` can never splice a section that
starts mid-block. Exports: `.html` (same builder as html) and a PAGED PDF —
see "Paged PDF and page boxes" below; Word is absent because panther's
markdown IR cannot represent the blocks and would silently drop every one.

**Paged PDF and page boxes (2026-09-08, inverted 2026-09-10).** A FASTR
Markdown report has a real PDF, and the Edit pane shows where its pages fall.
The EDITOR decides where the pages break, and print follows: the editor lays
the document out from CodeMirror's height map on every measure
(`layoutFastrPages`, lib/fastr_markdown_pages.ts), and the export forces
Paged.js to break on exactly those lines inside the server's headless Chrome
(`server/report_pdf/`, astral over CDP, the Chrome for Testing headless shell
the Dockerfile installs at `CHROME_PATH`), so the seams the editor draws and
the pages the PDF prints cannot disagree. The first design ran Paged.js on
both sides and had the editor chase the paginator's answer; the section
below says why that could not be made to feel right.
`lib/report_fastr_paged.ts` is the contract: the paged stylesheet
(`buildFastrPagedCss` — `@page` size/margins, a zero-margin named page for a
cover with `fill=page` (any other cover is a 544px-tall band at the head of
page 1, flush to the top of the sheet through the page's top margin with a
negative margin, the report continuing below it on a page that keeps its
bottom margin and footer; Nick's rulings 2026-09-08, "back to normal size,
maybe have an option to page fill" and no white above the cover; a named
page with no top margin was tried first, but Paged.js breaks wherever the
flow leaves a named page and the cover took page 1 alone), the running
footer as
margin boxes, keep-together on the designed blocks that are one thing
(cards, stats, tiles, columns, figures, table rows, list items, each step)
while callouts, bands, quotes and steps CONTINUE across pages between
paragraphs and steps with the box drawn on both sides (Nick, 2026-09-08,
after a bulletin printed with pages half empty behind blocks that missed
the foot by a line; a block's title or kicker never ends a page, its
standfirst never opens one, and a break at a flowing block's first content
counts as a break before the block so the heading above travels with it;
the runner judges "first on the page" by a block's FIRST fragment inside
the page box, since a block that overflowed also has a fragment in
Paged.js's overflow column whose top is the page's top; a continued block's
page starts at its first new child, not at the cloned box), keep-with-next
on headings, orphans/widows 3, explicit breaks from `:::pagebreak` (its
marker is out of the flow, pinned to the page's top corner: pushed to the
next page by a margin it would break after itself and print a blank page)
and `break=before|after`, section counters on the
renderer-stamped `fm-numbered` class, TOC page numbers via `target-counter`) and
the in-document runner (`fastrPagedRunnerJs`), which releases blocks taller
than a page before pagination (they split as a last resort and are reported),
repairs Paged.js's keep-with-next flags, redirects a break that lands inside a
whole block to the block itself (and back over its heading), repeats table
header rows on continuations, paints the document ground on every sheet, and
publishes a `FastrPagedResult` in SOURCE LINES on `window.__fmPaged`.
`lib/report_document_shell.ts` holds the document wrapper so the Deno render
test builds byte-identical documents. A paged document takes the theme
sheet with `omitPrintRules` (`BROWSER_PRINT_CSS` is the .html download's
browser print: Paged.js applies `@media print` while laying out, Chrome
again when printing the fixed pages, and its callout keep-together and
cover padding fought the paged sheet; found 2026-09-08 when a long callout
refused to flow). Side margins are zero on the page and
live on the content wrapper: Paged.js treats any content wider than its box as
overflow, and bands must bleed to the paper edge. The client builds the
document (`buildStandaloneReportHtml` with `paged`, fonts inlined as data URLs
by `exports/inline_theme_fonts.ts` so the host needs no network) and POSTs it to
the streaming `renderReportPdf` route (can_view_reports; one render at a time
per instance; `CHROME_PATH` unset ⇒ a clean "cannot render" error). EDIT ON PAGES
(opt-in, the Page menu's toggle; off by default): the Edit pane is the printed pages
themselves — `report/paged_edit_surface.ts` holds the same paged document in
an iframe (rasters from the host's cache, the same pixels the export draws),
double-buffered so a re-layout after a pause swaps in without a flash. The
in-place editors the CodeMirror widgets use (text islands, block labels, stat
pieces, table cells; now document-aware, since they run inside the frame) are
attached to the page DOM and dispatch into the CodeMirror view, which stays
mounted and hidden as the model (undo, collab, the toolbar API). The caret is
restored after each swap from the CodeMirror selection the islands mirror;
Enter splits a paragraph (a list item gets a sibling), Backspace removes an
empty one, a press on a page's empty tail appends a paragraph, and an element
Paged.js split across pages edits through its first fragment. Peer carets are
mapped onto the pages. With the toggle off (the default, Nick's ruling after trying the
frame: "still use the CodeMirror system for each of the pages"), the
CodeMirror live preview IS broken into pages, 1:1 with print: the sheet is
the printed page at 96dpi (`--fm-sheet` 794px for A4, `--fm-measure` the
printed column plus the surface's two 24px bleed pads, no `.cm-line`
insets), so lines wrap in the editor exactly as they wrap in print.
`paginationField`/`setPagination` draw a seam before each page's first line
(a block widget between plain or leaf lines, an element injected into the
rendered block's DOM). WHERE the pages break is the editor's own decision,
made synchronously by `pageBoxPlugin` on every measure pass: `flowBlocksOf`
walks the source into blocks (a region from fence to fence, a paragraph of
consecutive non-blank lines, a heading, a line of space; the first blank
line after content is the separator between blocks, not a block), takes
each block's own box from the height map (`lineBox`: the line or the region
widget without the seam widget attached before it, `seamsAbove` subtracting
seams from the space between rendered blocks) and hands the list to
`layoutFastrPages`: whole blocks fill a page, a heading travels with the
block after it, `:::pagebreak` and `break=` end or open a page, a cover
opens page 1 (natural: flush to the sheet's top; fill=page: alone), a block
taller than a page continues at the inner boundaries its rendered DOM
offers (`innerCandidates`: anchored descendants, a seam placed inside the
widget by `applyRegionPagination`), and 6px stay free at every foot
(`LAYOUT_SAFETY_PX`) so print, whose measure of a block can differ by a
pixel or two, never finds a page fuller than the editor did. When the pages
differ from the current pagination the plugin dispatches the new one after
the cycle: Enter moves a block onto the next page in the same frame and
Backspace brings it back, with nothing to wait for. Every seam's filler
(the padding that brings a page box to the sheet's height, `--fm-page-h`
1123px for A4, `--fm-page-margin` 68px) comes from the layout's own
numbers (the blocks and gaps it stacked on the page, plus the separator
line trailing the last block), on screen or not, so a page box is the
same size before and after its lines are rendered. A block's height, once
measured, is kept by kind and source text (`measuredBlockHeights`, one
cache per geometry epoch: column width and body font) and used wherever
the block goes and whether or not it is rendered now, and the space
between blocks always comes from the source (a separator line or
nothing): the first build re-read both from the height map as blocks
scrolled in and out of CodeMirror's rendered range, and the pixel or two
between a measurement and an estimate moved seams while scrolling (Nick,
2026-09-10, "scrolling makes things flicker between pages"). Two more
findings from the same probe: the layout's page height once kept a heading
that moved to the next page with the block after it (the page starts were
right, the filler was that heading short, a 1042px box wherever a page
ended before a heading and a figure), pinned by the layout test; and a
block taller than a page carries its "continues" flag inside its widget
AFTER the seam that opens its page, with no margin of its own, or the flag
stood at the foot of the page before and the layout counted it as the
block's.

A seam changes no block's box. The layout measures every block from the
height map, so a stylesheet rule that gave a block another margin beside a
seam made the layout that placed the seam find another height, move the
seam away, find the first height again and move it back, every frame: the
rule that zeroed the margin of the child after an inner seam (written for
the flag) took 25px off a `:::tiles` block that opened page 2 of Nick's
ANC1 report, the block then fit on page 1, and the pages flipped at 60Hz
while page 2's foot was on screen (2026-09-10, "flickering rapidly"). The
widget clamp in `report_fastr_css.ts` now addresses the block's first
CONTENT child through the seam and the flag alike (`:not(.fm-page-gutter,
.fm-page-split)`), and the space-line rules that give a block or a heading
its whole margin hold with a seam widget between the space and the block.
Print keeps a block's whole top margin at the top of a page (measured:
tiles at +25.6px, a heading at +44.6px, a band at +40px under the content
area's top), where the editor's mid-page box keeps only what the margin
exceeds the separator by; the difference is the block's `topExtra`
(`FastrLayoutBlock`), which `layoutFastrPages` counts only when the block
opens a page (the continuation of a split block has none) and the seam
carries as padding under its head (`EditorPagination.topExtras`, written
by the plugin like the fillers). A region's comes from its `--fm-mt` token
(`HeightOracle.regionMargins`, at most the separator), a plain block's
from print's margin of its element less the editor line's padding
(`printMarginTop`, `linePaddingTop`: a heading's 1.8em less 1.15em, a
blockquote's whole 1.4em); the first block of the document, a cover and a
block after a line of space have none.

An embed's box is known before it draws. A figure's live chart (panther's
FigureHolder, mounted by the region widget) lays out a beat after its
mount, at a canvas's default size first; measured, that transient moved
the pages, and a page move shifts CodeMirror's rendered range, which
destroys and re-creates the widgets at its edge, so the chart drew again
at the default size, moved the pages back, and so on for as long as the
figure was near the screen (Nick's ANC1 bulletin, a whole-page figure
under "ANC1 in context", 2026-09-10: "flickering, impossible to scroll
past"). The editor now gives the mount the box print gives the raster:
the host's `FigureSizeCache` aspect (`EmbedResolver.figureSize`, the same
cache `paginate_report.ts` uses, through `ReportEditor`'s `figureSize`
prop) as `--fm-fig-w/h` on the mount (`applyFigureSize`), which the
structure sheet sizes exactly as the printed img (the raster's aspect
capped at 42% of the page area, narrowed and centred, the canvas cut to
the box), so a figure measures right on its first measure and the editor's
page equals the PDF's; an image takes its natural size as width and
height attributes (`applyImageSize`, `imageSize`). While a size is still
being measured the mount is flagged `data-fm-pending` and `flowBlocksOf`
leaves the block's height alone: what was measured before, else print's
hint, else the first height seen (`pendingBlockHeights`, steady if wrong)
stands, and the page's filler absorbs what the widget actually shows
(`FlowBlock.domHeight`) so the box keeps the sheet's height meanwhile;
when the host's cache lands (`sizeTick`) it calls the editor's
`refreshEmbedSizes`, and `embedSizePlugin` sizes the waiting mounts. The
harness cannot render a real chart (a bundle needs a results package), so
`probe_pages.tsx` emulates one (`?fake=1`: a mount that grows 30ms after
it appears): that reproduced the storm (20 page flips per 700ms, the
scroll dragged back) and is quiet with the fix, pending and landed alike,
and the forced print agrees with the editor on the bulletin.

The height map is measured where a line has been on screen and estimated
elsewhere, and a page laid out from guesses moves when it scrolls in, so
three things stand in for measurement: `paginate_report.ts` still lays the
whole document out in a hidden frame after a typing pause, but only to
report every block's height at the print column (`FastrPagedResult.blocks`,
keyed by the block's source text through `fastrLayoutHints`, into the
editor's `layoutHintsField`), which is exact for a paragraph; a heading or
a list, whose editor line carries padding print keeps as margin, is
measured the editor's own way by `HeightOracle` (its lines as `.cm-line`
boxes off screen inside the editor, concealed text, the content column's
width); and a region keeps its rendered height by source text
(`measuredRegionHeights`, also its widget's estimate) or takes print's box
plus the widget clamp (`regionExtra`, from the `--fm-mt`/`--fm-mb` the
structure sheet declares). The space ABOVE an unrendered block comes from
the source (the separator line, or nothing when blocks touch), never from
estimated positions: the first build measured it from them and got zero or
nonsense, which laid far pages out too full and let print overflow. A block
taller than a page that has not been rendered lays out whole until it is
(no inner candidates), so its pages appear on first scroll.

Print follows: `fastrForcedBreaksCss` emits `[data-line="N"]
{ break-before: page !important }` for the editor's page starts
(`paged.pageStarts` on `buildStandaloneReportHtml`), which index.tsx hands
to Download and Email through `registerReportPageLayout`
(export_report_as_paged_pdf.ts) when the body the export fetched is the
body the editor laid out; otherwise Paged.js decides by the same rules.
Every block is atomic in the paged sheet, paragraphs included: a block cut
by a page reads as a mistake (its ground stops at the seam) and would not
pass in a ministry (Nick, 2026-09-10), and the editor cannot draw a seam
through a line box anyway. A block taller than a page still continues
(`releaseOverTall`), at the boundary the editor forced. The editor's list
lines carry print's item margins as padding (`.cm-fm-li + .cm-fm-li`); the
widget clamp and the heading paddings are derived from print's margins as
described under "Blank lines are space" below. A seam inside a rendered
block (one taller than a page, or one that opens a page) is
`fm-page-gutter--inner`: sheet-wide, on the DOCUMENT's ground
(`--fm-page-ground`, see `docGroundPlugin` below; the theme's page colour
showed as a lighter block on a `background=paper` document until
2026-09-10), opted out of the block's child styling (counters, borders,
padding), so the box visibly stops and resumes; the stylesheet centres it
on the block's content box and `pageBoxPlugin` measures it against the
sheet and writes the exact margin and width inline (a callout's 4px left
border alone puts the strip 2px past the sheet, which is a horizontal
scrollbar on the whole editor). A page a natural cover opens has no top margin in the editor either
(`FastrPagedPage.flushTop`: no PageHeadWidget, content area = sheet less
the bottom margin). Embeds are laid out at the boxes the PDF gives them
(`createFigureSizeCache`: a figure's raster aspect from a 200px panther
draw; an image's natural size), drawn as `sizedPlaceholderImageSrc` SVGs
whose INTRINSIC size is the box (a 1px pixel with size attributes lays out
square once it loads: Nick's "test 17", 2026-09-08). The model's brief
(`FASTR_MD_SYNTAX_DOC`) carries a "composing for pages" paragraph: every
block keeps whole, open a section with a paragraph before its figure, never
two figures back to back, alternate blocks with prose, no page breaks to
tidy what it cannot see. The Download modal offers PDF
(default) and HTML for fastr; Print is gone for that format. Verified by
`server/tests/report_pdf_render_test.ts` (env-gated on `CHROME_PATH`): the
fixture corpus in `server/tests/fixtures/fastr_pdf/` on every theme, with
structural assertions on the Paged.js DOM before printing.

**Blank lines are space, and the editor's rhythm is print's.** One blank line
separates blocks, as in any markdown; every further blank line is a line of
empty space in the document, as Enter is in a word processor (the `fm_spaces`
core rule in report_fastr_markdown.ts emits one `<div class="fm-space">` per
extra blank line, `1lh` tall, anchored to its source line, so a run breaks
across pages like text; leading blank lines stay nothing, trailing ones
count). This exists because the editor's page flow needs it: Enter added
height in the editor and nothing in print, so a block pushed onto the next
page snapped back when the paginator answered (Nick, 2026-09-09). A list's
token map runs on over the blank lines after it, so the rule trims a map to
its last non-blank line. The editor marks the second and later blank lines of
a run `cm-fm-space` (full height; the first is the `cm-fm-blank` separator)
and the page flow treats them as blocks. Two calibrations came out of the same
probe: every flow block declares its margins as `--fm-mt`/`--fm-mb` beside
`margin:` in the structure sheet, and the editor's widget clamp is derived
from them (margin less the separator's height, `--fm-separator`; the whole
margin when a space line is the neighbour, since print collapses a margin
into a margin but never into a space), likewise the heading paddings
(`cm-fm-h*`, line-height 1.2 like print); and a top-level `.fm-card` has a
flow margin (1.2em, zero inside tiles), where it had none and sat flush on
the next paragraph. probe_calib in the scratchpad recipe compares the two
block by block; the widget rows read 0. Known residual: a THEME's own heading
rules (a border under h2 with 0.2-0.3em of padding, a theme's h2 font size)
do not reach the editor's heading lines, so a heading can stand a few pixels
taller in print than in Edit; the default theme's h2 padding is mirrored on
`cm-fm-h2`, the rest is what the layout's 6px safety margin covers. Those residual
pixels are what killed the first design, where Paged.js in the hidden frame
decided the breaks and the editor FLOWED blocks provisionally until the
paginator answered (2026-09-08 and 09-09): a page the editor measured a few
pixels taller than print pushed a block that came straight back, a page
only partly rendered could not be judged and stood too tall until the
answer, and a paragraph print split at its lines (orphans/widows) left the
page opening on its tail a hundred pixels taller in Edit. Gating the flow
on the paginator's last answer, then moving it onto the height map, each
helped and neither was enough ("still flickering", twice), which is why the
editor now decides and print follows. probe_type2.ts (short viewport, Enter
at every page foot, then the forced print against the editor),
probe_enter2.ts, probe_scroll2.ts and probe_pdf.ts in the scratchpad recipe
are the verification; figure pages cannot be verified there (the harness
has no figure data).

**Spacing in AI-written reports** (Nick, 2026-09-09, "more professional"):
rendered through the paged pipeline, the ANC1 bulletin the AI wrote showed
three things. Its blank-line habit (two blank lines after every figure)
became lines of space once blank lines meant space, so every body the AI
proposes (create_report, rewrite_report, rewrite_section; never replace_text,
never a person's typing) goes through `collapseFastrBlankRuns` first, which
folds a run of blank lines to the separator outside code fences. A toned
`:::col` had no inset, so its text sat flush on the coloured edge (now padded
like a toned grid, first child's top margin dropped). And a tall figure at
full column width took two thirds of a page, so it could only sit alone with
its heading and left the page before it half empty: `.fm-figure img` is
capped at 42% of `--fm-page-area` (set by the paged sheet in mm and by the
editor's page boxes in px; a browser window falls back to its own height),
narrowing and centring the chart, so two figures, or a figure and its prose,
share a page. The rest of the emptiness in that report is composition (a
figure straight under a heading, two figures back to back), which the brief's
"composing for pages" rules already forbid for new reports.

**Backgrounds and page-level design.** The format's answer to "everything html
reports can do" is to name the ROLE, not the value. Every block takes
`tone = paper|ink|accent|warm|cool` — the theme's five colours as grounds, and
only five, so the picker shows five (Nick, 2026-09-09) — resolved once in
`fastrSurfaceTone` ([lib/fastr_markdown_blocks.ts](lib/fastr_markdown_blocks.ts)),
which also folds the older spellings (`muted`, `solid`, `dark`, `inverse`,
`gradient`, the four status names) and the card's historical `accent` flag
into one of the five so existing bodies keep rendering; the toolbar, the live
preview and the defect lister all go through it. Each ground is the palette
colour with the paper or the ink as its type, whichever stands further
(`grounds` in `deriveFastrThemeColors`; the paper ground carries 8% ink or a
paper panel on the paper page would be invisible), emitted as
`--fm-<tone>-ground`/`--fm-<tone>-ground-ink`, which never re-scope. The tone
RULES are per theme (`buildFastrToneCss`, after the structure sheet and before
a theme's extra rules): which status set reads inside a ground depends on how
dark that theme paints it (the ink ground is dark on Ministry and light on
Terminal), and only the theme knows. A tone re-scopes the
`--fm-ink*`/`--fm-accent`/`--fm-border` TOKENS on the block so descendants
follow — including the figure rasters, whose ground probe reads the computed
background these rules paint; the paper tone is the page again, so its accent
returns (a stat value in a paper card inside an ink band would otherwise be
paper on paper).
**Two traps, both found live and both now pinned by a structural test:** a rule
may not read a custom property it also redefines (`background: var(--fm-accent)`
beside `--fm-accent: …` resolved against the override and rendered a solid card
white-on-white — hence the never-re-scoped `--fm-<tone>-ground` tokens), and a
tone must re-declare `color`, not only the token, because an element inherits
its parent's COMPUTED colour (paragraphs stayed dark on a dark band while
headings, which set colour explicitly, did not).

Inline, `[fell 12 points]{.danger}` colours a WORD or phrase by the same
principle — a markdown-it inline rule registered before `link`, so anything that
is not `]` immediately followed by `{.<known role>}` falls through to the real
link rule and an unknown role stays the author's literal text. It compiles to
`<span class="fm-mark fm-mark--danger">`, which survives DOMPurify because
`REPORT_PURIFY_CONFIG` is a denylist (pinned by a test, since a future tightening
to an allowlist would strip every mark silently). The rule reads the semantic
token ON the span rather than through a `--fm-mark-*` alias, which is what makes
the six existing dark-ground rules work for marks with no rule of their own: an
alias declared at `:root` would substitute at computed-value time and inherit the
SUBSTITUTED colour. On a ground that is already that hue the mark returns to the
ground's ink — colour the text or the panel, never both. And where a theme's
accent cannot carry text (brutalist's yellow, or Minimal and Monochrome where the
accent IS the ink), `--fm-accent-text` degrades to ink by design, so those themes
mark with weight instead: a control that silently does nothing is worse than one
that does something modest.

`:::band` is the full-bleed section — the device that most makes a report read as
designed. It escapes the centred column with `margin: … calc(50% - 50vw)` and
insets its content back to `--fm-measure`; `html { overflow-x: hidden }` absorbs
the scrollbar width, and `@media print` drops the bleed. `:::cover` is a band
that is tall and `break-after: page`. Scoped sheets (picker tiles) neutralise the
bleed, since there the viewport is not the page. Figures take
`{width=wide|full}` — markdown-it has no attribute syntax, so the `fm_figures`
core rule claims a trailing `{…}` text child and removes it.

**Escape hatch** (documented as theme-breaking, and the editor guide says so):
`bg=` emits an inline STANDARD declaration — never a custom property, which
DOMPurify does not reliably keep — resolved by `safeCssBackground`: either a
colour (`safeCssColor`, hex/rgb/hsl/curated-name allowlist) as
`background-color`, or a gradient (`safeCssGradient` — the four gradient
functions only, a character set that cannot express a second declaration,
balanced parens, and an explicit ban on `url(`/`var(`/`image(`/`element(`/
`attr(`) as the `background` shorthand. `ink=light|dark` overrides the ink otherwise derived from the
background's luminance — for a gradient, the MEAN of its colour stops, since a
full-range sweep has no ink that reads at both ends. A `bg` value that is none
of these is a reported defect, not a silent no-op (it was the latter, and an
author saw no background and no reason why).
`bg=image:<id>` compiles to `data-bg-image="image:<id>"`, resolved against the
image registry by `materializeReportBackgrounds` — the source token stays in the
body text, which is what keeps the loose orphan-prune scan from deleting the
asset — with an `overlay` scrim defaulting to dark.

**`:::report{background= width=}`** is the document header: read straight from
the body by `readFastrDocumentSettings` (so page-level design is versioned and
diffed with the document, not hidden in config), it renders nothing, and its
classes go on **`<html>`** — the page ground has to reach past the centred
column, so `body` is transparent and only the root carries it. `background`
takes either a tone name or a literal; resolving which BEFORE the colour path is
load-bearing (`background=muted` once emitted `background-color: muted`).

**How a theme carries a design language.** A token block sets the palette and
type; the theme's `extraCss` is what makes it recognisable, and it is NOT
optional garnish — a theme with three rules of its own renders correctly and
reads ordinary. Measured against the html-format brief (where the model writes
~150 lines of bespoke CSS per report), a thin theme is exactly the gap. Each
theme now carries 15-25 rules covering the same six devices — `h2` rule,
`.fm-figure` frame + caption treatment, `.fm-stat`, `.fm-quote`, `.fm-steps`
and the table — because those are what change how a report READS. The scope
rewriter runs line by line over `extraCss`, so a rule must keep its whole
selector list on one line: `[^{]` matches newlines, and a comment line
therefore swallowed the selector after it and left that rule unscoped (a picker
tile repainting the whole app — invisible in output, caught by the leak test).

**No masthead.** A top-level `h1` is deliberately NOT special — the title page
is `:::cover`'s job (ruled 2026-09-03; the earlier `body > h1:first-child`
masthead treatment, one shared rule plus twelve per-theme full-bleed
promotions, was removed with it). The only concession is standard typography:
`body > :where(:first-child)` drops the document's first top margin, at zero
specificity so a first-child cover/band still wins with its own negative bleed
margin. The bleed geometry is defined ONCE as `--fm-bleed-margin` /
`--fm-bleed-pad` on the root, so print and the scoped picker tiles neutralise
every band, cover and full-width figure by overriding two properties rather
than resetting each selector. A bare heading cannot carry a kicker or a
standfirst, which is why the brief insists on `:::cover` with both.

**Two rules that are not obvious from the token model.** An accent is a GROUND
colour: using it as TEXT only works where it separates from the surface beneath.
Brutalist's `#ffff00` on a near-white stat tile is invisible, so
`--fm-accent-text` is computed at build time (luminance separation < 0.25 falls
back to the ink) and used wherever the accent is type — the stat value, the note
callout's rule, the step numbers, several themes' `h2`. Because that fallback is
chosen against the theme's OWN surface, every ground that re-scopes
`--fm-accent` must re-scope `--fm-accent-text` too, or a `tone=ink` tile shows
a black number on black; a structural test enforces the pair. A tone on a
`tiles` or `columns` grid also gets padding, since a grid has none of its own
and the ground would otherwise show only through the gaps between tiles.

The `warm` and `cool` tones double as the MEANING grounds: they are the very
colours the callout kinds and stat deltas carry for danger and success, so
"this is the bad news" is one colour wherever it is said, and a hue mark
inside one of the three hue grounds returns to the ground's ink. Every tone
rule doubles its class (`.fm-tone.fm-tone--ink`, specificity 0,2,0) so it
outranks any background a THEME sets on the same element — brutalist paints
`.fm-callout` white, which at equal specificity beat the tone and left white
type on a white callout. And a theme that paints a heading WITH the accent —
brutalist's highlighter `h1` — renders it invisible on a ground that is
already a hue, so the three hue grounds clear the heading background.

**Editor** ([report/index.tsx](client/src/components/report/index.tsx), ~1,700
LOC): CodeMirror 6 (`lang-markdown` or `lang-html` per format) with an
embed-widget extension (a line that is exactly one token renders as an atomic
block widget), three modes edit/split/view, and line-anchored bidirectional
scroll sync over a `PreviewSurface` adapter
([scroll_sync.ts](client/src/components/report/scroll_sync.ts): `divSurface`
for the markdown card, `iframeSurface` for the html/fastr frame; `data-line`
anchors, echo-loop guard, figure-settle ResizeObserver window; the html pane
aligns when its surface becomes ready, not on the next frame). Embed insert/edit controls
(`ReportEmbedControls`) ride the header strip — the left sidebar panel and the
format guide panels were removed 2026-09-03 (the toolbar's Insert menu owns
block insertion; figures resolve through the same S10 funnel as dashboards).
Markdown View mode and both markdown exports share
`REPORT_MARKDOWN_STYLE`. FASTR Markdown reuses the html editing surface wholesale
— `markdown()` as the CodeMirror language plus a line decoration for the `:::`
fences ([fastr_fence_extension.ts](client/src/components/report/fastr_fence_extension.ts))
and the same iframe preview (the theme sheet lives in a `<style data-fm-theme>` in
the frame HEAD so a re-theme never reloads the frame, which would drop the
surface, the scroll position and every blob: raster).

**The formatting toolbar** ([report_toolbar.tsx](client/src/components/report/report_toolbar.tsx),
FASTR only) sits inside the same `FrameTop` panel as the `HeadingBar`
— that panel is `flex-none overflow-auto` and sizes to content, so the strip
just grows the header, and the `HeadingBar`'s slots (already seven controls,
anchored by onboarding tour steps) stay untouched. It is laid out like Google
Docs: a MENU row (Insert and Page are dropdown menus — Insert carries the
blocks, link, table and the embed pickers, with Table, Stat, Tiles and Columns
opening hover flyouts that pick a size — a rows×columns grid, a 1–4 row that
writes a `:::tiles` grid of stats or cards or a `:::columns` block; Page
carries the hidden `:::report`
header's width/background/ink) above ONE persistent toolbar row — Google Docs'
PILL: a rounded tinted strip of flat buttons in thin-divided groups (undo/redo,
text style, bold/italic/underline — underline is the mark attribute
`[x]{underline}`, since markdown has none — a − N + text-size stepper (which shows the RENDERED
size measured at the caret when no explicit mark is set), text colour with its
colour bar, lists), dropdowns marked by a chevron; for FASTR the report header
drops its own undo/redo pair. The toolbar row adapts to the last
click: a selected embed's controls REPLACE the text controls (as selecting an
image does in Google Docs), and a block segment (fence chip + attributes + a
combined Background menu + ink) APPENDS while the caret is inside a `:::`
block. Background is ONE menu for both ground kinds — the theme's five tones as
preset swatches on top beside a struck-through "none" chip, the literal
colour grid + hex field below — and keeps
them mutually exclusive in a single fence rewrite, because a literal wins over
a tone in the renderer and a stale one must not linger; the Page menu embeds
the same panel for the document background. Text colour is the SAME shape
(`InkPanel`): the ink roles as preset swatches on top, the literal grid and
hex field below (`LiteralColours`, shared with the ground panel); a literal
writes `[x]{color=#hex}` — `color=` is a fourth mark attribute, gated by
`safeCssColor`, serialised after the role — and role and colour are one
choice: `setInlineRoleEdit`/`setInlineColorEdit` each drop the other. The Page menu carries the document THEME (the header's select survives only
where there is no toolbar, i.e. View), the background panel (tones, literal
colours and a PHOTO ground — `bg=image:<id>` with its overlay, the image
picked or uploaded through the host's own registry so the body-scan prune
keeps it), a NUMBERED SECTIONS toggle
(`numbering=sections` → `fm-doc--numbered`, a CSS counter on `body > h2/h3`
ONLY, since a heading inside a block is not a section — the editor's own
heading lines are cm-lines rather than real headings and a viewport-scoped
counter would renumber on scroll, so `buildSurfaceLines` computes the same
numbers doc-wide as widgets, and docGroundPlugin deliberately keeps `fm-doc*`
classes off the scroller so the two can never both fire) and DOCUMENT DETAILS
(words, headings, visualizations, images, last saved), PAGE SIZE (A4/Letter)
and ORIENTATION — the printed sheet the paged PDF uses and the editor's page
boxes show (`:::report{pagesize= orientation=}`; margins stay at normal, 18mm)
— and a SHOW PAGE BOXES toggle (per browser, localStorage). Theme and Background
are hover FLYOUTS — `MenuFlyout`, the pure-CSS row-plus-panel the Insert pickers
already used and now share. The theme flyout's tiles are drawn from
`FASTR_THEME_TOKENS` (paper, ink, accent, ink ground, heading face) rather than
from scoped copies of every theme's stylesheet, which would be ~17 sheets in
a dropdown. The menu
row opens with a FILE menu (Google Docs' shape): Download… (the host's
`DownloadReport` modal — the header's Download button hides while the toolbar
shows it), Email this file… (`share_report.tsx`, the slide deck's share modal
for a report: the attachment is always a PDF, built in memory by
`exports/export_report_attachment.ts` — markdown through panther's vector
renderer, fastr through the paged PDF (`export_report_as_paged_pdf.ts`, the
same bytes Download saves), html through `rasterize_report_document.ts`, which mounts the
standalone document in a hidden iframe sized to the PRINTABLE AREA (so `vh`
blocks like a cover match the sheet), rasterizes it and cuts it into pages at
top-level block boundaries, a cover taking a full sheet of its own ground.
Two html2canvas facts are load-bearing: `foreignObjectRendering` is required
(the default text path drops the SPACES between words on these fonts), and
every `color(srgb …)` — how Chrome serializes the theme's `color-mix()` — must
be rewritten to rgba() first or it throws on an unsupported colour function.
The `sendReportEmail` route carries the attachment's MIME type), Rename… (`rename_report_modal.tsx` →
`updateReportLabel`; the host's heading follows at once) and Make a copy…
(the project list's `DuplicateReportModal`, seeded with the current label and
folder). The
Insert menu's Cover page row opens a thumbnail flyout (`CoverPicker`): one
tile per `FASTR_COVER_PRESETS` entry (a layout on the ground that shows it
best), each the REAL cover markup under the toolbar's scoped theme sheet plus
`buildFastrCoverTileCss` (a fixed 4:3 box the cover fills absolutely, em-scaled
by a 5px font), so a tile is what the insert will look like in the current
theme; the block segment's Layout control changes the composition afterwards.
The hidden `:::report` fence is never a block target — the Page menu owns it.
Right-clicking a table cell, a stat tile, a card, a column or a step opens
panther's `showMenu` (rows/columns for tables; add-before/after, a Columns
submenu and delete for tiles, cards and columns — the grid's column count
follows the child count while it fits, and a card's or column's whole block
moves as one, via `applyTilesChildAction`; add-before/after and delete for
steps via `applyStepsChildAction`, where a step is any DIRECT child of
`:::steps` — a paragraph's blank-separated run, or a nested block whole —
and deleting the only step removes the block). The Insert menu's Stat, Tiles,
Columns and Steps rows open the same count flyout as Table (`TilesPicker`,
1–4 across; 1–8 steps). Enter inside a step's island makes the NEXT step
rather than committing: the text after the caret (or a placeholder) becomes a
new blank-separated paragraph and its island is activated with the
placeholder selected, one dispatch. Text actions go through pure
functions in [lib/fastr_markdown_edits.ts](lib/fastr_markdown_edits.ts) that
return pre-transaction, disjoint, ascending changes for ONE dispatch — in `lib/`
because `server/tests/` cannot import from `client/src`, and the fiddly rules
(delimiters go inside the selection's whitespace; a heading or list never
touches a `:::` fence or a code line; ordered lists renumber from the top) are
settled by test rather than by clicking. The right half appears only when the
caret is inside a block and rewrites THAT block's opening fence via
`updateContainerFenceLine`, whose contract is that a patch changing nothing
returns the author's line byte for byte — otherwise every click churns the
version-history diff and emits Y.Text ops into everyone else's session. The
block under the caret comes from `fastrContainerStackUpTo` plus a separate
`fenceHere` for the caret's own line, which is the only way the leaf blocks
(`:::stat`, `:::report`, which carry no closing fence and so never enter the
stack) are reachable at all. Tone and role swatches render the REAL scoped
stylesheet rather than a colour computed in JS — a tone's muted ink and
rules are `color-mix` — and the scope root paints `--fm-page`/`--fm-ink`, so a swatch
shows the document's colours whatever the app's own theme is doing.

**The one real hazard is the cursor→Solid feedback loop.** The context is pushed
from inside a CodeMirror `updateListener`, i.e. mid-update; a synchronous signal
write there re-renders the toolbar mid-update and anything in that render that
touches the view throws *"Calls to EditorView.update are not allowed while an
update is in progress"* — on some keystroke pattern in production, not in the
first ten minutes. Hence `queueMicrotask` on the emit, a cached stack keyed by
line number, and a `key` string so an arrow-key storm within one line produces
no re-render at all. The toolbar must never call the editor API during render,
only from an `onClick`.

Three walkers now share one code-fence-aware scan (`scanContainerLines`): the
defect lister, `fastrTopLevelLineMask` and the container stack. They keep their
own depth/stack/defect logic, which genuinely differs — what they must not keep
is a private copy of the loop, because a drifting copy mis-nests a whole
document in silence.

**Live preview** ([live_preview_extension.tsx](client/src/components/report/live_preview_extension.tsx),
[lib/fastr_live_regions.ts](lib/fastr_live_regions.ts)): for FASTR reports,
Edit mode is an Obsidian-style surface — still CodeMirror on the same Y.Text
(collab, per-user undo and the toolbar untouched), but decorated. Top-level
`:::` regions, tables and embed lines (the pure region mapper, built on
`scanContainerLines`; tables by a conservative delimiter-row heuristic because
the editor's Lezer tree is commonmark and carries no Table nodes) collapse into
block widgets holding their TRUE render: the slice through
`renderFastrMarkdownToHtml`, sanitized, styled by the scoped theme sheet, with
live `ReportFigureEmbed`s mounted inside. **Nothing reveals its source any more — every block edits IN PLACE in its
rendered form.** Pressing a paragraph, list item or heading inside a rendered
widget swaps THAT ELEMENT (only) to its raw source line(s) — inline markdown
stays authorable — while the block's layout stays rendered around it;
Enter/blur commits one dispatch and the widget re-renders, Escape restores.
Table cells map through their row's data-line anchor + column index, and a
commit rebuilds the row line. Stats edit their value/label/delta as before.
All these editors activate on MOUSEDOWN (the browser decides what a press
selects at mousedown; a click-time activation leaves a non-editable island
that gets whole-widget-selected), and widget presses on non-editable areas
claim the mousedown with preventDefault, parking the caret for the toolbar —
shown as the widget's accent ring, since there is no source view to open.
Split is the raw-source surface. The revealed-region machinery
(buildRevealedRegion: chrome widgets, per-line grounds, the box layer for
revealed frames) is retained but unreachable by pointer — the historical
derivation: A revealed
region shows NO syntax at all: it decomposes into chrome (the fence lines,
replaced by the block's real header — a callout's title bar, a band's kicker —
and a silent end cap, each painted on the block's own ground), rendered leaves
(a stat is pure attrs, so it renders exactly and is driven by the toolbar; a
revealed `:::report` line keeps its page-setup chip), rendered embeds, and
editable TEXT lines. The block's VISUAL BOX — background, the theme's real
borders, radius, shadow — is drawn by a CodeMirror layer (`above: false`, the
selection-background mechanism): one absolutely-positioned element per
box-worthy frame carrying the block's REAL sheet classes, which is safe
precisely because absolute positioning makes the structural classes' margins
inert. Lines inside a boxed frame paint NO background of their own (a line
ground would sit over the box's border) — a tone class stays on the line for
its ink-token re-scoping with `background: transparent` inlined. The layer's
pixel geometry (`FM_BOX_GAP`/`FM_BOX_PAD_BOTTOM`/`FM_BOX_INSET`, exported from
report_fastr_css.ts) is shared with the emitted padding rules so box and lines
cannot drift; nested frames inset by depth. The scroller gets
`isolation: isolate`: CM's below-layers carry negative z-index, and only a
stacking context guarantees they paint above the page ground. Collapsed
widgets are `flow-root` with no padding, so the render's own margins provide
the preview's block rhythm. The editor is a bounded SHEET, not a
full-pane wash: the page ground lives on `.cm-scroller`, capped at `--fm-sheet`
(max(896px, measure + 48px) — the host reads the `:::report{width=…}` header
live via `readFastrDocumentSettings` and widens the measure/sheet for
wide/full documents), with the scope root's structure background overridden
back to transparent so the pane around the sheet stays app chrome. Full-bleed
geometry is re-aimed at the sheet: the scoped structure sheet's tile
neutralisation is overridden so `--fm-bleed-margin`/`--fm-bleed-pad` reach the
sheet's edges — pinned to the MEASURED content padding by a small plugin
(`sheetBleedVars`), because a calc from `--fm-sheet` overshoots by half the
vertical scrollbar and a band then pokes out of the sheet. The centering
theme's `padding-right` (sidebar alignment) is neutralised on the sheet and
replaced by a half-pad left shift (`--fm-center-pad`), so the pad can never
shrink the sheet's content area. The base editor theme's 56rem `.cm-content`
cap is lifted under the scope (wide/full must outgrow it). The
`:::report` document ground (`background=`/`bg`/`ink`) is painted by
`docGroundPlugin`: it applies the header's surface classes and style to the
scroller — the scoped fm-tone--*/fm-has-bg/fm-ink--* rules then style the
sheet exactly as they style View's `<html>`, dark-ground ink re-scoping
included — dropping the `fm-doc--*` width classes (their rem measures would
re-shear the px pin) and removing everything it applied on destroy so Split
is never tinted. It also sets `--fm-page-ground` on the scroller, the
ground as one property every descendant can read: a tone's ground token by
reference (`var(--fm-paper-ground)`, so a theme change follows), a literal
`background-color` as written, nothing for a gradient or an image (the
in-block seam then keeps the theme's page colour). Heading lines carry `cm-fm-h1`…`h6`, and the host
re-targets the theme sheet's own `h2`…`h6` rules at those classes (an h1 is a
plain heading — no masthead), with a trailing rule stripping the flow margins
a .cm-line must never carry.
Only LAYOUT-FREE sheet classes may be reused per line (the tone rules and the
callout-kind custom-prop setters); the structural block classes carry margins
that would repeat on every line. **The structure guard** (a
`transactionFilter`) refuses any USER edit — anything carrying a `userEvent`
annotation — that touches a protected line (fences, leaves, embeds, or any
part of a collapsed region), so the `{...}` attrs are reachable only through
the toolbar; programmatic transactions (setBlockAttrs, AI rebase, remote
yCollab) carry no userEvent and pass, and a user change swallowing an ENTIRE
region is a clean block delete and stays allowed. The caret may still SIT on a
protected line — that is how the toolbar targets a fence. The chrome's LABELS
edit in place: clicking a callout/card title, a band/cover kicker, or a stat's
value/label/delta turns that element contentEditable (Enter/blur commits an
`updateContainerFenceLine` patch — no userEvent, so the guard passes it;
Escape reverts), and an empty label renders as a muted placeholder so a
cleared title can always be brought back. The
regions are deliberately NOT atomic ranges (unlike `embedWidgets`) — arrowing
into a hidden region reveals it in the same transaction. In live mode the
region extension SUBSUMES `embedWidgets` (two block replaces on one range is
undefined behaviour); the compartment's OFF branch restores `embedWidgets` +
the dark markdown highlighter for Split, and other formats never get the
compartment at all. Inline syntax (heading marks, emphasis, code, link URLs) conceals
off-cursor via a viewport ViewPlugin. `[x]{.role}` / `[x]{size=12}` marks (by
regex — Lezer doesn't know them; `parseFastrMarkAttrs` in lib is THE parser,
shared with the renderer and the toolbar, role and size combinable in either
order) NEVER reveal: the phrase stays styled with the caret inside it, the
hidden markers are atomic so the caret steps over them, and the toolbar owns
the attributes. The mark's LABEL styling (role class + `font-size`) lives in
the whole-doc surface StateField, not the conceal plugin — a size changes
line height, which viewport-scoped decorations must not. An inline action
invoked with NOTHING selected acts on the word under the caret (the
word-processor convention) and refuses structural lines outright — fences,
code, embed lines — because the caret is parked ON the fence whenever a
block's chrome was clicked, and the old insert-a-bare-pair-at-caret both left
invisible atomic junk and corrupted fences (`wordAround` in
fastr_markdown_edits owns this). A mark edit over a range that overlaps
EXISTING marks never nests them (nesting is unrenderable): the range absorbs
any mark it cuts into and is rebuilt as flat segments — each existing mark's
attrs patched, plain text newly marked, same-attr neighbours merged — so
re-sizing a partly-sized phrase yields one mark and an inner role survives as
its own segment (`rewriteRangeMarks`); selections split per line and at table
pipes, so a label can never swallow a cell boundary. **A theme is five colours (Nick, 2026-09-09: "only use 5 colours and make
them more muted").** `lib/types/report_fastr_themes.ts` writes each theme as
a `FastrThemePalette` (paper, ink, accent, warm, cool) plus type and extra
rules; `deriveFastrThemeColors` mixes everything else from the five at
module load (surfaces and border as paper toward ink, muted ink as ink toward
paper, the five grounds with the type that reads on each, status colours as
the theme's own: danger = warm, success = cool, info = accent, warning = the
warm-cool middle, each with a faded twin for grounds of the other darkness),
and a custom style's page/ink/accent
re-derive the whole set (`derivedFor` in report_fastr_css.ts, scheme from the
custom page's luminance; a non-hex colour falls back to swapping the three).
A theme's `extraCss` names the five as `--fm-paper/-ink/-accent/-warm/-cool`
and never a literal colour (a test pins that, the saturation cap, the
distinctness of the five and the role mapping). **Figure colours follow the
theme — every scale, not just the series cycle.** Each theme's `chart` is a
`FastrThemeChart` derived the same way: `series` (accent, warm, cool, an
accent shade, then tints), `neutral` (the muted ink), `good` (cool), `bad`
(warm), `warn` (their middle) and a sequential `ramp` on the accent (a test
pins good to green hues, bad to red hues, warn to amber, the ramp to a real
lightness run, so the palettes' warms are red families and their cools green
families).
`fastrChartPalette(theme, colors)` turns that into the `FastrChartPalette` a
figure receives: a custom style's accent leads the series, and two derived
colours are added — `strong` (the document's ink) and `faint` (the neutral
faded 60% toward the page). It travels as `chartPalette?: FastrChartPalette`
through `buildFigureInputs` → `getStyleFromPresentationObject` → every style
builder: `getStandardSeriesColorFunc` maps `pastel-discrete`/`alt-discrete`
to the series cycle, `single-grey` and the roll-up total to `neutral`,
`red-green` to a `bad`→`good` scale and `blue-green` to the ramp (a lone series
takes the ramp's emphatic `to` end, not the tint); the percent-change bars use
neutral/good/bad, the disruption bands good/bad with the ink as the observed
line, the coverage chart ink/bad/faint for observed/projected/background.
**Conditional formatting's traffic lights re-tint too.** Each theme also
carries `warn` (its amber), and the palette derives `cells` — good, warn and
bad each faded 60% toward the page (the same tint the stock pastels are of the
app's colours), plus `none` = the page. `themeConditionalFormatting(cf,
palette)` (lib/types/conditional_formatting.ts) rewrites a THRESHOLDS format:
the three stock pastels and the darkened / brightened variants the seven-bucket
diverging presets derive from them (matched by exact string, computed with the
same `getAdjustedColor` calls) become the theme's tints with the same
adjustment, and a stock white / `#f0f0f0` no-data cell becomes the page. The
standard builder feeds the themed format to `compileCfToValuesColorFunc` (so
cells, CF-coloured bars and map regions all take it) and `getLegendFromConfig`
— which now takes the palette for EVERY legend, so the swatches match what
the special-chart builders draw — feeds it to `compileCfToLegend`; the
scorecard's per-indicator tiers use `cells` directly. What passes through
untouched: a bucket colour the user picked themselves, a structural key (the
neutral middle bucket), and scale-mode formats (a chosen ColorBrewer-style
ramp). A figure's explicit per-series colours are never replaced either. The
three report render sites pass the palette (the live embed through
`EmbedResolver.chartPalette`, the preview through the raster cache — whose key
includes the palette, so a re-theme re-rasters — and the export), and nothing
else does, so dashboards, slide decks and the visualization editor are
byte-identical to before.
**A report's live figures render in the LIGHT key-colour scheme.** Panther's
`FigureHolder` follows the app's colour scheme by default, so in a dark app
every keyed colour a figure uses resolved dark: a table's column-header ground
is the base page key (near-black), and the CF cell text strategy's base text
key is white, which painted black header cells with invisible year labels and
white values on the pale traffic-light tints (observed on an AI-made
completeness table, 2026-09-07). `ReportFigureEmbed` now passes
`scheme="light"`, the documented "document surface" setting: a document stays
light in a dark app, and dark GROUNDS inside the report remain the ink theme's
job. The preview raster and the export never entered the dark scope, so they
were already right. `applyInkTheme` also makes column-header grounds
transparent through the real option (`content.tableColHeaders.func`,
wrapping any per-header rule the figure carries); the `colHeaderBackgroundColor`
it used to set was not a panther option and did nothing.
**Figure ink follows the ground in BOTH directions.** A figure's stored style
is its dashboard's — a dark dashboard's white text arrives as white text — so
every place a report renders one re-inks it for the ground it actually sits
on: `isDarkGroundBehind` walks up to the nearest painted ancestor (a theme's
figure card, a band, the page) and picks the palette's LIGHT ink on a dark
ground or its DARK ink (`figureDarkInkForColors`: the page's own ink when the
page is light, `GENERIC_DARK_INK` otherwise) on a light one. The preview
(`inkFor`), the standalone export and the live editor's `ReportFigureEmbed`
(which measures its own element on mount and again once the widget is in the
document, through `EmbedResolver.inkFor`) all apply the same rule; series
colours stay as configured. Before this only dark grounds were handled, so
Risograph — whose figure card is the light page colour — showed a
dark-dashboard figure's white text on cream. The AI brief (`FASTR_MD_SYNTAX_DOC`, the one source for both the editing
view's system prompt and the create_report tool) documents every element the
editor can insert — cover `layout`, `:::contents`, `numbering=sections`,
`color=`/`size=`/`underline`/`highlight=` marks — and its composition guidance
now says WHEN to reach for them (a layout per report, contents past four or
five sections, numbering for a formal review); a test pins that coverage, so
an editor feature cannot ship without the model being told. The literal-colour
gate (`listFastrLiteralBackgrounds`, used by the create tool and the client's
rewrite validator) lists phrase-mark `color=`/`highlight=` literals beside
block `bg=` ones, each with its `attr`, so an AI draft full of hex marks is
refused the same way a draft full of hex grounds is. The pill also carries FIND (CodeMirror's own `search({top:true})` panel, over
the SOURCE, so a phrase inside a collapsed block is reachable where the
browser's Ctrl+F cannot look; the panel is re-skinned as app chrome by the
surface sheet, since it sits on a themed document), a LINK button doubling
Mod-K, a QUOTE toggle beside the two list buttons, a HIGHLIGHT picker
(`highlight=<colour>`, a fifth mark attribute — literal only, `safeCssColor`
gated like `color=`, and coexisting with a role rather than replacing it) and
a TABLE segment that appears only while the caret is in a table
(`ReportBlockContext.table`, the same `applyTableCellAction` the cell
right-click menu uses, so rows and columns are reachable without knowing
about right-click). Applying a list kind now REPLACES whatever list marker is
there rather than stacking one; a quote still wraps a list. Islands COMMIT AS THEY ARE TYPED (text islands, the chrome attr editors and
table cells alike): every keystroke is a normal doc change, so under collab a
peer sees the cover title change letter by letter and nothing depends on a
blur that a widget rebuild may swallow. The island's own commits carry the
`islandCommit` annotation, and the region field keeps the ACTIVE region's
widget key (`RegionWidget.sourceKey`, carried through `LiveState.keys`) for
those, so the widget the user is typing in is never rebuilt under the cursor
— while a remote edit or a toolbar fence patch into the same region carries no
annotation and re-renders it as before. A region whose source is unchanged
keeps its key across ANY transaction (a caret move must not rebuild the
island). Closing an island dispatches `rebuildRegions`, which bumps
`LiveState.rev` — part of every touched region's key — so the committed text
is rendered even when it equals what the island started with (an Escape puts
the original back with one more commit). That closing dispatch is deferred a
microtask and dropped if the island is by then detached: Chrome fires the
blur of a removed focused element DURING CodeMirror's own update (where a
dispatch throws) and before the node is actually detached. A line-count
change in an island (Shift+Enter) lets the rebuild happen and re-opens the
island on the rebuilt element. Peer PRESENCE from inside an island: y-codemirror
publishes the caret only while the CM view has focus, and an island takes
focus from it, so the selection mirror publishes the caret itself through the
`presenceFacet` (`publishIslandCaret`, relative positions on the shared
Y.Text) — the attr editors publish their fence line on activation. Toolbar text actions reach
selections inside widget text islands AND table cell islands through a
selection MIRROR
(`selectionchange` → CM selection, alive only while an island is active);
cell islands park the caret at the cell's content inside the row line first
(same park-then-activate), which is also what gives the toolbar the table's
context on the first click;
because that mirror flips the region active — a widget rebuild that would
destroy the island mid-edit — island activation parks the CM selection into
the region FIRST and then activates the POST-rebuild element (found by
`data-line`, activated via its `_fmActivate` hook). The document opens FLUSH, as View does: blank lines above the first visible
block (View renders none) collapse to zero height via `cm-fm-lead`, the first
visible plain line loses its top padding (`cm-fm-first`) and the first region
carries `fm-live-region--first`, whose two-class rule beats the general
first-child margin clamp — otherwise every report began with a strip of bare
page ground above its cover. An all-blank document keeps its clickable lines
(there is no first visible block to flush against). Heading lines get
`cm-fm-hN` classes from a whole-doc StateField because font size changes line
HEIGHT and height-affecting decorations must exist off-screen. The editor wrapper carries
`fm-live-scope`, and one host-rendered `<style>` (the scoped theme sheet +
`buildFastrEditorSurfaceCss`, font import leading) themes both the widgets and
the editor's own text — a theme switch re-renders that element and never
touches CodeMirror, which is why `RegionWidget.eq` keys on the source slice
only. The document stays light in a dark app (documents-stay-light); a
`:::report` line is fully HIDDEN (zero-height widget, atomic so the caret
skips it) — findable through the toolbar's Page setup popover, which edits
the fence from anywhere via `setBlockAttrs` (or `insertPageSetup` when the
document has no header yet). A region widget's ROOT is built once (`RegionWidget.toDOM`: the element,
its reveal/embed-select listeners reading the current widget through a
`_widget` ref) and everything content-dependent lives in `fill()`; a widget
with a different key for the SAME region (a peer's keystroke inside the block,
a toolbar fence patch) re-renders through `updateDOM` into the existing
element rather than replacing it. CodeMirror lays a fresh block element out
at its ESTIMATED height until the next measure, and that estimate-then-correct
on every remote keystroke was a visible jolt of everything below the block
for every peer; an in-place fill keeps the measured height. The element at a
slot after a structural change may stand for a different region, so
`updateDOM` demands the same kind and start line and otherwise lets CodeMirror
rebuild. Every widget's FIRST child is a `.fm-peer-layer` (absolute, covering
it): the sheet's first/last-child margin clamps address the child after it,
so an overlay never hands a block its full margin back (a 37px shift on every
repaint when the caret was the last child), and nothing is ever appended
inside an open island, whose textContent is what it commits. Peer carets
inside a rendered region have no text layer to sit in, so an awareness-driven
plugin draws them INSIDE the widget itself (`regionPresencePlugin.placeCaret`):
the peer's document position → the region-relative line → the element the
renderer anchored for it (`[data-line]`: a paragraph or heading, a table
row's cell by pipe count, or the block element itself for a caret parked on a
fence) → a rendered-text offset (`fastrStripInlineSyntax` of the source
prefix past the line marker, edges kept; an OPEN island's text is the source,
so there the column is the offset) → a Range on the text nodes (hidden syntax
and inter-tag whitespace skipped) → an absolutely positioned `.fm-peer-caret`
with the same bar, dot and hover name flag as yCollab's paragraph caret. The
whole-widget border survives only as the fallback for a position nothing
rendered stands for. Repaints coalesce on a plain tick, not an animation
frame (a background tab can wait a long time for a frame). `yCaretHygiene`
no longer clears the caret when focus moves INTO the editor's content (an
island is a contentEditable inside contentDOM), which would otherwise erase
the island's own publish a tick later. Bands and covers bleed to the SHEET's edges in Edit (the re-aimed
bleed vars above); Split/View remain the true page, where the bleed is the
viewport.

**Autosave protocol** (no-room path: once a collab session becomes ready the
800ms REST autosave is turned off for good and edits flow over the WS, S16):
800ms debounce → `updateReportBody({body,
expectedLastUpdated, overwrite: true})`; the server **always writes** and
returns `{lastUpdated, conflicted}`, where `conflicted` is advisory
([db/project/reports.ts:127-163](server/db/project/reports.ts#L127-L163));
the client bumps its base timestamp monotonically (out-of-order responses
can't rewind) and shows a dismissible "your changes were saved over theirs"
banner. The `overwrite` param is accepted but unused, reserved for a
hard-reject mode (Open item). Figures/images/config/label are separate
whole-registry PUTs with **no concurrency guard**, the known MED
lost-update race on the registries (Open item).

**AI-diff view**: the `editing_report` view context registers `proposeEdit`
and `applyFigureUpdate`. `proposeEdit` is now the propose phase of the report
tools' approval lifecycle (S13), whose `customProposalUI` opens a
`@codemirror/merge` MergeView modal (accept/reject).
On accept, figures persist FIRST and roll back client-side if the save fails
(the AI is told the edit was not applied), then the body applies through the
editor API with the local-edit echo suppressed.

## Dashboards

**Storage.** `dashboards` (title, `is_public`, `layout` = `sidebar | grid`,
`config` = logos + about, slug held in the **main** DB, see below) +
`dashboard_items` (`figure_block`, nullable `geo_data`, `sort_order`,
`replicant_group_id`/`replicant_value`) + `dashboard_item_groups`
(`replicate_by`, `default_replicant_value`, ordered `replicants` JSON, and
the group's **shared** `geo_data`: members store none). A group = 1 group
row + N tagged member items inserted contiguously in one transaction.

**Entry CRUD.** 13 routes; every item/group mutation bumps the parent
dashboard row in the same transaction. `moveDashboardItems` rewrites the
full order (`(i+1)*10`, tie-free, since the old anchor+offset approach collided
when a moved group was wider than the gap). **`replaceDashboardEntry`** is
the single structural-reshape primitive: replace one entry (item or group)
with a new entry of either kind, preserving position. Inside one
transaction it reads the old position, deletes, shifts trailing rows to open
a tie-free hole, inserts, bumps, reSequences.

**Editor reconciliation rules** (`dashboard_editor.tsx`, 1080 LOC): an item
expands to a group only when the edited config **gains** a replicant
dimension (`oldHadReplicant` test); an item pinned to one replicant stays an
item (a cleared pick is restored). A group with the same dimension + same
value set gets an in-place member update behind a progress-only modal (no
confirm, since a cancel would discard); a different dimension/set → confirmed
rebuild via `replaceDashboardEntry`; no dimension → confirmed collapse to
item. Member resolution (`resolveMembersWithProgress`) builds one figure per
replicant and captures shared geo from the first member that has it;
structure discovery uses `excludeReplicantFilter: true` (keeps user filters,
drops the auto-pin). Group member updates are **matched by
`replicant_value`**: a vanished value silently no-ops (v1 same-set
assumption, unverified server-side, Open item).

**No conflict detection** anywhere in the family, and no dashboard-specific
permission flags. Both are Contract facts above.

## Slugs & the public viewer

**Slug indirection.** `dashboard_slugs` lives in the **main** DB (slug PK →
`{projectId, dashboardId}`) because dashboard ids are only unique per
project. The slug is what routes a bare `/d/:slug` to the right project
database. Format `^[a-z0-9]+(-[a-z0-9]+)*$`, 3-60 chars; uniqueness checked
with self-exclusion. Lifecycle writes are **non-transactional cross-DB
pairs**, all main-DB-first with compensation: create inserts the slug then
deletes it on project-insert failure; update moves the slug then restores
the previous one on project-update failure; delete removes the slug then
re-inserts it on project-delete failure.

**Auth boundary** (root [main.ts](main.ts)): `/api/d/*` gets CORS + a
**populate-only** Clerk middleware (attaches session context, never
rejects); `routesPublicDashboard` mounts BEFORE the global auth middleware;
`/d/:slug` serves the SPA HTML pre-auth. The route
([routes/public/dashboard.ts](server/routes/public/dashboard.ts)): resolve
slug on main (READ_ONLY) → project connection → detail; `isPublic: false`
requires any Clerk session (`getAuth(c)?.userId`). Under `_BYPASS_AUTH`
there is no session at all, so a private dashboard is hidden from everyone
in that mode. **All four failure modes return the identical 404**, with no
oracle distinguishing "private" from "doesn't exist". The response is
`buildPublicDashboardBundle(detail, countryIso3)`: titles/bundles only,
no emails or project ids; `countryIso3` is the env-sourced
`_INSTANCE_COUNTRY_ISO3` (label cleaning has no failure mode to guard).

**`buildPublicDashboardBundle`**
([lib/types/dashboard.ts:148](lib/types/dashboard.ts#L148)) is the single
shared transform: it sorts, collapses members into `entries`, injects the
group's shared geo into each member bundle as `{kind:"data"}`, skips
bundle-less items, and cleans replicant labels. It is used by BOTH the server
public route and the in-app editor (via a thin client wrapper, "so they can
never diverge").

**Client viewer**: `/d/:slug` registers before the logged-in catch-all:
outside the app shell, raw `fetch` with `credentials: "include"` (a
logged-in user can view private dashboards at the same URL), local
`AlertProvider`. Chrome: title bar with placement-configurable logos, About
modal, summary strip; `sidebar` layout (nav list, group members indented) or
`grid` (2-col tiles, per-tile replicant `Select`). The download modal
(PNG/PDF/PPTX/XLSX, scope current/all, >50-figure confirm, honest
table-count for XLSX) is the **only** dashboard export entry. The in-app
editor's outward path is just the public URL.

## FigureBundle: the three storage surfaces

This is S12's slice of the FigureBundle refactor; the full architecture
(bundle shape, `buildFigureInputs`, the invariants, localization) lives in
[SYSTEM_10](SYSTEM_10_figure_render_export.md). S12 owns the three surfaces
that **store** bundles and the public/export paths that **render** them.

- **What is stored.** All three surfaces embed the strict
  `FigureBlock = { type: "figure", bundle?: FigureBundle }`
  ([lib/types/_figure_bundle.ts](lib/types/_figure_bundle.ts)). Slides carry
  it inside the layout tree
  ([_slide_config.ts](lib/types/_slide_config.ts)); dashboards in the
  `figure_block` column
  ([_dashboard_config.ts](lib/types/_dashboard_config.ts)); reports in the
  `figures` registry ([reports.ts](lib/types/reports.ts), one shared block
  schema across all three). The strict schema is what lets the migration
  skip-gate catch legacy blocks (S2) and what made deleting the old
  force-run safe.
- **Capture-on-write.** Each surface assembles a bundle from the live build
  inputs: `config` + frozen `items` + the `resultsValue` projection +
  `indicatorMetadata` + `dateRange` + `geo` + **`localization` = the
  instance locale** (NOT the session toggle) + `metricId`/`snapshotAt` +
  free `provenance`. The bundle is undefined-free pure JSON, so it persists
  with no stripping.
- **Build-on-render: every surface.** On-screen render, exports, and the
  public viewer all call `buildFigureInputs(bundle, deckStyle?)`. The
  public/export path "just works" because the bundle carries its own
  `localization`. The old `hydrateFigureInputsForPublicRendering`
  special-casing was deleted.
- **The sentinel layer is gone.** Bundles carry no `undefined` values, so
  the `@@__UNDEFINED__@@` encode/decode wrappers were deleted along with
  `lib/json_slide_serialize.ts` itself. Follow-on status: the **reports**
  route bodies are tightened (`reportFiguresSchema`/`reportImagesSchema`);
  the **slides** bodies remain `z.unknown()` pending the PatternType
  `"none"` schema gap (see Slide decks above).

## Caches & the notify triangle

Per-family t2 reactive caches version off the SSE-pushed `lastUpdated` maps
(version is part of the cache key, so a flip is an automatic miss): `slide`
(per slide), `slide_deck_detail` (per deck), `dashboard_detail` (per
dashboard). **Reports have no t2 cache**: the editor and exports fetch
`getReportDetail` directly; summaries live in T1 via `reports_updated`.
Every family follows the pattern: mutations fire
`notifyLastUpdated(projectId, table, ids, ts)` + a full-list re-broadcast
(`notifyProject{SlideDecks,Reports,Dashboards,…Folders}Updated`) on
list-affecting ops. Coverage is inconsistent at the edges, with two real
staleness candidates: `moveSlideDeckToFolder` / `moveReportToFolder` bump
the row's `last_updated` in the DB but fire **no** `notifyLastUpdated` (a
changed row the triangle never pushes), and slide create/delete/move never
re-broadcast the deck list although its summary embeds `first_slide_id`
(Open item).

## Emails

[routes/project/emails.ts](server/routes/project/emails.ts) is the only
SendGrid egress (raw fetch, `Bearer _SEND_GRID_API`, from
`noreply@fastr-analytics.org`). `sendSlideDeckEmail`
(`can_view_slide_decks`, deliberately the view flag): the PDF is
client-rendered (S10 base64 export); recipients are schema-validated
(`z.array(z.email()).min(1).max(50)`); sequential per-recipient sends with
partial failures returned as `{sent: false, failedRecipients}`.
`sendHelpEmail` (bare `requireGlobalPermission()`, which authenticates only,
never checks `approved`, Open item): one email per
`_FEEDBACK_EMAIL_RECIPIENTS` with `replyTo` the user, then a confirmation
to the user only after at least one internal send succeeded. Zero internal
deliveries returns `success: false` (the form shows the error instead of
"Thank you"). User-typed text (`message`/`description`/`projectLabel`/
`userEmail`) is HTML-escaped before interpolation in both routes.

## Open items

- **Reports registry lost-update race (MED, known)**: figures/images/config
  PUTs are whole-registry replaces with no concurrency guard, so two editors
  (or human + AI `applyFigureUpdate`) clobber each other. Narrowed by S16:
  while a collab room is live these route through the room and merge; the
  race remains for the no-room path.
- **Non-transactional duplicates**: `duplicateSlides` (shift + INSERT loop
  outside `begin`) and `duplicateSlideDeck` (no transaction) leave partial
  state on mid-loop failure.
- **Notify coverage gaps**: `moveSlideDeckToFolder`/`moveReportToFolder`
  bump `last_updated` without a push; slide create/delete/move don't
  re-broadcast the deck list (`first_slide_id` staleness);
  `updateReportFigures/Images`, `updateSlideDeckPlan`,
  `updateDashboardItem/ItemGroup`, `moveDashboardItems` skip the list
  re-broadcast.
- **Dashboards**: zero optimistic concurrency; no dashboard-specific
  permission flags (rides the slide-deck pair): document as contract or
  add flags; group member update silently no-ops for vanished replicant
  values; every mutation route re-runs `getAllDashboards` (project + main
  DB) just to broadcast, N× for batch deletes.
- **`sendHelpEmail` approved-user question**: the guard never checks
  `approved`, so unapproved (Clerk-authenticated but not-added) users can
  send feedback. Possibly intended: an unapproved user may legitimately
  need to reach support. Decide and either document or add the check.
- **`overwrite` on `updateReportBody` is dead**: always sent `true`,
  ignored by the DB fn; wire the hard-reject mode or drop it.
- **`_shared/**` custody**: `dhis2_credentials/` is consumed only by
  S5/S6/S7 surfaces and documented by S7; `sort_control.tsx` is shell
  furniture (SYSTEM_14 flag). Settle via manifest move or a §4.1 exception
  row.
- **Type casts on mutation bodies**: `body as any` ×5 in the dashboards
  routes, `body.figures as any`, `body.slide as Slide`, `body.config as
  SlideDeckConfig`: the Zod-validated body is discarded typewise; ties into
  the tighten-to-schema follow-on.
- **Committed debug logging** in the slide editor ("FUZZ DEBUG" blocks incl.
  a full layout-tree dump on every measure).
- **Dead code**: `PasswordGate.tsx` (zero importers, EN-only); the ~90-line
  commented-out text-size slider block + its 5 imports in
  `editor_panel_content.tsx` (`TextBlockStyle.textSize` has no UI writer, which
  pairs with S10's dead-at-render textSize item); dead `editingSlideId`
  signal; `slide_deck_folders.description` column has no UI writer;
  duplicate modal pairs (deck/report duplicate + move modals are 231/231 and
  167/167 LOC copy-paste twins).
- **Barrel bypass**: `slide_list.tsx` imports the vendored SortableJS
  wrapper via a deep `../../../../panther/...` path instead of `"panther"`.
- **`deleteSlides` returns `deletedCount: slideIds.length`** regardless of
  rows actually deleted, and the route mints its own timestamp before the DB
  call (SSE/response ts differs from the rows').
- **3-char nanoid id space** (~30k combos/table) is per-project fine, but
  any future cross-project surface must key by `(projectId, id)` as
  `dashboard_slugs` already does.
