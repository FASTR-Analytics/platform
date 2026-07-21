---
system: 14
name: Client Shell & Session
globs:
  - client/src/app.tsx
  - client/src/components/ConnectionStatus.tsx
  - client/src/components/HelpButton.tsx
  - client/src/components/email_opt_in_modal.tsx
  - client/src/components/whats_new_modal.tsx
  - client/src/components/instance/index.tsx
  - client/src/components/organisation_modal.tsx
  - client/src/components/project/index.tsx
  - client/src/index.tsx
  - client/src/routes/**
  - client/src/state/t4_connection_monitor.ts
  - client/src/state/t4_ui.ts
  - lib/help/**
  - lib/types/sort.ts
  - lib/types/whats_new.ts
  - lib/translate/**
  - server/routes/instance/whats_new.ts
docs_absorbed:
---

# S14 — Client Shell & Session

SPA boot, the signal-based page maps (almost no URL routing), the
language/calendar singletons and the app's translation conventions, UI
preferences, connection monitoring, onboarding modals, and the help-button
system. Plus stewardship of the ~250-file `t3` call-site surface. Reviewed
against code 2026-07-17 (first review cycle, review-only; absorbs
DOC_TRANSLATION + DOC_HELP_BUTTONS).

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
via full page reload. Only two URL-addressable surfaces (`/d/:slug`, `?p=`);
every other page transition is a signal. UI prefs persist via localStorage and
never enter fetch configs or cache hashes. Every user-visible string is a
`TranslatableString` resolved by `t3`.

## Boot

`client/src/index.tsx` runs exactly three panther setters before
`render(<App />)`: `setKeyColors(_KEY_COLORS)`, `setBaseText`,
`setGlobalStyle(GLOBAL_STYLE_OPTIONS)` — the latter two **deep-imported from
`generate_visualization/get_style_from_po/_0_common`** (S10-owned files), so
figure styling and app chrome share one source; that deep import is load-bearing
for boot.

`app.tsx` mounts the router (and `app.css`). Everything under `/*` renders
`InstanceLoggedInWrapper` (`routes/index.tsx`) → `LoggedInWrapper` (S1-owned
file), which:

- holds the module-level Clerk singleton (`new Clerk(publishableKey)` from
  `VITE_CLERK_PUBLISHABLE_KEY`), and a `_BYPASS_AUTH` dev path that skips Clerk
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

The URL surface is deliberately minimal — two routes in `app.tsx`: `/d/:slug`
(the public dashboard viewer, S12) and `/*` (the logged-in app). Within the app,
exactly one URL parameter matters: **`?p=<projectId>`** selects
project-vs-instance (`components/instance/index.tsx` switches on
`searchParams.p`); "back to instance" is `navigate("/")`.

Everything else is a **signal-driven switchboard**, never the URL:

- `components/instance/index.tsx` — a local `_tab` signal filtered through a
  permission-guarded derivation selects Data / Assets / Users / Settings /
  Projects. This file also hosts the language menu and the onboarding-modal
  effect (below).
- `components/project/index.tsx` — the page is the **persisted** `projectTab()`
  signal from `t4_ui` (localStorage-backed, so reloads land on the same tab);
  changes go through `updateProjectView`, and an `AIContextSync` component
  mirrors the current tab into the AI context (S13).

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
  viz-generation pipeline (`build_figure_inputs`, conditional formatting), not
  shell UI.
- **`common.ts`** — the `TC` object of shared strings (25 keys: `cancel`,
  `save`, `download`, `delete`, `edit`, `done`, `update`, `settings`, `email`,
  `national`, `columns`, `rows`, `loading`, `loadingFiles`, `loadingAssets`,
  `fetchingData`, `general`, `label`, `folder`, `goBackToProject`,
  `mustEnterName`, and four `disaggregation_disabled_*` messages), all with `pt`
  entries.
- **`types.ts` / `mod.ts`** — re-export `TranslatableString`, `Language`,
  `resolveTS` from panther.

There is no translation build step and no string-key table — translations are
**inline `{ en, fr, pt? }` literals at the call site** (~252 client files call
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

Whether every literal is well-formed across the 252-file surface is the standing
§4.3.6 audit (SYSTEMS.md), not re-checked per cycle.

## UI preferences (`state/t4_ui.ts`)

Signal + localStorage pairs, each with a `set*` wrapper that writes localStorage
then the signal: `projectTab`, `navCollapsed`, five `*SortMode` prefs
(`SortMode = "name" | "recent"` from `lib/types/sort.ts`),
grouping/selected-group/`hideUnreadyVisualizations` for viz, decks, and reports,
with `updateProjectView` as the consolidated updater. In-memory only
(deliberately not persisted): `fitWithin`, `showAi`, `headerOrContent`,
`policyHeaderOrContent`, `showModules`, `moduleLatestCommits`. The rule these
encode: **display-only preferences stay in T4 — they never enter fetch configs
or cache hashes** (the roll-up sentinel lesson, SYSTEM_09).

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
`WhatsNewModal` — a multi-page release-notes popup. Posts are authored in the
Admin-Website, fetched by `server/routes/instance/whats_new.ts` from status-api
(5-min in-memory cache, fail-silent) and pre-filtered server-side to
`published && version <= _SERVER_VERSION && (!adminsOnly || isGlobalAdmin)`
(the version gate is skipped when `SERVER_VERSION` is non-dotted, i.e. ad-hoc
test deploys);
the client shows only the newest unseen post, keyed on the high-water mark
`unsafeMetadata.whatsNewSeenVersion` (brand-new users — detected as
`!emailOptInAsked` before the opt-in modal writes it — are baselined without
seeing a popup). The fetched posts also power a header bell (between the
language switcher and the feedback button; hidden when there are no posts)
with an unread dot and a `WhatsNewFeedModal` history feed — opening the feed
acknowledges everything, and any post can be re-read from it. Types +
`compareDottedVersions` live in `lib/types/whats_new.ts`. All three modals
persist to Clerk `unsafeMetadata` only — no server or localStorage writes.

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
the PO editor's data panel).

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
