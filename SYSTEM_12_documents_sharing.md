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
  - client/src/components/products/**
  - client/src/components/project/project_dashboards.tsx
  - client/src/components/public_viewer/**
  - client/src/components/report/**
  - client/src/components/slide_deck/*.ts
  - client/src/components/slide_deck/*.tsx
  - client/src/components/slide_deck/slide_editor/**
  - client/src/components/slide_deck/slide_transforms/**
  - client/src/components/slide_deck/style_editor/**
  - client/src/state/products/t2_report_detail.ts
  - client/src/state/products/t2_slide_deck_detail.ts
  - client/src/state/products/t2_slides.ts
  - client/src/state/project/t2_dashboards.ts
  - lib/types/_dashboard_config.ts
  - lib/types/_slide_config.ts
  - lib/types/_slide_deck_config.ts
  - lib/types/dashboard.ts
  - lib/types/products.ts
  - lib/types/reports.ts
  - lib/types/scope.ts
  - lib/types/slides.ts
  - server/db/instance/dashboard_slugs.ts
  - server/db/products/**
  - server/db/project/dashboards.ts
  - server/routes/instance/emails.ts
  - server/routes/project/dashboards.ts
  - server/routes/products/**
  - server/routes/public/dashboard.ts
  - server/tests/products_routes_test.ts
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
boundary), `routes/instance/emails.ts`, `server/utils/id_generation.ts`
(one 4-char generator, table-aware). The product plane:
`server/db/products/**`, `server/routes/products/**` and their harness
`server/tests/products_routes_test.ts` (the registries are S1's
`lib/api-routes/products/*`); on the client, the Products page and its
surfaces (`client/src/components/products/**`: the flat card grid, the type
registry `product_types.ts`, `product_settings.tsx`, the duplicate modal,
`package_label.ts`) and the two editors (`slide_deck/**`, `report/**`), which
since PLAN_PRODUCTS_RESTRUCTURE step 7a take `{ productId }` and read label,
package and scope live from the T1 products row. Lib: slide/report/dashboard
types incl.
`buildPublicDashboardBundle` and `buildReportPreview`, plus the product
contracts (`lib/types/products.ts`: `ProductType`, `Folder`, `ProductBase`,
`ProductSummary`; `lib/types/scope.ts`: `PackageScope`, `scopeToken`) that
describe the products registry below. Custody wrinkle: the
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
`server/db/products/{reports,slides,slide_decks}.ts`, and the version-history
routes ride its route files. S12 owns the files, S16 the feature (SYSTEMS.md
§4.1; [SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)). Every
product route declares its `access` level and is guarded by
`requireProductAccess` (S1; every approved user passes every level today,
D2); on the client the one gate is `canEditProduct(productId)` in
`state/instance/product_access.ts`. Dashboards keep the project flags and
`preventAccessToLockedProjects` until step 9a. The public viewer is the app's
only unauthenticated product surface (cross-cutting audit SYSTEMS.md §4.3.9).

## The products registry on `main`

`main` carries a products block beside the project layer
(`_main_database.sql`, created on existing instances by
`084_products.sql`): `folders` (nested through a nullable `parent_id`
self-reference), `products` (id, `type` in {`slide_deck`, `report`}, label,
`folder_id`, `run_id NOT NULL` referencing `runs` without cascade,
`admin_area_2`, `created_by`, `created_at`, `last_updated`), and per-type
detail tables keyed by the same id with `ON DELETE CASCADE` (`slide_decks`
plus `slides` plus `slide_deck_versions`; `reports` plus `report_versions`).
Each detail table carries a fixed `type` column and a composite FK on
`(id, type)` against `products`, so a detail row can exist only in the
table its registry type names; whether the detail row exists at all is a
writer rule (one transaction per product create), not a constraint. Row
types are `DBFolder`, `DBProduct`, `DBSlideDeck`, `DBSlide`,
`DBSlideDeckVersion`, `DBReport` and `DBReportVersion` in
`server/db/instance/_main_database_types.ts`; the project barrel no longer
star-exports its own row types, so the two sets coexist by direct import.
The shared contracts are `lib/types/products.ts` and `lib/types/scope.ts`.

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
`(run_id, admin_area_2)` through `INSERT ... SELECT` and the detail through
a per-type `Record<ProductType, fn>`. `folders.ts`: `updateFolder` is also
the move and refuses a cycle with a recursive CTE walking up from the new
parent inside the same transaction (`FOLDER_CYCLE`, through the envelope);
`deleteFolder` reparents child folders and products one level and returns
`freedProductIds`. `slide_decks.ts`, `slides.ts`, `move_slides.ts`,
`copy_slides.ts` (`copySlidesToSlideDeck`, the cross-deck reuse path:
configs copied verbatim, scoped by the source product), `reports.ts` and
`versions.ts` are the project counterparts rekeyed: every slide read and
write is scoped by `product_id` AND `slide_id`, the label lives on
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
(`generateUniqueProductId`, `generateUniqueSlideId`; the legacy 3-char ids
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
the deck's version. Every slide writer, `duplicateSlides` and the deck
duplicate included, runs its touch, its shift-UPDATE, its INSERTs and its
`reSequence` inside one `mainDb.begin`.

**Validation at write.** Deck config is validated at both the route body
(`slideDeckConfigSchema`) and the DB layer; slide bodies are **`z.unknown()`
at the route**, blocked on a real gap: panther's `PatternType` includes
`"none"` but the split-fill Zod enum doesn't
([lib/api-routes/products/slides.ts](lib/api-routes/products/slides.ts)),
with `slideConfigSchema.parse` as the DB-layer backstop. The layout tree is
a recursive Zod union embedding the strict `figureBlockSchema`; layout item
`style` is `z.record(z.unknown())`. Duplicates copy stored config text
without re-validation.

**The deck editor** (`SlideDeckEditor` in
[slide_deck/index.tsx](client/src/components/slide_deck/index.tsx)) takes
`{ productId }`: label, package and scope come from `productById` on the T1
store (D16), the authoring context from S9's immutable
`t2_run_authoring_context.ts` keyed by the LIVE `runId`, so a reattach or
rescope (from the header's product settings entry, the Products page or a
collaborator) moves figure data, metrics and presets together and lights the
stale badges without a remount; a product deleted under an open editor
closes it. The header shows the `ProductScopeBadge` ("package · scope") and
the overflow menu opens the shared `ProductSettings` surface.

**The slide editor**
([slide_editor/index.tsx](client/src/components/slide_deck/slide_editor/index.tsx))
opens via `openEditor` with `snapshotForSlideEditor` (the deck config only,
structuredClone-severed) plus the product id, the live pair and its
authoring context passed down. Left panel switches per slide type
(cover/section/content; content = header/footer tab + a per-block Content
tab with text/figure/image editors); right side is a live preview through
S10's `convertSlideToPageInputs` debounced 100ms off `trackStore(tempSlide)`.
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
([layout_editor/build_context_menu.ts](client/src/components/layout_editor/build_context_menu.ts)):
split/add/move/delete/convert, reachable from both the panel button and
canvas right-click. Figure blocks have ONE authoring path (D3): insert and
replace open `InsertFigureModal` (the product package's presets and the
metric wizard) and edit opens S11's embedded `VisualizationEditor`; every
result resolves through `resolveFigureBundleInteractively` under the
product's current pair, so editing a stale figure also brings it up to date.
Local edits notify the AI (`edited_slide_locally`) and the editor registers
the `editing_slide` view's mutator context on the AI view controller (S13);
until step 8 remounts the copilot the editors opened from the Products page
have no copilot.

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

**The Products page** (`components/products/index.tsx`) reads T1
(`instanceState.products`, per-row `products_upserted` maintained), sorts
newest first, multi-selects via `createSelectionController`, and offers
settings, duplicate and delete from the card context menu; "New deck" and
"New report" are two `createButtonAction`s over `createProduct` (the server
mints the label and resolves the pin; the buttons disable before the click
when no ready package is pinned) and the editor opens on the SSE echo or
through `pendingEditorOpen({ kind: "product" })`, the one opener the tours
and the copilot also use. Folders, list view, search and the menus are step
7b. The deck view's `SlideList` renders cards in the vendored SortableJS
wrapper (multiDrag; optimistic local order; reorder diffs the moved run and
calls `moveSlides`). Folders have **no GET route**: they ride the `starting`
payload and `folders_updated` only.

## Reports

**One-row model.** `reports` = `label` + `body` (markdown) + `figures` /
`images` (JSON registries `Record<id, Block>`, validated by the **strict**
`figureBlockSchema` at both route and DB) + `config` (v1 passthrough
`{version}`) + `folder_id`. Embeds are markdown tokens
`![caption](figure:<uuid>)` / `![caption](image:<uuid>)`; the caption IS the
alt text. Orphaned registry entries are pruned at load; deleting an embed
removes only the token, so undo restores a working embed.

**Summary derivation.** `getAllReports` deliberately never loads the heavy
registries; the list card's `preview` (`buildReportPreview`) derives from the
body alone: up to 8 lines/300 chars, heading levels, figure/image counts by
token regex.

**Editor** (`ReportEditor` in [report/index.tsx](client/src/components/report/index.tsx),
over `ReportBodyEditor` in `report_editor.tsx`): takes `{ productId }` and
reads label, package and scope live from the T1 row like the deck editor
(the product id is also the collab document id, since a report IS its
product). CodeMirror 6 with an embed-widget extension (a line that is
exactly one token renders as an atomic block widget), three modes
edit/split/view, and line-anchored bidirectional scroll sync (`data-line`
anchors, echo-loop guard, figure-settle ResizeObserver window). The left
panel inserts, replaces and edits embeds through the same one authoring path
as the slide editor (`InsertFigureModal` plus the embedded editor, resolved
by `resolveFigureBundleInteractively` under the product's pair). Each embed
(`ReportFigureEmbed`, in the
preview pane and the CodeMirror widget alike) shows S11's stale badge when
its bundle was resolved under another pair, and the header counts them with
"Update all figures", re-resolving through one `persistFigures` write. View
mode and both exports share `REPORT_MARKDOWN_STYLE`.

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
