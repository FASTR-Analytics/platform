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
- `--color-package` (+ `-content`, `-hover`, `-active`) with the
  `ui-fill-package` and `ui-hoverable-package` skins: the one accent for the
  results-package chip (`components/products/_shared/package_scope_chip.tsx`) on
  editor headers, product cards and list rows. Nothing else wears it.
- The base layer: `html, body, #app` → `font-sans`,
  `bg-base-100 text-base-content`, `font-variant-numeric: tabular-nums` for
  aligned numeric columns.

A third, runtime layer sits above both while the reskin is being chosen: the
Theme modal (`client/src/state/t4_theme.ts`, S14) writes brand color, radius,
density and text-scale tokens as inline properties on `<html>`. Its default
reproduces the shipped look, except that ramps pin their hover and active
states; the two CSS files remain the source of truth for what ships.

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
  tracked scope so a scheme toggle rebuilds the view. Of the roadtrip tour
  vars (`--roadtrip-*`) on `:root`, `--roadtrip-bg` and
  `--roadtrip-scrim-color` are `light-dark()` pairs; the rest are a z-index
  and two token references.
- **HTML-rendered markdown that passes a document style** (the report preview
  panes with `REPORT_MARKDOWN_STYLE`) colors text from inline `--md-*` vars
  derived from the light document style: near-black on dark surfaces. Wrap
  the mount in `.md-dark-adapt`, which re-points those vars to tokens under
  `data-scheme="dark"` (and `system` while the OS is dark); used by the report
  View pane and the version-history report preview. Markdown with no style
  (AI chat) needs no wrapper.
- **No inverted chrome.** Every header is a flush `HeadingBar` that follows
  the scheme; no surface in this app pins its `color-scheme`.
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
| A: simple content     | `FrameTop` + `HeadingBar` → `div.ui-pad.ui-spy`    | `slide_deck/settings.tsx`           |
| B: sidebar navigation | `FrameLeft` + vertical `TabsNavigation`            | `data/hmis/population/grid.tsx`    |
| C: list with grouping | `FrameTop` + `HeadingBar` + `FrameLeftResizable`   | `results_packages/results_packages.tsx`        |
| D: full editor        | `FrameTop` toolbar + `FrameLeftResizable` + canvas | `_shared/figure_editor/figure_editor.tsx` |
| E: split columns      | `div.flex` halves with `w-1/2` + `border-r`        | `data/hfa/indicators/*` managers               |

Pattern specifics, from the live pages:

- **B (population page):** `TabsNavigation` is `vertical` inside `FrameLeft`'s
  panel; the selected tab is a plain signal in the page.
- **C (list pages):**
  `FrameLeftResizable startingWidth={300} minWidth={150}
  maxWidth={400}` around a `SelectList`. The product explorer
  (`products/products.tsx`) is the tree variant without the side panel:
  `HeadingBar` carries the expand/collapse toggle in `centerLeftChildren`,
  `searchText`/`setSearchText` and the New button, over a tree list whose
  column headers set the sort and its direction; open folders and sort state
  live in `t4_ui` signals (PROTOCOL_APP_STATE).
- **D (editors):** opened full page, never routed. A view reached from a
  frame page (a product editor, module defaults, a Data sub-page, the user
  detail) opens through `openShellEditor` (`state/t4_ui.ts`), the shell's one
  `getEditorWrapper()`, and covers the header and the rail; a view a full-page
  view opens itself (the slide editor, an import run detail) uses that view's
  own `getEditorWrapper()`; panel widths in use: viz editor `384/300/600`, slide editor
  `400/300/600`; canvas area is `FigureHolder`/`PageHolder`.
- **Instance page:** `ShellEditorWrapper` around a `FrameTop` whose panel is
  the header (instance name, logo, right-hand cluster) and whose content is a
  `FrameLeft` with the rail: pattern B, a vertical collapsible
  `TabsNavigation` over `navItems()`, collapsed state in `t4_ui`'s
  `navCollapsed`. Nothing in the shell is responsive.

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
`ui-text-heading` section headings, fields `ui-spy-sm`. Every heading, the
instance name in the shell and a full-screen view's label included, is
`ui-text-heading`; never a bare `text-lg` / `text-xl`. The six top-level pages
have no title. An in-body count beside a search box is plain body text
("123 indicators", "12 of 40"). Modal widths are
`ModalContainer`'s `width` tokens (panther).

**Text sizes:** the three roles and the rem-only rule are PROTOCOL_UI_STYLING
("Type"). `lint:text-sizes` (chained into `deno task typecheck`) fails on an
arbitrary `text-[Npx]`, `text-md`, or an inline pixel font-size under
`client/src`, `panther/_303_components` and `panther/_305_ai`. Document and canvas rendering is
exempt by file in `lint_text_sizes.ts`: the report page surface
(`products/report/live_preview_extension.tsx`, pinned to its PDF's
typography) and the theme miniature (`products/report/fastr_theme_mock.tsx`).
Add a file there only when its text is a rendering of a document or a
canvas, not UI.

**Mono:** the face rule is PROTOCOL_UI_STYLING ("Type", Mono). In this app
that means indicator, DHIS2, variable and category IDs, column names,
formulas, file names, logs and R scripts are `font-mono`; emails, facility
and area names, dates, periods and every count are sans, including the
stats in the import staging summaries, whose emphasis is `font-700` at body
size.

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
| `package`                                | the results package a product serves from (chip, menu entry)             |
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
