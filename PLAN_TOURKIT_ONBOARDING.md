# Reusable Onboarding/Tutorial Library (@nw/tourkit) + Platform Integration

## Context

Nick wants a **separate repo** containing an onboarding/tutorial system usable across all his projects, with the FASTR **platform** repo as the first consumer. Platform currently has no tour/onboarding infrastructure — just two first-run modals (email opt-in, organisation) gated on Clerk `unsafeMetadata` flags, and a lightly-used help-button system. The goal: guided spotlight tours, a "getting started" checklist, and contextual hint beacons, built once and reused.

**Decisions made with user:**
- v1 features: **spotlight tours** (dimmed backdrop + cutout + anchored popover with Next/Back/Skip), **onboarding checklist** (headless task list), **hints/beacons** (pulsing dots opening one-off tips). No modal carousels.
- **Framework-agnostic vanilla-TS core + thin JSX-free SolidJS adapter** (platform client is SolidJS + TS strict + Tailwind v4 + Vite 6).
- Distribution: **public npm package**, named **`@nw/tourkit`** (user's choice).
- Tour **content lives in platform**, not the library.
- GitHub repo under personal account (**NicholasWillmott**), created via `gh` CLI.

**Prerequisite (user action, needed only before Phase 4 publish):** create npm account at npmjs.com/signup; create free org **`nw`** (registry checks show zero `@nw/*` packages and no user `nw`, but npm may still refuse a 2-char org name at creation time — if so, pick a fallback scope with user, e.g. `@nwillmott`, and rename in package.json); run `npm login`. Verified: not currently logged in (`npm whoami` → ENEEDAUTH). All phases except publish work without it (platform links locally via `file:`).

## Key platform facts (verified)

- First-run effect: `client/src/components/instance/index.tsx:152-164` — sequential `await openComponent(...)` modals gated on `clerk.user.unsafeMetadata`, waits on `instanceState.currentUserApproved`, skips when `?p=` (inside project).
- Clerk metadata write pattern: `client/src/components/email_opt_in_modal.tsx:12-18` — spread-merge `clerk.user.update({ unsafeMetadata: { ...clerk.user.unsafeMetadata, ... } })`.
- Overlay root: panther `AlertProvider` at instance/index.tsx:355; panther modals use z-index 50. **Never modify `panther/`** — wrap elements to add attributes.
- i18n: inline `t3({en, fr, pt})` (include `pt` — European Portuguese rollout); language switch does a full page reload, so resolving strings at definition time is safe.
- Navigation is **signal-driven, not URL-driven**: instance tabs = component-local `_tab` signal; project tabs = `setProjectTab` in `client/src/state/t4_ui.ts`.
- Dev: `./run` (client :3000, server :8000). Docker build only sees the platform repo → `file:` dep must be swapped for published version before deploy.

---

## Phase 1 — Scaffold new repo `~/Work/tourkit`

```
tourkit/
├── package.json         # @nw/tourkit, type: module, 0.1.0, files: ["dist"], sideEffects: false
├── tsconfig.json        # strict, ES2022, moduleResolution bundler
├── tsup.config.ts       # entries: src/core/index.ts + src/solid/index.ts → ESM + d.ts
├── vitest.config.ts     # environment: happy-dom
├── README.md            # quickstart (core + solid), theming vars table, StorageAdapter contract, data-tour convention
├── LICENSE              # MIT (user can change before publish)
├── src/core/            # index.ts, types.ts, emitter.ts, storage.ts, target.ts, styles.ts, overlay.ts, popover.ts, tour.ts, checklist.ts, hints.ts
├── src/solid/index.ts   # JSX-free adapter (pure .ts)
├── demo/                # vite playground (not published): index.html, vite.config.ts, src/main.ts
└── tests/               # tour.test.ts, target.test.ts, checklist.test.ts, hints.test.ts
```

- `exports`: `"."` → core, `"./solid"` → solid adapter (with `types` conditions). No CSS export — styles injected at runtime.
- `dependencies`: `@floating-ui/dom` only. `peerDependencies`: `solid-js` (optional via `peerDependenciesMeta`). Dev: tsup, vitest, happy-dom, typescript, solid-js, vite.
- `git init`, then `gh repo create NicholasWillmott/tourkit --public --source . --push` (public since npm is public; `--private` if preferred at implementation time).

## Phase 2 — Core engine (`src/core/`)

**Types (types.ts)** — the public contract:
```ts
type Content = string | HTMLElement | ((container: HTMLElement) => void | (() => void));
type Text = string | (() => string);

interface TourStep {
  id: string;
  target: string | (() => Element | null);   // CSS selector or getter
  title: Text; body: Content;
  placement?: Placement;                      // floating-ui placement
  beforeEnter?: () => void | Promise<void>;   // app navigates here (signal setters)
  afterLeave?: () => void | Promise<void>;
  waitForTargetTimeoutMs?: number;            // default 8000
  onTargetTimeout?: "skip" | "abort";         // default "abort"
  allowInteraction?: boolean;                 // default false
  padding?: number; borderRadius?: number; canSkip?: boolean; showProgress?: boolean;
}
interface TourDefinition { id: string; steps: TourStep[]; labels?; zIndex?; onFinish?; onAbort?; onStepChange? }
type TourState = { status: "idle" } | { status: "waiting-for-target"; stepIndex } |
  { status: "active"; stepIndex; total } | { status: "finished" } | { status: "aborted"; atStep };
interface TourController { start(atStep?); next(); back(); skip(); abort(); destroy(); getState(); subscribe(fn): () => void }
interface StorageAdapter { get(key): unknown | Promise<unknown>; set(key, value): void | Promise<void> }
```

**Locked design decisions:**
- **Spotlight (overlay.ts):** one fixed full-viewport `<svg>` with a single `<path fill-rule="evenodd">` (outer rect + rounded cutout). Even-odd hit-testing lets cutout clicks pass through free; `allowInteraction: false` adds a transparent blocker div over the cutout. Reposition via `ResizeObserver` on target + capture-phase scroll + resize, rAF-throttled. Target unmounting mid-step → transition to `waiting-for-target`, not a stale rect.
- **Popover (popover.ts):** `@floating-ui/dom` (only runtime dep, ~10 kB) for flip/shift/arrow/`autoUpdate`. Core renders the card DOM: title, body, progress ("2 / 5"), Back/Next/Skip buttons, classes `tourkit-popover` etc.
- **Target waiting (target.ts):** immediate check → `MutationObserver` on body (debounced re-check) + 250 ms polling fallback, until timeout.
- **Target registration:** `data-tour="id"` attributes as the primary convention; export `tourTarget(id)` → `[data-tour="${id}"]`. Element getters as escape hatch.
- **State machine (tour.ts):** `idle → start → (waiting-for-target|active) → next/back` with ordered `afterLeave(current) → beforeEnter(next) → wait → show`; re-entrant guard (ignore calls while a transition is in flight); `destroy()` removes all DOM + observers.
- **Checklist (checklist.ts):** fully headless — items + completed Set + dismissed flag; hydrates from `StorageAdapter` (`checklist:<id>`), persists on mutation, `subscribe()`. No panel DOM in the lib.
- **Hints (hints.ts):** registry + core-rendered pulsing dot (CSS keyframes) anchored via floating-ui; click opens small popover with Dismiss; persisted as `hint:<id>`; missing targets simply don't render; `refresh()` for post-navigation re-check.
- **Styling (styles.ts):** idempotent injected `<style data-tourkit>` sheet; all themeable via CSS custom properties with fallbacks: `--tourkit-z`, `--tourkit-scrim-color`, `--tourkit-accent`, `--tourkit-bg`, `--tourkit-fg`, `--tourkit-radius`, `--tourkit-font`. No Tailwind; explicit box-sizing/margins (no preflight assumptions).

## Phase 3 — Solid adapter (`src/solid/index.ts`)

Pure `.ts`, imports only solid-js reactive primitives (no JSX → trivial publishing):
```ts
createTour(defn): { state: Accessor<TourState> } & TourController
createChecklist(defn): { state: Accessor<ChecklistState>; complete; reset; dismiss }
createHints(defn): { mount(); refresh(); destroy() }
```
Each bridges core `subscribe()` into a signal; `onCleanup(destroy)` guarded with `getOwner()` so module-scope usage also works.

## Phase 4 — Demo, tests, publish

1. **Demo** (`npm run demo`): three fake tabs toggled by buttons (simulates signal-driven nav), 5-step tour with one `beforeEnter` tab-switch (exercises waiting-for-target), checklist on `localStorageAdapter`, two hints.
2. **Tests** (vitest + happy-dom + fake timers): state-machine transitions, re-entrancy guard, waitForTarget success/timeout (both `skip` and `abort`), checklist hydration/persistence round-trip, hint dismissal. Position math is verified manually in the demo (happy-dom can't do layout).
3. **Publish 0.1.0** to public npm — *requires the npm-account prerequisite; can be deferred until after Phase 5 works via local link.*

## Phase 5 — Platform integration (`/home/nicho/Work/platform`)

**Dependency:** during development `"@nw/tourkit": "file:../../tourkit"` in `client/package.json` (works with Vite; must be swapped to the published version before `./deploy` since Docker only sees the platform repo).

**New files:**
- `client/src/onboarding/storage.ts` — `ClerkStorageAdapter`: all keys under one `clerk.user.unsafeMetadata.onboarding` object; re-read `unsafeMetadata` immediately before each spread-merge `update` to reduce clobber risk (pattern from email_opt_in_modal.tsx).
- `client/src/onboarding/tours.ts` — welcome tour definition; text via `t3({en, fr, pt})` resolved at definition time; instance-tab `setTab` passed in from the wiring site (it's component-local).
- `client/src/onboarding/checklist.ts` — "Getting started" `ChecklistDefinition` on the same adapter.
- `client/src/onboarding/index.ts` — `maybeAutoStartOnboarding()` + `startWelcomeTour()`.
- `client/src/components/instance/checklist_panel.tsx` — panel rendered with the app's Tailwind classes from headless `createChecklist` state.

**Edits (all in `client/src/components/instance/index.tsx` + projects-list component):**
- Extend the post-login effect (lines 152–164): after the two existing modals, if `!unsafeMetadata.onboarding?.welcomeTourDone` → start welcome tour.
- Add `data-tour` attributes on **wrapper divs** around nav buttons / feedback / profile (panther components must not be modified).
- Add "Take the tour" restart item to the existing profile/menu.
- Mount the checklist panel in the projects view; `data-tour="projects-list"` / `data-tour="create-project"` on the projects list & create button.

**Z-index:** panther AlertProvider uses z-50 → set `--tourkit-z: 40` (tour) in platform CSS so alert modals always stack above; safe because the first-run effect awaits the modals before starting the tour.

**Initial tour (structure; exact wording TBD with user):** 5 same-page steps on the instance shell — welcome/nav tabs → projects list → create-project button → feedback/help → profile menu (finish sets `welcomeTourDone`). Cross-page tours (via `beforeEnter` + `setProjectTab`) deliberately deferred.

## Phase 6 — Verification

1. **tourkit repo:** `npm test`, `npm run build` (dist + d.ts emitted), demo walk-through: all three features, scroll/resize with spotlight open, tab-switch waiting step, timeout path.
2. **Platform:** `./run`; clear `unsafeMetadata.onboarding` on a test user; confirm modal→tour sequence, restart from menu, checklist ticking + cross-device persistence, dark mode (`data-theme="dark"` — check custom-prop colors), French UI, `cd client && npm run typecheck`.
3. **Before any platform deploy:** publish to npm, swap `file:` for published version, `deno task typecheck`.

## Risks / notes

- **Clerk write races:** spread-merge can clobber concurrent metadata writes → serialize all onboarding writes through the single adapter.
- **Platform working tree has uncommitted parallel work** (version-attribution fixes from 2026-07-17) — check `git status` before staging platform changes; keep integration commits scoped.
- **Scope registration risk:** `@nw/tourkit` requires registering the `nw` npm org after account creation — no existing `@nw/*` packages or `nw` user found, but npm may reject a 2-char org name; fall back to an alternative scope (user's call) if so.
- happy-dom can't verify layout — positioning correctness is demo/manual only.
