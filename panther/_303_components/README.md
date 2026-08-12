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
integrated circle in marking-select mode. See
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
<ButtonGroup items={items} value={selected()} onChange={setSelected} />
<Slider min={0} max={100} value={value()} onChange={setValue} />
<Checkbox checked={checked()} onChange={setChecked} label="Enabled" />
<Checkbox checked={false} indeterminate onChange={...} label="Partial" />
<TextArea value={text()} onChange={setText} />
<FileInput value={file()} onChange={setFile} label="Data file" />
```

Complete form control library. Size via `size="sm"`, never ad-hoc classes.

### Layout (`layout/`)

```tsx
<FrameTop panelChildren={<HeadingBar heading="Rows" />}>{content}</FrameTop>
<FrameLeft panelChildren={<Sidebar />}>{content}</FrameLeft>
<TabsNavigation items={items} value={active()} onChange={setActive} vertical />
<CollapsibleSection header="Advanced">{content}</CollapsibleSection>
```

Frames: `FrameTop`, `FrameLeft`, `FrameRight`, `FrameBottom`, plus
`FrameLeftResizable`, `FrameRightResizable`, `FrameThreeColumnResizable`. Side
frames own their panel/content divider (never add that edge's border yourself).
Steppers: `StepperNavigation`, `StepperLabeledBreadcrumb`,
`StepperChipsWithTitles`, and friends.

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

const { openEditor, EditorWrapper } = getEditorWrapper();

<StateHolderWrapper state={query.state()}>
  {(data) => <Content data={data} />}
</StateHolderWrapper>;
```

Modals, editors, popover menus (`PopoverMenu`, `showMenu`), tooltips, and the
async-state container. Never hand-roll an overlay.

### Tables (`tables/`)

```tsx
<Table
  columns={columns}   // TableColumn<T>[]
  data={data()}
  keyField="id"
  onRowClick={open}
  selectedKeys={selectedKeys}          // controlled selection (optional)
  setSelectedKeys={setSelectedKeys}
  bulkActions={bulkActions}
/>

<TableFromCsv csv={csvData()} />
```

Sorting via column config, grouping, controlled multi-select with bulk actions,
and an `EmptyState` no-rows fallback.

## CSS Public API

`_fixed.css` holds the `@theme` token block and the `ui-*` classes. Public
surface for app code:

- **Spacing/density** — `ui-pad`, `ui-pad-sm`, `ui-pad-lg`, `ui-pad-x`,
  `ui-pad-x-sm`, `ui-pad-x-lg`, `ui-gap`, `ui-gap-sm`, `ui-gap-lg`, `ui-spy`,
  `ui-spy-sm`, `ui-spy-lg`
- **Form density** — `ui-form-pad`, `ui-form-pad-sm`, `ui-form-text-size`,
  `ui-form-text-size-sm`, `ui-icon-only-correction`,
  `ui-icon-only-correction-sm`
- **State** — the `ui-hoverable-{token}` family (`base-100`, `base-200`,
  `base-300`, `base-content`, and the five intents) and `ui-focusable`
- **Type** — `ui-text-display`, `ui-text-title`, `ui-text-heading`,
  `ui-text-overline`, `ui-text-caption`, `ui-text-small`, `ui-form-text`,
  `ui-label`
- **Skins** — `ui-fill-{intent}`, `ui-outline-{intent}`, for building a control
  the kit doesn't provide

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
  const [value, setValue] = createSignal("");

  return (
    <FrameLeft panelChildren={<Sidebar />}>
      <div class="ui-pad ui-spy">
        <Input
          value={value()}
          onChange={setValue}
          searchIcon
          placeholder="Search..."
        />
        <Card header="Results" pad="none">
          <Table columns={columns} data={results()} keyField="id" />
        </Card>
      </div>
    </FrameLeft>
  );
}
```

## Module Dependencies

- `solid-js` — SolidJS framework
- `@solidjs/router` — routing
- `sortablejs` — drag-and-drop (vendored wrapper)
- Internal: lower-numbered panther modules, imported through `deps.ts` only
