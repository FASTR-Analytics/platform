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
  - server/routes/project/slide_deck_folders.ts
  - server/routes/project/slide_decks.ts
  - server/routes/project/slides.ts
  - server/routes/public/dashboard.ts
  - server/tests/fastr_live_regions_test.ts
  - server/tests/fastr_markdown_edits_test.ts
  - server/tests/report_fastr_markdown_test.ts
  - server/tests/report_format_helpers_test.ts
  - server/tests/report_html_sanitize_test.ts
  - server/tests/report_sections_test.ts
  - server/utils/id_generation.ts
docs_absorbed:
---
# S12 — Documents & Sharing

The three figure-snapshot-embedding artifact types — slide decks, markdown
reports, and dashboards — plus the public slug-addressed viewer and the
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
(hardcodes 7 tables — Open item). Lib: slide/report/dashboard types incl.
`buildPublicDashboardBundle` and `buildReportPreview`. Custody wrinkle: the
`_shared/**` glob also carries `dhis2_credentials/` (all consumers are
S5/S6/S7 surfaces — SYSTEM_07 documents it) and `sort_control.tsx`
(shell furniture — flagged in SYSTEM_14); the three logo files are genuinely
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
the CRDT merge is the conflict resolution — the philosophies below engage only
when no room is live. The collab checkpoint functions and additive columns
(`saveSlideCheckpoint` / `saveReportCheckpoint`, `crdt_state` /
`crdt_state_last_updated` / `body_authors`) ride this system's
`server/db/project/{reports,slides,slide_decks}.ts`, and the version-history
routes ride its route files — S12 owns the files, S16 the feature (SYSTEMS.md
§4.1; [SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)). Reads are
guarded by `can_view_*`,
mutations by `can_configure_*` + `preventAccessToLockedProjects` — dashboards
have no flags of their own and ride the slide-deck pair (Open item). The
public viewer is the app's only unauthenticated product surface (cross-cutting
audit SYSTEMS.md §4.3.9).

## Slide decks

**Data model.** A deck row (`label`, free-text `plan` — the AI planning
scratchpad, JSON `config` = deck style) + one row per slide (JSON `config` =
one `Slide`, integer `sort_order`; FK cascade on deck delete). Deck and slide
ids are 3-char nanoids. `getSlideDeckDetail` returns only ordered `slideIds`;
slide bodies fetch per-slide through `_SLIDE_CACHE`. Sort orders are
**gap-numbered** (append = max+10, insert = target±5) with `reSequence`
(`ROW_NUMBER()*10`) run inside the create/delete/duplicate transactions;
`moveSlides` ([db/project/move_slides.ts](server/db/project/move_slides.ts))
is **within-deck reorder only** — no cross-deck slide move exists.

**The deck-touch rule.** Every slide mutation bumps
`slide_decks.last_updated` with the same timestamp in the same transaction —
that touch is what drives the SSE push and t2 cache versioning. Exceptions
(Open item): `duplicateSlides` runs its shift-UPDATE and per-slide INSERT
loop **outside** any transaction, and `duplicateSlideDeck` has no transaction
at all — a mid-loop failure leaves partial rows.

**Validation at write.** Deck config is validated at both the route body
(`slideDeckConfigSchema`) and the DB layer; slide bodies are **`z.unknown()`
at the route** — blocked on a real gap: panther's `PatternType` includes
`"none"` but the split-fill Zod enum doesn't
([lib/api-routes/project/slides.ts:16-18](lib/api-routes/project/slides.ts#L16-L18))
— with `slideConfigSchema.parse` as the DB-layer backstop. The layout tree is
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
([layout_editor/build_context_menu.ts](client/src/components/layout_editor/build_context_menu.ts))
— split/add/move/delete/convert, reachable from both the panel button and
canvas right-click. Figure blocks resolve through the S10 shared resolvers
(select existing viz → `resolveFigureBundleFromVisualization`; edit →
ephemeral S11 editor + rebuild; create → `AddVisualization` + build). Local
edits notify the AI (`edited_slide_locally`) and the editor registers the
`editing_slide` view's mutator context on the AI view controller (S13).

**The per-slide save loop** (the no-room/offline path — while a collab
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
error (no overwrite path — the human editor's modal is the only override).

**Lists & operations.** `ProjectDecks` reads T1 (`projectState.slideDecks`,
SSE-maintained), groups `folders | flat` with a "General" pseudo-group,
sorts client-side (`sortBySortMode` — not the server ORDER BY), multi-selects
via `createSelectionController`, and batches move/duplicate/delete. The deck
view's `SlideList` renders cards in the vendored SortableJS wrapper
(multiDrag; optimistic local order; reorder diffs the moved run and calls
`moveSlides`). Deck cards track both the deck's and the first slide's
`lastUpdated`. Folders have **no GET route** — they ride the project-state
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
Each theme declares `scheme: "light" | "dark"` which picks
`FASTR_SEMANTIC_COLORS`, and every rule that establishes a dark ground
(`tone=solid|dark|gradient|inverse`, `fm-ink--light`, `fm-card--accent`)
re-emits the dark set locally — pinned by a test, since the first attempt
missed `fm-tone--dark` and nothing else would have caught it. Tokens are
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
starts mid-block. Exports: `.html` + print, same builder as html; PDF/Word are
deliberately absent because panther's markdown IR cannot represent the blocks
and would silently drop every one.

**Backgrounds and page-level design.** The format's answer to "everything html
reports can do" is to name the ROLE, not the value. Every block takes
`tone = default|muted|accent|solid|dark|inverse`, resolved once in `surfaceFor`
([lib/fastr_markdown_blocks.ts](lib/fastr_markdown_blocks.ts)); each theme maps
the six to its own palette (`toneDark`/`toneDarkInk` are real per-theme values,
so Ministry's dark band is deep green and Swiss's is black), and a re-theme
keeps every band readable. A tone re-scopes the `--fm-ink*`/`--fm-accent`/
`--fm-border` TOKENS on the block so descendants follow — including the figure
rasters, whose ground probe reads the computed background these rules paint.
**Two traps, both found live and both now pinned by a structural test:** a rule
may not read a custom property it also redefines (`background: var(--fm-accent)`
beside `--fm-accent: …` resolved against the override and rendered a solid card
white-on-white — hence `--fm-solid-bg`/`--fm-inverse-bg`), and a tone must
re-declare `color`, not only the token, because an element inherits its parent's
COMPUTED colour (paragraphs stayed dark on a dark band while headings, which set
colour explicitly, did not).

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
`attr(`) as the `background` shorthand. `tone=gradient` is the theme-safe
equivalent. `ink=light|dark` overrides the ink otherwise derived from the
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
`--fm-accent` must re-scope `--fm-accent-text` too, or a `tone=dark` tile shows
a black number on black; a structural test enforces the pair. A tone on a
`tiles` or `columns` grid also gets padding, since a grid has none of its own
and the ground would otherwise show only through the gaps between tiles.

Four of the tones — `danger`, `warning`, `success`, `info` — are MEANING grounds
rather than palette entries. They reuse the semantic colours the callout kinds
and stat deltas already carry, and are deliberately the SAME strong colour in
every theme: a danger tile is a saturated red panel on a white page and on a
near-black one, because "this is the bad news" is not a thing a theme should be
free to reinterpret. Every tone rule doubles its class (`.fm-tone.fm-tone--dark`,
specificity 0,2,0) so it outranks any background a THEME sets on the same
element — brutalist paints `.fm-callout` white, which at equal specificity beat
`.fm-tone--danger` and left white type on a white callout.
And a theme that paints a
heading WITH the accent — brutalist's highlighter `h1` — renders it invisible on
a ground that is already the accent, so any accent ground clears the heading
background.

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
block. Background is ONE menu for both ground kinds — the theme's tones as
preset swatches on top, the literal colour grid + hex field below — and keeps
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
(words, headings, visualizations, images, last saved). The printed SHEET is
deliberately NOT a control: `:::report` still accepts
`pagesize`/`orientation`/`margin` and `fastrPageRuleCss` still writes the
`@page` rule the .html export, the print frame and the emailed PDF use, but
nothing in the UI or the AI brief sets them, so a report prints A4 portrait
with normal margins unless a body says otherwise by hand. Theme and Background
are hover FLYOUTS — `MenuFlyout`, the pure-CSS row-plus-panel the Insert pickers
already used and now share. The theme flyout's tiles are drawn from
`FASTR_THEME_TOKENS` (page, ink, accent, dark tone, heading face) rather than
from scoped copies of every theme's stylesheet, which would be ~17 sheets in
a dropdown. The menu
row opens with a FILE menu (Google Docs' shape): Download… (the host's
`DownloadReport` modal — the header's Download button hides while the toolbar
shows it), Email this file… (`share_report.tsx`, the slide deck's share modal
for a report: the attachment is always a PDF, built in memory by
`exports/export_report_attachment.ts` — markdown through panther's vector
renderer, html/fastr through `rasterize_report_document.ts`, which mounts the
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
stylesheet rather than a colour computed in JS — `fm-tone--accent` is a
`color-mix` — and the scope root paints `--fm-page`/`--fm-ink`, so a swatch
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
is never tinted. Heading lines carry `cm-fm-h1`…`h6`, and the host
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
pipes, so a label can never swallow a cell boundary. Toolbar text actions reach
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
document has no header yet). Peer carets
inside a collapsed region have no text to sit in, so an awareness-driven
plugin paints the peer's colour and name on the widget instead (relative
positions resolved with the `yCaretHygiene` ownership check; DOM-only writes,
never a dispatch). Bands and covers bleed to the SHEET's edges in Edit (the re-aimed
bleed vars above); Split/View remain the true page, where the bleed is the
viewport.

**Autosave protocol** (no-room path — once a collab session becomes ready the
800ms REST autosave is turned off for good and edits flow over the WS, S16):
800ms debounce → `updateReportBody({body,
expectedLastUpdated, overwrite: true})`; the server **always writes** and
returns `{lastUpdated, conflicted}` — `conflicted` is advisory
([db/project/reports.ts:127-163](server/db/project/reports.ts#L127-L163));
the client bumps its base timestamp monotonically (out-of-order responses
can't rewind) and shows a dismissible "your changes were saved over theirs"
banner. The `overwrite` param is accepted but unused — reserved for a
hard-reject mode (Open item). Figures/images/config/label are separate
whole-registry PUTs with **no concurrency guard** — the known MED
lost-update race on the registries (Open item).

**AI-diff view**: the `editing_report` view context registers `proposeEdit`
— now the propose phase of the report tools' approval lifecycle (S13), whose
`customProposalUI` opens a `@codemirror/merge` MergeView modal
(accept/reject) — and `applyFigureUpdate`;
on accept, figures persist FIRST and roll back client-side if the save fails
(the AI is told the edit was not applied), then the body applies through the
editor API with the local-edit echo suppressed.

## Dashboards

**Storage.** `dashboards` (title, `is_public`, `layout` = `sidebar | grid`,
`config` = logos + about, slug held in the **main** DB — below) +
`dashboard_items` (`figure_block`, nullable `geo_data`, `sort_order`,
`replicant_group_id`/`replicant_value`) + `dashboard_item_groups`
(`replicate_by`, `default_replicant_value`, ordered `replicants` JSON, and
the group's **shared** `geo_data` — members store none). A group = 1 group
row + N tagged member items inserted contiguously in one transaction.

**Entry CRUD.** 13 routes; every item/group mutation bumps the parent
dashboard row in the same transaction. `moveDashboardItems` rewrites the
full order (`(i+1)*10`, tie-free — the old anchor+offset approach collided
when a moved group was wider than the gap). **`replaceDashboardEntry`** is
the single structural-reshape primitive — replace one entry (item or group)
with a new entry of either kind, preserving position: inside one
transaction it reads the old position, deletes, shifts trailing rows to open
a tie-free hole, inserts, bumps, reSequences.

**Editor reconciliation rules** (`dashboard_editor.tsx`, 1080 LOC): an item
expands to a group only when the edited config **gains** a replicant
dimension (`oldHadReplicant` test); an item pinned to one replicant stays an
item (a cleared pick is restored). A group with the same dimension + same
value set gets an in-place member update behind a progress-only modal (no
confirm — a cancel would discard); a different dimension/set → confirmed
rebuild via `replaceDashboardEntry`; no dimension → confirmed collapse to
item. Member resolution (`resolveMembersWithProgress`) builds one figure per
replicant and captures shared geo from the first member that has it;
structure discovery uses `excludeReplicantFilter: true` (keeps user filters,
drops the auto-pin). Group member updates are **matched by
`replicant_value`** — a vanished value silently no-ops (v1 same-set
assumption, unverified server-side — Open item).

**No conflict detection** anywhere in the family, and no dashboard-specific
permission flags — both are Contract facts above.

## Slugs & the public viewer

**Slug indirection.** `dashboard_slugs` lives in the **main** DB (slug PK →
`{projectId, dashboardId}`) because dashboard ids are only unique per
project — the slug is what routes a bare `/d/:slug` to the right project
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
requires any Clerk session (`getAuth(c)?.userId`) — under `_BYPASS_AUTH`
there is no session at all, so a private dashboard is hidden from everyone
in that mode. **All four failure modes return the identical 404** — no
oracle distinguishing "private" from "doesn't exist". The response is
`buildPublicDashboardBundle(detail, countryIso3)` — titles/bundles only,
no emails or project ids; `countryIso3` is the env-sourced
`_INSTANCE_COUNTRY_ISO3` (label cleaning has no failure mode to guard).

**`buildPublicDashboardBundle`**
([lib/types/dashboard.ts:148](lib/types/dashboard.ts#L148)) is the single
shared transform — sorts, collapses members into `entries`, injects the
group's shared geo into each member bundle as `{kind:"data"}`, skips
bundle-less items, cleans replicant labels — used by BOTH the server public
route and the in-app editor (via a thin client wrapper, "so they can never
diverge").

**Client viewer**: `/d/:slug` registers before the logged-in catch-all —
outside the app shell, raw `fetch` with `credentials: "include"` (a
logged-in user can view private dashboards at the same URL), local
`AlertProvider`. Chrome: title bar with placement-configurable logos, About
modal, summary strip; `sidebar` layout (nav list, group members indented) or
`grid` (2-col tiles, per-tile replicant `Select`). The download modal
(PNG/PDF/PPTX/XLSX, scope current/all, >50-figure confirm, honest
table-count for XLSX) is the **only** dashboard export entry — the in-app
editor's outward path is just the public URL.

## FigureBundle — the three storage surfaces (shipped 2026-06-13)

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
  `figures` registry ([reports.ts](lib/types/reports.ts) — one shared block
  schema across all three). The strict schema is what lets the migration
  skip-gate catch legacy blocks (S2) and what made deleting the old
  force-run safe.
- **Capture-on-write.** Each surface assembles a bundle from the live build
  inputs: `config` + frozen `items` + the `resultsValue` projection +
  `indicatorMetadata` + `dateRange` + `geo` + **`localization` = the
  instance locale** (NOT the session toggle) + `metricId`/`snapshotAt` +
  free `provenance`. The bundle is undefined-free pure JSON, so it persists
  with no stripping.
- **Build-on-render — every surface.** On-screen render, exports, and the
  public viewer all call `buildFigureInputs(bundle, deckStyle?)`. The
  public/export path "just works" because the bundle carries its own
  `localization` — the old `hydrateFigureInputsForPublicRendering`
  special-casing was deleted.
- **The sentinel layer is gone.** Bundles carry no `undefined` values, so
  the `@@__UNDEFINED__@@` encode/decode wrappers were deleted along with
  `lib/json_slide_serialize.ts` itself. Follow-on status: the **reports**
  route bodies are tightened (`reportFiguresSchema`/`reportImagesSchema`);
  the **slides** bodies remain `z.unknown()` pending the PatternType
  `"none"` schema gap (see Slide decks above).

## Caches & the notify triangle

Per-family t2 reactive caches version off the SSE-pushed `lastUpdated` maps
(version is part of the cache key — a flip is an automatic miss): `slide`
(per slide), `slide_deck_detail` (per deck), `dashboard_detail` (per
dashboard). **Reports have no t2 cache** — the editor and exports fetch
`getReportDetail` directly; summaries live in T1 via `reports_updated`.
Every family follows the pattern: mutations fire
`notifyLastUpdated(projectId, table, ids, ts)` + a full-list re-broadcast
(`notifyProject{SlideDecks,Reports,Dashboards,…Folders}Updated`) on
list-affecting ops. Coverage is inconsistent at the edges — two real
staleness candidates: `moveSlideDeckToFolder` / `moveReportToFolder` bump
the row's `last_updated` in the DB but fire **no** `notifyLastUpdated` (a
changed row the triangle never pushes), and slide create/delete/move never
re-broadcast the deck list although its summary embeds `first_slide_id`
(Open item).

## Emails

[routes/project/emails.ts](server/routes/project/emails.ts) is the only
SendGrid egress (raw fetch, `Bearer _SEND_GRID_API`, from
`noreply@fastr-analytics.org`). `sendSlideDeckEmail`
(`can_view_slide_decks` — deliberately the view flag): the PDF is
client-rendered (S10 base64 export); recipients are schema-validated
(`z.array(z.email()).min(1).max(50)`); sequential per-recipient sends with
partial failures returned as `{sent: false, failedRecipients}`.
`sendHelpEmail` (bare `requireGlobalPermission()` — authenticates only,
never checks `approved`, Open item): one email per
`_FEEDBACK_EMAIL_RECIPIENTS` with `replyTo` the user, then a confirmation
to the user only after at least one internal send succeeded — zero internal
deliveries returns `success: false` (the form shows the error instead of
"Thank you"). User-typed text (`message`/`description`/`projectLabel`/
`userEmail`) is HTML-escaped before interpolation in both routes.

## Open items

- **Reports registry lost-update race (MED, known)**: figures/images/config
  PUTs are whole-registry replaces with no concurrency guard — two editors
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
  permission flags (rides the slide-deck pair) — document as contract or
  add flags; group member update silently no-ops for vanished replicant
  values; every mutation route re-runs `getAllDashboards` (project + main
  DB) just to broadcast — N× for batch deletes.
- **`sendHelpEmail` approved-user question**: the guard never checks
  `approved`, so unapproved (Clerk-authenticated but not-added) users can
  send feedback. Possibly intended — an unapproved user may legitimately
  need to reach support. Decide and either document or add the check.
- **`overwrite` on `updateReportBody` is dead** — always sent `true`,
  ignored by the DB fn; wire the hard-reject mode or drop it.
- **`_shared/**` custody**: `dhis2_credentials/` is consumed only by
  S5/S6/S7 surfaces and documented by S7; `sort_control.tsx` is shell
  furniture (SYSTEM_14 flag) — settle via manifest move or a §4.1 exception
  row.
- **Type casts on mutation bodies**: `body as any` ×5 in the dashboards
  routes, `body.figures as any`, `body.slide as Slide`, `body.config as
  SlideDeckConfig` — the Zod-validated body is discarded typewise; ties into
  the tighten-to-schema follow-on.
- **Committed debug logging** in the slide editor ("FUZZ DEBUG" blocks incl.
  a full layout-tree dump on every measure).
- **Dead code**: `PasswordGate.tsx` (zero importers, EN-only); the ~90-line
  commented-out text-size slider block + its 5 imports in
  `editor_panel_content.tsx` (`TextBlockStyle.textSize` has no UI writer —
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
