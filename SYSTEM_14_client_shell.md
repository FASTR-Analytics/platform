---
system: 14
name: Client Shell & Session
globs:
  - client/src/app.tsx
  - client/src/components/ConnectionStatus.tsx
  - client/src/components/HelpButton.tsx
  - client/src/components/email_opt_in_modal.tsx
  - client/src/components/instance/index.tsx
  - client/src/components/organisation_modal.tsx
  - client/src/components/whats_new_modal.tsx
  - client/src/index.tsx
  - client/src/onboarding/**
  - client/src/routes/**
  - client/src/state/t4_connection_monitor.ts
  - client/src/state/t4_ui.ts
  - lib/help/**
  - lib/translate/**
  - lib/types/whats_new.ts
  - server/routes/instance/onboarding.ts
  - server/routes/instance/whats_new.ts
docs_absorbed:
---

# S14 — Client Shell & Session

SPA boot, the signal-based page maps (almost no URL routing), the
language/calendar singletons and the app's translation conventions, UI
preferences, connection monitoring, onboarding modals, the help-button
system, and the first-visit page tours (`client/src/onboarding/` — the
`@njwse/roadtrip` tour manager, Clerk-backed seen-flags under
`unsafeMetadata.onboarding`). There is **ONE manager for the whole app**,
built by `setupTours()` and mounted from the instance shell, which hands it
the permission-normalized tab accessor plus an approved-visibility gate so a
tour can never fire behind the sign-in wall. The product editors are overlays
on that same shell, so one manager is also one run-at-a-time lock — opening a
deck mid-tour hands over cleanly instead of two tours overlapping. A tour's
`pages` predicate must be true only while its page is actually visible (tab
active AND permission granted), or the tour fires, finds no targets, and is
marked seen invisibly; because the editors keep the shell's tab on
`products`, the page-level predicates additionally exclude the editing views
and the copilot's view controller (`copilotViewController.current()`) is what
actually tracks where the user is. The same directory hosts the tour
catalogue modal (`tour_catalogue_modal.tsx` + `catalogue.ts`, sidebar shell in
`tour_catalogue_layout.tsx`, opened from the instance topbar), which replays
or re-arms any of the 21 tours across five areas (Products, Explore, Decks,
Reports, Instance). Play always routes through the `pendingTourReplay` signal:
the modal sets it, then `entry.navigate(openInstanceTab)` switches tab and —
for the deeper tours — asks the Products page to open a product via the
`pendingEditorOpen` request signal in `t4_ui.ts` (persists until the page
mounts and consumes it), with the slide tours chaining a second-level
`pendingSlideOpen` the deck editor consumes to open the first slide of the
requested type; `setupTours()` starts the tour once its own page is active,
which for the editor tours is several frames after `navigate()`. Availability
is state-only over T1 — `available()` must not probe the DOM, since the tour's
page is usually unmounted when it is evaluated — with a plain
`unavailableReason()` string shown in place of the Play button. The three
slide-tour rows are the exception: slide types live only in the slide
documents, so the modal runs a cache-first `findDeckWithSlideOfType` search on
mount and the row list waits for it. The manager is created with the shared
button labels (`tourLabels()`, merged by roadtrip under any per-tour labels)
and `onEvent: reportTourEvent` (`telemetry.ts`), which posts tour start /
finish / abort to `recordTourEvent` (`server/routes/instance/onboarding.ts`) →
the user-log pipeline as `tour_<event>:<tourId>` rows (details carry page,
trigger, and for aborts the step reached and the reason — skip vs missing
target); per-step events are not sent. Seen-state in the modal reads the Solid
manager's reactive `hasSeen()`, so the pill updates on hydration and after a
tour finishes with no manual invalidation. Plus stewardship of the ~240-file
`t3` call-site surface. Reviewed against code 2026-07-17 (first review cycle,
review-only; absorbs DOC_TRANSLATION + DOC_HELP_BUTTONS).

Boundaries: the generic translation rules (`TranslatableString`, `t3` vs
`resolveTS`, fallback-to-English, `Record<Language, T>` formatting lookups) are
panther's `protocols/PROTOCOL_ALL_TRANSLATION.md` — deferred there, not
restated. The add-a-help-button recipe is
[PROTOCOL_APP_HELP_BUTTONS.md](PROTOCOL_APP_HELP_BUTTONS.md); this system owns
the machinery. Client state tiers and cache-consumption rules are
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md); the deploy-flush the shell
performs on boot is S3 machinery
([SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)). The page _content_
each switchboard mounts belongs to its feature system — this system owns the
frame. Sub-file custody exceptions are in SYSTEMS.md §4.1: `LoggedInWrapper.tsx`
is owned by **S1** (this system a mandatory reader — it hosts the Clerk
singleton, language resolution, and the version flush);
`lib/translate/t-func.ts` is owned here with **S9** a mandatory reader (calendar
semantics feed period labels); `components/_shared/**` is owned by **S12**'s
manifest (its `sort_control.tsx` renders this system's sort prefs). Repo-root
`build_help_buttons.ts` and `client/src/app.css` are outside the lint manifest
but reviewed here.

## Contract

Panther style globals are set before first render; language/calendar resolve
_during_ render of the logged-in tree (localStorage → instance config) and apply
via full page reload. One URL-addressable page (`/access-tokens`) and one
deep-link parameter (`?product=`); every page transition is a signal. UI prefs
persist via localStorage and
never enter fetch configs or cache hashes. Every user-visible string is a
`TranslatableString` resolved by `t3`.

## Boot

`client/src/index.tsx` runs exactly three panther setters before
`render(<App />)`: `setKeyColors(_KEY_COLORS, undefined,
{ remapNearBlackOnDark: true })` (the opt-in flips module-authored near-black
literals to the dark baseContent, which would otherwise vanish on a dark base),
`setBaseText(BASE_TEXT_OPTIONS)`,
`setGlobalStyle(GLOBAL_STYLE_OPTIONS)` — the latter two **deep-imported from
`generate_visualization/get_style_from_po/_0_common`** (S10-owned files), so
figure styling and app chrome share one source; that deep import is load-bearing
for boot.

`app.tsx` mounts the router (and `app.css`). Everything under `/*` renders
`InstanceLoggedInWrapper` (`routes/index.tsx`) → `LoggedInWrapper` (S1-owned
file), which:

- holds the module-level Clerk singleton (`new Clerk(publishableKey)` from
  `VITE_CLERK_PUBLISHABLE_KEY`), and a `bypassAuth` dev path
  (`VITE_BYPASS_AUTH === "true"` AND a non-production build) that skips Clerk
  entirely and synthesizes a dev user (`"en"`/`"gregorian"`);
- resolves **language**: `localStorage[LANGUAGE_STORAGE_KEY]`
  (`"fastrLanguage"`) if present, else the instance's configured language
  fetched via `getInstanceMeta` (the logged-out login screen does the same);
  Clerk then loads with `frFR` localization when the resolved language is
  French;
- performs the **deploy flush**: compares the server's `serverVersion` against
  localStorage and calls `clearDataCache()` on change (mechanics in S3).

Once the global user exists, `routes/index.tsx` sets the singletons for the
render pass: `setLanguage(stored ?? globalUser.instanceLanguage)` and
`setCalendar(globalUser.instanceCalendar)` — **calendar comes only from instance
config; there is no calendar override**. Note the singletons are set
_mid-render_, not before `render()` — only the style globals are guaranteed
pre-render (Open items).

## Routing & page maps

The URL surface is deliberately minimal — two routes in `app.tsx`:
`/access-tokens` (the unlisted Clerk-gated PAT panel,
`routes/access_tokens.tsx` — reached only by knowing the URL) and `/*` (the
logged-in app). Note `/mcp` is the server's headless MCP endpoint and never
reaches the SPA. Within the app, exactly one URL parameter matters:
**`?product=<id>`** (`_PRODUCT_QUERY_PARAM` + `productDeepLinkHref` in
`t4_ui.ts`, so page, cards and copilot all spell it the same way), which opens
that product's editor over the Products page. `components/products/index.tsx`
consumes it in an effect that immediately clears the parameter and converts it
into the same `pendingEditorOpen` request the tour catalogue and the copilot
use — one opener, one place that waits for hydration; once the store is ready
and the id is still absent the request is dropped as a dead link. There is no
shim for older link shapes.

Everything else is a **signal-driven switchboard**, never the URL:

- `components/instance/index.tsx` — a local `_tab` signal filtered through a
  permission-guarded derivation (an inaccessible tab falls back to
  `products`) selects Products / Explore / Data / Results (`results_packages`)
  / Assets / Users — Products first and the default, Products and Explore
  always present, the other four gated on their permissions. This file also hosts the
  language menu, the tour manager (`setupTours`), the tour catalogue modal and
  the onboarding-modal effect (below). The tab signal is deliberately NOT
  persisted — a reload lands on Products.
- The product editors are overlays opened over the Products page, not tabs, so
  the shell's tab stays on `products` while one is open. A product's AA2 scope
  is branded on its card (`components/products/product_card.tsx`): when
  `product.adminArea2` is set a small badge with the area name renders beside
  the label; national products show nothing extra. Scope semantics are S9's
  ([SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) §AA2 scope
  injection).

## Language, calendar & translation

Three languages: `en`, `fr`, and `pt` (European Portuguese, being rolled out
across the inline literals). Language is per-browser
(`localStorage.fastrLanguage`), defaulting to the instance language; the
language menu writes localStorage and calls `window.location.reload()` —
**language and calendar apply by full reload, nothing re-renders reactively**.
Calendar (`gregorian`/`ethiopian`) is instance config only.

`lib/translate/` is the app's whole translation surface over panther's
primitives:

- **`t-func.ts`** — re-exports `t3`/`setLanguage`/`getLanguage` from
  `@timroberton/panther`; owns `LANGUAGE_STORAGE_KEY`, the app's **calendar
  singleton** (`setCalendar`/`getCalendar`, default `"gregorian"`), and
  `pickLang(language, ts)` — an explicit-language resolver used only by the
  viz-generation pipeline (`generate_visualization/conditional_formatting.ts`),
  not shell UI.
- **`common.ts`** — the `TC` object of shared strings (24 keys: `cancel`,
  `save`, `download`, `delete`, `edit`, `done`, `update`, `settings`, `email`,
  `national`, `columns`, `rows`, `loading`, `loadingFiles`, `loadingAssets`,
  `fetchingData`, `general`, `label`, `folder`, `mustEnterName`, and four
  `disaggregation_disabled_*` messages), all with `pt` entries.
- **`types.ts` / `mod.ts`** — re-export `TranslatableString`, `Language`,
  `resolveTS` from panther.

There is no translation build step and no string-key table — translations are
**inline `{ en, fr, pt? }` literals at the call site** (~239 client files call
`t3`), plus `TC`. There is deliberately no `isFrench()` helper; conditional
language logic uses `getLanguage()`.

**Authoring conventions** (the app layer over `PROTOCOL_ALL_TRANSLATION`):

- Wrap all user-visible client text: JSX text content, button/link labels,
  label-ish props (`label`, `header`, `heading`, `placeholder`, `noRowsMessage`,
  `selectionLabel`, `text`), fallbacks, template literals.
- Don't wrap: CSS classes, route paths, endpoints, object keys/enum values/ids,
  `intent`/`size`/`iconName`-style props, console output, or error strings in
  `throw`/`{ err }` responses.
- Panther components translate their own built-in strings internally — no
  language prop is passed.
- Promote a string to `TC` when it appears in 3+ places.
- Register: professional, concise French/Portuguese for a technical World Bank
  UI; for domain terms (admin area, indicator, slide deck) copy the established
  translation from existing `t3` calls, don't invent.

Whether every literal is well-formed across the 239-file surface is the standing
§4.3.6 audit (SYSTEMS.md), not re-checked per cycle.

## UI preferences (`state/t4_ui.ts`)

Signal + localStorage pairs, each with a `set*` wrapper that writes localStorage
then the signal: the one product list's `productsSortMode`
(`ProductSortMode = "recent" | "label"`, `lib/types/products.ts`),
`productsTypeFilter` (`null` = both types) and `productsSelectedFolder` (`null`
= the sidebar's "All products" root, not "unfoldered"), plus `navCollapsed` and
the tri-state `scheme` preference. `updateProductsView` is the consolidated
updater — one entry point, so a copilot view tool never reaches past this file
into individual setters. Stored sort/filter values are unvalidated on read:
they only feed comparisons, so an unknown value degrades to "no match" rather
than throwing. `scheme` rides panther's `data-scheme` contract
(`"system" | "light" | "dark"`, applied at module scope so it is on `<html>`
before first paint, with the legacy boolean `darkMode` key migrated in);
`darkMode()` is the resolved-as-rendered accessor for JS consumers.

In-memory only (deliberately not persisted): `fitWithin`, `showAi`,
`headerOrContent`, `policyHeaderOrContent`, the Explore tab's `exploreRunId` /
`exploreAdminArea2` pair (ephemeral by ruling — the package Select starts at
the pin and the scope picker at national; these are module-level signals purely
so the pair survives a tab switch within one session), and the three-level
editor-open request chain `pendingEditorOpen` → `pendingSlideOpen` →
`pendingTourReplay`. The rule these encode: **display-only preferences stay in
T4 — they never enter fetch configs or cache hashes** (the roll-up sentinel
lesson, SYSTEM_09).

## Connection monitoring (`state/t4_connection_monitor.ts`)

No polling, no heartbeat: `navigator.onLine` + `online`/`offline` window events
feed `isOnline`; a failure counter fed by the server-action wrapper
(`try_catch_server.ts` calls `reportNetworkFailure`/`reportNetworkSuccess`)
flips `connectionIssues` at ≥2 failures with a 30 s decay.
`ConnectionStatus.tsx` renders the offline banner but is **mounted nowhere —
dead UI** (Open items); the monitor itself is live.

## Onboarding modals

An effect in `components/instance/index.tsx` (after approval + Clerk user)
sequentially opens `EmailOptInModal` (writes
`clerk.user.unsafeMetadata.{emailOptIn, emailOptInAsked}`) then
`OrganisationModal` (writes `unsafeMetadata.organisation`; skippable), then
`WhatsNewModal` — a multi-page release-notes popup. The sequence is guarded to
run ONCE per signed-in user id (the approval store re-fires the effect, which
would otherwise re-open the modals and displace whatever the alert slot
holds). Posts are
authored in the Admin-Website, fetched by `server/routes/instance/whats_new.ts`
from status-api (60s in-memory cache, fail-silent, 30s backoff after a failed
fetch) and pre-filtered server-side to
`published && version <= _SERVER_VERSION && (!adminsOnly || isGlobalAdmin)`
(the version gate is skipped when `SERVER_VERSION` is non-dotted, i.e. ad-hoc
test deploys). Read-state is a per-post id set in
`unsafeMetadata.whatsNewReadPostIds` (a post counts as read once opened, Skip
or Done alike), pruned on write to the currently-eligible ids; users still
carrying the superseded high-water `whatsNewSeenVersion` are migrated once by
marking every post at or below it read. Brand-new users — detected as
`!emailOptInAsked` before the opt-in modal writes it — are baselined with
everything marked read, so they get neither popup nor dot. The fetched posts
also power a header bell (between the language switcher and the feedback
button; hidden when there are no posts) with a warning-coloured unread dot and
a `WhatsNewFeedModal` history feed. The dot persists until every missed post
has been opened — the feed does NOT bulk-acknowledge; it marks each post read
as it is opened and flags the still-unread rows. The login popup
(`whatsNewAutoShowPost`) only pushes a release NEWER than every version already
acknowledged, so acknowledging one release never drags an older unread backlog
into subsequent logins — those stay behind the bell. Bell/feed state is keyed
to the signed-in user id (module signals survive a same-tab user switch). The
modal keeps every page mounted (inactive ones `invisible`) with a staggered
load queue, so the element that downloaded the media is the one displayed;
it supports arrow-key paging and Escape, shows a GIF's first frame under
`prefers-reduced-motion` (play button opts back in), and closes with a
`"skipped" | "completed"` outcome; open/outcome are recorded via
`recordWhatsNewEvent` → the user-log pipeline as `whats_new_<event>:<postId>`
rows (post id in the endpoint name so counts survive the 7-day rollup;
surfaced per-post in the Admin-Website). Layouts are locked presets
(`WHATS_NEW_LAYOUTS`, incl. a full-bleed `cover`), each page scaling its media
via `mediaSize`. Types + `compareDottedVersions` live in
`lib/types/whats_new.ts`. The three onboarding modals persist to Clerk
`unsafeMetadata` only — no localStorage writes.

## Help buttons (`lib/help/**`, `HelpButton.tsx`)

Docs-site-backed contextual help: content is authored as invisible
`<!-- help#id -->` tags in the EN+FR markdown of the sibling `wb-fastr-site`
repo; `deno task build:help-buttons` walks the site and generates
`lib/help/help_targets.generated.ts` (41 entries: page slug, per-language
anchors, titles, ~200-char summaries), failing on duplicate or one-language-only
ids. `<HelpButton id />` is fully self-contained — `id` is typed as the
generated `HelpId` union (a dangling button is a compile error), the modal
renders title+summary from the table with no runtime fetch, and "Read more…"
deep-links via `getHelpUrl` (site URL, `/fr` prefix when
`getLanguage() === "fr"`, the language's own anchor). The recipe and its traps
are [PROTOCOL_APP_HELP_BUTTONS.md](PROTOCOL_APP_HELP_BUTTONS.md). Coverage
today: **EN/FR only** (a `pt` user gets English content and the English site),
and exactly **one** of the 41 targets has a button in the UI (`viz-data-tab`, in
the figure editor's data panel).

## Open items

- **Language/calendar are not set before first render** — only the style globals
  are; `setLanguage`/`setCalendar` run mid-render in `routes/index.tsx`. Decide:
  hoist resolution ahead of `render()` (kills any pre-language flash) or bless
  the current order as the contract.
- `ConnectionStatus.tsx` is dead UI — the monitor feeds signals nobody renders.
  Mount it or delete it.
- Help system has no `pt`: the generator and `getHelpUrl` are EN/FR-only, so
  Portuguese users silently get English summaries and the English site. Needs a
  site-side `pt` tree before the app side can follow.
- Help-button adoption is 1 of 41 generated targets — the machinery is built;
  the buttons were never rolled out.
- `components/_shared/**` custody: S12's manifest owns it but `sort_control.tsx`
  is shell furniture — settle the custody (manifest or §4.1 exception) rather
  than leaving prose and globs disagreeing.
- Help generator hygiene: `.mdx` pages are silently skipped by the walk;
  `getHelpTarget` in `lib/help/mod.ts` is an unused export.
