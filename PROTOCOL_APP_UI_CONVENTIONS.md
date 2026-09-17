# PROTOCOL (App): UI Conventions

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_. Read it when **building or changing app
> UI**: which layout pattern a page uses, the recurring scaffolds, the theming
> override point, dark mode, the icon vocabulary.
>
> **This file must never restate a panther fact.** Token names, color/state
> classes, border rules, spacing utilities, type styles and sentence case all
> live in `panther/protocols/` and change with the sync. Mirroring them here is
> how this doc rotted before. If something is true of every panther app, it does
> not belong in this file; add a pointer instead. The shell architecture these
> pages mount into is **S14**
> ([SYSTEM_14_client_shell.md](SYSTEM_14_client_shell.md)).

## What panther owns: read there, not here

- **Tokens, washes, hover/focus classes, borders, spacing, elevation, font
  weights, sentence case** → `panther/protocols/PROTOCOL_UI_STYLING.md`; current
  values → `panther/_303_components/_fixed.css`.
- **Which component to reach for**, tables, modals, action creators, `size="sm"`
  → `PROTOCOL_UI_COMPONENTS.md`.
- Reactivity, state rigs, file organisation → `PROTOCOL_UI_SOLIDJS.md`,
  `PROTOCOL_UI_STATE.md`, `PROTOCOL_UI_STRUCTURE.md`.

## Theming: the app's override point

Two CSS files control the visual system:

1. **`panther/_303_components/_fixed.css`**: the defaults and the authoritative
   token inventory. Synced; never edited here.
2. **`client/src/app.css`**: the app's override point. It imports panther's CSS
   first, so any `@theme` variable or `@utility` re-declared here wins globally.

Today's app-level additions:

- The `"International Inter"` font stack and its `@font-face` declarations.
- **`--font-weight-800`**, so `font-800` exists in this app on top of panther's
  `font-400` / `font-700`. Nothing else does: named aliases like `font-medium`
  and `font-semibold` are wiped no-ops (PROTOCOL_UI_STYLING).
- `--text-5xl`.
- `--color-running` / `--color-running-stripe` and the animated `ui-running`
  stripe utility.
- The base layer: `html, body, #app` → `font-sans`,
  `bg-base-100 text-base-content`, `font-variant-numeric: tabular-nums` for
  aligned numeric columns.

A third, runtime layer sits above both while the reskin is being chosen: the
Theme modal (`client/src/state/t4_theme.ts`, S14) writes palette, radius,
density and text-scale tokens as inline properties on `<html>`. Its default
writes nothing, so the two CSS files remain the source of truth for the shipped
look.

## Dark mode

A per-device preference: `localStorage["scheme"]` (`system` | `light` |
`dark`), owned by `client/src/state/t4_ui.ts` (`schemePref` signal +
`setScheme`; `darkMode()` is the resolved scheme for JS consumers), chosen in
the profile modal's Appearance section
(`client/src/components/instance/profile.tsx`, a `ButtonGroup`).
`setSchemePreference` runs at module scope in `t4_ui.ts`, so `data-scheme`
lands on `<html>` before first paint.

- **Token override.** Every panther `--color-*` token is a `light-dark()` pair
  (PROTOCOL_UI_STYLING rule 18), so `client/src/app.css` adds or overrides a
  token in plain `@theme` as a pair too. `--color-running` /
  `--color-running-stripe` are single-valued on purpose (mid-tone fills that
  hold on both bases). **When adding a `--color-*` token, write it as a
  `light-dark()` pair.**
- **Documents stay light.** `setKeyColors` in `client/src/index.tsx` sets the
  light foundation plus panther's default dark companion
  (`remapNearBlackOnDark: true` flips module-authored near-black literals on
  dark bases); slides, thumbnails, and every export keep light document
  styling.
- **On-screen figures follow the scheme at display time** inside panther's
  `FigureHolder` (`scheme="follow"`, the default, resolves the dark key colors
  per render), so exports and persisted figure data are untouched.
  `scheme="light"` is the canvas twin of `ui-scheme-light` for document
  surfaces (PROTOCOL_UI_STYLING rule 19).
- **Supporting `app.css` rules**: a `:root .cm-editor` block retheming
  CodeMirror's light internals from tokens (one rule serves both schemes,
  since the tokens resolve per scheme), plus a dark-only wash over
  `.cm-ySelection` so peers' selection highlights show on dark. Markdown
  _syntax token_ colors can't be themed from CSS, so editors with markdown
  highlighting must also spread `darkMarkdownExtensions()` (from
  `_shared/collab_markdown_editor.tsx`) into their extension list inside a
  tracked scope so a scheme toggle rebuilds the view. The roadtrip tour vars
  (`--roadtrip-*`) on `:root` are `light-dark()` pairs.
- **HTML-rendered markdown that passes a document style** (the report preview
  panes with `REPORT_MARKDOWN_STYLE`) colors text from inline `--md-*` vars
  derived from the light document style: near-black on dark surfaces. Wrap
  the mount in `.md-dark-adapt`, which re-points those vars to tokens under
  `data-scheme="dark"` (and `system` while the OS is dark); used by the report
  View pane and the version-history report preview. Markdown with no style
  (AI chat) needs no wrapper.
- **No inverted chrome.** Every header is a flush or tonal `HeadingBar` that
  follows the scheme; no surface in this app pins its `color-scheme`.
- **No `text-white` / `bg-white`**: they are not tokens and break the dark
  palette. Document surfaces (slide canvases, thumbnails, previews) wear
  `ui-scheme-light`; constant contrast over media/data is an inline style
  beside its inline background (PROTOCOL_UI_STYLING rule 19 + checklist).
- The mechanism above is PROTOCOL_UI_STYLING rule 18 (`data-scheme` +
  `light-dark()` pairs); `data-theme` stays reserved for palette swaps.

## Page layout patterns

Every page is full-height; scrolling happens inside content areas, never the
page body. Pick the pattern; don't invent new frames. (All `Frame*` components
are panther exports.)

| Pattern               | Frame structure                                    | Live example                                   |
| --------------------- | -------------------------------------------------- | ---------------------------------------------- |
| A: simple content     | `FrameTop` + `HeadingBar` → `div.ui-pad.ui-spy`    | `slide_deck/slide_deck_settings.tsx`           |
| B: sidebar navigation | `FrameLeft` + vertical `TabsNavigation`            | `instance_population/_population_grid.tsx`     |
| C: list with grouping | `FrameTop` + `HeadingBar` + `FrameLeftResizable`   | `instance_results_packages/index.tsx`          |
| D: full editor        | `FrameTop` toolbar + `FrameLeftResizable` + canvas | `figure_editor/visualization_editor_inner.tsx` |
| E: split columns      | `div.flex` halves with `w-1/2` + `border-r`        | `indicator_manager_hfa/*` managers             |

Pattern specifics, from the live pages:

- **B (population page):** `TabsNavigation` is `vertical` inside `FrameLeft`'s
  panel; the selected tab is a plain signal in the page.
- **C (list pages):**
  `FrameLeftResizable startingWidth={300} minWidth={150}
  maxWidth={400}` around a `SelectList`. The product explorer
  (`products/index.tsx`) is the search-and-sort variant without the side
  panel: `HeadingBar` carries `searchText`/`setSearchText`, a `centerChildren`
  with the type-filter `ButtonGroup`, `SortControl`
  (`components/_shared/sort_control.tsx`) and the view-mode `ButtonGroup`, and
  the Create buttons; open folder / view mode / sort / type-filter state lives
  in `t4_ui` signals (PROTOCOL_APP_STATE).
- **D (editors):** opened full-screen via `getEditorWrapper()` → `openEditor`
  (never routed); panel widths in use: viz editor `384/300/600`, slide editor
  `400/300/600`; canvas area is `FigureHolder`/`PageHolder`.
- **Instance page:** `FrameTop` with a custom panel and a centered
  `ButtonGroup` tab selector, responsive at the app's one breakpoint `xl`:
  `flex xl:hidden` icon-only (`compactNavItems`, empty `label` plus
  `labelText`) vs `hidden xl:flex` labeled (`wideNavItems`).

## Recurring scaffolds

One copy each. Copy these, don't re-derive. Classes here are only the layout
skeleton; the color/state classes in them follow PROTOCOL_UI_STYLING and will
change with it.

**Card grid** (`15rem` is the standard card width; `18rem` for larger cards like
the HMIS indicator manager's). Cards are panther `Card`, which owns the frame,
hover, selected state and keyboard wiring:

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
`ui-pad h-full overflow-auto` around the `SelectList`, no column wrapper.

**Context menu:** panther
`showMenu({ anchor: { x: e.clientX, y: e.clientY, width: 0, height: 0 }, items })`,
or the convenience `showMenuAtPoint(x, y, { items })`. `MenuItem`s take `icon`
and `intent`; delete is always last and `intent: "danger"`.

**Buttons:** which intent / outline / `onBackground` → PROTOCOL_UI_STYLING
("Which token do I reach for"). App policy on top: destructive actions always go
through `createDeleteAction` (confirmation built in); async buttons pass
`state={action.state()}`; toolbar groups are `div.flex.items-center.ui-gap-sm`.

**Modal forms:** `openComponent()` + `AlertFormHolder` + `createFormAction`.
Validate inside the action and return `{ success: false, err }`; fields spaced
`ui-spy-sm`; `autoFocus` the first input. Settings pages: `ui-pad ui-spy` page,
`ui-text-heading` section headings, fields `ui-spy-sm`. Modal widths are
`ModalContainer`'s `width` tokens (panther).

**Form-draft signals:** draft state under edit uses a `temp*` prefix
(`tempConfig`, `tempWindowing`); unsaved-changes tracking is a `needsSaving`
signal.

## Icon vocabulary

Icon names are the panther `IconName` union
(`panther/_303_components/icons/icon_types.ts`). The app's established
mappings:

| Icon                                     | Usage                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------ |
| `plus` / `pencil` / `trash` / `copy`     | create / edit / delete / duplicate                                       |
| `save`                                   | save actions (very common)                                               |
| `x` / `check`                            | close-dismiss / confirm                                                  |
| `search` / `refresh`                     | search inputs / reload                                                   |
| `upload` / `download` / `databaseImport` | file up / export / data import                                           |
| `chevronLeft/Right/Up/Down`              | back, expand/collapse                                                    |
| `presentation` / `report` / `chart`      | slide decks and the Products tab / reports / the Explore tab and figures |
| `code` / `database` / `settings`         | system-prompt view / the Data tab, data import / settings actions        |
| `sparkles`                               | AI features                                                              |
| `moreVertical`                           | overflow menu trigger                                                    |
| `info` / `questionMark` / `help`         | hints, help chrome                                                       |
| `eye` / `eyeOff`                         | show / hide toggles                                                      |

## What NOT to do

App-specific only. The general styling prohibitions are in PROTOCOL_UI_STYLING.

- Don't restate a panther fact here. Point at the protocol instead.
- Don't add a `--color-*` token as a single value unless it is meant to read
  the same in both schemes; write a `light-dark()` pair.
- Don't hand-roll cards, selection circles, context menus, delete
  confirmations, or the running-stripe animation. `Card` (with
  `selected`/`onSelectToggle`), `showMenu`, `createDeleteAction` and
  `ui-running` exist for exactly these.
- Don't put color or radius overrides in components; the override point is
  `client/src/app.css`.
- Never modify `panther/` in this repo (fix in the panther repo, resync).
