# WB-FASTR Design System

This document describes the visual design system used in wb-fastr. It complements
the panther library's `panther/FRONTEND_STYLE_GUIDE.md`, which covers base component
APIs, SolidJS reactivity rules, and coding conventions. Read that document first.

This document focuses on **how wb-fastr assembles panther components into pages**:
the color palette, spacing tokens, layout structures, and recurring UI patterns
that define the application's visual language.

---

## How the Theming System Works

The visual system is controlled by two CSS files:

1. **`panther/_303_components/_fixed.css`** — Panther's defaults. Defines the
   `@theme` block (colors, fonts, radius) and all `ui-*` utility classes. This
   file ships with panther and should **not** be edited directly.

2. **`client/src/app.css`** — wb-fastr's overrides. Imports panther's CSS, then
   re-declares `@theme` variables to set the app's color palette, fonts, and
   radius. Can also re-declare `@utility` blocks to override spacing.

### How to Change the Design System

**To change colors, fonts, or radius**: Edit the `@theme` block in
`client/src/app.css`. These variables override panther's defaults.

```css
/* client/src/app.css — @theme block */
@theme {
  --color-primary: #0e706c;      /* Change this to update all primary-colored elements */
  --color-base-300: #cacaca;     /* Change this to update all borders/dividers */
  --radius: 4px;                 /* Change this to update all border-radius */
  /* ... etc */
}
```

**To change spacing/padding/gaps**: Add `@utility` overrides in
`client/src/app.css`. These override panther's defaults because app CSS loads
after panther CSS.

```css
/* Example: Tighten all standard padding from px-4 py-4 to px-3 py-3 */
@utility ui-pad {
  @apply px-3 py-3;
}

/* Example: Tighten all standard gaps from gap-4 to gap-3 */
@utility ui-gap {
  @apply gap-x-3 gap-y-3;
}
```

Any `@utility` override in `app.css` replaces the panther default globally —
every component using that utility class updates automatically.

### Current Token Values

The tables below show the **current** values. When you change a value, update
this document to match.

---

## Color Palette

All colors are defined in the `@theme` block of `client/src/app.css`. To change
a color, update the `--color-*` variable there. Never use arbitrary color values
(`bg-[#ff0000]`) in components — always use semantic tokens.

### Base Colors — Current Values

| Token           | Value     | Usage                                    |
|-----------------|-----------|------------------------------------------|
| `base-100`      | `#ffffff` | Primary background (pages, cards, inputs)|
| `base-200`      | `#f2f2f2` | Secondary background (panels, sidebars)  |
| `base-300`      | `#cacaca` | Borders, dividers, inactive elements     |
| `base-content`  | `#2a2a2a` | Primary text, also used for dark headers |

### Intent Colors — Current Values

| Token              | Value                  | Usage                              |
|--------------------|------------------------|------------------------------------|
| `primary`          | `#0e706c` (teal)       | Primary actions, active states, links, selection highlights |
| `primary-content`  | `#ffffff`              | Text on primary backgrounds        |
| `neutral`          | `rgb(161, 161, 161)`   | Secondary/cancel actions, muted text, placeholder text |
| `neutral-content`  | `#ffffff`              | Text on neutral backgrounds        |
| `success`          | `#009f70` (green)      | Success states, confirmations, "ready" status |
| `success-content`  | `#ffffff`              | Text on success backgrounds        |
| `danger`           | `#f04d44` (red)        | Destructive actions, errors, "error" status |
| `danger-content`   | `#ffffff`              | Text on danger backgrounds         |

### Color Application Rules

- **Borders**: Almost always `border-base-300`. Use `border-primary` only for selected/active states.
- **Backgrounds**: Default is `base-100`. Use `base-200` for secondary panels. Use intent colors with low opacity for tinted backgrounds (e.g., `bg-success/10` for success tint).
- **Text**: Default is `base-content`. Use `text-neutral` for secondary/muted text. Use `text-primary` for links or emphasis.
- **Status mapping**: "ready" → `success`, "error" → `danger`, "running"/"queued"/"pending" → `neutral`.
- **Dark header**: The project page header uses `bg-base-content` (dark) with white text.

---

## Typography

### Font Stack

| Token       | Family       | Usage                        |
|-------------|--------------|------------------------------|
| `font-sans` | Inter        | All UI text (default)        |
| `font-mono` | Roboto Mono  | Code, data values, IDs       |

### Font Weights

| Weight | Tailwind Class | Usage                                  |
|--------|----------------|----------------------------------------|
| 400    | `font-400`     | Body text, form labels, descriptions   |
| 700    | `font-700`     | Headings, button text, emphasis        |
| 800    | `font-800`     | Rarely used (available for branding)   |

### Text Sizes

wb-fastr uses panther's text size utilities for form elements and relies on
standard Tailwind for everything else:

| Context              | Classes                          |
|----------------------|----------------------------------|
| Form input text      | `ui-form-text-size` (text-sm)    |
| Form input text (sm) | `ui-form-text-size-sm` (text-xs) |
| Page headings        | `font-700 text-lg`              |
| Section headings     | `font-700 text-base`            |
| Card titles          | `font-700 text-sm`              |
| Body/description     | `text-sm`                        |
| Helper/secondary     | `text-xs`                        |
| Muted counts/labels  | `text-neutral text-xs`           |

### Text Rules

- **Sentence case everywhere**: "Save changes", not "Save Changes".
- **No arbitrary font sizes**: Use Tailwind's scale (`text-xs`, `text-sm`, `text-base`, `text-lg`).
- **Tabular numbers**: The root element sets `font-variant-numeric: tabular-nums` for aligned numeric columns.

---

## Spacing System

All spacing uses panther's `ui-*` utility classes or standard Tailwind values.
Never use arbitrary spacing (`p-[23px]`).

### Spacing Utilities — Current Values

These are defined in `panther/_303_components/_fixed.css`. To change any of them
globally, add a `@utility` override in `client/src/app.css` (see "How to Change
the Design System" above).

**Layout spacing:**

| Utility    | Current Tailwind Classes | Current Pixel Values | Usage                                 |
|------------|--------------------------|----------------------|---------------------------------------|
| `ui-pad`   | `px-4 py-4`             | 16px all sides       | Standard container/section padding    |
| `ui-pad-sm`| `px-2 py-2`             | 8px all sides        | Compact container padding             |
| `ui-pad-lg`| `px-8 py-6`             | 32px h / 24px v      | Modal/dialog padding                  |
| `ui-gap`   | `gap-x-4 gap-y-4`       | 16px both axes       | Standard flex/grid gap                |
| `ui-gap-sm`| `gap-x-2 gap-y-2`       | 8px both axes        | Compact flex/grid gap                 |
| `ui-spy`   | `space-y-6`             | 24px between children| Vertical spacing between major sections|
| `ui-spy-sm`| `space-y-2`             | 8px between children | Vertical spacing between related items|

**Form input spacing:**

| Utility              | Current Tailwind Classes | Current Pixel Values | Usage                          |
|----------------------|--------------------------|----------------------|--------------------------------|
| `ui-form-pad`        | `px-3 py-2`             | 12px h / 8px v       | Form input internal padding    |
| `ui-form-pad-sm`     | `px-2 py-1`             | 8px h / 4px v        | Small form input padding       |
| `ui-form-text-size`  | `text-sm leading-tight`  | 14px / tight         | Form input text size           |
| `ui-form-text-size-sm`| `text-xs leading-tight` | 12px / tight         | Small form input text size     |

**Example: Tightening the spacing globally**

To make the entire UI more compact, add these overrides to `client/src/app.css`:

```css
@utility ui-pad {
  @apply px-3 py-3;    /* was px-4 py-4 (16px → 12px) */
}

@utility ui-pad-sm {
  @apply px-1.5 py-1.5; /* was px-2 py-2 (8px → 6px) */
}

@utility ui-gap {
  @apply gap-x-3 gap-y-3; /* was gap-x-4 gap-y-4 (16px → 12px) */
}

@utility ui-spy {
  @apply space-y-4;     /* was space-y-6 (24px → 16px) */
}
```

After changing any values, update the tables above to reflect the new values.

### When to Use What

- **Between page sections**: `ui-spy` (currently 24px vertical)
- **Between related items** (fields in a form, items in a list): `ui-spy-sm` (currently 8px vertical)
- **Between flex/grid children**: `ui-gap` (currently 16px) or `ui-gap-sm` (currently 8px)
- **Container padding**: `ui-pad` (currently 16px) for most containers, `ui-pad-sm` (currently 8px) for compact panels
- **Panel internal padding**: Often `p-3` (12px) for sidebar sections

---

## Border & Radius

The default border radius is controlled by `--radius: 4px` in `client/src/app.css`.
Change it there to update all `rounded` elements globally.

| Pattern                         | Usage                               |
|---------------------------------|-------------------------------------|
| `border border-base-300 rounded`| Standard card/container border      |
| `border-b border-base-300`      | Horizontal divider between sections |
| `border-r border-base-300`      | Vertical divider (sidebar edge)     |
| `border-primary`                | Selected/active card border         |
| `rounded`                       | Currently 4px (via `--radius`)      |
| `rounded-full`                  | Pill shape (badges, color dots)     |
| `last:border-b-0`              | Remove bottom border on last list item |

---

## Interaction States

### Hover

- **Cards/clickable areas**: Use `ui-hoverable` class (brightness reduction on hover/active).
- **Borders on hover**: `hover:border-primary` for cards that can be selected.
- **Group hover**: Use Tailwind `group` + `group-hover:opacity-100` for revealing actions on hover (e.g., selection circles).

### Focus

- Panther handles focus rings via `ui-focusable` on form inputs.
- 2px ring with offset, colored by intent.

### Selection

- **Unselected**: `border-base-300`
- **Selected**: `border-primary` (border) + `bg-primary text-primary-content` (selection indicator)
- **Multi-select**: Supports click, Cmd/Ctrl+click (toggle), Shift+click (range).

### Running/Loading Animation

The `ui-running` utility class creates an animated striped background (blue gradient)
for elements in a "running" state. Defined in `app.css`.

---

## Layout System

wb-fastr uses panther's Frame components to compose page layouts. All layouts
are full-height (`h-full w-full`) and use flexbox.

### Frame Components (from panther)

| Component              | Purpose                                   |
|------------------------|-------------------------------------------|
| `FrameTop`             | Fixed header bar above scrollable content |
| `FrameLeft`            | Fixed left sidebar + main content         |
| `FrameRight`           | Main content + fixed right sidebar        |
| `FrameLeftResizable`   | Draggable-width left panel                |
| `FrameRightResizable`  | Draggable-width right panel               |

### Page Layout Patterns

#### Pattern A: Simple Content Page

Header bar + scrollable content. Used for settings, data management, simple list views.

```
FrameTop
  panelChildren: HeadingBar (title + search + actions)
  children:
    div.ui-pad.ui-spy (scrollable content area)
```

#### Pattern B: Sidebar Navigation Page

Header + collapsible left sidebar + tab content. Used for the main project view.

```
FrameTop
  panelChildren: Header (back button + project name + actions)
  children:
    FrameLeft
      panelChildren: TabsNavigation (vertical, collapsible, with icons)
      children:
        Switch/Match (renders active tab's content)
```

#### Pattern C: List Page with Grouping Sidebar

Header + resizable grouping panel + card grid. Used for decks, visualizations.

```
FrameTop
  panelChildren: HeadingBar (title + search + create button)
  children:
    FrameLeftResizable (startingWidth=180, minWidth=170, maxWidth=300)
      panelChildren:
        div.border-r (sidebar with group/folder selector)
      children:
        div.ui-pad (card grid content)
```

#### Pattern D: Full Editor

Header toolbar + resizable panels + canvas area. Used for visualization and slide editors.

```
FrameTop
  panelChildren: Toolbar (save + close + action buttons)
  children:
    FrameLeftResizable
      panelChildren: Editor controls panel
      children:
        Canvas / ChartHolder / PageHolder (main editing area)
        [Optional: FrameRightResizable for AI/properties panel]
```

#### Pattern E: Split Content

Two equal columns. Used for data management (structure + datasets).

```
div.flex.h-full.w-full
  div.ui-pad.border-r.h-full.w-1/2 (left column)
  div.ui-pad.h-full.w-1/2 (right column)
```

### Instance Page Structure

The top-level instance view uses Pattern A with tab-based content switching:

```
FrameTop
  panelChildren:
    Instance name + logo (left)
    ButtonGroup tab selector (center, responsive: icons-only on mobile, labels on desktop)
    Language + user menu (right)
  children:
    EditorWrapper
      Switch: Projects | Data | Assets | Users | Settings
```

### Project Page Structure

The project view uses Pattern B:

```
FrameTop (bg-base-content, dark header)
  panelChildren:
    Back button + project name (left)
    Feedback + AI toggle + run status (right)
  children:
    FrameLeft
      panelChildren: TabsNavigation (vertical, icons: decks/reports/viz/metrics/modules/data/settings)
      children:
        Switch: Decks | Reports | Visualizations | Metrics | Modules | Data | Settings
```

---

## Recurring UI Patterns

### Cards in a Grid

Responsive grid of clickable item cards.

```tsx
<div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] ui-gap ui-pad">
  <For each={items()}>
    {(item) => (
      <div
        class="ui-pad ui-hoverable border-base-300 group relative min-h-[150px] rounded border"
        classList={{ "border-primary": isSelected(item.id) }}
        onClick={() => openItem(item.id)}
      >
        <div class="ui-spy-sm">
          <div class="font-700">{item.label}</div>
          <div class="text-neutral text-sm">{item.description}</div>
        </div>
      </div>
    )}
  </For>
</div>
```

### Selection Circle (on cards)

Appears on hover, fills on selection. Positioned in top-right corner of a `group` card.

```tsx
<div
  class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full opacity-0 group-hover:opacity-100"
  classList={{ "bg-primary text-primary-content opacity-100": isSelected() }}
>
  <Show when={isSelected()}>
    <CheckIcon />
  </Show>
</div>
```

### Sidebar Section

A bordered section inside a sidebar panel, with padding and optional bottom border.

```tsx
<div class="border-base-300 border-b p-3">
  <Select label={t("Group by")} ... />
</div>
<div class="flex-1 overflow-auto p-2">
  <SelectList ... />
</div>
```

### Empty State

Muted text inside the content area. Differentiate between "no items exist" and "no search results".

```tsx
<For each={filteredItems()} fallback={
  <div class="text-neutral text-sm">
    {searchText().length >= 3
      ? t("No matching items")
      : t("No items")}
  </div>
}>
  {(item) => <ItemCard item={item} />}
</For>
```

### Status Badge

Inline badge with intent-based coloring and optional running animation.

```tsx
<div
  class="inline-flex items-center rounded border border-[currentColor] px-3 py-1.5 text-sm leading-none"
  data-intent={intent}
  data-outline={true}
  data-running={status === "running"}
  classList={{ "ui-running": status === "running" }}
>
  {statusLabel}
</div>
```

Intent mapping: `"ready"` → `"success"`, `"error"` → `"danger"`, everything else → `"neutral"`.

### Action Bar (in HeadingBar)

Group of action buttons aligned right in a heading bar.

```tsx
<HeadingBar
  heading={t("Reports")}
  searchText={searchText()}
  setSearchText={setSearchText}
>
  <div class="flex items-center ui-gap-sm">
    <Button iconName="upload" intent="neutral" outline>{t("Upload")}</Button>
    <Button iconName="plus">{t("Create")}</Button>
  </div>
</HeadingBar>
```

### Context Menu

Right-click or overflow menu on cards/items.

```tsx
showMenu({
  x: e.clientX,
  y: e.clientY,
  items: [
    { label: t("Edit"), icon: "pencil", onClick: () => editItem(id) },
    { label: t("Duplicate"), icon: "copy", onClick: () => duplicateItem(id) },
    { label: t("Delete"), icon: "trash", intent: "danger", onClick: () => deleteItem(id) },
  ],
});
```

### Color Dot + Label (for categories/folders)

Small colored circle followed by label text.

```tsx
<div class="flex items-center gap-2">
  <div
    class="h-2.5 w-2.5 flex-none rounded-full"
    style={{ "background-color": color ?? getColor({ key: "base300" }) }}
  />
  <span class="truncate">{label}</span>
  <span class="text-neutral text-xs">({count})</span>
</div>
```

### List Item with Bottom Border

Items in a vertical list, separated by borders.

```tsx
<For each={items()}>
  {(item) => (
    <div class="border-base-300 flex items-start gap-2 border-b px-3 py-2 last:border-b-0">
      <div class="flex-1">{item.label}</div>
      <Button size="sm" iconName="trash" intent="danger" outline />
    </div>
  )}
</For>
```

### Tinted Status Container

A bordered container with a light tint background for success/active states.

```tsx
// Active/success state
<div class="border-success bg-success/10 rounded border ui-pad">
  {/* Content */}
</div>

// Default/inactive state
<div class="border-base-300 rounded border ui-pad">
  {/* Content */}
</div>
```

---

## Responsive Behavior

The primary breakpoint is `xl` (1280px).

### Common Responsive Patterns

```tsx
// Icon-only on small screens, labels on large
<div class="flex xl:hidden">
  <ButtonGroup itemWidth="50px" />  {/* Icons only */}
</div>
<div class="hidden xl:flex">
  <ButtonGroup itemWidth="115px" /> {/* With labels */}
</div>
```

The app is primarily designed for desktop use. Mobile/tablet layouts use
collapsible sidebars and icon-only navigation.

---

## Modal & Editor Overlays

### Small Modals

For forms, confirmations, feedback. Use `openComponent()` from panther.

```tsx
await openComponent({
  element: EditForm,
  props: { data, onSave: callback },
});
```

Modal width options: `sm` (400px), `md` (560px), `lg` (800px), `xl` (1000px), `2xl` (1200px).

### Full-Screen Editors

For complex editing (visualizations, slides, reports). Use `openEditor()` from `getEditorWrapper()`.

```tsx
const { openEditor, EditorWrapper } = getEditorWrapper();

// Wrap the parent content
<EditorWrapper>
  <PageContent />
</EditorWrapper>

// Open editor as full overlay
await openEditor({
  element: VisualizationEditor,
  props: { vizId, projectDetail },
});
```

Editors receive a `close(result?)` prop to dismiss themselves.

---

## Icon Usage

Icons are rendered via panther's `IconRenderer` component using string icon names.
Common icons used in wb-fastr:

| Icon Name       | Usage                           |
|-----------------|---------------------------------|
| `plus`          | Create/add actions              |
| `trash`         | Delete actions                  |
| `pencil`        | Edit actions                    |
| `copy`          | Duplicate actions               |
| `refresh`       | Refresh/reload actions          |
| `x`             | Close/dismiss                   |
| `search`        | Search inputs                   |
| `upload`        | Upload actions                  |
| `download`      | Download/export actions         |
| `chevronLeft`   | Back navigation                 |
| `chevronRight`  | Forward/expand                  |
| `chevronUp`     | Collapse                        |
| `chevronDown`   | Expand                          |
| `settings`      | Settings tab                    |
| `chart`         | Visualizations tab              |
| `report`        | Reports tab                     |
| `database`      | Data tab                        |
| `code`          | Modules tab                     |
| `badge`         | Metrics tab                     |
| `sparkles`      | Decks/AI features               |
| `moreVertical`  | Overflow menu trigger           |

---

## Summary of Visual Principles

1. **Semantic color only**: Never use raw hex values in components. Use intent tokens (`primary`, `danger`, `success`, `neutral`) and base tokens (`base-100` through `base-content`).
2. **Consistent spacing**: Use `ui-*` utilities for all padding, gaps, and vertical spacing. Fall back to Tailwind scale values (`gap-2`, `p-3`) only when the `ui-*` utilities don't fit.
3. **Borders define structure**: Sections are separated by `border-base-300` borders, not background color changes or shadows.
4. **Intent drives meaning**: Button color, badge color, and container tint all derive from the same intent system. "What does this mean?" determines the color, not "what does this look like?".
5. **Full-height layouts**: Every page fills the viewport. Scrolling happens inside content areas, not the page body.
6. **Panther components first**: Always compose from panther's component library. Only build custom elements when panther doesn't cover the need.
