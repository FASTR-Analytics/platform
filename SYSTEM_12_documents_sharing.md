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
  - lib/types/slides.ts
  - server/db/instance/dashboard_slugs.ts
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
`expectedLastUpdated` in the family). Reads are guarded by `can_view_*`,
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
970 LOC) opens via `openEditor` with `snapshotForSlideEditor`
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
edits notify the AI (`edited_slide_locally`) and register AIContext
`editing_slide` mutators.

**The per-slide save loop**: editor seeds `lastKnownServerTimestamp` from
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

**One-row model.** `reports` = `label` + `body` (markdown) + `figures` /
`images` (JSON registries `Record<id, Block>` — validated by the **strict**
`figureBlockSchema` at both route and DB) + `config` (v1 passthrough
`{version}`) + `folder_id`. Embeds are markdown tokens
`![caption](figure:<uuid>)` / `![caption](image:<uuid>)`; the caption IS the
alt text. Orphaned registry entries are pruned at load; deleting an embed
removes only the token, so undo restores a working embed.

**Summary derivation.** `getAllReports` deliberately never loads the heavy
registries; the list card's `preview` (`buildReportPreview`) derives from the
body alone — up to 8 lines/300 chars, heading levels, figure/image counts by
token regex.

**Editor** ([report/index.tsx](client/src/components/report/index.tsx), 1063
LOC): CodeMirror 6 with an embed-widget extension (a line that is exactly one
token renders as an atomic block widget), three modes edit/split/view, and
line-anchored bidirectional scroll sync (`data-line` anchors, echo-loop
guard, figure-settle ResizeObserver window). The left panel inserts/edits
embeds (figures resolve through the same S10 funnel as dashboards). View
mode and both exports share `REPORT_MARKDOWN_STYLE`.

**Autosave protocol**: 800ms debounce → `updateReportBody({body,
expectedLastUpdated, overwrite: true})`; the server **always writes** and
returns `{lastUpdated, conflicted}` — `conflicted` is advisory
([db/project/reports.ts:127-163](server/db/project/reports.ts#L127-L163));
the client bumps its base timestamp monotonically (out-of-order responses
can't rewind) and shows a dismissible "your changes were saved over theirs"
banner. The `overwrite` param is accepted but unused — reserved for a
hard-reject mode (Open item). Figures/images/config/label are separate
whole-registry PUTs with **no concurrency guard** — the known MED
lost-update race on the registries (Open item).

**AI-diff view**: AIContext `editing_report` registers `proposeEdit` (opens a
`@codemirror/merge` MergeView modal, accept/reject) and `applyFigureUpdate`;
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
no emails or project ids; `countryIso3` is fetched best-effort (label
cleaning must never block serving).

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
  (or human + AI `applyFigureUpdate`) clobber each other.
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
- **Decoupling — `server/utils/id_generation.ts` hardcodes 7 tables**
  (across S11/S12): generalize to `generateUniqueId(db, tableName)` (also
  [PLAN_DOC_ENFORCEMENT.md](PLAN_DOC_ENFORCEMENT.md) #16).
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
