---
system: 14
name: Client Shell & Session
globs:
  - client/src/app.tsx
  - client/src/components/HelpButton.tsx
  - client/src/components/instance/email_opt_in_modal.tsx
  - client/src/components/instance/whats_new_modal.tsx
  - client/src/components/instance/instance.tsx
  - client/src/components/instance/organisation_modal.tsx
  - client/src/components/instance/theme_modal.tsx
  - client/src/index.tsx
  - client/src/onboarding/**
  - client/src/routes/**
  - client/src/state/t4_connection_monitor.ts
  - client/src/state/t4_theme.ts
  - client/src/state/t4_ui.ts
  - lib/help/**
  - lib/types/sort.ts
  - lib/types/whats_new.ts
  - server/routes/instance/whats_new.ts
  - lib/translate/**
  - server/routes/instance/onboarding.ts
  - server/tests/lint_structure_test.ts
docs_absorbed:
---

# S14: Client Shell & Session

SPA boot, the signal-based page maps (almost no URL routing), the
language/calendar singletons and the app's translation conventions, UI
preferences, connection monitoring, onboarding modals, the help-button
system, and the first-visit page tours (`client/src/onboarding/`: the
`@njwse/roadtrip` tour manager, Clerk-backed seen-flags under
`unsafeMetadata.onboarding`). ONE manager serves the whole app (`setupTours`,
mounted from the instance shell with its permission-normalized tab accessor
and an approved gate): the Products page and the instance tabs are pages
keyed on the shell's tab signal, and the deck, slide and report editor tours
are pages keyed on the copilot's view controller (`editing_slide_deck`,
`editing_slide` by the open slide's type, `editing_report`), because the
editors are overlays that leave the tab on Products. The Products page
predicate excludes the editing views, so a list tour never fires behind an
editor. Deferred parts (a card on screen, a slide in the deck, a figure in
the report) use entry-level `when` gates plus `watch` triggers over the T1
list lengths, the explorer's location, filter and view signals, and the open
view's slide or figure count. The same directory hosts the tour catalogue
modal (`tour_catalogue_modal.tsx` + `catalogue.ts`, opened from the Help
menu, always offered), which lists every tour by area (Products, Slide
decks, Reports, Instance) with availability computed over T1 only
(`instanceState.products`, `readyPackages`, the permissions; the three
slide-type rows first run a cache-first search of the decks' slide documents,
`findDeckWithSlideOfType`) and a reason when unavailable. Play calls the
entry's `navigate(openTab)`: a tab switch, plus for the editor tours a
`pendingEditorOpen` request (`{ productId }` in `t4_ui.ts`, persisting until
the Products page mounts and consumes it) and, for the slide tours, a
`pendingSlideOpen` the deck editor consumes to open the first slide of that
type; once navigate resolves (the slide tours search first, and a search that
finds nothing arms no replay) it arms `pendingTourReplay` with the tour id and
the product the tour's page lives in. The order matters: the manager's replay
effect runs synchronously on that write, starts the tour once its page
predicate is true, drops a tab-page replay whose page is not active (the
switch was synchronous, so the tab is denied), and drops a product replay
only once T1 is ready and no longer holds the product (a dead id, the
Products page's own rule for the open request). It reads nothing transient,
so the Products page clearing the open request just before it mounts the
editor does not disturb a waiting replay. The manager is created with the shared button labels
(`tourLabels()`, merged by roadtrip under any per-tour labels) and
`onEvent: reportTourEvent` (`telemetry.ts`), which posts tour start / finish /
abort to `recordTourEvent` (`server/routes/instance/onboarding.ts`) → the
user-log pipeline as `tour_<event>:<tourId>` rows (details carry page,
trigger, and for aborts the step reached and the reason, skip vs missing
target); per-step events are not sent. Seen-state in the modal reads the
Solid manager's reactive `hasSeen()`. Plus stewardship of the 241-file `t3`
call-site surface. Reviewed
against code (first review cycle, review-only; absorbs
DOC_TRANSLATION + DOC_HELP_BUTTONS).

Boundaries: the generic translation rules (`TranslatableString`, `t3` vs
`resolveTS`, fallback-to-English, `Record<Language, T>` formatting lookups) are
panther's `protocols/PROTOCOL_ALL_TRANSLATION.md`, deferred there, not
restated. The add-a-help-button recipe is
[PROTOCOL_APP_HELP_BUTTONS.md](PROTOCOL_APP_HELP_BUTTONS.md); this system owns
the machinery. Client state tiers and cache-consumption rules are
[PROTOCOL_APP_STATE.md](PROTOCOL_APP_STATE.md); the deploy-flush the shell
performs on boot is S3 machinery
([SYSTEM_03_realtime_cache.md](SYSTEM_03_realtime_cache.md)). The page _content_
each switchboard mounts belongs to its feature system. This system owns the
frame. Sub-file custody exceptions are in SYSTEMS.md §4.1: `LoggedInWrapper.tsx`
is owned by **S1** (this system a mandatory reader: it hosts the Clerk
singleton, language resolution, and the version flush);
`lib/translate/t-func.ts` is owned here with **S9** a mandatory reader (calendar
semantics feed period labels); `components/_shared/**` is owned by **S12**'s
manifest (its `sort_control.tsx` renders this system's sort prefs). Repo-root
`build_help_buttons.ts` and `client/src/app.css` are outside the lint manifest
but reviewed here.

## Contract

Panther style globals are set before first render; language/calendar resolve
_during_ render of the logged-in tree (localStorage → instance config) and apply
via full page reload. Two URL-addressable surfaces (`/access-tokens`, `?product=`); every other
page transition is a signal. UI prefs persist via localStorage and
never enter fetch configs or cache hashes. Every user-visible string is a
`TranslatableString` resolved by `t3`.

## Boot

`client/src/index.tsx` runs exactly three panther setters before
`render(<App />)`: `setKeyColors(_KEY_COLORS)`, `setBaseText`,
`setGlobalStyle(GLOBAL_STYLE_OPTIONS)`. The option objects of the latter two
(`BASE_TEXT_OPTIONS`, `GLOBAL_STYLE_OPTIONS`) are **deep-imported from
`generate_visualization/get_style_from_po/_0_common`** (S10-owned files), so
figure styling and app chrome share one source; that deep import is load-bearing
for boot.

`app.tsx` mounts the router (and `app.css`). Everything under `/*` renders
`InstanceLoggedInWrapper` (`routes/index.tsx`) → `LoggedInWrapper` (S1-owned
file), which:

- holds the module-level Clerk singleton (`new Clerk(publishableKey)` from
  `VITE_CLERK_PUBLISHABLE_KEY`), and a `bypassAuth` dev path
  (`VITE_BYPASS_AUTH`, non-production builds only) that skips Clerk
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
`setCalendar(globalUser.instanceCalendar)`. **Calendar comes only from instance
config; there is no calendar override**. Note the singletons are set
_mid-render_, not before `render()`: only the style globals are guaranteed
pre-render (Open items).

## Routing & page maps

The URL surface is deliberately minimal, two routes in `app.tsx`:
`/access-tokens` (the unlisted Clerk-gated PAT panel,
`routes/access_tokens.tsx`, reached only by knowing the URL) and `/*` (the
logged-in app). Note `/mcp` is the server's headless MCP endpoint and never
reaches the SPA. Within the app one
URL parameter matters: **`?product=<id>`** (`_PRODUCT_QUERY_PARAM` in
`t4_ui.ts`) is the product deep link: the Products page consumes it into
`pendingEditorOpen`, clears it from the URL and opens that product's editor
once the store has hydrated (S12). No other product parameter (`?p=`, `?d=`)
is recognised.

Everything else is a **signal-driven switchboard**, never the URL:
`components/instance/index.tsx` holds a local `_tab` signal filtered through
a permission-guarded derivation that selects Products / Explore / Results /
Data / Assets / Users, in that nav order; Products (S12's
`components/products/`) is first and the default, and Explore (S11's
`components/explore/`, empty until the results explorer plan) needs approval
only, which the whole nav already requires. The tab id union is `InstanceTab`
in `onboarding/catalogue.ts` and the shell imports it.

The shell is `ShellEditorWrapper` around a `FrameTop` whose panel is the
header (instance name, logo, and the right-hand cluster: Theme, language,
bell, Help, versions, profile) and whose content is, once the user is
approved, a `FrameLeft` whose panel is the rail: a vertical, collapsible
`TabsNavigation` over `navItems()`, one gated ordered list, with its
collapsed state persisted in `t4_ui`'s `navCollapsed` (default collapsed).
The approval `Show` wraps the `FrameLeft` rather than sitting inside its
panel, because a `Show` passed as a prop is a truthy accessor even when it
renders nothing and `FrameLeft` would draw an empty rail. `ShellEditorWrapper`
and `openShellEditor` are the one `getEditorWrapper()` the app has at shell
level, created in `t4_ui.ts`; every view a user reaches through a Back button
(the product editors, module defaults, the package viewers, the Data hub's
sub-pages, the user detail) opens through it and covers the header and the
rail, so its Back is the only way out and the rail cannot switch tabs under
an open editor. The tab stays on Products while a product editor is open.
Views those full-page views open through their own wrappers (the slide editor,
an import run detail) are already full page. This file also hosts the
language menu and the onboarding-modal effect (below).

## Language, calendar & translation

Three languages: `en`, `fr`, and `pt` (European Portuguese). Language is
per-browser
(`localStorage.fastrLanguage`), defaulting to the instance language; the
language menu writes localStorage and calls `window.location.reload()`.
**Language and calendar apply by full reload, nothing re-renders reactively**.
Calendar (`gregorian`/`ethiopian`) is instance config only.

`lib/translate/` is the app's whole translation surface over panther's
primitives:

- **`t-func.ts`**: re-exports `t3`/`setLanguage`/`getLanguage` from
  `@timroberton/panther`; owns `LANGUAGE_STORAGE_KEY`, the app's **calendar
  singleton** (`setCalendar`/`getCalendar`, default `"gregorian"`), and
  `pickLang(language, ts)`, an explicit-language resolver used only by the
  viz-generation pipeline (`build_figure_inputs`, conditional formatting), not
  shell UI.
- **`common.ts`**: the `TC` object of shared strings (24 keys: `cancel`,
  `save`, `download`, `delete`, `edit`, `done`, `update`, `settings`, `email`,
  `national`, `columns`, `rows`, `loading`, `loadingFiles`, `loadingAssets`,
  `fetchingData`, `general`, `label`, `folder`,
  `mustEnterName`, and four `disaggregation_disabled_*` messages), all with `pt`
  entries.
- **`types.ts` / `mod.ts`**: re-export `TranslatableString`, `Language`,
  `resolveTS` from panther.

There is no translation build step and no string-key table: translations are
**inline `{ en, fr, pt? }` literals at the call site** (241 client files call
`t3`), plus `TC`. There is deliberately no `isFrench()` helper; conditional
language logic uses `getLanguage()`.

**Authoring conventions** (the app layer over `PROTOCOL_ALL_TRANSLATION`):

- Wrap all user-visible client text: JSX text content, button/link labels,
  label-ish props (`label`, `header`, `heading`, `placeholder`, `noRowsMessage`,
  `selectionLabel`, `text`), fallbacks, template literals.
- Don't wrap: CSS classes, route paths, endpoints, object keys/enum values/ids,
  `intent`/`size`/`iconName`-style props, console output, or error strings in
  `throw`/`{ err }` responses.
- Panther components translate their own built-in strings internally. No
  language prop is passed.
- Promote a string to `TC` when it appears in 3+ places.
- Register: professional, concise French/Portuguese for a technical World Bank
  UI; for domain terms (admin area, indicator, slide deck) copy the established
  translation from existing `t3` calls, don't invent.

Whether every literal is well-formed across the 241-file surface is the standing
§4.3.6 audit (SYSTEMS.md), not re-checked per cycle.

## UI preferences (`state/t4_ui.ts`)

Signal + localStorage pairs, each with a `set*` wrapper that writes localStorage
then the signal: the rail's `navCollapsed`; the Data page's section tab
`dataSection` (General / HMIS / HFA / ICEH); the product explorer's four (`productsOpenFolder`, the
location, null = the root; `productsViewMode`; `productsSortMode`, `SortMode
= "name" | "recent"` from `lib/types/sort.ts`, one vocabulary for every list;
`productsTypeFilter`, null = every type). They are unvalidated on read: they
only feed comparisons, and a value from a build that spelled one differently
degrades to "no match" rather than throwing. Plus the scheme preference
(`scheme`, tri-state on panther's data-scheme contract, applied at module
scope before first paint; a stored `darkMode` boolean is mapped on read when
no `scheme` key is stored).
In-memory only (deliberately not persisted): `fitWithin`, `showAi`,
`headerOrContent`, `policyHeaderOrContent`, the three request signals the
tours and the deep link use (`pendingEditorOpen`, `pendingSlideOpen`,
`pendingTourReplay`), and the shell's full-page wrapper (`openShellEditor`,
`ShellEditorWrapper`: a module-level `getEditorWrapper()` so the frame pages
that open views share the instance the shell renders, recreated on each
shell mount so a same-tab user switch without a reload cannot resurface the
previous user's open view). The rule these encode: **display-only preferences stay
in T4: they never enter fetch configs or cache hashes** (the roll-up sentinel
lesson, SYSTEM_09).

## Theme prototype (`state/t4_theme.ts`, `components/theme_modal.tsx`)

The reskin preview: a `Theme` of five color knobs (surface ramp, primary, text
ink, status colors, dark-mode primary) plus corner radius, density and text scale,
each a short gradient of sensible steps denser below the default, stored as JSON under `localStorage["theme"]` and applied at module scope
as inline custom properties on `<html>`, which beat every stylesheet rule. The
color knobs draw only from the GFF brand guidelines (the PDF at the repo root;
GFF Teal is excluded as a light primary because white on it reaches only
3.1:1). Colors are always written as `light-dark()` pairs, and every ramp pins
its six hover and active tokens as literals rather than trusting the kit's
mix-toward-ink formula, which already makes a pressed base-100 darker than a
resting base-200. The literals were generated in oklab and verified for
lightness ordering and contrast across every combination. Text ink is a gradient of near-blacks (black to soft, plus a green-tinted one),
mirrored in white for the dark halves. Radius, density and text scale write
nothing at their default step, so those stay what `_fixed.css` declares;
density and text scale are percentage factors over the kit's rem tables,
mirrored in the module. Unlike the other T4 prefs the stored value is validated
on read, because it feeds CSS rather than a comparison. The Theme button in the
instance top bar opens `ThemeModal`, where every change applies immediately,
the scheme toggle from the profile modal sits at the top as the mode rather
than a theme knob, and a summary line names the current combination. Canvas figures keep their fixed key colors.

## Connection monitoring (`state/t4_connection_monitor.ts`)

No polling, no heartbeat: `navigator.onLine` seeds `isOnline`, and the
`online`/`offline` window listeners that update it are attached only by
`useConnectionMonitor()`, which only `ConnectionStatus.tsx` calls; a failure
counter fed by the server-action wrapper
(`try_catch_server.ts` fires the transport's `onNetworkFailure` /
`onNetworkSuccess` hooks, which `LoggedInWrapper.tsx` binds to
`reportNetworkFailure` / `reportNetworkSuccess`)
flips `connectionIssues` at ≥2 failures with a 30 s decay.
`ConnectionStatus.tsx` renders the offline banner but is **mounted nowhere,
dead UI** (Open items); the failure counter is live, the window listeners are
never attached.

## Onboarding modals

An effect in `components/instance/index.tsx` (after approval + Clerk user)
sequentially opens `EmailOptInModal` (writes
`clerk.user.unsafeMetadata.{emailOptIn, emailOptInAsked}`) then
`OrganisationModal` (writes `unsafeMetadata.organisation`; skippable), then
`WhatsNewModal`, a multi-page release-notes popup. The sequence is guarded to
run ONCE per signed-in user id (the approval store re-fires the effect, which
would otherwise re-open the modals). Posts are
authored in the Admin-Website, fetched by `server/routes/instance/whats_new.ts`
from status-api (60s in-memory cache, fail-silent, 30s backoff after a failed
fetch) and pre-filtered server-side to
`published && version <= _SERVER_VERSION && (!adminsOnly || isGlobalAdmin)`
(the version gate is skipped when `SERVER_VERSION` is non-dotted, i.e. ad-hoc
test deploys). Read-state is a per-post id set in
`unsafeMetadata.whatsNewReadPostIds` (a post counts as read once opened, Skip
or Done alike), pruned on write to the currently-eligible ids; users still
carrying the superseded high-water `whatsNewSeenVersion` are migrated once by
marking every post at or below it read. Brand-new users (detected as
`!emailOptInAsked` before the opt-in modal writes it) are baselined with
everything marked read, so they get neither popup nor dot. The fetched posts
also power a header bell (between the language switcher and the Help menu;
hidden when there are no posts) with a warning-coloured unread dot and
a `WhatsNewFeedModal` history feed. The dot persists until every missed post
has been opened. The feed does NOT bulk-acknowledge; it marks each post read
as it is opened and flags the still-unread rows. The login popup
(`whatsNewAutoShowPost`) only pushes a release NEWER than every version already
acknowledged, so acknowledging one release never drags an older unread backlog
into subsequent logins. Those stay behind the bell. Bell/feed state is keyed
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
`unsafeMetadata` only, with no localStorage writes.

## Help buttons (`lib/help/**`, `HelpButton.tsx`)

Docs-site-backed contextual help: content is authored as invisible
`<!-- help#id -->` tags in the EN+FR markdown of the sibling `wb-fastr-site`
repo; `deno task build:help-buttons` walks the site and generates
`lib/help/help_targets.generated.ts` (43 entries: page slug, per-language
anchors, titles, ~200-char summaries), failing on duplicate or one-language-only
ids. `<HelpButton id />` is fully self-contained: `id` is typed as the
generated `HelpId` union (a dangling button is a compile error), the modal
renders title+summary from the table with no runtime fetch, and "Read more…"
deep-links via `getHelpUrl` (site URL, `/fr` prefix when
`getLanguage() === "fr"`, the language's own anchor). The recipe and its traps
are [PROTOCOL_APP_HELP_BUTTONS.md](PROTOCOL_APP_HELP_BUTTONS.md). Coverage
today: **EN/FR only** (a `pt` user gets English content and the English site),
and exactly **one** of the 43 targets has a button in the UI (`viz-data-tab`, in
the PO editor's data panel).

## Open items

- **Language/calendar are not set before first render.** Only the style globals
  are; `setLanguage`/`setCalendar` run mid-render in `routes/index.tsx`. Decide:
  hoist resolution ahead of `render()` (kills any pre-language flash) or bless
  the current order as the contract.
- `ConnectionStatus.tsx` is dead UI: the monitor feeds signals nobody renders,
  and its `online`/`offline` listeners are never attached. Mount it or delete
  it.
- Help system has no `pt`: the generator and `getHelpUrl` are EN/FR-only, so
  Portuguese users silently get English summaries and the English site. Needs a
  site-side `pt` tree before the app side can follow.
- Help-button adoption is 1 of 43 generated targets. The machinery is built;
  the buttons were never rolled out.
- `components/_shared/**` custody: S12's manifest owns it but `sort_control.tsx`
  is shell furniture. Settle the custody (manifest or §4.1 exception) rather
  than leaving prose and globs disagreeing.
- Help generator hygiene: `.mdx` pages are silently skipped by the walk;
  `getHelpTarget` in `lib/help/mod.ts` is an unused export.
