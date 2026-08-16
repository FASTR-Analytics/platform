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

A per-device preference: `localStorage["darkMode"]`, owned by
`client/src/state/t4_ui.ts` (`darkMode` signal + `setDarkMode`), toggled in the
profile modal's Appearance section
(`client/src/components/instance/profile.tsx`). `applyThemeToDocument` runs at
module scope in `t4_ui.ts`, so `data-theme="dark"` lands on `<html>` before
first paint. (A TEMP `Shift+N` dev toggle also lives there, marked
remove-before-release; the mechanism as a whole is slated to be replaced by the
panther repo's PLAN_DARK_MODE.)

- **Token override.** An **unlayered** `:root[data-theme="dark"]` block in
  `client/src/app.css` re-declares the `--color-*` variables (bases from
  panther's `KEY_COLOR_THEMES["neutral-dark"]`, `primary` swapped to the app's
  teal accent, plus `--color-border` and `color-scheme`) — unlayered so it beats
  Tailwind's layered `@theme` defaults. **When adding a `--color-*` token, add
  its dark counterpart to this block too.**
- **Documents stay light.** Panther's key colors are static (`setKeyColors` in
  `client/src/index.tsx` is one-shot), so slides, thumbnails, and every export
  keep light document styling.
- **On-screen figures are dark-adapted at display time** via
  `adaptFigureStyleForDarkMode` (`components/_shared/dark_mode_figures.ts`): a
  no-op in light mode, else an overlay merged into `FigureInputs.style` (light
  text/axes, dimmed grid/table lines, dark table header bands, near-black data
  colors flipped to light in seriesColorFunc/lines/legend; chromatic palette
  colors pass through). It wraps the inputs at **every on-screen `FigureHolder`
  call site — and only there**, so exports and persisted figure data are
  untouched. **Any new on-screen `FigureHolder` must wrap its inputs in it.**
- **Supporting `app.css` rules** (all `data-theme="dark"`-scoped): a
  `@custom-variant dark` for one-off `dark:` overrides (classes that read as
  "strong dark" in light mode but glare in dark); the inverted-ribbon rule —
  surfaces pairing `bg-base-content` with `text-base-100` get the two base vars
  re-inverted so they stay dark, **prefer that class pair for any new inverted
  surface**; a `.cm-editor` block retheming CodeMirror's light internals from
  tokens — markdown _syntax token_ colors can't be themed from CSS, so editors
  with markdown highlighting must also spread `darkMarkdownExtensions()` (from
  `_shared/collab_markdown_editor.tsx`) into their extension list inside a
  tracked scope so a theme toggle rebuilds the view; and a
  `select option { color: CanvasText; background-color: Canvas }` rule.
- **HTML-rendered markdown** (AI chat renderers, `MarkdownPresentationJsx`)
  colors text from inline `--md-*` vars derived from the light document style —
  near-black on dark surfaces. Wrap the mount in `.md-dark-adapt`, which
  re-points those vars to tokens (used by the AI chat panes, public-viewer
  summary/about, and the report View-pane / version-history previews).
- **Inverted chrome is app-owned.** `HeadingBarMainRibbon`
  (`components/_shared/heading_bar_main_ribbon.tsx`) is deliberately not a
  panther component — the kit no longer ships inverted surfaces, and the
  re-invert rule above keys on its `bg-base-content`/`text-base-100` pair.
- **No `text-white` / `bg-white`** — they are not tokens and break the dark
  palette. Document surfaces (slide canvases, thumbnails, previews) wear
  `ui-scheme-light`; constant contrast over media/data is an inline style
  beside its inline background (PROTOCOL_UI_STYLING rule 19 + checklist).
- The `data-theme="dark"` mechanism above predates PROTOCOL_UI_STYLING rule 18
  (`data-scheme` + `light-dark()` pairs); that rule is the target state, landing
  with the panther repo's PLAN_DARK_MODE.

## Page layout patterns

Every page is full-height; scrolling happens inside content areas, never the
page body. Pick the pattern; don't invent new frames. (All `Frame*` components
are panther exports.)

| Pattern                | Frame structure                                      | Live example                       |
| ---------------------- | ---------------------------------------------------- | ---------------------------------- |
| A — simple content     | `FrameTop` + `HeadingBar` → `div.ui-pad.ui-spy`      | `project/project_data.tsx`         |
| B — sidebar navigation | `FrameTop` + `FrameLeft` + vertical `TabsNavigation` | `project/index.tsx`                |
| C — list with grouping | `FrameTop` + `HeadingBar` + `FrameLeftResizable`     | `project/project_decks.tsx`        |
| D — full editor        | `FrameTop` toolbar + `FrameLeftResizable` + canvas   | `visualization_editor_inner.tsx`   |
| E — split columns      | `div.flex` halves with `w-1/2` + `border-r`          | `indicator_manager_hfa/*` managers |

Pattern specifics, from the live pages:

- **B (project page):** the header is the inverted pair
  (`bg-base-content text-base-100`) with a `chevronLeft` back button;
  `TabsNavigation` is `vertical collapsible`, collapsed state persisted via
  `t4_ui.navCollapsed`.
- **C (list pages):**
  `FrameLeftResizable startingWidth={180} minWidth={170}
  maxWidth={300}`;
  `HeadingBar` carries `searchText`/`setSearchText`, a
  `centerChildren={<SortControl …/>}` (`components/_shared/sort_control.tsx`),
  and the Create button; grouping / selected-group / sort state lives in `t4_ui`
  signals (PROTOCOL_APP_STATE).
- **D (editors):** opened full-screen via `getEditorWrapper()` → `openEditor`
  (never routed); panel widths in use: viz editor `384/300/600`, slide editor
  `startingWidth={400}`; canvas area is `FigureHolder`/`PageHolder`.
- **Instance page:** Pattern A frame with a centered `ButtonGroup` tab selector,
  responsive at the app's one breakpoint `xl`: `flex xl:hidden` icon-only
  (`itemWidth="50px"`) vs `hidden xl:flex` labeled (`115px` en, `140px` fr/pt).

## Recurring scaffolds

One copy each — copy these, don't re-derive. Classes here are only the layout
skeleton; the color/state classes in them follow PROTOCOL_UI_STYLING and will
change with it.

**Card grid** (`15rem` is the standard card width; `18rem` for larger cards like
dashboards/metrics). Cards are panther `Card` — it owns the frame, hover,
selected state and keyboard wiring:

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

**Grouping sidebar** (inside Pattern C's resizable panel): the frame draws the
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
| `report` / `presentation` / `layoutDashboard` / `chart` | reports / decks / dashboards / visualizations tabs |
| `code` / `database` / `settings`                        | modules / data / settings tabs                     |
| `sparkles`                                              | AI features                                        |
| `moreVertical`                                          | overflow menu trigger                              |
| `info` / `questionMark` / `help`                        | hints, help chrome                                 |
| `lock` / `unlock` / `eye`                               | locking, visibility                                |

## What NOT to do

App-specific only — the general styling prohibitions are in PROTOCOL_UI_STYLING.

- Don't restate a panther fact here — point at the protocol instead.
- Don't add an on-screen `FigureHolder` without `adaptFigureStyleForDarkMode`.
- Don't add a `--color-*` token without its `:root[data-theme="dark"]`
  counterpart.
- Don't build a new inverted surface without the `bg-base-content` /
  `text-base-100` pair the re-invert rule keys on.
- Don't hand-roll cards, selection circles, context menus, delete
  confirmations, or the running-stripe animation — `Card` (with
  `selected`/`onSelectToggle`), `showMenu`, `createDeleteAction` and
  `ui-running` exist for exactly these.
- Don't put color or radius overrides in components; the override point is
  `client/src/app.css`.
- Never modify `panther/` in this repo (fix in the panther repo, resync).
