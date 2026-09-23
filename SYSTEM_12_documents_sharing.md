---
system: 12
name: Documents & Sharing
globs:
  - client/src/components/_shared/collab_markdown_editor.tsx
  - client/src/components/_shared/live_cursors.tsx
  - client/src/components/_shared/mod.ts
  - client/src/components/_shared/package_label.ts
  - client/src/components/_shared/presence_avatars.tsx
  - client/src/components/_shared/scope_picker.tsx
  - client/src/components/products/*.ts
  - client/src/components/products/*.tsx
  - client/src/components/products/_shared/*.ts
  - client/src/components/products/_shared/*.tsx
  - client/src/components/products/report/**
  - client/src/components/products/slide_deck/**
  - client/src/state/products/t2_report_detail.ts
  - client/src/state/products/t2_slide_deck_detail.ts
  - client/src/state/products/t2_slides.ts
  - lib/types/_slide_config.ts
  - lib/types/_slide_deck_config.ts
  - lib/types/products.ts
  - lib/types/reports.ts
  - lib/types/report_fastr_themes.ts
  - lib/types/report_styles.ts
  - lib/types/scope.ts
  - lib/types/slides.ts
  - lib/fastr_live_regions.ts
  - lib/fastr_markdown_blocks.ts
  - lib/fastr_markdown_edits.ts
  - lib/fastr_report_templates.ts
  - lib/fastr_markdown_pages.ts
  - lib/fastr_markdown_spec.ts
  - lib/fastr_report_page_map.ts
  - lib/report_document_shell.ts
  - lib/report_fastr_css.ts
  - lib/report_fastr_markdown.ts
  - lib/report_fastr_paged.ts
  - lib/report_fastr_word.ts
  - lib/report_sections.ts
  - lib/slide_text_offsets.ts
  - server/db/instance/report_styles.ts
  - server/db/products/**
  - server/report_pdf/**
  - server/routes/instance/emails.ts
  - server/routes/products/**
  - server/tests/consolidated_products_test.ts
  - server/tests/fastr_live_regions_test.ts
  - server/tests/fastr_markdown_edits_test.ts
  - server/tests/fastr_markdown_pages_test.ts
  - server/tests/fastr_report_page_map_test.ts
  - server/tests/folder_tree_test.ts
  - server/tests/products_routes_test.ts
  - server/tests/report_fastr_markdown_test.ts
  - server/tests/report_fastr_word_test.ts
  - server/tests/report_format_helpers_test.ts
  - server/tests/report_html_sanitize_test.ts
  - server/tests/report_pdf_render_test.ts
  - server/tests/report_word_raster_test.ts
  - server/tests/report_sections_test.ts
  - server/tests/slide_text_offsets_test.ts
  - server/utils/id_generation.ts
docs_absorbed:
---
# S12: Documents & Sharing

The two product types (slide decks and reports), their folders, and the
SendGrid email egress. A report's body is FASTR Markdown, the platform's own
designed document format, and new reports are minted in it; plain markdown
and html reports predate it and are still read and edited. The render/export
engines themselves are S10's; S12 owns the artifacts, their storage, and the
export *triggers*.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1. Client:
`components/products/slide_deck/**` (the copilot's `slide_ai/` is S13's),
`components/products/report/**`,
`state/products/{t2_slides,t2_slide_deck_detail,t2_report_detail}.ts`
(`t2_images.ts` is S10's). Server: CRUD for both product families + folders,
`routes/instance/emails.ts`, `server/utils/id_generation.ts` (one 4-char
generator, table-aware). The product plane: `server/db/products/**`,
`server/routes/products/**` and their two harnesses (below; the registries are
S1's `lib/api-routes/products/*`); on the client, the Products page and its
surfaces (`client/src/components/products/**`: the explorer page, the pure
`folder_tree.ts` derivations and their harness, the card and list views, the two
menu builders, the folder and move modals, the type registry `product_types.ts`,
`product_settings.tsx` for name and folder, `package_scope_chip.tsx` and
`package_scope_modal.tsx` for the pair, the duplicate modal, `_shared/package_label.ts`) and the two
editors (`slide_deck/**`, `report/**`), which take `{ productId }` and read
label, package and scope live from the T1 products row. Lib: slide/report types,
plus the product contracts (`lib/types/products.ts`: `ProductType`, `Folder`,
`ProductBase`, `ProductSummary`; `lib/types/scope.ts`: `PackageScope`,
`scopeToken`) that describe the products registry below. Custody wrinkle: this
manifest owns `products/sort_control.tsx` (shell furniture, flagged in
SYSTEM_14); the two logo editors are this system's under
`products/slide_deck/**`, and the FASTR logo table they read is S10's
`generate_slide_deck/fastr_logos.ts`.

Two harnesses cover the product plane, both against the dev database.
`server/tests/products_routes_test.ts` drives the product, folder, slide-deck,
slide and report routes through the real registry, access guard and DB layer.
`server/tests/consolidated_products_test.ts` proves the products that migration
201 consolidated, and skips when none exist (they are the ones with no
`created_by`): every stored figure bundle on the four surfaces (slides, report
figures, and the two version tables read through the same figure-block upgrade
the restore paths run) parses under the strict schema, so each carries its
package and scope, and a report version and a deck version restore through the
real routes, on copies.

## Contract

Both families persist CLIENT-built `FigureBlock` bundles (the server
never recomputes figures); the figure-snapshot lifecycle is owned upstream by
S10. **Two concurrency philosophies, one per family**: slides = per-row
**opt-in optimistic lock** (`expectedLastUpdated` → `err: "CONFLICT"`; both
the human editor and the AI tools send it); reports body = **always-write
last-write-wins** returning an advisory `conflicted` flag → non-blocking
banner. **S16 overlays both**: when a
live collab room exists for a slide or report, the mutating routes offer the
save to the room first (`applySlideToLiveRoom` / `applyReportToLiveRoom`) and
the CRDT merge is the conflict resolution. The philosophies below engage only
when no room is live. The collab checkpoint functions and additive columns
(`saveSlideCheckpoint` / `saveReportCheckpoint`, `crdt_state` /
`crdt_state_last_updated` / `body_authors`) ride this system's
`server/db/products/{reports,slides,slide_decks}.ts`, and the version-history
routes ride its route files. S12 owns the files, S16 the feature (SYSTEMS.md
§4.1; [SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)). Every
product route declares its `access` level and is guarded by
`requireProductAccess` (S1; every approved user passes every level today,
D2); on the client the one gate is `canEditProduct(productId)` in
`state/instance/product_access.ts`. There is no unauthenticated product
surface: a deck reaches recipients as an emailed PDF (cross-cutting audit
SYSTEMS.md §4.3.9).

## The products registry on `main`

`main` carries the products block (`_main_database.sql`, created on existing
instances by `200_products.sql`): `folders` (nested through a nullable
`parent_id` self-reference), `products` (id, `type` in {`slide_deck`, `report`},
label, `folder_id`, `run_id NOT NULL` referencing `runs` without cascade,
`admin_area_2`, `created_by`, `created_at`, `last_updated`), and one detail
table per type keyed by the same id, `slide_decks` and `reports`, with `slides`,
`slide_deck_versions` and `report_versions` hanging off them, all `ON DELETE
CASCADE`. The two detail tables carry a fixed `type` column and a composite FK
on `(id, type)` against `products`, so a detail row can exist only in the table
its registry type names; whether the detail row exists at all is a writer rule
(one transaction per product create), not a constraint. Row types are
`DBFolder`, `DBProduct`, `DBSlideDeck`, `DBSlide`, `DBSlideDeckVersion`,
`DBReport` and `DBReportVersion` in
`server/db/instance/_main_database_types.ts`; the layer's barrel
`server/db/products/mod.ts` is star-exported from `server/db/mod.ts`. The shared
contracts are `lib/types/products.ts` and `lib/types/scope.ts`.

**The layer** (`server/db/products/**`, PLAN_PRODUCTS_RESTRUCTURE step 5):
every function takes `mainDb` and keys off the registry. `products.ts`
holds the cross-type surface: one summary query for both types
(`listProducts` / `getProductSummaries`, the registry row plus
`firstSlideId` for a deck and `hasEmbeds` for a report, computed in SQL so
no body crosses the DB boundary); `createProduct` inserts the registry row
and the detail row in one transaction, resolves `run_id` from `runs WHERE
pinned AND status = 'ready'` inside the insert and returns the typed
`NO_READY_PINNED_PACKAGE` when nothing qualifies; `updateProductLabel`,
`moveProductsToFolder`, `setProductScope`; `deleteProducts` is one `DELETE
... WHERE id = ANY` on the registry, with the batch's slide ids pre-read
inside the transaction for the room closers; `duplicateProduct` clones
`run_id` through `INSERT ... SELECT`, takes the scope from the body (the
duplicate modal's "keep" sends each source's own) and copies the detail
through a per-type `Record<ProductType, fn>`. `folders.ts`: `updateFolder` is also
the move and refuses a cycle with a recursive CTE walking up from the new
parent inside the same transaction (`FOLDER_CYCLE`, through the envelope);
`deleteFolder` reparents child folders and products one level and returns
`freedProductIds`. `slide_decks.ts`, `slides.ts`, `move_slides.ts`,
`copy_slides.ts` (`copySlidesToSlideDeck`, the cross-deck reuse path:
configs copied verbatim, scoped by the source product), `reports.ts` and
`versions.ts` hold the per-type detail: every slide read and write is
scoped by `product_id` AND `slide_id`, the label lives on
`products` and the detail reads join it, and the version functions carry
the `SlideDeck` stem on the `slide_deck_versions` table
(`insertSlideDeckVersion`, `latestSlideDeckVersionHash`,
`copySlideDeckFromVersion`). Every detail mutation opens its transaction
with `touchProduct` (`_product_row.ts`, which also holds the two type
not-found constants): one `UPDATE products ... WHERE id AND type` that
stamps `last_updated` (and the label when the write carries one) and throws
the writer's type not-found when it matches nothing, so a missing id or a
report id sent to a deck route rolls back with no side effect and leaves as
a 404. `updateFolder` and `deleteFolder` throw `FOLDER_NOT_FOUND` the same
way. `setProductRun`, the products half of the
run delete guard and `listReadyPackages` live in
`db/instance/run_generation.ts`. Ids mint at four characters
(`generateUniqueProductId`, `generateUniqueSlideId`; existing 3-char ids
stay valid).

**The routes** (`server/routes/products/**` over
`lib/api-routes/products/*`): every product-scoped path lives under
`/products/:product_id/...` (`.../slide-deck`, `.../slides/:slide_id`,
`.../report`, `.../versions/:version_id`), batch targets ride the body as
`productIds`, and every registry entry declares `access`, which is the
whole guard (S1). Handlers name only `log(...)`; a not-found envelope from
the DB layer leaves as a 404 through `_respond.ts`, so a slide or version
id under the wrong product is a 404. In `routes/products/slides.ts` the move
route is registered before the per-slide update: both match `PUT
.../slides/move`, and Hono runs matching handlers in registration order. Every
mutation re-reads the touched summaries through
`notifyInstanceProductsUpserted` (S3), slide writes also stamp
`notifyInstanceLastUpdated("slides", ...)`, and package or delete changes
re-nonce the runs catalogue.

## Slide decks

**Data model.** A `slide_decks` detail row keyed by the product id
(free-text `plan` for the AI planning scratchpad, JSON `config` = deck style;
the label lives on `products`) + one row per slide (JSON `config` = one
`Slide`, integer `sort_order`; FK cascade on product delete). Slide ids are
short nanoids, instance-wide unique. `getSlideDeckDetail` returns only ordered
`slideIds`; slide bodies fetch per-slide through `_SLIDE_CACHE`
(`state/products/t2_slides.ts`, versioned by `lastUpdated.slides[id]`). Sort
orders are **gap-numbered** (append = max+10, insert = target±5) with
`reSequence` (`ROW_NUMBER()*10`) run inside the create/delete/duplicate
transactions; `moveSlides` ([db/products/move_slides.ts](server/db/products/move_slides.ts))
is **within-deck reorder only**; `copySlidesToSlideDeck` is the cross-deck
reuse path.

**The deck-touch rule.** Every slide mutation bumps the owning `products` row
(`touchProduct`, which also asserts the row's type) with the same timestamp in
the same transaction, and that touch is what drives the SSE push and t2 cache
versioning. `slide_decks` carries no timestamp of its own: the product row is
the deck's version. Every slide writer, `duplicateSlides` included, runs its
touch, its shift-UPDATE, its INSERTs and its `reSequence` inside one
`mainDb.begin`; the deck duplicate copies the slide rows, sort orders
verbatim, inside `duplicateProduct`'s transaction, where the fresh
`products` row already carries the stamp.

**Validation at write.** Deck config is validated at both the route body
(`slideDeckConfigSchema`) and the DB layer, and so are slide bodies:
`createSlide` and `updateSlide` both take `slide: slideConfigSchema`
([lib/api-routes/products/slides.ts](lib/api-routes/products/slides.ts)), so a
malformed slide is a 400 at the boundary, with `slideConfigSchema.parse` as
the DB-layer backstop. The split-fill enum mirrors panther's `PatternType`
exactly, `"none"` included.
The layout tree is a recursive Zod union embedding the strict
`figureBlockSchema`; layout item `style` is
`z.record(z.string(), z.unknown()).optional()`. Duplicates copy stored
config text without re-validation.

**The deck editor** (`SlideDeckEditor` in
[slide_deck/slide_deck.tsx](client/src/components/products/slide_deck/slide_deck.tsx)) takes
`{ productId }`: label, package and scope come from `productById` on the T1
store (D16), the authoring context from S9's immutable
`t2_run_authoring_context.ts` keyed by the LIVE `runId`, so a reattach or
rescope (from the header chip, the Products page or a collaborator) moves
figure data, metrics and presets together and lights the stale badges
without a remount; a product deleted under an open editor closes it. The
header shows the `PackageScopeChip` ("package · scope" in the package accent
from `app.css`), which for an editor opens `PackageScopeModal` with a count of
the figures the candidate pair would leave stale; the overflow menu opens
`ProductSettings` for name and folder; Present and Download are buttons on
the bar.

**One screen, Google-Slides style (2026-09-22).** The deck is ONE header:
the name (with the back arrow, chip and presence) and, under it, the open
slide's menu row (Slide / Insert / Layout, portaled there by `SlideToolbar`
through `menuRowHost`) on the left, the deck's actions (Present, Download,
Update figures, Settings, More, AI) on the right; beneath it a full-width
TOOLBAR ROW (the deck's Add slide at the left, then the slide's formatting
pill, portaled through `toolbarHost`), over a `FrameLeftResizable` (210px,
140-420): the RAIL on the left is the
vertical slide list, and the slide clicked in it is open beside it. `SlideList`
([slide_list.tsx](client/src/components/products/slide_deck/slide_list.tsx))
is that frame and takes the editor as its children; the deck component
(`SlideDeckEditorInner`) owns `currentSlideId`, fetches the slide's content,
and mounts the editor KEYED by slide id plus the deck config's JSON, so a
click on another slide is a cleanup (the outgoing slide's collab session
closes, an unsaved offline draft is flushed) and a fresh mount, while a
refetch of an unchanged config remounts nothing. The rail follows the deck:
the first slide opens when none is, the neighbour when the open one is gone;
a new or duplicated slide opens; deleting the open slide moves the editor to
its neighbour BEFORE the request, since the server closes the deleted slide's
room with a fatal error that must never reach a mounted editor. The deck asks
the editor to settle a draft before a swap (`onApi({ flush })`, the same
conflict-modal path the old back button ran), and a refused flush leaves the
open slide where it is. The copilot's `editing_slide` view carries the deck's
context too (`EditingSlideContext` extends the deck's), so every deck tool is
available while a slide is open, and the deck's view state is what the editor
returns to between slides.

**The slide editor**
([slide_editor/slide_editor.tsx](client/src/components/products/slide_deck/slide_editor/slide_editor.tsx))
is mounted by the deck with `snapshotForSlideEditor` (the deck config only,
structuredClone-severed) plus the product id, the live pair and its
authoring context passed down. There is no side panel: a toolbar under the
header
([slide_toolbar.tsx](client/src/components/products/slide_deck/slide_editor/slide_toolbar.tsx),
built from the report toolbar's shared parts in
`products/_shared/toolbar_primitives.tsx`) has a menu row (Slide: type and
logos; Text: the slide type's title fields from `slide_fields.ts`, adding an
absent one seeds it with its name and starts typing; Split panel) over one
pill that follows the selection (text formatting while typing, a title's
size/bold/italic, or the selected block's type, Layout menu, text background
and markdown source, figure or image controls). Below it the canvas is a live
preview through S10's `convertSlideToPageInputs`, debounced 100ms off
`trackStore(tempSlide)` except while typing on it.
Every figure it writes is stamped with the product's pair, a figure block
whose bundle was resolved under another pair shows S11's stale badge in the
block panel, and the header counts them with "Update all figures" (S10 "The
captured pair and staleness"). The deck header does the same across every
slide through `deck_stale_figures.ts`, which walks the per-slide cache,
swaps bundles with `slide_transforms/update_block_in_layout.ts` (the one
structural walk the slide editor's own block edits use, so every write carries
a fresh reference for the CRDT sync) and writes each updated slide back
through `updateSlide` with its `expectedLastUpdated`. Slide-type switching
keeps a per-type cache so switching back restores prior state (same idiom
per-block for block-type switches). The layout tree is manipulated exclusively
through panther node ops via `buildLayoutContextMenu`
([slide_editor/build_context_menu.ts](client/src/components/products/slide_deck/slide_editor/build_context_menu.ts)):
split/add/move/delete/convert, reachable from both the panel button and
canvas right-click. Figure blocks have ONE authoring path (D3): insert and
replace open `InsertFigureModal` (the product package's presets and the
metric wizard) and edit opens S11's embedded `VisualizationEditor`; every
result resolves through `resolveFigureBundleInteractively` under the
product's current pair, so editing a stale figure also brings it up to date.
Local edits notify the AI (`edited_slide_locally`) and the editor registers
the `editing_slide` view's mutator context on the AI view controller (S13);
the copilot host wraps whichever editor the Products page opens
(`ProductCopilotHost`, D15: one mount site, one copilot per open product), so
a slide editor opened inside a deck shares the deck's copilot.

**Typing on the canvas.** Double-clicking a text block or a title primitive
(or Enter with one selected) mounts
[inline_text_editor.tsx](client/src/components/products/slide_deck/slide_editor/inline_text_editor.tsx):
a hidden, focused CodeMirror bound by yCollab to the block's `markdown` /
the root field's `Y.Text` (so merge, remote carets and the session's shared
undo stack are unchanged), with the caret, selection and peers' carets painted
over the canvas. The canvas stays the only renderer, so there is no second
text layout to drift. The preview is therefore NOT keyed: `PageHolder` redraws
in place, and while an inline edit is open the preview skips the 100ms
debounce. Caret geometry
([text_geometry.ts](client/src/components/products/slide_deck/slide_editor/text_geometry.ts))
re-runs panther's public `MarkdownRenderer.measure` on the item's
`(contentRpd, data)`, which is deterministic and so gives the drawn lines, and
mirrors panther's `placeRuns`. The source offsets come from
[lib/slide_text_offsets.ts](lib/slide_text_offsets.ts), which re-derives them
from panther's own `parseMarkdown` plus markdown-it block maps, because panther
keeps none and is not edited here. Body text is pure WYSIWYG. Typed markdown
punctuation is escaped. Deletions keep inline syntax, so the formatting of what
remains survives. Bold and italic re-serialize the touched lines. Every such
edit is a set of whole-document candidates, and the first one whose re-parse
renders the intended text and styles wins; an edit none of them renders is
refused. Blocks holding tables, code fences or block images are not
canvas-editable, and the side panel remains their editor (and every block's
source view).

**The per-slide save loop** (the no-room/offline path: while a collab
session is live the editor never explicit-saves; the room checkpoints
continuously, S16): editor seeds `lastKnownServerTimestamp` from
props → `updateSlide({slide, expectedLastUpdated, overwrite})` → DB compares
`last_updated` and returns `CONFLICT` unless `overwrite`
([db/products/slides.ts](server/db/products/slides.ts)) →
`ConflictResolutionModal` offers overwrite / save-as-new (inserts after the
current slide) / view-theirs / cancel → on success the editor pre-warms
`_SLIDE_CACHE.setPromise` with the fresh version before SSE arrives. The
lock is **opt-in** at the DB layer, but both writers send it: the S13 AI
slide tools pass `expectedLastUpdated` from a pre-write `getSlide` fetch
and rethrow `CONFLICT` to the model as a "re-read via get_slide and retry"
error (no overwrite path: the human editor's modal is the only override).

**The product explorer** (`components/products/products.tsx`) is a file browser
over the two flat T1 lists (`instanceState.products` and
`instanceState.folders`, both maintained per row off the instance channel).
The user is always **inside one folder**: the page shows that folder's
sub-folders and products and nothing from anywhere else. The location is one
folder id in localStorage (`productsOpenFolder`, null = the root) beside the
view mode, the sort mode and the type filter (`state/t4_ui.ts`); the path
back to the root is **derived**, never stored, by
`folder_tree.ts` (`childFolders`, `ancestors`, `folderPathLabels`,
`descendantIds`, `folderPathOptions`: pure, type-import-only, every walk
carrying a visited set so a corrupted cycle terminates, pinned by
`server/tests/folder_tree_test.ts`). Inside a folder, and only then, a
location row under the heading bar carries an Up button and the breadcrumb:
the bar's own Back is reserved for leaving a full-page view. The trail is
the ancestors then the current folder, with no root crumb (the bar already
says "Products" and Up reaches the root), and collapses the middle into a
menu past two ancestors. A
location that no longer exists (another session deleted the folder) resets to
the root through an effect gated on `isReady`, so the persisted location
survives hydration.

The header toggles **cards and list** over the same contents. The list
(`list_view.tsx`) is hand-built from panther parts on one CSS grid template
shared by the header row and every body row, the sanctioned exception to
PROTOCOL_UI_COMPONENTS rule 4, because the rows open editors, reveal per-row
menus and mix two entity kinds. Type chips filter **products only**; folders
are always visible, with direct-child counts (computed for every folder in
one pass, not a scan per row) that follow the filter. Search at 3+ characters
is global and flat: it escapes the location and lists matching folders then
products from anywhere, each with its path. One sort vocabulary (`SortMode`)
drives the header Select and the list's clickable Name and Last updated
headers; folders sort by the same mode and always come first.

Multi-select runs over the plain product id via `createSelectionController`;
folders are never multi-selectable and act through their own menu. One menu
builder per kind (`product_menu.ts`, `folder_menu.ts`) serves the tiles, the
list rows and the right-click menu, and both share `buildQuickMoveEntries`:
**Move into ▸** (this location's folders, capped at 10, then More…), **Move
up to "parent"**, **Move to top level**, **Move to folder…**. There is no
drag-and-drop and no batch action bar. The full picker
(`move_to_folder_modal.tsx`) moves a product batch or one folder, lists flat
full paths sorted by path with "No folder" first, and excludes a moved
folder's own subtree; the server's typed `FOLDER_CYCLE` is still the
authority. `edit_folder_modal.tsx` creates a folder in the current location
and renames or recolours an existing one, sending its parent back unchanged
because label, colour and parent are one `updateFolder` write. Deleting a
folder **reparents one level and never cascades**, and the confirmation
carries the direct counts and the destination.

Create is two buttons, no modal: "New deck" and "New report" are two separate
`createButtonAction`s over `createProduct` with the location as the folder
(separate, because one shared action's request-id guard would discard all but
the most recent click's callback). The server mints the label and resolves
the pin, and the buttons disable before the click when no ready package is
pinned. The editor opens on the SSE echo, on the page's own
`awaitingProductId` wait for a product it just created, or through
`pendingEditorOpen({ kind: "product" })`, the one opener the tours, the
copilot and the `?product=<id>` deep link share (`_PRODUCT_QUERY_PARAM`; the
parameter is consumed into that request and cleared, and an id still absent
once the store is ready is dropped as a dead link).

The deck view's `SlideList` renders cards in the vendored SortableJS wrapper
(multiDrag; optimistic local order; reorder diffs the moved run and calls
`moveSlides`), and its menu carries **"Copy to deck…"**
(`copy_slides_to_deck_modal.tsx` over `copySlidesToSlideDeck`), the only
cross-product figure reuse there is: bundles are copied verbatim, so the
picker names each destination deck's package and scope. Folders have **no GET
route**: they ride the `starting` payload and `folders_updated` only.

## Reports

**One-row model.** `reports` = `body` (**FASTR Markdown**, markdown or
**html**) + `figures` / `images` (JSON registries `Record<id, Block>`,
validated by the **strict** `figureBlockSchema` at both route and DB) +
`config` (passthrough `{version, format?, ...}`); the label and `folder_id`
live on the `products` row, because a report IS its product. **Format is fixed
at creation**, and every new report is minted FASTR Markdown:
`insertNewReportDetail` (the report half of `createProduct`) seeds
`getStartingConfigForReport("fastr")` and the format's worked starting body.
Nothing mints a markdown or an html report any more; both are still read,
edited, exported and restored from a version, which is why every path below
stays format-aware. Absent format means markdown (`getReportFormat` is total —
the stored config is a raw cast — and an unknown value reads as markdown,
which is what makes adding a format a no-migration change).
`reportRendersAsHtml(format)` names the two formats that go through the
sanitize → iframe → `.html`/print funnel (html, fastr) rather than panther's
markdown IR. html reports additionally carry `htmlStyle?` — one of the
`REPORT_HTML_STYLES` presets (default, minimal, corporate, ministry, classic,
executive, clinical, editorial, swiss, monochrome, bauhaus, blueprint,
broadsheet, risograph, artdeco, japanese, terminal, brutalist; also fixed at
creation, also total via `getReportHtmlStyle`) — it changes ONLY the S13 AI
authoring brief, never the render path. Six of those names have no FASTR theme
any more (blueprint retired 2026-09-03; risograph, artdeco, japanese, terminal
and brutalist 2026-09-17, as too loud for the reports people actually send):
the html style stays so an html report written in one still renders, and a
fastr report stored on a retired theme opens on the default,
`getFastrReportTheme` being total. **Creation asks nothing**: the products
page mints the report the way it mints a deck, server-labelled and instantly
open (D16). The look is chosen from INSIDE the report instead, by
[theme_modal.tsx](client/src/components/products/report/theme_modal.tsx),
which the editor opens unprompted the first time a new report is opened and
which the Page menu reaches after that. `config.themeChosen === false` is the
mark of a report that has never been asked: it is written only at creation, so
a report minted before the modal existed carries no flag at all and is never
interrupted about a choice it was never offered. Its tiles render the REAL
theme sheet over the REAL `fm-*` markup, scoped per tile
([fastr_theme_mock.tsx](client/src/components/products/report/fastr_theme_mock.tsx)),
so a preview is exactly what the report becomes. **Custom styles**:
user-authored briefs live in the MAIN-db `report_styles` table (203;
visibility per style, either this/selected REPORTS via a `product_ids` JSON
list or NULL = instance-wide, since the restructure left no project to scope
one to;
[server/db/instance/report_styles.ts](server/db/instance/report_styles.ts),
CRUD on the product-scoped report routes: the path's report decides which
styles are visible, list is `view` access and every mutation is `edit` and
logged). They render in the theme modal as color-skinned generic tiles and are
created/edited via
[report_style_editor.tsx](client/src/components/products/_shared/report_style_editor.tsx)
(delete lives there because openConfirm would replace the modal). A style
saved from a report also carries the source report's `<style>` CSS verbatim
(`reference_css`, 076) — the prose brief alone proved lossy, so the AI is
instructed to REUSE that stylesheet rather than re-derive one. A report
snapshots `{id,label,brief,referenceCss,colors}` into `config.customStyle`,
always server-resolved from an id and visibility-checked, never a
client-supplied blob: at creation for html, and through `setReportStyle` for
fastr. The editor prefers the LIVE library brief when the style still exists
and is visible (live ref + snapshot fallback), and `updateReportConfig`
re-imposes the stored snapshot. S13's "Save this report's style..."
distillation writes into this library; `updateReportConfig` re-imposes format,
style and `themeChosen`, so the only write that can change a report's look
after creation is `setReportStyle`, and only for fastr; duplicate /
copy-from-version carry `config`. Embeds are per-format tokens — markdown
`![caption](figure:<uuid>)` / `![caption](image:<uuid>)`, html `<img
src="figure:<uuid>" alt="caption">` (other attributes are the author's and
survive every rewrite) — the caption IS the alt text. **Every token read/write
goes through the format-aware helpers in
[lib/types/reports.ts](lib/types/reports.ts)** (`findReportEmbeds`,
`parseReportEmbedLine`, `buildReportEmbedToken`, `rewriteReportEmbedToken`,
`replaceReportEmbedTokens`); the load-time orphan prune uses the loosest
`referencedReportEmbedIds(body, "any")` substring scan (over-retention is
harmless, a miss deletes a figure). Deleting an embed removes only the token,
so undo restores a working embed.

**Summary derivation.** `getProductSummaries` deliberately never loads the
body or the registries; a report's summary carries only `hasEmbeds`, computed
in SQL.

**HTML format.** Rendering = DOMPurify with the pure-data
`REPORT_PURIFY_CONFIG` (lib; `FORCE_BODY`, explicit `FORBID_TAGS`, the default
URI regexp plus the `figure:`/`image:` schemes — pinned by
`server/tests/report_html_sanitize_test.ts` on jsdom) → materialize embeds →
base CSS ([report_html.ts](client/src/generate_report/report_html.ts) in S10's
`generate_report/`, the one builder for preview, version-history preview,
`.html` download and print). The editor preview is a `sandbox="allow-same-origin"` srcdoc iframe
([report_html_preview.tsx](client/src/components/products/_shared/report_html_preview.tsx))
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
([report_figure_raster.ts](client/src/generate_report/report_figure_raster.ts):
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

**Themes**
([lib/types/report_fastr_themes.ts](lib/types/report_fastr_themes.ts),
[lib/report_fastr_css.ts](lib/report_fastr_css.ts)): ONE structure sheet plus
a per-theme token block — **18 presets, one per `REPORT_HTML_STYLES` name**,
so a report can be moved between formats without losing its look. A theme is
~700 chars of tokens plus 0-195 chars of its own rules against a shared 12k
sheet, which is why every block, tone and background added since landed on all
of them at once. Two WERE dark pages (blueprint, terminal, both retired), and
that is what forced the callout/delta colours out of the sheet: they carry
MEANING so they cannot come from the palette, but a fixed light-page set is
unreadable on a dark ground. The machinery stays: a custom style's colours can
still make a page dark, and every theme left is light. Each theme declares
`scheme: "light" | "dark"`, which picks which of its two status sets the page
reads, and every rule that establishes a ground of the other darkness (a tone
the theme paints dark, `fm-ink--light`) re-points the set locally — pinned by
a test, since the first attempt missed the ink tone and nothing else would
have caught it. Tokens are projected into `--fm-*` custom properties;
`buildFastrReportCss(theme, colors?, scope?, opts?)` is a pure string builder,
so the same call serves the preview, the export AND the creation picker's
tiles — which therefore show the real design, not an impression. Everything is
in `em` so a tile shrinks the whole sheet by dropping its root font-size.
`@import` must LEAD a sheet, hence `fastrAllFontImportsCss()` +
`omitFontImport` for the concatenated multi-theme tile sheet. **The theme is
changeable after creation** (unlike `htmlStyle`) — the body carries no CSS, so
nothing can be invalidated. Two writes reach it, and only these two. The quick
switch (the header `Select` and the Page menu's theme flyout) writes
`config.fastrTheme` through `updateReportConfig`, which re-imposes format, the
custom-style snapshot and `themeChosen` but lets the theme through. The theme
modal writes through `setReportStyle`, the one route that may also change a
fastr report's custom style: it resolves the style from an id, checks its
visibility, snapshots it, and refuses a report that is not fastr. Both read
the stored config INSIDE their write transaction, so a concurrent style change
cannot be pinned back to its old value. A custom `report_styles` row
contributes only its `colors` here — its `reference_css` targets AI-authored
class names, not `fm-*`. Sections are the markdown `#`-line scan with a
top-level mask (`fastrTopLevelLineMask`): headings inside a container or a
code fence are NOT indexed, so `rewrite_section` can never splice a section
that starts mid-block. Exports: `.html` (same builder as html), a PAGED PDF
(see "Paged PDF and page boxes" below) and, since 2026-09-22, a Word file
(see "Word export" below). Panther's markdown-to-Word engine is NOT used for
it: its IR cannot represent the blocks and would silently drop every one.

**Word export (2026-09-22).** `lib/report_fastr_word.ts` builds the .docx from
markdown-it's token stream (the same `createFastrMarkdownIt` the compiler
uses, so container attrs arrive parsed) with the `docx` library, in the
browser (`client/src/exports/export_report_as_fastr_word.ts`, `Packer.toBlob`
+ `saveAs`). Text-carrying blocks become native Word structures so the file
reflows and pastes into a ministry's own template: headings (with the
`numbering=sections` numbers baked into the text, so a live TOC agrees),
paragraphs, lists, tables, callouts and steps as shaded one-cell tables,
quotes as ruled paragraphs, `:::columns` as a continuous multi-column
section, marks as run colours, `:::contents` as a Word TOC field with
update-on-open, figures inline at the column's width under a Caption
paragraph, the page ground as Word's page colour, and the PDF's running
footer with PAGE/NUMPAGES fields. The decorative blocks (cover, band, tiles,
card, stat) have no Word equivalent, so they are PICTURES with the text laid
over them in editable boxes: the client posts the same standalone document
the PDF prints, laid out at the print column by `buildFastrWordRasterCss`
(bands bleed by the margin exactly as print), to `rasterizeReportBlocks`
(`server/report_pdf/rasterize_blocks.ts`, on the PDF's shared browser via
`withReportBrowser`); Chrome measures every text element of each block
(`fastrWordMeasureJs`: content box, alignment, line height, per-run font,
size, weight, colour with any alpha composited onto the ground, tracking,
caps), hides the glyphs with `-webkit-text-fill-color: transparent` (so
rules, pills, bullets and counters stay painted) and screenshots the block
at 2x. The document anchors the PNG behind one exact-height paragraph and
floats a VML text box per element (`FastrTextboxRun`: unfilled, unstroked,
zero inset, grow-to-fit; docx's own `Textbox` can be none of those) at the
measured offsets; a `fill=page` cover is its own zero-margin section with no
footer, a natural cover is pulled up through the top margin like print. Only
authored breaks (`:::pagebreak`, `break=`) are forced; Word paginates the
rest, so page counts drift from the PDF by a page or so. The theme's faces
are embedded from static TrueType files vendored under
`client/public/fonts/word/` (one face per family; docx writes `embedRegular`
only, so a heading family embedded at 700 is emitted unbolded). Same Chrome
gate as the PDF, no degraded fallback: a report with no decorative block
never calls the server. Tests: `server/tests/report_fastr_word_test.ts`
(asserts on the .docx's own XML) and the Chrome-gated
`server/tests/report_word_raster_test.ts`.

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
area's top), where the editor's block carries none of it (since 2026-09-11
the blank line above a block is the whole gap: "Pixel for pixel" below);
the margin is the block's `topExtra` (`FastrLayoutBlock`), which
`layoutFastrPages` counts only when the block opens a page (the
continuation of a split block has none) and the seam carries as padding
under its head (`EditorPagination.topExtras`, written by the plugin like
the fillers). Every block's comes from print's measured margins
(`printMetricsField`), less the gap a block with no blank line above it
carries itself; the first block of the document and a cover have none.

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

**Setting the page** (2026-09-10, "make the spacing and page structure
better when creating reports with the AI"). Three things fill an AI
report's pages. A figure short of room at the foot of its page shrinks to
what is left rather than opening the next page: `FastrLayoutBlock.flex`
(what it may give up, four tenths of its natural image height,
`FIGURE_FLOOR`) and `tail` (the separator line that stays under it before
the seam), the layout's `fits` (`FastrPagedResult.fits`, px taken off the
block), the editor writes `--fm-fig-fit` on the mount (the stylesheet caps
the box at it) and keeps the block's own height NATURAL when it measures
a fitted mount (`figureImageBox`: the raster's aspect at the column under
the 42% cap, plus what the fit took off), or the layout would find the
room it made and give it back; print gets the image height as
`fastrFigureFitCss` (`figure[data-line] img { max-height }`), through
`getPageLayout().figureFits`. A page that ends because its next block did
not fit shares its leftover among the gaps between its blocks
(`stretchesOf`: 40px at most beside a heading, a figure or a block, 12px
between two paragraphs, nothing under 20px of leftover, never on the last
page, after a break or a cover, or on a page cut inside a block): the
stretch is a line decoration on the separator line (`stretchField`,
`--fm-stretch` as the line's padding-bottom), the seam's filler pads what
the gaps do not, the layout never sees it (gaps come from the source), and
print takes each gap as the next block's whole top margin
(`fastrGapStretchCss`, print's collapsed margin plus the stretch, from the
blocks' `printMt`/`printMb`). And an h1 is a section now (the cover
carries the title): print gives it an h2's space above in px (1.3em of
its own em; the document's first block and a cover's title keep none),
and the editor's blank line above it stands that tall (Pixel for pixel). The brief tells
the AI to think in pages (a section is a heading, two or three paragraphs
and one figure or block), to open a section with a paragraph so a heading
never travels with a block, that a figure bends to its page, and that a
contents list belongs to a formal review of eight or more sections, not a
bulletin. Verified in the harness with emulated charts: fits on a body
with room (`probe_body14.md`: the regional figure at 284px, page exact,
print identical), stretches on the bulletin (every box 1123, one layout
while scrolling, print identical), the typing and Enter probes unchanged.

**The AI sees its pages** (2026-09-10, Nick's "test 21" PDF: page 2 at 61%,
a last page holding a callout and a band, "have the AI aware of what
things are going to go on what page"). `get_report_pages` (reports.ts, a
registry-bound tool available everywhere) lays a draft's markdown, or a
report by id (the open editor's live body when it is the one open), out
in the editor's hidden frame (`describeReportPages`, report_page_map.ts:
figure boxes from the size cache first, images at their natural size,
then `createReportPaginator`) and returns the page map
(`fastrPageMapText`, lib/fastr_report_page_map.ts, pure and tested): every
page's fill, each block on it named from its source with its share of
the page, the spacing between blocks as a row so the shares add up, and
the problems: a page under 75% left short by the block that moved whole
to the next page (named, with the block a moved heading keeps with), and
a last page under 40% that is a stub. The brief carries a page budget
(100 units a page: a line of prose 3, a heading 10 and an h1 11, a cover
60, a tiles row 22, a band 25, a columns pair 30, a callout 8 plus 4 a
line, a steps block 12 a step, a figure 50, a table 6 a row plus 6, a
contents block 13 plus 3.5 an entry, 1.75 in two columns), tells the
model to plan pages to 85 to 95 units, to check the draft with the tool
before proposing (create_report's description and the editor
instructions say so too) and to fix what it flags by moving prose or
blocks across the boundary, never with blank lines. The gap stretch
never grows the gap under a heading (a heading keeps its text): 48px
above a heading, 32px beside a block or figure, 12px between paragraphs.

**A figure's box from its own chart** (2026-09-10, Nick's "test 22" PDF:
a heading and three lines alone on page 4, the figure that followed them
at the top of page 5 with room to spare, so the editor had believed the
figure taller than the room: a mount whose size the host's cache never
delivered, its live chart drawn at the chart's own uncapped height). Panther
lays a figure out at its reference frame whatever the display, so the live
canvas's backing size carries the same aspect as the PDF's raster: once a
chart has drawn, `pageBoxPlugin` sizes its mount from the canvas
(`drawnCanvasSize`, `derivedFigureSizes` by figure id, ahead of the cache
in `figureSizeOf`, which `fill`, the refresh plugin and `figureImageBox`
all take), and a mount whose chart drew to another aspect (an in-place
figure edit) is re-boxed the same way. A mount still waiting is capped
like a printed figure (`[data-fm-pending]`, 42% of the page area), so no
figure can stand a page tall meanwhile. Verified in the harness with
charts emulated as canvases and the size cache returning nothing for
every figure: the same pages as with the cache, one layout while
scrolling, every box the sheet's height, print identical.

**The sweep** (2026-09-10, late: "do a sweep on the system to ensure that
it is going to visually have no bugs and works flawlessly with making page
breaks and different widgets in different scenarios"). A corpus of forty
bodies (every block kind in eight sections at varying offsets, a mixed
body of every kind twice, the print fixtures, Nick's two ANC1 reports, and
edge bodies for covers, explicit breaks, lines of space, page-tall blocks
under headings, landscape and letter) went through a headless harness that
scrolls each body end to end and checks one layout throughout, every box
at the sheet's height, in-block seams aligned to the sheet, no heading last
on a page and the forced print equal to the editor, then photographs every
seam; a calibration probe compared each block's layout height with its DOM
box and print's; an operations probe typed, inserted blocks and markers and
toggled `break=before` at every page boundary. What it found, and what
changed:

- *The placing rule* (`fastr_markdown_pages.ts`). A block that only its
  heading precedes on a page continues in place at its inner boundaries
  rather than run past the page (a heading and a page-tall table stood
  250px over the sheet while print split the table). Headings, and lines
  of space between them and the block, travel with a block that starts a
  page by `break=before` (`FastrLayoutBlock.space`, `keepWith`). A marker
  that opens a page ends nothing, so a leading `:::pagebreak` or two in a
  row leave no empty page. A cover page keeps no safety and a cover never
  continues: a filling cover was being cut at its title, the kicker alone
  on one page. A page continued from a block re-sums from the block's last
  part (a latent miscount of the page after a split).
- *Print follows the editor alone.* `fastrForcedBreaksCss` neutralises the
  marker's and the break attributes' own breaks (print broke twice when
  the editor carried a heading onto a break=before block's page) and marks
  each forced anchor (`--fm-forced`); the runner releases every block
  around a forced anchor from keeping whole, whatever its height, so the
  in-place continuation prints where the editor cut it. The stretch sheet
  targets the outermost element of a line: a blockquote's paragraph shares
  its line and took the stretch a second time inside the box.
- *Boxes that changed with the viewport* (the flicker class). A block's
  "after a line of space" margin came from a sibling selector that
  CodeMirror's gap placeholder for unrendered neighbours did not match, so
  the same block measured 16px taller only while its neighbour was rendered
  and the pages moved as it scrolled: the flags ride on the widget or line
  as classes from the source (`spaceFlags`, `fm-live-region--after-space`,
  `cm-fm-after-space`, `cm-fm-leaf--after-space` and the `before` forms),
  and `regionExtra` takes them for a block not yet rendered. A block's
  inner boundaries are remembered with its measured height
  (`measuredInner`), so a split block that leaves the viewport is not laid
  whole again, and print's boundaries travel with the hints
  (`FastrPagedBlock.inner`, `FastrLayoutHint`), so a page-tall block far
  down the document splits right at first sight.
- *Calibration.* CodeMirror's line wrapping (overflow-wrap anywhere)
  inherited into a widget let every character break, and a wide table's
  columns shrank to single letters, its rows 60% taller than print's:
  rendered content wraps at words. A leaf widget (contents, the marker)
  carried the block's whole margins inside its box and was never measured
  (no `data-region-line`): `cm-fm-leaf`, clamped and remembered like a
  region. The page break marker takes no room, as in print (a rule laid
  over the page's foot, estimated and laid out at 0). The split chip is an
  overlay. A blockquote's lines carry print's 1.4em margins less the
  separator on the run's first and last line, as a heading's do, and
  print's blockquote no longer adds its paragraph's margin. The height
  oracle's box wraps its rows (an unrendered list measured at half its
  height). A filling cover has no margins in the editor, the blank line
  after it no height, and a sheet's height before it renders.
- *Seams.* The end element takes no extra (a stale one from a page that no
  longer existed stood the last page 16px over), the per-page filler and
  extra maps are pruned on every move, and a page full to the pixel keeps
  its trailing separator by moving the seam's foot up rather than growing
  the box (a negative filler).
- *Contents.* A list of `FASTR_TOC_COLUMNS_FROM` entries or more runs in
  two columns (`.fm-toc__list--columns`), so the block stays under a
  page's height (a 24-entry list overflowed page 1 on both sides). The page
  map flags a heading that ends a page (STRANDED) for the AI.

Verified on the finished code: the full sweep (forty-one bodies at the
default theme, four themed runs and one with the size cache empty) is
clean on forty-four of forty-six jobs: one layout while scrolling, every
box at the sheet's height, every seam aligned, no stranded heading, and
the forced print equal to the editor. The two that remain are one effect
of the harness itself: under three parallel headless Chrome runs, about one
run in four renders a heading or a paragraph with slightly different font
metrics on one tab (a paragraph a line shorter, a heading 5px taller), and
the pages move once; nine isolated runs of the same bodies never show it.
The operations probe (typing at the foot of a page, a paragraph or a
callout at its head, a page break marker above it, `break=before` under a
heading, every edit undone) is clean on seven bodies, with the boxes at
the sheet's height at every step and print equal after each edit. Lib
tests, typecheck, the systems lint and the print render test pass; the
many_sections fixture opens with a line of prose under its cover, since
its forty-entry contents block, now two columns and whole, no longer fits
beside the cover on page 1.

Known limits after the sweep: a contents block taller than a page even in
two columns overflows the page box in the editor while print splits it; a
block with no inner boundaries that does not fit under the heading that
opened its page runs past the page on both sides; and the AI's page map
comes from print's natural layout of a draft, which can differ from the
editor's decisions by a block where the two rules part (a block continued
under its heading, a heading carried over a break, a fitted figure).

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
(`paged.pageStarts` on `buildStandaloneReportHtml`), which report.tsx hands
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

**Pixel for pixel** (2026-09-11, "make sure that the pdf export is pixel
perfect with the pages on the edit pane"). Two probes judge it: one
photographs every page box in the editor and the same page of the forced
print document and diffs them in Chrome; the other reads where every block
and every text row starts on both sides, to the thousandth of a pixel. The
first run found the page starts equal and the blocks inside a page a few
pixels apart: the editor's rhythm was hand-written (a heading's padding in
its own em, a blank line at 0.65 line-heights, a block's margin clamped one
side at a time), which is print's collapsed margins for the default theme's
prose and nothing else. What stands now:

- Print's margins, measured. `measurePrintMetrics` (live_preview_extension)
  reads print's margins for every block kind in the editor's own sheet
  (`HeightOracle`: p, h1 to h6 as `fm-top`, blockquote, pre, hr, a list as
  its items' margins, a table, a figure, every `fm-*` region class, a cover
  as a band), once per geometry, floored to the 1/64 px the browser lays
  out at (`snapPx`: a margin floors where a line height rounds, and a
  sixty-fourth per block moved a text row by a pixel), and lands them in
  `printMetricsField` before any layout; the sheet's `--fm-p-margin`,
  `--fm-li-gap`, `--fm-li-indent` and `--fm-bq-pad` are set from them.
- The rhythm from the source (`docRhythmOf`). Two blocks a blank line apart
  stand max(margin-bottom, margin-top) apart in print, so the blank line is
  that tall (`--fm-gap`, its line height); through a line of space margins
  do not collapse, so a run's first blank is the previous block's bottom
  margin and the last line of space carries the next block's top margin
  under it (`--fm-gap-bottom`); two blocks with no blank line between put
  the collapsed gap above the second (`--fm-gap-top`: a block `::before`
  on a line, the first content child's margin in a widget). Blocks carry no
  margin of their own: headings have no padding (the theme's heading rules
  reach the line through the host's retargeting), quote lines keep print's
  0.2em box padding on the run's first and last line (classes from the
  source), the widget clamp is gone. A block's `topExtra` is its whole
  print margin less what it carries; the layout's `gap` is the blank
  line's height; the blank line at a page's foot takes only the room the
  page has left for it (`Stretches.ends`, `--fm-gap-end`), as print drops
  a margin that runs past the foot; the filler of a rendered page is the
  height map's own extent (remembered per page once measured, and trusted
  only within two pixels of the layout's sum), and fillers, seam extras,
  figure fits and print's stretched margins are written to the 1/64, so a
  page top sits on the pixel grid and its glyphs are drawn in the same
  sub-pixel phase as print's (pages after a figure can sit a fraction off
  it, which changes nothing but the anti-aliasing).
- The page in whole pixels: the printed page is `794px 1123px` with `68px`
  margins (`fastrSheetPx`, `fastrPageMarginPx`; the .html export's own
  `@page` stays in mm), since a page in millimetres put print's column a
  third of a pixel wider and its area half a pixel shorter than the
  editor's; the runner's pre-pass reads px. The seam's footer is print's
  margin box: 8.5pt in the body face at the document's line height,
  centred in the margin.
- Code blocks as print's pre: the fence lines are the pre's 0.9em padding
  rows (small labels, `cm-fm-code-fence`), the code lines its rows with the
  code in a monospace span (`cm-fm-codetext`), unwrapped; a blank line
  inside a fence is code. The renderer anchors a fence's `data-line` on
  the pre (markdown-it put it on the code), and the structure sheet
  declares the pre's browser-default 1em margins, since the editor measures
  under the app's base sheet, which zeroes them.
- Lists: print draws its own markers (`list-style: none`; a bullet or
  `counter(fm-ol)` in `li::before` at the left of the 1.4em indent, the
  contents list excepted) and the editor draws the same glyph in the same
  place (`cm-fm-bullet`, absolute in the line's indent; the marker's space
  and the item's indentation are concealed with it); a nested item's depth
  is read from its indentation (`listDepthOf`, `cm-fm-li-dN`, the indent
  per depth print's measured `--fm-li-indent`), and a nested list's end
  carries the list margin into the next item. A thematic break's widget is
  the rule alone. The contents block's entries carry their page numbers in
  the editor (`data-fm-page` from the page layout, drawn as print's
  target-counter is, the same flex row).
- A table continued on the next page repeats its header rows in the editor
  as print's runner does (`fm-page-gutter-repeat` rows after the in-table
  seam, inert copies; the theme's `thead th` rules are retargeted onto
  them), and the layout counts them (`FastrLayoutBlock.repeat`: every
  continuation part opens with it); the runner skips a repeated head's
  lines when it names a page's first line.

Verified on the finished code: the glyph probe reads 0.000 px for every
block and text row of the corpus (thirty-six bodies, the lists body new),
and the pixel probe reads 0.00% (not one pixel) on the first seven pages
of the mixed body and on whole pages of Nick's ANC1 body and the kitchen
sink, under 0.2% where a page holds a figure (the harness's placeholder
text against print's transparent box), and up to a few percent of
anti-aliasing on pages after a figure. The stability sweep is clean on
all thirty-six bodies and the operations probe on five (the sixth types at
the end of a figure's own line, the known limit that turns it into prose). What remains is under a pixel: a
figure's box can differ from print's by a sixty-fourth (the browser's
aspect-ratio box against its image sizing) and move the row after it by a
device pixel; a continued steps block draws its border a pixel differently
across the seam; nested list depth comes from indentation with one rounding
for bullets and numbers. The caveat that matters to a reader: the default
theme sets no web font, so the server's Chrome draws its system sans
(Liberation, DejaVu) where a user's browser draws Segoe or Helvetica, and a
paragraph can wrap differently; every other theme inlines a Google font and
prints what the editor shows. A bundled font for the default theme would
close that.

**Real charts in the harness** (2026-09-11, Nick: "how do i give you the
ability to test viz in the test harness"; then "look on the testing instance
for figures"). A figure is self-contained: its stored `FigureBundle` (config,
the queried rows, indicator metadata, localization) is everything
`buildFigureInputs` needs, so a report's charts draw with no server, no
database and no results package. The harness therefore needs only a report's
`figures` column beside its body. Four FASTR reports with real bundles live
on the `testing` instance (project `ecfc22be`, reports bb4/nx5/jms/7nc, three
to five charts each, themes risograph, bauhaus and classic); a row of each is
saved as `probe_real_<id>.json` (id, label, body, figures, images, config)
and the probe page takes `?real=<id>`. In that mode the editor mounts the
REAL charts through panther exactly as the app does (a raster cache and a
size cache, the ink and the theme's chart palette), and the print document
embeds the SAME rasters the PDF embeds (`cached.figureRaster`) with the
theme's fonts inlined, as `buildReportPdfFromDetail` does. Without the
inlining the print tab has no base URL, a bare `@import` falls back to system
sans, and every line wraps differently: a harness that would have reported
the product broken.

Three product defects that only real, themed content could show, all fixed:

- **Numerals.** The app sets `font-variant-numeric: tabular-nums` on
  `html, body, #app` for its data tables, and it inherits into the live
  preview, where print has proportional figures. In any font carrying both
  sets (every theme with a web font) each line with digits measured wider in
  Edit than in print and wrapped early: a two-column block stood three lines
  taller. The surface now sets `font-variant-numeric: normal` on
  `.cm-content`; the seam's footer and the contents page numbers ask for
  tabular figures again for themselves, as the paged sheet does for print's
  margin boxes. The default-theme corpus could not see this: system fonts
  carry one set of digits, so the property is a no-op there.
- **Heading lines.** CodeMirror puts a zero-width
  `<img class="cm-widgetBuffer">` beside every inline widget. A replaced box
  is laid out by its own margin box, and at CodeMirror's `text-top` its top
  sits at the font's content-area top, which is ABOVE the strut whenever the
  line's line-height is tighter than that content area. Every heading line
  (line-height 1.2) therefore stood up to 2px taller than print's heading and
  pushed the rest of the page down; prose lines, whose line-height is the
  looser of the two, were never affected. The buffer is now aligned to the
  line box (`vertical-align: top`), which keeps its place in the flow and its
  purpose and can never grow the line.
- **Repeated table headers.** The rows the editor draws after an in-table
  seam took the plain cell border (1px) where print's cloned `thead` takes the
  header's (2px), so a table's continuation ran a pixel high. The structure
  sheet's header rule now names `tr.fm-page-gutter-repeat > th` too.

And two figure defects. The editor boxed a chart from its drawn canvas's
whole CSS pixels (`derivedFigureSizes`) even when the raster cache knew the
exact aspect, half a pixel out over a page-wide figure: `figureSizeOf` now
prefers the cache whenever the chart drew to that same aspect (within
`sameAspect`), and keeps the drawn size for a chart the cache never measured
or one that really drew to another shape. And the size cache itself rendered
its probe at 200px wide and scaled the height up to the export width, where
a chart's height is not linear in its width (an axis label or a legend wraps
at one width and not another): its aspect came out about 0.3% off the raster
the PDF embeds, a pixel over a page-wide figure, enough to move a block
across a page boundary. It now renders at the raster's own width and takes
the canvas's own dimensions, so the editor's figure box IS the PDF's.

Verified with real charts: on the risograph report the glyph probe reads
0.000px for every block and text row, its seven page starts equal print's,
and its three figure boxes match print's to 0.00px (one to 0.03px). Two
findings stay OPEN, both recorded here rather than half-fixed:

- **A theme's own body typography never reaches the editor.** Three themes
  set it (classic's `line-height: 1.7`, japanese's 1.85, artdeco's
  `font-size: 1.06em`). `buildFastrReportCss` rewrites a theme's `body`
  selector onto the scope root, but `livePreviewTheme` pins `font-size` and
  `line-height` on `.cm-content`, so the theme's value never reaches a line:
  the four real reports say it plainly: both classic-theme reports disagree
  with their PDFs (14 editor pages against 17, and 7 against 9) while the
  risograph and bauhaus ones, which set no body typography, agree exactly.
  Letting the two inherit from the scope root (which would then carry the
  document's base typography, as the shell gives print) is the shape of the
  fix; tried once, it moved BOTH sides, so it needs its own pass and its own
  sweep. Until then a themed report on one of those three themes shows the
  right content on every page but not always the right page breaks.
- **Two layouts while scrolling a report with real charts.** The risograph
  report settles on the right pages and agrees with print, but the stability
  sweep sees one intermediate layout as the charts re-mount and re-draw
  (page 4 opening at line 34 before settling at 38). The emulated corpus is
  clean on all thirty-six bodies, so this is specific to the live chart
  mount, not to the page layout. The harness bodies stay emulated (a canvas that grows a beat
after mounting) because they are the ones that cover page positions
exhaustively; the real reports cover the chart path. One harness lesson
recorded with them: a probe page restored from a backup can carry stale page
geometry (its own `boxOf` rounded the column instead of taking the sheet less
its margins, a pixel out in landscape only), so a "regression" in landscape
was the harness, not the product.

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
`margin:` in the structure sheet (the editor's blank lines are made of them
since 2026-09-11, Pixel for pixel: print collapses a margin into a margin
but never into a space); and a top-level `.fm-card` has a
flow margin (1.2em, zero inside tiles), where it had none and sat flush on
the next paragraph. probe_calib in the scratchpad recipe compares the two
block by block; the widget rows read 0. The theme's own heading rules (a
border under h2 with 0.2-0.3em of padding, a theme's h2 font size) reach
the editor's heading lines through the host's retargeting; the mirrored
h2 padding the editor sheet once carried is gone. Those residual
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
`{width=full}`: markdown-it has no attribute syntax, so the `fm_figures`
core rule claims a trailing `{…}` text child and removes it. `width=wide`
is still accepted and classed but renders at the text column: it used to
overhang the column by up to 4rem a side, which on a paged sheet crosses
the margin line and read as a mistake (Nick, 2026-09-10); the spec no
longer offers it, so the AI stops asking for it.

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
outranks any background a THEME sets on the same element: the retired
brutalist theme painted `.fm-callout` white, which at equal specificity beat
the tone and left white type on a white callout. And a theme that paints a
heading WITH the accent (that theme's highlighter `h1`) renders it invisible on
a ground that is already a hue, so the three hue grounds clear the heading
background. Both rules stay: a custom style can do either.

**Editor** (`ReportEditor` in
[report/report.tsx](client/src/components/products/report/report.tsx), ~2,300 LOC, over
`ReportBodyEditor` in `body_editor.tsx`): takes `{ productId }` and reads
label, package and scope live from the T1 row like the deck editor (the
product id is also the collab document id, since a report IS its product), so
rename and duplicate are the SHARED product surfaces (`ProductSettings`,
`DuplicateProductsModal`) rather than report-only modals, and the header
follows the store with nothing to tell it about a new name. Each embed
(`ReportFigureEmbed`, in the preview pane and the CodeMirror widget alike)
shows S11's stale badge when its bundle was resolved under another pair, and
the header counts them with "Update all figures", re-resolving through one
`persistFigures` write. CodeMirror 6 (`lang-markdown` or `lang-html` per format) with an
embed-widget extension (a line that is exactly one token renders as an atomic
block widget), three modes edit/split/view, and line-anchored bidirectional
scroll sync over a `PreviewSurface` adapter
([scroll_sync.ts](client/src/components/products/_shared/scroll_sync.ts): `divSurface`
for the markdown card, `iframeSurface` for the html/fastr frame; `data-line`
anchors, echo-loop guard, figure-settle ResizeObserver window; the html pane
aligns when its surface becomes ready, not on the next frame). Embed insert/edit controls
(`ReportEmbedControls`) ride the header strip — the left sidebar panel and the
format guide panels were removed 2026-09-03 (the toolbar's Insert menu owns
block insertion; figures resolve through the same S10 funnel as dashboards).
Markdown View mode and both markdown exports share
`REPORT_MARKDOWN_STYLE`. FASTR Markdown reuses the html editing surface wholesale
— `markdown()` as the CodeMirror language plus a line decoration for the `:::`
fences ([fastr_fence_extension.ts](client/src/components/products/report/fastr_fence_extension.ts))
and the same iframe preview (the theme sheet lives in a `<style data-fm-theme>` in
the frame HEAD so a re-theme never reloads the frame, which would drop the
surface, the scroll position and every blob: raster).

**The formatting toolbar** ([toolbar.tsx](client/src/components/products/report/toolbar.tsx),
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
the same panel for the document background. The block segment offers NO page
break control (2026-09-23): `break=before|after` stays a legacy attribute
the paged sheet honours, but neither the toolbar nor the AI brief writes it;
a page break is the `:::pagebreak` leaf. Nor does a `tiles` or `columns`
GRID get the Background menu (a ground behind the whole row reads as a
mistake; its cards and columns keep theirs). Two gestures treat a region as
the unit it looks like (`insertBlockEdit`, `enterBesideRegionEdit` in lib):
an Insert-menu block or table with the caret parked inside a region lands
AFTER that whole top-level region, never inside it, and Enter on a parked
caret opens a blank line beside the block, above it (the block moves down)
or below when the caret stands at the region's very end, which is the only
keyboard way past a stat row, a figure or a table at the end of a document.
A natural cover opening ANY page is flush to the sheet's top in the editor
as it is in print (`openPage`, no `isFirst`), where it used to sit under a
band of top margin after a page break. TEMPLATES (2026-09-23): on a
report whose body is still a title line alone, the theme modal is step 1 of
2 (`offerTemplates`): Next applies the theme and step 2 is a template gallery
(`template_gallery.tsx`, Back returns, Skip keeps the theme and the title):
Policy brief, Long-form report and Empty, each tile
the template's real first page rendered under the look just chosen
(`FastrTemplateMock`). The skeletons live in `lib/fastr_report_templates.ts`
with placeholder guidance written as muted marks (`[What goes here]{.muted}`,
bracketed text in attributes); the chosen body goes in through
`applyRebasedBody` (one transaction, so collaborators and undo see it) and the
choice is stored as `config.template`. The AI's editing instructions append
`fastrReportTemplateBrief` for that template (shape, section order, the
placeholder convention), read live from the view context's `getTemplate`,
and `get_report_editor` names it. LINE BREAKS IN BLOCKS
(2026-09-23): in a paragraph island inside a card, column, callout, band,
quote or cover, Enter (and Shift+Enter) inserts a newline in the same text,
a `<br>` under `breaks: true`, instead of closing the island or (on the
pages) splitting a new paragraph; steps keep Enter for a new step and
top-level prose on the pages keeps it for a new paragraph. The newline goes
in as a text node (Chrome's insertText turns it into markup textContent
drops), a trailing one is not committed until text follows (a blank last
line would end the paragraph), and a rebuilt island re-opens with the caret
at its source offset rather than at the end. STABLE TEXT METRICS
(2026-09-23, "when I write at the start of a new line the page jitters"):
CodeMirror estimates every unrendered line's height from ONE sample, the
first rendered line of at most 20 plain-text characters, and on this surface
those are headings and the line being typed, each in its own font; a
character-width change over 0.1px makes it throw the whole height map away
and re-estimate, so Enter-then-type shuffled the page above the caret in
line-height steps for a second (probe: the oracle's charWidth flipping
7.56 → 12 → 10.5 → 8.3 → 7.25 while lineHeight held). `stableTextMetricsPlugin`
marks the text of every short line (`cm-fm-nosample`, no style): mark views
are skipped by the sampler, so CodeMirror always measures its own dummy line
in the body font. Verified: charWidth constant, caret and scroll steady. Text colour is the SAME shape
(`InkPanel`): the ink roles as preset swatches on top, the literal grid and
hex field below (`LiteralColours`, shared with the ground panel); a literal
writes `[x]{color=#hex}` — `color=` is a fourth mark attribute, gated by
`safeCssColor`, serialised after the role — and role and colour are one
choice: `setInlineRoleEdit`/`setInlineColorEdit` each drop the other. The Page menu carries the document THEME (a flyout of the built-in themes for
the quick switch, and below it the full theme modal, which is the only way to
reach a saved custom style; the header's select survives only where there is
no toolbar, i.e. View), the background panel (tones, literal
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

**Live preview** ([live_preview_extension.tsx](client/src/components/products/report/live_preview_extension.tsx),
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
there rather than stacking one; a quote still wraps a list. EVERY BLOCK DELETES from its own right-click (`attachBlockContextMenu` on the region and leaf widgets, `deleteFastrBlockEdit` in lib taking the region's lines plus the blank line beside them): the menu's first row names what will go, since a right-click inside a nested block is claimed by that block's own menu (a card, a step, a table cell) and only reaches the region when it lands on the block itself. Without it a cover, a band or a page break had no way out of the document at all. Islands COMMIT AS THEY ARE TYPED (text islands, the chrome attr editors and
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
([db/products/reports.ts](server/db/products/reports.ts));
the client bumps its base timestamp monotonically (out-of-order responses
can't rewind) and shows a dismissible "your changes were saved over theirs"
banner. The `overwrite` param is accepted but unused, reserved for a
hard-reject mode (Open item). Figures/images/config/label are separate
whole-registry PUTs with **no concurrency guard**, the known MED
lost-update race on the registries (Open item).

**AI-diff view**: the `editing_report` view context registers `proposeEdit`
and `applyFigureUpdate`. `proposeEdit` is the propose phase of the report
tools' approval lifecycle (S13), whose `customProposalUI` opens a
`@codemirror/merge` MergeView modal (accept/reject).
On accept, figures persist FIRST and roll back client-side if the save fails
(the AI is told the edit was not applied), then the body applies through the
editor API with the local-edit echo suppressed.

## FigureBundle: the two storage surfaces

This is S12's slice of the FigureBundle refactor; the full architecture
(bundle shape, `buildFigureInputs`, the invariants, localization) lives in
[SYSTEM_10](SYSTEM_10_figure_render_export.md). S12 owns the two surfaces
that **store** bundles and the export paths that **render** them.

- **What is stored.** Both surfaces embed the strict
  `FigureBlock = { type: "figure", bundle?: FigureBundle }`
  ([lib/types/_figure_bundle.ts](lib/types/_figure_bundle.ts)). Slides carry
  it inside the layout tree
  ([_slide_config.ts](lib/types/_slide_config.ts)); reports in the
  `figures` registry ([reports.ts](lib/types/reports.ts), one shared block
  schema). The strict schema is what lets the migration
  skip-gate catch legacy blocks (S2).
- **Capture-on-write.** Each surface assembles a bundle from the live build
  inputs: `config` + frozen `items` + the `resultsValue` projection +
  `indicatorMetadata` + `dateRange` + `geo` + **`localization` = the instance
  locale** (NOT the session toggle) + `metricId`/`snapshotAt` + the (package,
  scope) pair the bundle was resolved under, `provenance.runId` and `scope`,
  both required, so staleness (`isFigureBundleStale`) compares both halves with
  no missing-field branch. The bundle is undefined-free pure JSON, so it
  persists with no stripping.
- **Build-on-render: every surface.** On-screen render and exports all call
  `buildFigureInputs(bundle, deckStyle?)`. The export path "just works"
  because the bundle carries its own `localization`.
- **No sentinel layer.** Bundles carry no `undefined` values, so no
  encode/decode wrapper sits between a bundle and its JSON column on either
  surface: the **reports** registries validate through
  `reportFiguresSchema`/`reportImagesSchema` and the **slides** bodies
  through `slideConfigSchema` (see Slide decks above).

## Caches & the notify triangle

Per-family t2 reactive caches version off the SSE-pushed `lastUpdated` maps
(version is part of the cache key, so a flip is an automatic miss): `slide`
(per slide), `slide_deck_detail` (per deck), `report_detail` (per report;
`state/products/t2_report_detail.ts`).
Every product mutation ends with `notifyInstanceProductsUpserted` (the
per-row summary re-read, the only product-list message, D8), which is also
how a product's own `last_updated` reaches the client; slide writers add
`notifyInstanceLastUpdated("slides", ids, ts)` for the per-slide cache;
deletes fire `notifyInstanceProductsDeleted`; folders re-broadcast the whole
list through `notifyInstanceFoldersUpdated`. Because slide create, delete,
move and duplicate all re-read the deck summary, `firstSlideId` never goes
stale.

## Emails

[routes/instance/emails.ts](server/routes/instance/emails.ts) is the only
SendGrid egress (raw fetch, `Bearer _SEND_GRID_API`, from
`noreply@fastr-analytics.org`). `sendSlideDeckEmail`
(`requireApprovedUser()`; the recipient roster is the instance roster, D2):
the PDF is client-rendered (S10 base64 export); recipients are
schema-validated (`z.array(z.email()).min(1).max(50)`); sequential
per-recipient sends with partial failures returned as `{sent: false,
failedRecipients}`.
`sendHelpEmail` (bare `requireGlobalPermission()`, which authenticates only,
never checks `approved`, Open item): one email per
`_FEEDBACK_EMAIL_RECIPIENTS` with `replyTo` the user, then a confirmation
to the user only after at least one internal send succeeded. Zero internal
deliveries returns `success: false` (the form shows the error instead of
"Thank you"). User-typed text (`message`/`description`/`context`/
`userEmail`) is HTML-escaped before interpolation in both routes.

## Open items

- **Reports registry lost-update race (MED, known)**: figures/images/config
  PUTs are whole-registry replaces with no concurrency guard, so two editors
  (or human + AI `applyFigureUpdate`) clobber each other. Narrowed by S16:
  while a collab room is live these route through the room and merge; the
  race remains for the no-room path.
- **`sendHelpEmail` approved-user question**: the guard never checks
  `approved`, so unapproved (Clerk-authenticated but not-added) users can
  send feedback. Possibly intended: an unapproved user may legitimately
  need to reach support. Decide and either document or add the check.
- **`overwrite` on `updateReportBody` is dead**: always sent `true`,
  ignored by the DB fn; wire the hard-reject mode or drop it.
- **`products/sort_control.tsx` custody**: this manifest owns it, but it is
  shell furniture (SYSTEM_14 flag). Settle via manifest move or a §4.1
  exception row.
- **Type casts on mutation bodies**: `body.slide as Slide`,
  `body.config as SlideDeckConfig`: the
  Zod-validated body is discarded typewise; ties into the tighten-to-schema
  follow-on.
- **Barrel bypass**: `slide_list.tsx` imports the vendored SortableJS
  wrapper via a deep `../../../../panther/...` path instead of `"panther"`.
