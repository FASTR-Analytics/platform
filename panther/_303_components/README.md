# _303_components

SolidJS reactive UI components library for building interactive data
applications.

## Purpose

Complete set of production-ready SolidJS components:

- Form inputs (buttons, inputs, selects, sliders, file input, etc.)
- Display components (badges, cards, empty states)
- Layout components (frames, heading bars, tabs, steppers)
- Chart and page holders for panther figures
- Modals, editors, and async-state containers
- Data tables with sorting, grouping, and controlled selection
- Icon system with swappable sets (Tabler default, Phosphor opt-in)

## Prerequisites

Your application must have:

- **SolidJS** v1.8+
- **Tailwind CSS** v4, importing `_fixed.css` (which ships the full `@theme`
  token block — an app overrides only what it wants; see
  **[DOC_UI_COLOR_AND_STATE.md](../../DOC_UI_COLOR_AND_STATE.md)**)

## Component Categories

### Charts (`charts/`)

```tsx
<FigureHolder figureInputs={figureInputs} />
<PageHolder pageInputs={pageInputs} />
```

Display panther visualizations and pages in SolidJS apps.

### Display (`display/`)

```tsx
<Badge intent="success">Ready</Badge>
<Badge intent="danger" variant="solid">3</Badge>

<Card header="Section title" headerRight={<Badge>4</Badge>}>
  {content}
</Card>
<Card href={`/?p=${id}`}>{navCardContent}</Card>          // real <a>
<Card onClick={open}>{actionCardContent}</Card>            // div role="button"
<Card
  selected={sel.isSelected(id)}
  onSelectToggle={(e) => sel.handleClick(id, e)}
  onClick={(e) => sel.handleClick(id, e, () => open())}
>
  {markingSelectCardContent}
</Card>

<EmptyState
  iconName="box"
  title="No datasets yet"
  description="Import a CSV to get started."
>
  <Button size="sm">Import</Button>
</EmptyState>
```

Cards clip their content to the rounded corners, hover at the frame
(`hover:border-primary` — never a bg tint), and render selection via the
integrated circle in marking-select mode. The body takes `pad` (default `md`;
`pad="none"` for a flush table) and `spy` (default `none`); the header and
footer rows keep their own inset. See
**[DOC_UI_COLOR_AND_STATE.md](../../DOC_UI_COLOR_AND_STATE.md)** (selection
idioms) and **[DOC_LIST_SELECTION.md](../../DOC_LIST_SELECTION.md)** (the
controller).

### Form Inputs (`form_inputs/`)

```tsx
<Button intent="primary" onClick={handleClick}>Save</Button>
<Button outline onBackground="base-200" onClick={edit}>Edit</Button>
<Input value={value()} onChange={setValue} />
<Select options={options} value={selected()} onChange={setSelected} />
<SelectList items={items} value={selected()} onChange={setSelected} />
<SelectV2 items={items} value={selected()} onChange={setSelected} />
<ButtonGroup items={items} value={selected()} onChange={setSelected} />
<Slider min={0} max={100} value={value()} onChange={setValue} />
<Checkbox checked={checked()} onChange={setChecked} label="Enabled" />
<Checkbox checked={false} indeterminate onChange={...} label="Partial" />
<TextArea value={text()} onChange={setText} />
<FileInput value={file()} onChange={setFile} label="Data file" />
<Field label="Range" invalidMsg={err()}>
  <DoubleSlider ... />
</Field>
```

Complete form control library. Size via `size="sm"`, never ad-hoc classes. Every
control renders inside `Field` (label, intent, invalid message, width); `Field`
is also the app-facing wrapper for a control the kit does not label itself.

### Layout (`layout/`)

```tsx
<FrameTop pad="md" spy="md" panelChildren={<HeadingBar heading="Rows" />}>
  {content}
</FrameTop>
<FrameLeft panelPad="sm" panelChildren={<Sidebar />}>{content}</FrameLeft>
<TabsNavigation items={items} value={active()} onChange={setActive} vertical />
<CollapsibleSection title="Advanced" pad="md" spy="sm">{content}</CollapsibleSection>
```

Frames: `FrameTop`, `FrameLeft`, `FrameRight`, plus `FrameLeftResizable`,
`FrameRightResizable`, `FrameThreeColumnResizable`. Every slot scrolls. A slot
owns its inset and its stack spacing: `pad` / `spy` (a `PadSize`:
`"none" | "sm" | "md" | "lg"`, default none) on the content slot, `panelPad` /
`panelSpy` on the panel slot, so no padding `<div>` sits between a Frame and its
content. Side frames own their panel/content divider (never add that edge's
border yourself). Horizontal `TabsNavigation` is a `FrameTop` panel in its own
right (it carries its own `ui-pad-x` and bottom border; no wrapper); inside
padded content pass `noPad`; `size="sm"` is independent of placement.
`CollapsibleSection`'s body takes `pad` and `spy` (default none) and its header
row `headerPad` (default `md`). Steppers: `getStepper` with
`StepperChipsWithTitles` or `StepperNavigationVisual`.

`SelectList` / `TabsNavigation` / `ButtonGroup` share one `items`/`value`/
`onChange` contract (swap = rename); `EditableList` adds add/delete/reorder; the
optional `createSelectionController` helper backs multi-select card grids via
`Card`'s selectable mode. See
**[DOC_LIST_SELECTION.md](../../DOC_LIST_SELECTION.md)**.

### Icons (`icons/`)

```tsx
<Icon iconName="check" />                       // bare glyph, scales with font size
<IconRenderer iconName="search" size="sm" />    // form-control sized
```

One shared `IconName` key set across two glyph sets — Tabler (default) and
Phosphor. Select per app with `--panther-icon-set: phosphor;` in the theme
block; unknown keys render a visible fallback, never a gap.

### Special State (`special_state/`)

```tsx
await openAlert({ text: "Saved", intent: "success" });
const ok = await openConfirm({ title: "Delete?", text: "..." });
await openComponent({ element: EditForm, props: { data } });

// Inside EditForm (an AlertComponentProps component):
<ModalContainer
  title="Edit"
  form
  onCancel={() => p.close(undefined)}
  actions={[{ label: "Save", onClick: save.click, state: save.state() }]}
>
  {fields}
</ModalContainer>;

const { openEditor, EditorWrapper } = getEditorWrapper();

<MenuButton items={items} iconName="plus">Add</MenuButton>;
<ActionMenuButton items={items} />; // the three-dots button

<StateHolderWrapper state={query.state()}>
  {(data) => <Content data={data} />}
</StateHolderWrapper>;
```

Dialogs stack: one opened over another layers on top, and each promise settles
when its own layer closes. `ModalContainer` owns the footer: `onCancel` renders
Cancel, `actions` render right-aligned after it with the last one primary,
`form` makes Enter click the primary action, and each action's error state
renders under the body. The body takes `pad` and `spy`, both default `md`
(`pad="none"` for a flush table or editor). A modal whose only button dismisses
it passes `onClose={{ kind, onClick }}` instead: `"close"` for read-only
content, `"done"` when the modal applied edits live with no Save step. It
renders as the primary action; a lone button is never the outline Cancel.
`footer` is the left slot for non-action content. Menus: `MenuButton` for a
button that opens a menu, `ActionMenuButton` for the three-dots preset,
`showMenu` for context menus. Never hand-roll an overlay.

`StateHolderWrapper` renders no element of its own: its loading, error and ready
branches land directly in the slot it sits in and take the slot's inset. Where
the ready branch is flush in a `none` slot, `loadingAndErrorPad` insets the two
message blocks to match the content (`"md"` over a default `Table`), or
`spinner` centres an indicator instead. `LoadingIndicator` on its own takes the
same knob as `pad`.

A popover that can open inside an `openAlert` or `openComponent` modal must stop
Escape itself. `AlertProvider` closes the modal from a document-level `keydown`
listener, which the popover's own close watcher does not stop. Solid's
`onKeyDown` is no help: `keydown` is a delegated event, so that handler already
runs at the document. Put a native `on:keydown` on the panel and on its trigger
that calls `preventDefault` and `stopPropagation` on Escape, as the table column
filter (`tables/display_table/column_filter.tsx`) does.

### Tables (`tables/`)

```tsx
<Table
  columns={columns}   // TableColumn<T>[]: { key, header, sortable?, filterable?, searchable?, searchValue? }
  data={data()}
  keyField="id"
  itemLabel={{ one: t3(USER), other: t3(USERS) }} // PluralForms<string>, default "item" / "items"
  onRowClick={open}
  selectedKeys={selectedKeys}          // controlled selection (optional)
  setSelectedKeys={setSelectedKeys}
  bulkActions={bulkActions}
  toolbar={{ search: true, children: <Button onClick={add}>Add</Button> }}
/>

<TableFromCsv csv={csvData()} />
```

Sorting and per-column value filters via column config (`sortable`,
`filterable`), a built-in search, controlled multi-select with bulk actions, and
an `EmptyState` no-rows fallback. A filterable column gets a funnel button in
its header that lists the column's distinct values as check rows;
`defaultFilters` and `onFilterChange` persist the unchecked values.

**The frame** is the bordered, rounded box that holds the rows. It is the
element directly around the scroll box, not the Table's root. The scroll box
owns the sticky header and takes `maxHeight`, or the parent's definite height.

**The toolbar** is a row of fixed height above the rows. It renders when
`toolbar` is passed or `bulkActions` is non-empty, in one of two placements:

- **Floating** (the default): above the frame, outside its border, with no
  padding, background or border of its own, so its content starts and ends at
  the frame's outer edges. The space between it and the frame is stack spacing
  on the Table's root, sized by `toolbar.spy` (a `PadSize`, default `"md"`;
  `"none"` puts the toolbar against the frame).
- **Nested** (`toolbar={{ nested: true }}`): inside the frame, above the scroll
  box, with a background and a bottom border. Its horizontal padding is always
  the cells' (`paddingX`), so its content lines up with the first and last
  columns. Its vertical padding is sized by `toolbar.pad` (a `PadSize`, default
  `"md"`).

`spy` exists only on a floating toolbar and `pad` only on a nested one. The
floating toolbar has no inset, so it belongs in a padded parent: a `Table`
placed flush in a `none` slot (a `<Card pad="none">`, an unpadded Frame slot)
passes `nested`. That is the caller's job and the component does not check it.

Two groups. On the left, in order: the search field (`toolbar.search`, `true` or
`{ placeholder }`), then a text, then, while rows are selected, the bulk action
buttons with "Clear selection". On the right: `toolbar.children`. The field
comes first because the text changes width, and anything to the right of it
would move. The text has two faces. At rest it is the count ("12 users", or "5
of 12 users" while a search or a filter hides rows; `toolbar.count: false`
removes it). With rows selected it is the selection sentence ("Selected: 3
users"), and the bulk actions follow it directly, next to the text that just
changed. `toolbar.children` stay where they are in both faces: they are the
table's standing buttons and have nothing to do with the selection. The search
field stays mounted across the switch, and neither a search nor a selection
moves it. The row's height does not change either, so selecting a row does not
move the rows, as long as the left group fits on one line. When it does not, the
left group wraps, the bulk actions dropping under the field; the children never
wrap, shrink or move.

**Search.** The query is split on whitespace and every token must appear in the
row's search text, case- and accent-insensitively (`searchTokens`,
`matchesSearch` and `foldString` in `_000_utils`). A row's search text is the
table-level `searchValue(item)` when given; otherwise the text of every column
not marked `searchable: false`, joined by spaces, where a column's text is its
`searchValue(item)`, else its `filterValue(item)`, else the field as a string.
Columns search by default: a text no column shows (an id, a resolved label) goes
in a table-level `searchValue`. The search text is the Table's own state unless
`searchText` and `setSearchText` are passed together, which is how a field
outside the table (a `HeadingBar`'s) drives it, and how a search survives a
remount of the table: the Table's own text is lost when it remounts, so a parent
that remounts it holds the signal. Visible rows are `data` after the search and
the column filters; sort applies after. Select-all acts on the visible rows, and
a selected row hidden by the search or a filter stays selected. When nothing
matches, the Table says so and offers "Clear search", which also clears the
column filters; `noRowsMessage` is only for empty `data`.

**`itemLabel`** names what a row is, as `PluralForms<string>`. The count and the
selection sentence pick the form with `plural()`, and the sentence is worded so
that only the noun inflects.

**`SelectionActions`** is the selection sentence, the bulk action buttons and
"Clear selection" in one flex row with no border, background or padding, for a
screen that hosts its bulk actions in a fixed-height row of its own. The screen
controls selection, passes the Table no `bulkActions` and no `toolbar` (it then
shows checkboxes and no toolbar row), and swaps its ordinary buttons for the
actions:

```tsx
<HeadingBar heading={title}>
  <Show when={selectedKeys().size > 0} fallback={<Button onClick={add}>Add</Button>}>
    <SelectionActions
      items={selectedItems()}
      actions={bulkActions}
      itemLabel={itemLabel}
      onClear={() => setSelectedKeys(new Set())}
    />
  </Show>
</HeadingBar>
<Table data={rows()} columns={columns} keyField="id"
  selectedKeys={selectedKeys} setSelectedKeys={setSelectedKeys} />
```

Two matrix grids draw rows × columns with a sticky row-header column and share
the grid contract: `GridColumn { id, label, groupId? }`,
`GridColumnGroup { id, label }`, `GridRow { id, label }`, and
`cells[rowIndex][columnIndex]` aligned with `rows` and `columns`. `DataGrid`
draws numeric cells and sorts; `PresenceGrid` draws a swatch per boolean cell.
Each has an adapter that builds the contract from a source panther already
knows: `dataGridPropsFromTableData` from the canvas table's pivot, and
`presenceGridColumnsFromPeriods` from an inclusive range of month period ids
(months or quarters grouped by year, or ungrouped years, per the `PeriodType`).

```tsx
<PresenceGrid
  columns={columns} // GridColumn[]
  columnGroups={groups} // present: one header row of group labels
  rows={rows} // GridRow[]
  cells={cells()} // boolean[][], cells[rowIndex][columnIndex]
  cellWidth="fixed" // a 16px swatch; "stretch" fills the column
/>;
```

## CSS Public API

`_fixed.css` holds the `@theme` token block and the `ui-*` classes. Public
surface for app code:

- **Spacing/density** — `ui-pad`, `ui-pad-sm`, `ui-pad-lg`, `ui-pad-x`,
  `ui-pad-x-sm`, `ui-pad-x-lg`, `ui-pad-y`, `ui-pad-y-sm`, `ui-pad-y-lg`, and
  one-sided `ui-pad-{t,b,l,r}`, `-sm`, `-lg`, `ui-gap`, `ui-gap-sm`,
  `ui-gap-lg`, `ui-spy`, `ui-spy-sm`, `ui-spy-lg`; and the `ui-tablepad-*`
  family (`ui-tablepad-x-compact`, `-x-normal`, `-x-comfortable`, the same three
  for `-y-`, and `ui-tablepad-y-header`), which is the padding of `Table`'s
  cells and header row, one token per `paddingX` / `paddingY` value, so an app
  tunes table density by overriding the `--ui-tablepad-*` variables
- **Form density** — `ui-form-pad`, `ui-form-pad-sm`, `ui-form-text-size`,
  `ui-form-text-size-sm`, `ui-icon-only-correction`,
  `ui-icon-only-correction-sm`
- **State** — the `ui-hoverable-{token}` family (`base-100`, `base-200`,
  `base-300`, `base-content`, and the five intents), its outline sibling
  `ui-hoverable-outline-on-{token}`, `ui-hoverable-ghost`, and `ui-focusable`
- **Type** — three roles: body (14px, inherited from `body`, no class),
  `ui-text-caption` (12px, muted) and `ui-text-heading` (16px, bold); plus
  `ui-text-overline`, `ui-text-small`, `ui-form-text`, `ui-label`
- **Skins** — `ui-fill-{intent}`, `ui-outline-{intent}`, `ui-ghost-{intent}`,
  for building a control the kit doesn't provide

Every other `ui-*` class is internal and may change without notice.

Color tokens, the state doctrine, and theming:
**[DOC_UI_COLOR_AND_STATE.md](../../DOC_UI_COLOR_AND_STATE.md)**. App-facing
rules: `protocols/PROTOCOL_UI_STYLING.md`.

## Usage Example

```tsx
import {
  Button,
  Card,
  FrameLeft,
  HeadingBar,
  Input,
  Table,
} from "@timroberton/panther";

function MyApp() {
  const [name, setName] = createSignal("");

  return (
    <FrameLeft pad="md" spy="md" panelChildren={<Sidebar />}>
      <Input value={name()} onChange={setName} label="Name" />
      <Card header="Results" pad="none">
        <Table
          columns={columns}
          data={results()}
          keyField="id"
          toolbar={{ nested: true, search: true }}
        />
      </Card>
    </FrameLeft>
  );
}
```

## Module Dependencies

- `solid-js` — SolidJS framework
- `@solidjs/router` — routing
- `sortablejs` — drag-and-drop (vendored wrapper)
- Internal: lower-numbered panther modules, imported through `deps.ts` only
