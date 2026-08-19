# PROTOCOL — App: UI Conventions

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_ — read it when **building or changing app
> UI**: which layout pattern a page uses, the recurring scaffolds, the theming
> override point, dark mode, the icon vocabulary.
>
> **This file must never restate a panther fact.** Token names, color/state
> classes, border rules, spacing utilities, type styles and sentence case all
> live in `panther/protocols/` and change with the sync — mirroring them here is
> how this doc rotted before. If something is true of every panther app, it does
> not belong in this file; add a pointer instead. The shell architecture these
> pages mount into is **S14**
> ([SYSTEM_14_client_shell.md](SYSTEM_14_client_shell.md)).

## What panther owns — read there, not here

- **Tokens, washes, hover/focus classes, borders, spacing, elevation, font
  weights, sentence case** → `panther/protocols/PROTOCOL_UI_STYLING.md`; current
  values → `panther/_303_components/_fixed.css`.
- **Which component to reach for**, tables, modals, action creators, `size="sm"`
  → `PROTOCOL_UI_COMPONENTS.md`.
- Reactivity, state rigs, file organisation → `PROTOCOL_UI_SOLIDJS.md`,
  `PROTOCOL_UI_STATE.md`, `PROTOCOL_UI_STRUCTURE.md`.

## Theming — the app's override point

Two CSS files control the visual system:

1. **`panther/_303_components/_fixed.css`** — the defaults and the authoritative
   token inventory. Synced; never edited here.
2. **`client/src/app.css`** — the app's override point. It imports panther's CSS
   first, so any `@theme` variable or `@utility` re-declared here wins globally.

Today's app-level additions:

- The `"International Inter"` font stack and its `@font-face` declarations.
- **`--font-weight-800`** — so `font-800` exists in this app on top of panther's
  `font-400` / `font-700`. Nothing else does: named aliases like `font-medium`
  and `font-semibold` are wiped no-ops (PROTOCOL_UI_STYLING).
- `--text-5xl`.
- `--color-running` / `--color-running-stripe` and the animated `ui-running`
  stripe utility.
- The base layer: `html, body, #app` → `font-sans`,
  `bg-base-100 text-base-content`, `font-variant-numeric: tabular-nums` for
  aligned numeric columns.

## Dark mode

The app is opted in to panther's `data-scheme` contract (PROTOCOL_UI_STYLING
rule 18), so **the token layer is panther's, not the app's**: `_fixed.css`
re-declares every color token as a `light-dark()` pair and everything resolves
per scheme with no JS in the styling path.

A per-device tri-state preference (`system | light | dark`) owned by
`client/src/state/t4_ui.ts`: `schemePref` signal + `setScheme`, stored under
`localStorage["scheme"]` (the old boolean `"darkMode"` key migrates: `true` →
dark, explicit `false` → light, absent → system), toggled in the profile modal's
Appearance section (`components/instance/profile.tsx`). `setSchemePreference`
runs at module scope so `data-scheme` lands on `<html>` before first paint;
`darkMode()` = `effectiveScheme() === "dark"` is the reactive read for the JS
consumers that genuinely need the resolved value (CodeMirror highlight
extensions, diff tints, Clerk appearance).

- **App-side token overrides are `light-dark()` pairs.** Today the only app
  `--color-*` additions are `--color-running` / `--color-running-stripe`, left
  single-valued on purpose — mid-tone fills that hold on both bases. **A new
  `--color-*` token needs a pair unless a single value is deliberate.**
- **Canvas figures follow the scheme; documents and exports stay light.**
  `setKeyColors(_KEY_COLORS, undefined, { remapNearBlackOnDark: true })`
  (`client/src/index.tsx`) installs a light foundation plus panther's dark
  companion; `FigureHolder` scopes the dark palette per render, and the remap
  opt-in flips module-authored near-black literals (the Actual/Expected lines,
  coverage defaults) to the dark `baseContent` so they don't vanish. Slides,
  page previews and every export resolve light — `PageHolder` renders the
  document model, and the canvas twin for a figure that must stay light is
  `<FigureHolder scheme="light">` (PROTOCOL_UI_STYLING rule 19). **There is no
  JS style overlay** — nothing wraps `FigureInputs.style` on its way to the
  canvas, and nothing should.
- **Remaining app-side `app.css` rules**, each gated on BOTH
  `:root[data-scheme="dark"]` and `:root[data-scheme="system"]` inside
  `@media (prefers-color-scheme: dark)` — the dual gate is the pattern, since
  "system" carries no resolved value in the attribute: the roadtrip tour popover
  vars, the CodeMirror `.cm-ySelection` tint, and `.md-dark-adapt`. The
  `.cm-editor` retheme is unconditional (it reads tokens, which already resolve
  per scheme) but sits at `:root` specificity because CodeMirror injects its own
  stylesheets at runtime.
- **CodeMirror markdown syntax colors can't be themed from CSS**, so editors
  with markdown highlighting must also spread `darkMarkdownExtensions()` (from
  `_shared/collab_markdown_editor.tsx`) into their extension list inside a
  tracked scope, so a scheme toggle rebuilds the view.
- **HTML-rendered markdown that passes a DOCUMENT style** (the report preview
  panes, `REPORT_MARKDOWN_STYLE`) carries inline `--md-*` vars derived from the
  static light document model — near-black on a dark surface. Wrap the mount in
  `.md-dark-adapt`, which re-points those vars to tokens. Markdown with no style
  (AI chat, card summaries) needs no wrapper: its `--md-*` defaults already
  chain to the app tokens.
- **There is no inverted chrome anywhere.** Every header is a flush or tonal
  `HeadingBar` that follows the scheme, so no surface in this app pins its
  `color-scheme` — don't reintroduce one.
- **No `text-white` / `bg-white`** — they are not tokens and break the dark
  palette. Constant contrast over media/data is an inline style beside its
  inline background (PROTOCOL_UI_STYLING rule 19 + checklist).

## Page layout patterns

Every page is full-height; scrolling happens inside content areas, never the
page body. Pick the pattern; don't invent new frames. (All `Frame*` components
are panther exports.)

| Pattern                | Frame structure                                    | Live example                       |
| ---------------------- | -------------------------------------------------- | ---------------------------------- |
| A — simple content     | `FrameTop` + `HeadingBar` → `div.ui-pad.ui-spy`    | `instance/instance_data.tsx`       |
| B — list with grouping | `FrameTop` + `HeadingBar` + `FrameLeftResizable`   | `products/index.tsx`               |
| C — full editor        | `FrameTop` toolbar + `FrameLeftResizable` + canvas | `visualization_editor_inner.tsx`   |
| D — split columns      | `div.flex` halves with `w-1/2` + `border-r`        | `indicator_manager_hfa/*` managers |

Pattern specifics, from the live pages:

- **B (list pages):**
  `FrameLeftResizable startingWidth={180} minWidth={170}
  maxWidth={300}`;
  `HeadingBar` carries `searchText`/`setSearchText`, the filter/sort controls in
  `centerChildren` (`sortBySortMode` from `components/_shared/sort_control.tsx`
  does the ordering), and the Create button(s); selected-group / filter / sort
  state lives in `t4_ui` signals (PROTOCOL_APP_STATE). Explore uses the same
  frame with a package `Select` and the scope picker in place of the folder
  list.
- **C (editors):** opened full-screen via `getEditorWrapper()` → `openEditor`
  (never routed — the only URL affordance is `?product=<id>`, consumed into the
  same pending-open request); panel widths in use: figure editor `384/300/600`,
  slide editor `startingWidth={400}`; canvas area is `FigureHolder`/`PageHolder`.
- **Instance page:** Pattern A frame with a centered `ButtonGroup` tab selector,
  responsive at the app's one breakpoint `xl`: `flex xl:hidden` icon-only
  (`itemWidth="50px"`) vs `hidden xl:flex` labeled (`115px` en, `140px` fr/pt).

## Recurring scaffolds

One copy each — copy these, don't re-derive. Classes here are only the layout
skeleton; the color/state classes in them follow PROTOCOL_UI_STYLING and will
change with it.

**Card grid** (`15rem` is the standard card width; `16–18rem` for larger cards
like Explore's metric cards and preset previews). Cards are panther `Card` — it
owns the frame, hover, selected state and keyboard wiring:

```tsx
<div class="ui-gap ui-pad grid h-full w-full grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start overflow-auto">
  <For
    each={filteredItems()}
    fallback={
      <div class="text-base-content-muted text-sm">
        {searchText().length >= 3
          ? t3({ en: "No matching items", fr: "…", pt: "…" })
          : t3({ en: "No items", fr: "…", pt: "…" })}
      </div>
    }
  >
    {(item) => (
      <Card
        header={item.label}
        selected={isSelected(item.id)}
        onClick={() => openItem(item.id)}
      >
        <div class="text-base-content-muted text-sm">{item.description}</div>
      </Card>
    )}
  </For>
</div>;
```

**Multi-select on cards:** panther's `createSelectionController` (click /
Cmd+click toggle / Shift+click range) drives `Card`'s `selected` +
`onSelectToggle`, which renders the selection circle itself.

**Search:** `HeadingBar`'s built-in search input; filtering triggers at **3+
characters** (below that, show all). Empty states are search-aware (see the grid
fallback above).

**List with borders** (non-grid): rows with
`ui-pad-sm border-b last:border-b-0`, `flex-1 truncate` label, `size="sm"`
outline action buttons.

**Grouping sidebar** (inside Pattern B's resizable panel): the frame draws the
edge, so don't add one. With a controls section (e.g. a `Select` for group-by):
full-height column, controls `ui-pad border-b`, list `ui-pad flex-1
overflow-auto` around the `SelectList`. Without one: just
`ui-pad h-full overflow-auto` around the `SelectList` — no column wrapper.

**Context menu:** panther
`showMenu({ anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 }, items })`
— or the convenience `showMenuAtPoint(x, y, { items })`. `MenuItem`s take `icon`
and `intent`; delete is always last and `intent: "danger"`.

**Buttons:** which intent / outline / `onBackground` → PROTOCOL_UI_STYLING
("Which token do I reach for"). App policy on top: destructive actions always go
through `createDeleteAction` (confirmation built in); async buttons pass
`state={action.state()}`; toolbar groups are `div.flex.items-center.ui-gap-sm`.

**Modal forms:** `openComponent()` + `AlertFormHolder` + `createFormAction` —
validate inside the action and return `{ success: false, err }`; fields spaced
`ui-spy-sm`; `autoFocus` the first input. Settings pages: `ui-pad ui-spy` page,
`ui-text-heading` section headings, fields `ui-spy-sm`. Modal widths are
`ModalContainer`'s `width` tokens (panther).

**Form-draft signals:** draft state under edit uses a `temp*` prefix
(`tempConfig`, `tempWindowing`); unsaved-changes tracking is a `needsSaving`
signal.

## Icon vocabulary

Icon names are the panther `IconName` union
(`panther/_303_components/icons/icon_types.ts`) — the app's established
mappings:

| Icon                                                    | Usage                                              |
| ------------------------------------------------------- | -------------------------------------------------- |
| `plus` / `pencil` / `trash` / `copy`                    | create / edit / delete / duplicate                 |
| `save`                                                  | save actions (very common)                         |
| `x` / `check`                                           | close-dismiss / confirm                            |
| `search` / `refresh`                                    | search inputs / reload                             |
| `upload` / `download` / `databaseImport`                | file up / export / data import                     |
| `chevronLeft/Right/Up/Down`                             | back, expand/collapse                              |
| `report` / `presentation`                               | the two product types (`PRODUCT_TYPE_ICONS`)       |
| `folder` / `chart`                                      | Products / Explore tabs                            |
| `database` / `package` / `paperclip` / `users`          | Data / Results / Assets / Users tabs               |
| `code` / `settings`                                     | modules / settings                                 |
| `sparkles`                                              | AI features                                        |
| `moreVertical`                                          | overflow menu trigger                              |
| `info` / `questionMark` / `help`                        | hints, help chrome                                 |
| `eye`                                                   | visibility toggles                                 |

## What NOT to do

App-specific only — the general styling prohibitions are in PROTOCOL_UI_STYLING.

- Don't restate a panther fact here — point at the protocol instead.
- Don't add a `--color-*` token as a bare value unless a single colour in both
  schemes is deliberate — it is a `light-dark()` pair otherwise.
- Don't write a `:root[data-scheme="dark"]` rule without its
  `@media (prefers-color-scheme: dark) :root[data-scheme="system"]` twin.
- Don't build an inverted surface — nothing in this app pins its
  `color-scheme` any more.
- Don't hand-roll cards, selection circles, context menus, delete
  confirmations, or the running-stripe animation — `Card` (with
  `selected`/`onSelectToggle`), `showMenu`, `createDeleteAction` and
  `ui-running` exist for exactly these.
- Don't put color or radius overrides in components; the override point is
  `client/src/app.css`.
- Never modify `panther/` in this repo (fix in the panther repo, resync).
