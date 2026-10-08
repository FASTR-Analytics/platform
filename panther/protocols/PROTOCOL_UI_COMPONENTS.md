# Protocol: UI Components

**Scope:** UI

How to use the panther component library in app code. For component
_declaration_ and reactivity rules see `PROTOCOL_UI_SOLIDJS.md`; for Tailwind
theme, `ui-*` utilities, sizing utilities, and sentence case see
`PROTOCOL_UI_STYLING.md`; for `createQuery` / `createAction*` /
`StateHolderWrapper` see `PROTOCOL_UI_STATE.md`.

## Rules

1. **Panther components first**: Never hand-roll a `Button`, `Input`, `Select`,
   `SelectV2`, `TextArea`, `Checkbox`, `RadioGroup`, table, or modal that
   panther provides. A dropdown is `Select` (native list, flat options),
   `SelectV2` (a styled list: headers, sublabels, icons, disabled rows, no
   search) or `SelectSearch` (a long list that needs search); never a hand-built
   menu.
2. **Compose, don't replace**: When panther lacks something, build on top of its
   components rather than reimplementing them.
3. **Custom only when justified**: Hand-write a component only when panther has
   no equivalent or the need is app-specific; even then, wrap panther parts.
4. **Tables use `Table`**: Define `columns: TableColumn<T>[]`; never build
   bespoke `<table>` markup for data.
5. **Modals/editors use the helpers**: Open dialogs via the editor/alert helpers
   (`getEditorWrapper` / `openEditor`, confirm/prompt/alert); never roll a
   custom overlay.
6. **Delete confirmations via `createDeleteAction`**: Don't wire a custom
   confirm modal for deletes (see `PROTOCOL_UI_STATE.md`).
7. **Size via the `size` prop**: Use `size="sm"` for small variants; resize
   globally with the `ui-form-*` utilities (see `PROTOCOL_UI_STYLING.md`). Never
   restyle a component with ad-hoc classes to change its size.
8. **Loading/error via `StateHolderWrapper`**: Render async data through it, not
   hand-written spinner/error branches (see `PROTOCOL_UI_STATE.md`).
9. **`data-*` goes on the component, not a wrapper**: `Button`, `Card`,
   `HeadingBar`, `CollapsibleSection`, `Field`, `Select`, `SelectV2`, `Input`,
   `TextArea`, `Slider`, `ButtonGroup`, `TabsNavigation`, `MenuButton`,
   `ActionMenuButton` and `CopyToClipboardButton` forward `data-*` attributes to
   their root element (`HeadingBar`'s `tabs` object also forwards its own to the
   tab strip); put tour anchors, test hooks and other DOM markers there instead
   of wrapping in a `<div data-*="...">`. `data-*` only: anything else (`class`,
   `style`, `id`, event handlers) is a real prop or needs a wrapper; it will NOT
   forward, by design. On every other component a `data-*` attribute compiles
   but is silently dropped (TypeScript exempts hyphenated JSX attribute names),
   so this list is the source of truth. Inside the kit, a component's own
   attributes are always written after `{...dataAttrs}`, so they win on a key
   collision.
10. **Horizontal `TabsNavigation` is placed, not wrapped**: as a `FrameTop`
    `panelChildren` or directly under a `HeadingBar`, pass it bare; it carries
    its own `ui-pad-x` and bottom border. Inside padded content pass `noPad`;
    `size="sm"` is a separate choice about weight, not placement. Never wrap the
    strip in a padding `<div>` (the one exception is `ui-pad-x` around a `noPad`
    strip, which is the same as `insetRail`), and never put a `Callout` or other
    content above a panel strip; a notice goes below the rail as the first block
    of content. A vertical `TabsNavigation` takes `inset`, which draws its items
    as rounded blocks set in from the panel's edges, the selected one filled, in
    place of full-width rows with a primary bar.
11. **A slot owns the space around its content and between its children, and a
    Frame slot owns scrolling. The slot knob comes first; a raw element is for
    what the slot cannot say**: choose the inset and the stack spacing once, on
    the container (`pad` / `spy` on a Frame's content slot, `panelPad` /
    `panelSpy` on its panel slot, `pad` / `spy` on `Card`, `ModalContainer` and
    `CollapsibleSection`), and everything rendered into the slot gets it, in
    every state. No padding `<div>` between a kit container and its content.
    What a slot cannot say stays a raw element on the `ui-pad-*` classes: an
    inset on one axis, a background that must fill the slot, a scroller a sticky
    header needs, and a padded stack inside a plain parent. The model is
    `DOC_CONTAINER_MODEL.md`.
12. **A table's search field is the table's**: `toolbar={{ search: true }}` on
    the `Table`. The one alternative is a `HeadingBar`'s field wired to the
    table's config (`searchText={config.state.searchText}`,
    `setSearchText={config.setSearchText}`, rule 14), for a page whose whole
    content is one table and whose only header is that bar. Never an `Input`
    beside a `Table`, and never a hand-built count or "no results" line: the
    toolbar shows "5 of 12 users" and the table has its own no-match state. The
    toolbar floats above the table's border by default, with no inset of its
    own. A table placed flush in an unpadded parent (a `<Card pad="none">`, a
    `none` slot) passes `toolbar={{ nested: true }}`, which puts it inside the
    border.
13. **A table's search text is declared on the table**: per column
    (`searchValue`, else `filterValue`, else the field; `searchable: false` to
    leave a column out), or as a table-level `searchValue` when the rows are
    searched by text no column shows. Never a memo in front of `data` that
    filters the rows before the `Table` sees them: it hides the total from the
    count and loses the "Clear search" state.
14. **A table's view state outlives its remounts in a `config`**: the sort, the
    column filters, the search text and the scroll position live in a
    `TableConfig` from `createTableConfig({ sort })`, passed as `config`. A
    `Table` inside a `StateHolderWrapper`, a `Show` or a tab takes a config
    created in the component that owns the query, above the wrapper: the wrapper
    creates its children again on every refetch, so a config created inside it,
    beside the `Table`, is lost with it. A config at module scope lasts the
    session. Read `config.state` anywhere; write only through its setters.

## Do / Don't

### Component selection

```tsx
// ❌ DON'T: hand-rolled equivalent of a panther component
<button
  class="rounded bg-primary px-3 py-2 text-primary-content"
  onClick={save}
>
  Save
</button>;

// ✅ DO
<Button intent="primary" onClick={save}>Save</Button>;
```

**Why:** Panther components centralize styling, sizing, and state integration,
so fixes and theme changes flow from one place to every app.

### Form inputs

```tsx
// ❌ DON'T: custom size styling / arbitrary classes
<Input class="px-1 py-0.5 text-xs" value={v()} onChange={setV} />;

// ✅ DO: use the size prop (and global ui-form-* utilities to resize app-wide)
<Input size="sm" value={v()} onChange={setV} />;
```

**Why:** `size` and the `ui-form-*` utilities keep every input consistent;
ad-hoc classes drift and break global resizing.

### Tables

```tsx
// ❌ DON'T: bespoke table markup
<table>
  <For each={rows()}>
    {(r) => (
      <tr>
        <td>{r.id}</td>
      </tr>
    )}
  </For>
</table>;

// ✅ DO: Table with typed columns
const columns: TableColumn<Row>[] = [
  {
    key: "id",
    header: t3({ en: "ID", fr: "ID" }),
    sortable: true,
    render: (item) => <span class="font-mono">{item.id}</span>,
  },
  {
    key: "status",
    header: t3({ en: "Status", fr: "Statut" }),
    filterable: true,
  },
];
<Table columns={columns} data={rows()} />;
```

**Why:** `Table` provides sorting, per-column filtering (`filterable` in the
column config), search, selection with bulk actions, and rendering consistently;
bespoke tables re-solve those and diverge.

```tsx
// ❌ DON'T: a search row in front of the table
const [search, setSearch] = createSignal("");
const shown = createMemo(() =>
  rows().filter((r) => r.name.toLowerCase().includes(search().toLowerCase()))
);
<div class="w-72">
  <Input value={search()} onChange={setSearch} searchIcon clearable fullWidth />
</div>
<Table
  columns={columns}
  data={shown()}
  keyField="id"
  noRowsMessage={search() ? t3(NO_MATCH) : t3(NO_ROWS)}
/>;

// ✅ DO: the table searches its own rows
<Table
  columns={columns}
  data={rows()}
  keyField="id"
  itemLabel={{ one: t3(USER), other: t3(USERS) }}
  toolbar={{ search: true, children: <Button onClick={add}>{t3(ADD)}</Button> }}
  noRowsMessage={t3(NO_ROWS)}
/>;
```

**Why:** the built-in search is accent-insensitive, matches every word of the
query, keeps the total in the count, and keeps the field in a row that does not
move when rows are selected. A hand-rolled one re-decides each of those per
screen.

While rows are selected the toolbar shows the selection sentence in place of the
count, with the `bulkActions` directly after it. `toolbar.children` stay on the
right throughout. A screen that wants its bulk actions in its `HeadingBar`
instead controls selection, passes the table no `bulkActions` and no `toolbar`,
and renders `SelectionActions` in the bar. `itemLabel` (`{ one, other }`) names
the rows in the count and the sentence.

### Modals & editors

```tsx
// ❌ DON'T: custom overlay
<Show when={open()}>
  <div class="fixed inset-0 bg-black/30">
    <div class="...">{form}</div>
  </div>
</Show>;

// ✅ DO: editor/alert helpers
const { openEditor, EditorWrapper } = getEditorWrapper();
await openEditor({ element: EditForm, props: { data, onSave } });
// and for destructive actions, createDeleteAction (see PROTOCOL_UI_STATE.md)
```

**Why:** The helpers centralize focus, dismissal, and lifecycle; custom overlays
duplicate that and miss edge cases. Dialogs stack, so a dialog opened from
inside another opens on top of it.

### Dialog footers

```tsx
// ❌ DON'T: a hand-built footer
<ModalContainer title="Copy" footer={[<Button onClick={save.click}>Save</Button>, <Button onClick={cancel}>Cancel</Button>]}>

// ✅ DO: declare the actions; the container places Cancel and the buttons
<ModalContainer
  title="Copy"
  form
  onCancel={() => p.close(undefined)}
  actions={[{ label: "Save", onClick: save.click, state: save.state(), disabled: !ok() }]}
>

// ❌ DON'T: a lone Done or Close as the outline Cancel button
<ModalContainer title="Preview" onCancel={close} cancelLabel="Close">

// ✅ DO: onClose renders it as the primary action
<ModalContainer title="Preview" onClose={{ kind: "close", onClick: close }}>
<ModalContainer title="Theme" onClose={{ kind: "done", onClick: close }}>
```

**Why:** the container decides button order and side (Cancel first, primary
last, right-aligned), Cancel's look, and the error line under the body, once.
`footer` is only for content that is not an action. A modal with a single button
has one obvious thing to do, so that button is primary: `"close"` for read-only
content, `"done"` when edits were applied live with no Save step. `cancelLabel`
is for a Cancel that needs another name ("Skip"), never for the only button.

### Containers and their content

```tsx
const catalogTable = createTableConfig();

// ❌ DON'T: a padding div between the container and its content; the loading
// and error states render outside it and do not line up with the table
<FrameTop panelChildren={<HeadingBar compact heading="Ops catalog" />}>
  <StateHolderWrapper state={entries.state()}>
    {(list) => (
      <div class="ui-pad">
        <Table
          config={catalogTable}
          data={list}
          columns={COLUMNS}
          keyField="name"
        />
      </div>
    )}
  </StateHolderWrapper>
</FrameTop>;

// ✅ DO: the slot carries the inset; all three states get it, and the table
// is the slot's direct child, so it scrolls inside itself with its header stuck
<FrameTop pad="md" panelChildren={<HeadingBar compact heading="Ops catalog" />}>
  <StateHolderWrapper state={entries.state()}>
    {(list) => (
      <Table
        config={catalogTable}
        data={list}
        columns={COLUMNS}
        keyField="name"
      />
    )}
  </StateHolderWrapper>
</FrameTop>;

// ✅ DO: a raw element for what the slot cannot say: an x-only inset around a
// sticky toolbar, which needs its own scroller to stick at the top edge
<FrameTop panelChildren={<HeadingBar compact heading="Rows" />}>
  <div class="ui-pad-x h-full w-full overflow-auto">
    <div class="sticky top-0 bg-base-100">{toolbar}</div>
    {rows}
  </div>
</FrameTop>;
```

**Why:** a wrapper div chooses the space for one state only, and the kit's
containers already own that space; a slot knob covers every branch the slot
renders. A one-axis inset and a sticky child's scroller are not in the slot
vocabulary, so they stay raw elements rather than growing the knobs.

### Menu triggers

```tsx
// ❌ DON'T: a wrapper span around a Button, or a hand-anchored showMenu
// ✅ DO
<MenuButton items={items} iconName="plus">Add slide</MenuButton>
<ActionMenuButton items={items} />       // three dots, bottom-end
showMenu({ anchor: rect, items })        // right-click / card context menus only
```

## Patterns

### Component catalog (prefer these)

- **Form:** `Button`, `Input`, `TextArea`, `Select`, `SelectV2`, `MultiSelect`,
  `Checkbox` (incl. `indeterminate`), `RadioGroup`, `Slider`, `ButtonGroup`,
  `FileInput`; `Field` around any control the kit does not label.
- **Layout:** `FrameTop`, `FrameLeft` / `FrameRight` (+ resizable variants),
  `HeadingBar`, `TabsNavigation`, `getStepper` + `StepperChipsWithTitles`,
  collapsible sections.
- **Display:** `Badge`, `Card`, `EmptyState`.
- **Data:** `Table` (sortable/filterable/searchable/selectable, with a toolbar),
  `SelectionActions`, `DataGrid`, `PresenceGrid`, `FigureHolder`, `PageHolder`.
- **State/feedback:** `StateHolderWrapper`, `StateHolderFormError`, editor/alert
  helpers, `ModalContainer` (with `actions` / `onCancel`), `MenuButton` /
  `ActionMenuButton`, loading/progress indicators.

### Standard data view

```tsx
const query = createQuery(
  () => serverActions.getRows(),
  t3({ en: "Loading…", fr: "Chargement…" }),
);
// Above the wrapper, which creates the Table again on every refetch (rule 14).
const rowsTable = createTableConfig();

<FrameTop
  pad="md"
  panelChildren={<HeadingBar heading={t3({ en: "Rows", fr: "Lignes" })} />}
>
  <StateHolderWrapper state={query.state()}>
    {(rows) => (
      <Table config={rowsTable} columns={columns} data={rows} keyField="id" />
    )}
  </StateHolderWrapper>
</FrameTop>;
```

(`createQuery` / `StateHolderWrapper` semantics: `PROTOCOL_UI_STATE.md`. Layout
spacing/classes: `PROTOCOL_UI_STYLING.md`. User-facing strings: `t3` /
`PROTOCOL_ALL_TRANSLATION.md`.)

### `HeadingBar`: every header bar, no exceptions

One component covers all of it: optional `heading` with inline `subheading`,
`onBack`, `leftChildren`, `tabs`, `centerLeftChildren`, `centerChildren`,
right-hand `children`, and a built-in search field via `searchText` /
`setSearchText`. Empty slots collapse, so the title gets the full width when
nothing else is present.

There are two header forms, each with one height, chosen by the call site:

- **Standard** (default): padding around a control-height floor, so a bar
  holding only a title is exactly as tall as one holding buttons.
- **`compact`**: exactly `--ui-heading-bar-compact-height` tall, content centred
  in it, whatever size its controls are (pair it with `size="sm"` controls). A
  panel `TabsNavigation` strip at full size is the same height, so a bare tab
  strip and a compact bar line up.

With no heading, back button, `leftChildren` or `tabs`, the centre group (search
and its neighbours) starts at the left edge, for pages whose title is already
shown by the navigation that opened them.

`tabs` (`{ items, value, onChange }`) puts a tab strip in the bar after the
heading, with the bar's bottom edge as its rail. It needs `compact` (the type
rejects it otherwise), so a header holding both tabs and controls is one bar,
not a `HeadingBar` over a `TabsNavigation`. A header that is only tabs stays a
bare `TabsNavigation`.

`tonal` is the only surface control, and it also decides the divider:

- **omitted** → flush: no background, draws `border-b`.
- **`tonal`** → the kit's one header surface, no divider. The tone change _is_
  the divider.

There is deliberately no way to pick _which_ tonal colour at a call site. The
surface is `--ui-heading-bar-tonal-bg` / `-content`, retuned once per app, so
"what does a tonal header look like?" has a single answer. The content colour is
the bar's text colour, and the `heading` wears it too.

```tsx
// ❌ DON'T: the hand-rolled bar this component exists to delete
<div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
  <Button iconName="chevronLeft" onClick={back} />
  <div class="font-700 flex-1 truncate text-xl">
    {title}
    <span class="font-400 ml-4">{subtitle}</span>
  </div>
  <div class="ui-gap-sm flex items-center">{actions}</div>
</div>

// ✅ DO
<HeadingBar tonal onBack={back} heading={title} subheading={subtitle}>
  <div class="ui-gap-sm flex items-center">{actions}</div>
</HeadingBar>
```

**Why:** the hand-rolled version drifts: every copy re-decides the surface, the
title type scale, and whether there's a divider. Four implementations of this
bar existed before it was consolidated.

Outline `Button`s placed in a `tonal` bar still declare their surface:
`onBackground="base-200"` (rule 6 in `PROTOCOL_UI_STYLING.md`).

## Checklist

- [ ] No hand-rolled equivalents of panther `Button`/`Input`/`Select`/etc.
- [ ] Data tables use `Table` with typed `TableColumn<T>[]`
- [ ] A table's search is `toolbar.search` (or the `HeadingBar` field wired to
      the table's config), its search text is declared on the table or its
      columns, and its rows are named by `itemLabel`
- [ ] A `Table` that a wrapper, `Show` or tab remounts takes a `config` created
      above that wrapper
- [ ] Dialogs use the editor/alert helpers; deletes use `createDeleteAction`
- [ ] Component sizing uses the `size` prop / `ui-form-*`, not ad-hoc classes
- [ ] Async data rendered through `StateHolderWrapper`
- [ ] No padding `<div>` between a kit container and its content: the inset and
      stack spacing are `pad` / `spy` on the slot
- [ ] Custom components only where panther has no equivalent, built on panther
      parts
