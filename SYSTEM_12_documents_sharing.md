---
system: 12
name: Documents & Sharing
globs:
  - client/src/components/PasswordGate.tsx
  - client/src/components/_markdown_guide.tsx
  - client/src/components/_shared/**
  - client/src/components/forms_editors/edit_label.tsx
  - client/src/components/layout_editor/**
  - client/src/components/products/**
  - client/src/components/report/**
  - client/src/components/slide_deck/*.ts
  - client/src/components/slide_deck/*.tsx
  - client/src/components/slide_deck/slide_editor/**
  - client/src/components/slide_deck/slide_transforms/**
  - client/src/components/slide_deck/style_editor/**
  - client/src/state/products/t2_report_detail.ts
  - client/src/state/products/t2_slide_deck_detail.ts
  - client/src/state/products/t2_slides.ts
  - lib/types/_slide_config.ts
  - lib/types/_slide_deck_config.ts
  - lib/types/products.ts
  - lib/types/reports.ts
  - lib/types/slides.ts
  - server/db/products/**
  - server/routes/instance/emails.ts
  - server/routes/products/**
  - server/utils/id_generation.ts
docs_absorbed:
---
# S12 — Products & Folders

**A product is a slide deck or a report.** This system owns the `products`
registry every cross-type operation goes through, the flat `folders` level over
it, the two per-type detail families, the Drive-like page they live on, and the
SendGrid email egress. The render/export engines themselves are S10's; S12 owns
the artifacts, their storage, and the export *triggers*.

## Scope

The `globs:` frontmatter above is the lint-enforced manifest
(`lint_systems.ts`); sub-file custody exceptions are in SYSTEMS.md §4.1.
Client: `components/products/**` (the page, the card, the ONE settings surface,
the three modals), `components/slide_deck/**` minus `slide_ai/` (S13),
`layout_editor/` (one file, imported only by the slide editor),
`components/report/**`, `state/products/{t2_slides,t2_slide_deck_detail,
t2_report_detail}.ts`. Server: `db/products/**` and `routes/products/**` whole
(S12 owns the files, S16 the collab/version slice riding them — SYSTEMS.md
§4.1), `routes/instance/emails.ts`, `server/utils/id_generation.ts`. Lib:
`types/products.ts` plus the slide/report types incl. `buildReportPreview`.
Custody wrinkle: the `_shared/**` glob also carries `dhis2_credentials/` (all
consumers are S5/S6/S7 surfaces — SYSTEM_07 documents it), `scope_picker.tsx`
(S11/S12 seam), `sort_control.tsx` (shell furniture — flagged in SYSTEM_14) and
the collab client UI (S16); the three logo files are genuinely S12's (Open
item: settle the manifest).

## Contract

**One registry, one id namespace.** `products` (id, type ∈
`{slide_deck, report}`, label, folder_id, `run_id NOT NULL`, admin_area_2,
created_by, created_at, last_updated) plus per-type detail tables keyed by the
SAME id with `ON DELETE CASCADE`. Every cross-type operation — list, folder
move, delete, package reattach, "in use by", the id space — is one query
against `products`, which is exactly why two independent tables were rejected
(D1). `products.last_updated` is THE product version: every content mutation
and every metadata write bumps it in the same transaction, and it keys the
detail cache.

**Access is permissive and uniform.** Every route in the family is guarded by
`requireApprovedUser()` and nothing finer — signed in AND approved makes you a
full editor of every product (D2). **The product id in the path IS the
authority**: never add a per-handler permission check behind that guard, because
a future permission scheme replaces the guard itself with a product-aware one
(SYSTEM_01). `products.created_by` is recorded so that later owner/sharing model
has its join key; nothing reads it for access today.

**Both families persist CLIENT-built `FigureBlock` bundles** (the server never
recomputes figures); the figure-snapshot lifecycle is owned upstream by S10.
**Two concurrency philosophies, one per family**: slides = per-row **opt-in
optimistic lock** (`expectedLastUpdated` → `err: "CONFLICT"`; both the human
editor and the AI tools send it); reports body = **always-write
last-write-wins** returning an advisory `conflicted` flag → non-blocking banner.
**S16 overlays both**: when a live collab room exists for a slide or report, the
mutating routes offer the save to the room first (`applySlideToLiveRoom` /
`applyReportToLiveRoom`) and the CRDT merge is the conflict resolution — the
philosophies below engage only when no room is live. The collab checkpoint
functions and additive columns (`saveSlideCheckpoint` / `saveReportCheckpoint`,
`crdt_state` / `crdt_state_last_updated` / `body_authors`) ride
`server/db/products/{reports,slides}.ts` and the version-history routes ride the
route files — S12 owns the files, S16 the feature
([SYSTEM_16_collaboration.md](SYSTEM_16_collaboration.md)).

**There is no unauthenticated surface in this system.** Decks email a PDF;
reports download. Every other exit is a signed-in export.

## The Products page

One Drive-like page, [components/products/index.tsx](client/src/components/products/index.tsx)
(~650 LOC), reading `instanceState.products` and `instanceState.folders`
straight from T1 — the SSE channel keeps both current, so the page has no list
route to call. `FrameLeftResizable` sidebar of folder groups (two pseudo-groups:
"All products" and "General" = un-foldered) with right-click rename/delete;
type-filter chips; 3+-character search; one sort preference
(`sortBySortMode`, client-side, not a server ORDER BY); a mixed card grid
(`product_card.tsx` — type icon, package label + scope badge, last updated) and
`createSelectionController` over the **plain product id**. One id namespace and
cross-type batch routes mean there is nothing to dispatch per type: multi-select
feeds `moveProductsToFolder` / `deleteProducts` / per-product `duplicateProduct`
directly.

**Create is two buttons, no modal.** "New deck" / "New report" call
`createProduct({type, folderId})`; the server mints the localized label
("Untitled deck" / "Untitled report"), resolves `run_id` from the pin INSIDE the
insert (`INSERT … SELECT … FROM runs WHERE pinned AND status='ready'` — no
read-then-write window) and inserts the detail row in the same transaction, then
the editor opens immediately via `getEditorWrapper`. With no ready pinned
package there is nothing to create against: T1 already knows that, so the
buttons are disabled before the click, and the server's typed
`NO_READY_PINNED_PACKAGE` still comes back **through the envelope** (not a
throw) to cover the race where the pin moves between render and click.

**One settings surface.** [product_settings.tsx](client/src/components/products/product_settings.tsx)
(label, folder, package `Select` over T1 `readyPackages`, scope picker) is
reached from the card menu AND from both editor headers. Changing package or
scope never blocks and has no pre-flight — the per-figure stale badge is the
whole mechanism (D4, S11). The package options are captured at open and always
include the product's CURRENT package even when it is no longer ready: dropping
it would silently reattach the product on the next save.

**Deep link.** `?product=<id>` is consumed into the same `pendingEditorOpen`
request the tours and the copilot use, so there is one opener and one place that
waits for hydration; an id still absent once the store `isReady` is a dead link
and the request is dropped.

**Folders** are flat, few, and have **no GET route**: `listFolders` rides the
SSE `starting` payload and `folders_updated`. Deleting one frees its products
(`folder_id = NULL`) and returns the freed ids so the route can emit
`products_upserted` for them beside the folder list — the rows changed, so they
need their own version bump.

**Delete is hard, and rooms close with it.** `deleteProducts` reads the batch's
types BEFORE the delete (a transient read failure aborts rather than leaving
live rooms as zombies) and pre-reads the slide ids of any deck in the batch
INSIDE the delete transaction; detail rows, slides and versions go by CASCADE.
The returned slide ids exist only so the route can `closeSlideRoom` /
`closeReportRoom` — after the CASCADE they are unrecoverable. There is no trash.

## Slide decks

**Data model.** The `products` row carries label, folder, package and scope; the
`slide_decks` detail row adds free-text `plan` (the AI planning scratchpad) and
JSON `config` (deck style). One `slides` row per slide (JSON `config` = one
`Slide`, integer `sort_order`, its own `last_updated`, plus the S16 CRDT
columns; FK cascade on deck delete). The deck config carries its own `label`
field, which the editor's title box writes — `updateSlideDeckConfig` writes both
copies in one transaction and the registry's is authoritative.

**Ids** come from [id_generation.ts](server/utils/id_generation.ts): one
generator, 4 chars over a 31-char alphabet (923,521 combinations), for
`products` and `slides` alike. Ids are never length-validated and registry
params stay `z.string()` — never `z.uuid()` — so shorter historical ids keep
working.

`getSlideDeckDetail` joins `products` for the label and stamp and returns only
ordered `slideIds`; slide bodies fetch per-slide through `_SLIDE_CACHE`. Sort
orders are **gap-numbered** (append = max+10, insert = target±5) with
`reSequence` (`ROW_NUMBER()*10`) run inside the create/delete/duplicate/copy
transactions. `moveSlides`
([db/products/move_slides.ts](server/db/products/move_slides.ts)) is
**within-deck reorder only**; the cross-deck path is `copySlidesToDeck`.

**`copySlidesToDeck` is the only cross-product figure reuse.** There is no
figure library, so copying slides between decks is how a figure gets reused. The
slide configs — and so their `FigureBundle`s — are copied VERBATIM, which means
a copied figure keeps the `(runId, adminArea2)` pair it was resolved under and
shows as stale under the target whenever the two products' pairs differ (D4).
That is deliberate: both products are the user's own, so the mixed-package state
is a visible choice.

**The product-touch rule.** Every slide mutation bumps `products.last_updated`
with the same timestamp in the same transaction — that touch is what drives the
`products_upserted` push and the t2 detail cache's version. Exception (Open
item): `duplicateSlides` runs its shift-UPDATE and per-slide INSERT loop
**outside** any transaction, so a mid-loop failure leaves partial rows.
`duplicateProduct` has no such hole — both detail halves run inside its
transaction.

**Validation at write.** Deck config is validated at the route body
(`slideDeckConfigSchema`) and again at the DB layer; slide bodies validate
against `slideConfigSchema` (strip mode) at the route, with
`slideConfigSchema.parse` as the DB-layer backstop. The layout tree is a
recursive Zod union embedding the strict `figureBlockSchema`; layout item
`style` is `z.record(z.unknown())`, and the split-fill pattern enum mirrors
panther's `PatternType` exactly, `"none"` included — a route-body schema must
accept everything the stored schema does even where the UI never produces it.
Handlers still cast the parsed value to `Slide`: `z.lazy()` cannot reproduce
panther's branded `LayoutNode<ContentBlock>`, so the cast bridges a
compile-time gap Zod has already closed at runtime. Duplicates and version
copies move stored config text without re-validation.

**The slide editor**
([slide_editor/index.tsx](client/src/components/slide_deck/slide_editor/index.tsx),
~1,520 LOC) opens via `openEditor` with `snapshotForSlideEditor` — which
snapshots ONLY the deck config, because the product's pair must NOT be frozen
(it is read live off the T1 row so a reattach mid-edit moves the editor's reads
with it). Left panel switches per slide type (cover/section/content; content =
header/footer tab + a per-block Content tab with text/figure/image editors);
right side is a live preview through S10's `convertSlideToPageInputs` debounced
100ms off `trackStore(tempSlide)`. Slide-type switching keeps a per-type cache
so switching back restores prior state (same idiom per-block for block-type
switches). The layout tree is manipulated exclusively through panther node ops
via `buildLayoutContextMenu`
([layout_editor/build_context_menu.ts](client/src/components/layout_editor/build_context_menu.ts))
— split/add/move/delete/convert, reachable from both the panel button and canvas
right-click. Figure blocks go through S11's two entry points: `InsertFigureModal`
(the product's presets or the metric wizard) to create, the embedded
`VisualizationEditor` to edit, and `resolveFigureBundleInteractively` to rebuild
the bundle either way. The header carries the scope badge, a Settings entry and
`UpdateAllFiguresButton` with its stale count. Local edits notify the copilot
(`edited_slide_locally`) and the editor registers the `editing_slide` view's
mutator context — including the open product's pair — on the view controller
(S13).

**The per-slide save loop** (the no-room/offline path — while a collab session
is live the editor never explicit-saves; the room checkpoints continuously,
S16): editor seeds `lastKnownServerTimestamp` from props →
`updateSlide({slide, expectedLastUpdated, overwrite})` → DB compares
`last_updated` and returns `CONFLICT` unless `overwrite`
([db/products/slides.ts](server/db/products/slides.ts)) →
`ConflictResolutionModal` offers overwrite / save-as-new (inserts after the
current slide) / view-theirs / cancel → on success the editor pre-warms
`_SLIDE_CACHE.setPromise` with the fresh version before SSE arrives. The lock is
**opt-in** at the DB layer, but both writers send it: the S13 AI slide tools pass
`expectedLastUpdated` from a pre-write `getSlide` fetch and rethrow `CONFLICT` to
the model as a "re-read via get_slide and retry" error (no overwrite path — the
human editor's modal is the only override).

## Reports

**One-row model.** `reports` = `body` (markdown) + `figures` / `images` (JSON
registries `Record<id, Block>` — validated by the **strict** `figureBlockSchema`
/ `imageBlockSchema` at both route and DB) + `config` (v1 passthrough
`{version}`) + the S16 CRDT/authorship columns; label, folder, package and scope
live on the `products` row. Embeds are markdown tokens
`![caption](figure:<uuid>)` / `![caption](image:<uuid>)`; the caption IS the alt
text. Orphaned registry entries are pruned at load; deleting an embed removes
only the token, so undo restores a working embed.

**Summary derivation.** The product summary query deliberately never loads the
heavy registries: the list card's `preview` (`buildReportPreview`) derives from
`body` alone — up to 8 lines/300 chars, heading levels, figure/image counts by
token regex. That matters more here than it did as a list route, because the
summary is re-read and re-broadcast on **every** `products_upserted`.

**Editor** ([report/index.tsx](client/src/components/report/index.tsx), ~1,790
LOC): CodeMirror 6 with an embed-widget extension (a line that is exactly one
token renders as an atomic block widget), three modes edit/split/view, and
line-anchored bidirectional scroll sync (`data-line` anchors, echo-loop guard,
figure-settle ResizeObserver window). The left panel inserts and edits embeds
through the same S11 funnel as the slide editor (`InsertFigureModal` →
`resolveFigureBundleInteractively`, or the embedded editor for an existing
figure), and figures carry `StaleFigureBadge` with the header's
`UpdateAllFiguresButton`. View mode and both exports share
`REPORT_MARKDOWN_STYLE`.

**Autosave protocol** (no-room path — once a collab session becomes ready the
800ms REST autosave is turned off for good and edits flow over the WS, S16):
800ms debounce → `updateReportBody({body, expectedLastUpdated, overwrite: true})`;
the server **always writes** and returns `{lastUpdated, conflicted}` —
`conflicted` is advisory ([db/products/reports.ts](server/db/products/reports.ts));
the base compared against is the PRODUCT's stamp, which is what versions a
report. The client bumps its base timestamp monotonically (out-of-order
responses can't rewind) and shows a dismissible "your changes were saved over
theirs" banner. The `overwrite` param is accepted but unused — reserved for a
hard-reject mode (Open item). Figures/images/config are separate whole-registry
PUTs with **no concurrency guard** — the known MED lost-update race on the
registries (Open item).

**AI-diff view**: the `editing_report` view context registers `proposeEdit` —
the propose phase of the report tools' approval lifecycle (S13), whose
`customProposalUI` opens a `@codemirror/merge` MergeView modal (accept/reject) —
and `applyFigureUpdate`; on accept, figures persist FIRST and roll back
client-side if the save fails (the AI is told the edit was not applied), then the
body applies through the editor API with the local-edit echo suppressed.

## FigureBundle — the two storage surfaces

This is S12's slice of the FigureBundle architecture; the full picture (bundle
shape, `buildFigureInputs`, the invariants, localization, staleness) lives in
[SYSTEM_10](SYSTEM_10_figure_render_export.md). S12 owns the two surfaces that
**store** bundles and the export paths that **render** them.

- **What is stored.** Both surfaces embed the strict
  `FigureBlock = { type: "figure", bundle?: FigureBundle }`
  ([lib/types/_figure_bundle.ts](lib/types/_figure_bundle.ts)). Slides carry it
  inside the layout tree ([_slide_config.ts](lib/types/_slide_config.ts));
  reports in the `figures` registry ([reports.ts](lib/types/reports.ts)) — one
  shared block schema across both. The strict schema is what lets the migration
  skip-gate catch a block that predates a required field (S2).
- **Capture-on-write.** Each surface assembles a bundle from the live build
  inputs: `config` + frozen `items` + the `resultsValue` projection +
  `indicatorMetadata` + `dateRange` + `geo` + **`localization` = the instance
  locale** (NOT the session toggle) + `metricId`/`snapshotAt` + **`scope` and
  `provenance.runId` — the pair the figure resolved under** (D4). The bundle is
  undefined-free pure JSON, so it persists with no stripping.
- **Build-on-render — every surface.** On-screen render and every export call
  `buildFigureInputs(bundle, deckStyle?)`. The export path "just works" because
  the bundle carries its own `localization` AND its own `scope` — which is what
  makes an exported figure label its roll-up row correctly outside any authoring
  shell (S10).
- **Version tables carry bundles too.** `deck_versions` / `report_versions`
  snapshot the same blocks, so a restore or a `copy*Version` (which mints a NEW
  product) brings the captured pairs back with them and the D4 badges judge them
  against the product they land in.

## Caches & the notify triangle

Both per-type t2 reactive caches version off the SSE-pushed `lastUpdated` maps —
version is part of the cache key, so a flip is an automatic miss — and both are
per-entity (Variant B, PROTOCOL_APP_STATE): `slide` per slide on
`lastUpdated.slides[id]`; `slide_deck_detail` and `report_detail` per product on
`lastUpdated.products[id]`.

The push side has one shape for the whole system. **`products_upserted` is the
ONLY product-list message** and it is per-row: every mutation route (and every
collab checkpoint) hands `notifyProductsUpserted` the ids it touched, which
re-reads those summaries and broadcasts them. A summary carries its own
`lastUpdated`, so the registry message and the cache-version index cannot
disagree, and there is no separate `last_updated` emit for products — only for
`slides`, whose rows have their own stamp. `notifyProductsUpserted` swallows a
failed re-read (logged): the write has already committed, and losing a broadcast
costs one stale card until the next event, while throwing would turn a succeeded
write into a failed request.

Consequences worth stating: a keystroke checkpoint on one deck never re-sends the
instance's cards; a metadata-only write (label, folder, package, scope) is a
first-class version bump and pushes exactly like a content write; and a folder
delete pushes both the folder list and the freed products. `setProductPackage`
additionally fires `notifyInstanceRunsCatalogUpdated`, because a repoint changes
the catalogue's "in use by" column and therefore which packages are deletable —
without it an admin reads a package as unused, clicks delete, and is refused by
the guard inside the DELETE.

## Emails

[routes/instance/emails.ts](server/routes/instance/emails.ts) is the only
SendGrid egress (raw fetch, `Bearer _SEND_GRID_API`, from
`noreply@fastr-analytics.org`). `sendSlideDeckEmail` (`requireApprovedUser()`):
the PDF is client-rendered (S10 base64 export); the recipient roster is the
instance roster — a named consequence of the permissive model (D2) — and the
addresses are schema-validated (`z.array(z.email()).min(1).max(50)`); sends are
sequential per recipient with partial failures returned as
`{sent: false, failedRecipients}`. `sendHelpEmail` (bare
`requireGlobalPermission()` — authenticates only, never checks `approved`, Open
item): one email per `_FEEDBACK_EMAIL_RECIPIENTS` with `replyTo` the user, then a
confirmation to the user only after at least one internal send succeeded — zero
internal deliveries returns `success: false` (the form shows the error instead of
"Thank you"). User-typed text (`message` / `description` / `context` /
`userEmail`) is HTML-escaped before interpolation in both routes.

## Open items

- **Reports registry lost-update race (MED, known)**: figures/images/config PUTs
  are whole-registry replaces with no concurrency guard — two editors (or human +
  AI `applyFigureUpdate`) clobber each other. Narrowed by S16: while a collab
  room is live these route through the room and merge; the race remains for the
  no-room path.
- **`duplicateSlides` is non-transactional** (shift + INSERT loop outside
  `begin`) and leaves partial state on mid-loop failure.
- **`sendHelpEmail` approved-user question**: the guard never checks `approved`,
  so unapproved (Clerk-authenticated but not-added) users can send feedback.
  Possibly intended — an unapproved user may legitimately need to reach support.
  Decide and either document or add the check.
- **`overwrite` on `updateReportBody` is dead** — always sent `true`, ignored by
  the DB fn (its parameter is `_overwrite`); wire the hard-reject mode or drop it.
- **`_shared/**` custody**: `dhis2_credentials/` is consumed only by S5/S6/S7
  surfaces and documented by S7; `sort_control.tsx` is shell furniture (SYSTEM_14
  flag) — settle via manifest move or a §4.1 exception row.
- **Type casts on mutation bodies**: `body.slide as Slide` and
  `body.config as SlideDeckConfig` discard the Zod-validated body typewise. Both
  are the branded-`LayoutNode` gap rather than laziness — closing them needs
  either a branded recursive schema or a `Slide` type that a schema can express
  (PLAN item, out of scope here).
- **Barrel bypass**: `slide_list.tsx` imports the vendored SortableJS wrapper via
  a deep `../../../../panther/...` path instead of `"panther"`.
- **`deleteSlides` route mints its own timestamp** before the DB call, so the
  SSE/response ts differs from the rows'.
- **Dead code**: `PasswordGate.tsx` (zero importers, EN-only);
  `forms_editors/confirm_update.tsx` (zero importers — S11's inventory).
