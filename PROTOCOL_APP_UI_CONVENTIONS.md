# PROTOCOL — App: UI Conventions

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_ — read it when **building or changing app
> UI**: which layout pattern a page uses, the recurring scaffolds, the theming
> override point, the icon vocabulary. It sits on top of the panther protocols
> and does not restate them — read `PROTOCOL_UI_STYLING` (semantic tokens,
> `ui-*` spacing, sentence case), `PROTOCOL_UI_COMPONENTS` (panther-first,
> tables, modals, action creators), `PROTOCOL_UI_SOLIDJS`, and
> `PROTOCOL_UI_STRUCTURE` (file organisation) first — code-level patterns
> (imports, props, form actions, control flow) live there, not here. The shell
> architecture these pages mount into is **S14**
> ([SYSTEM_14_client_shell.md](SYSTEM_14_client_shell.md)).

## Theming — where tokens live and how to override

Two CSS files control the visual system:

1. **`panther/_303_components/_fixed.css`** — the defaults, and the
   authoritative home of current token values: the `@theme` block (colors
   including the app's teal `--color-primary`, radius, type scale, spacing
   density) and every `ui-*` utility (`ui-pad*`, `ui-gap*`, `ui-spy*`,
   `ui-form-*`, `ui-hoverable`, `ui-quiet`, `ui-intent-*`, `ui-text-*`). Never
   edited here — a cross-app default change happens in the panther repo and
   rides the sync.
2. **`client/src/app.css`** — the app's override point. It imports panther's CSS
   first, so any `@theme` variable or `@utility` block re-declared here wins
   globally. Today's actual overrides are deliberately few: the
   `"International Inter"` font stack (+ its `@font-face` declarations),
   `--font-weight-800`, `--text-5xl`, the two `--color-running*` stripe colors
   with the `ui-running` animated-stripe utility, and the base layer
   (`html, body, #app` → `font-sans`, `bg-base-100 text-base-content`,
   `font-variant-numeric: tabular-nums` for aligned numeric columns).

Don't mirror token values into docs — read them from the two files above.

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
  teal accent, plus `--color-border` and `color-scheme`) — unlayered so it
  beats Tailwind's layered `@theme` defaults. **When adding a `--color-*`
  token, add its dark counterpart to this block too.**
- **Documents stay light.** Panther's key colors are static
  (`setKeyColors` in `client/src/index.tsx` is one-shot), so slides,
  thumbnails, and every export keep light document styling.
- **On-screen figures are dark-adapted at display time** via
  `adaptFigureStyleForDarkMode` (`components/_shared/dark_mode_figures.ts`):
  a no-op in light mode, else an overlay merged into `FigureInputs.style`
  (light text/axes, dimmed grid/table lines, dark table header bands,
  near-black data colors flipped to light in seriesColorFunc/lines/legend;
  chromatic palette colors pass through). It wraps the inputs at **every
  on-screen `ChartHolder` call site — and only there**, so exports and stored
  FigureInputs snapshots are untouched. **Any new on-screen `ChartHolder` must
  wrap its inputs in it.**
- **Supporting `app.css` rules** (all `data-theme="dark"`-scoped): a
  `@custom-variant dark` for one-off `dark:` overrides (classes that read as
  "strong dark" in light mode but glare in dark); the inverted-ribbon rule —
  surfaces pairing `bg-base-content` with `text-base-100` (project header,
  panther's `HeadingBarMainRibbon`/`Tooltip`) get the two base vars
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
- **Theme-blind styling rules:** never use the static Tailwind palette
  (`gray-*`, `bg-white`) for app UI — use tokens. `text-white`/`bg-white` are
  acceptable only on fixed-color surfaces (identity-color badges, document
  thumbnails, the login brand panel). Pair intent backgrounds with their
  `-content` color (`bg-danger text-danger-content`), never `text-white`, so
  contrast survives the lighter dark-mode intent colors.

Type conventions on top of the tokens:

- **Font weights: only `font-400`, `font-700`, `font-800` exist.**
  `font-500`/`font-600` are undeclared no-ops — don't write them.
- **Muted/secondary text is `text-base-content-muted`** (or the named utilities
  `ui-text-caption` / `ui-text-small`). `text-neutral` is the _intent_ color for
  buttons/badges, not a text-muting token.
- Headings: `font-700` + Tailwind scale (`text-lg` page, `text-base` section,
  `text-sm` card title). Sentence case everywhere (PROTOCOL_UI_STYLING).

## Page layout patterns

Every page is full-height; scrolling happens inside content areas, never the
page body. Pick the pattern; don't invent new frames. (All Frame components are
panther exports.)

| Pattern                | Frame structure                                      | Live example                       |
| ---------------------- | ---------------------------------------------------- | ---------------------------------- |
| A — simple content     | `FrameTop` + `HeadingBar` → `div.ui-pad.ui-spy`      | `project/project_data.tsx`         |
| B — sidebar navigation | `FrameTop` + `FrameLeft` + vertical `TabsNavigation` | `project/index.tsx`                |
| C — list with grouping | `FrameTop` + `HeadingBar` + `FrameLeftResizable`     | `project/project_decks.tsx`        |
| D — full editor        | `FrameTop` toolbar + `FrameLeftResizable` + canvas   | `visualization_editor_inner.tsx`   |
| E — split columns      | `div.flex` halves with `w-1/2` + `border-r`          | `indicator_manager_hfa/*` managers |

Pattern specifics, from the live pages:

- **B (project page):** the header is dark —
  `bg-base-content
  border-base-content text-base-100` — with a `chevronLeft`
  back button; `TabsNavigation` is `vertical collapsible`, collapsed state
  persisted via `t4_ui.navCollapsed`.
- **C (list pages):**
  `FrameLeftResizable startingWidth={180} minWidth={170}
  maxWidth={300}` with
  `hoverOffset="offset-for-border-1-on-left"`; `HeadingBar` carries
  `searchText`/`setSearchText`, a `centerChildren={<SortControl …/>}`, and the
  Create button; grouping / selected-group / sort state lives in `t4_ui` signals
  (PROTOCOL_APP_STATE).
- **D (editors):** opened full-screen via `getEditorWrapper()` → `openEditor`
  (never routed); panel widths in use: viz editor `384/300/600`, slide editor
  `startingWidth={400}`; canvas area is `ChartHolder`/`PageHolder`.
- **Instance page:** Pattern A frame with a centered `ButtonGroup` tab selector,
  responsive at the app's one breakpoint `xl`: `flex xl:hidden` icon-only
  (`itemWidth="50px"`) vs `hidden xl:flex` labeled (`115px` en, `140px` fr/pt).

## Recurring scaffolds

One copy each — copy these, don't re-derive.

**Card grid** (`15rem` is the standard card width; `18rem` for larger cards like
dashboards/metrics):

```tsx
<div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] ui-gap ui-pad">
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
      <div
        class="ui-pad ui-hoverable border-base-300 group relative rounded border cursor-pointer"
        classList={{ "border-primary": isSelected(item.id) }}
        onClick={() => openItem(item.id)}
      >
        <div class="ui-spy-sm">
          <div class="font-700">{item.label}</div>
          <div class="text-base-content-muted text-sm">{item.description}</div>
        </div>
      </div>
    )}
  </For>
</div>;
```

**Multi-select on cards:** use panther's `createSelectionController` (click /
Cmd+click toggle / Shift+click range) + `<SelectionCircle isSelected onClick/>`
inside the `group relative` card — never hand-roll the circle markup.

**Search:** `HeadingBar`'s built-in search input; filtering triggers at **3+
characters** (below that, show all). Empty states are search-aware (see the grid
fallback above).

**List with borders** (non-grid): rows with
`border-base-300 border-b px-3 py-2 last:border-b-0`, `flex-1 truncate` label,
small outline action buttons.

**Grouping sidebar** (inside Pattern C's resizable panel): full-height
`border-r border-base-300` column; controls section `border-b p-3` (e.g. a
`Select` for group-by); list section `flex-1 overflow-auto p-2` with
`SelectList`.

**Status badge** (the `DirtyStatus.tsx` idiom):

```tsx
<div
  class="ui-intent-fill ui-intent-outline data-[running=true]:ui-running inline-flex items-center rounded border border-[currentColor] px-3 py-1.5 text-sm leading-none"
  data-intent={intent()} // "ready" → success, "error" → danger, else neutral
  data-outline={true}
  data-running={status() === "running"}
>
  {statusLabel()}
</div>;
```

Tinted containers follow the same intent logic: `border-success bg-success/10`
when active, `border-base-300` otherwise.

**Context menu:** panther
`showMenu({ anchor: { x: e.clientX, y: e.clientY,
width: 0, height: 0 }, items })`
— or the convenience `showMenuAtPoint(x, y, { items })`. `MenuItem`s take `icon`
and `intent`; delete is always last and `intent: "danger"`.

**Buttons:** primary = default intent, no outline; secondary/cancel =
`intent="neutral" outline`; destructive = `intent="danger" outline` and always
through `createDeleteAction` (confirmation built in); async buttons pass
`state={action.state()}`; toolbar groups are `div.flex.items-center.ui-gap-sm`.

**Modal forms:** `openComponent()` + `AlertFormHolder` + `createFormAction` —
validate inside the action and return `{ success: false, err }`; fields spaced
`ui-spy-sm`; `autoFocus` the first input. Settings pages: `SettingsSection`
blocks inside `ui-pad ui-spy`, fields `ui-spy-sm`. Modal widths: `sm` 400 / `md`
560 / `lg` 800 / `xl` 1000 / `2xl` 1200 / `3xl` 1400 (all clamped to viewport).

**Form-draft signals:** draft state under edit uses a `temp*` prefix
(`tempConfig`, `tempWindowing`); unsaved-changes tracking is a `needsSaving`
signal.

## Icon vocabulary

Icon names are the panther `IconName` union
(`panther/_303_components/icons/icon_types.ts`, 84 names) — the app's
established mappings:

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

- Don't restyle by hand what a named utility covers: use
  `ui-intent-fill`/`ui-intent-outline` for intent surfaces,
  `ui-text-title/heading/caption/small` for typography, `ui-hoverable` for hover
  surfaces — the raw-Tailwind equivalents drift.
- Don't use `text-neutral` for muted text (it's a button/badge intent); don't
  write `font-500`/`font-600` (dead classes).
- Don't hand-roll selection circles, context menus, delete confirmations, or the
  running-stripe animation — panther primitives exist for all four.
- Don't put colors/radius overrides in components or mirror token values into
  docs; the override point is `client/src/app.css`, the defaults are panther's
  `_fixed.css`.
- Never modify `panther/` in this repo (fix in the panther repo, resync).
