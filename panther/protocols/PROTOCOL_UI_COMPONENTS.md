# Protocol: UI Components

**Scope:** UI

How to use the panther component library in app code. For component
_declaration_ and reactivity rules see `PROTOCOL_UI_SOLIDJS.md`; for Tailwind
theme, `ui-*` utilities, sizing utilities, and sentence case see
`PROTOCOL_UI_STYLING.md`; for `createQuery` / `createAction*` /
`StateHolderWrapper` see `PROTOCOL_UI_STATE.md`.

## Rules

1. **Panther components first** — Never hand-roll a `Button`, `Input`, `Select`,
   `TextArea`, `Checkbox`, `RadioGroup`, table, or modal that panther provides.
2. **Compose, don't replace** — When panther lacks something, build on top of
   its components rather than reimplementing them.
3. **Custom only when justified** — Hand-write a component only when panther has
   no equivalent or the need is app-specific; even then, wrap panther parts.
4. **Tables use `Table`** — Define `columns: TableColumn<T>[]`; never build
   bespoke `<table>` markup for data.
5. **Modals/editors use the helpers** — Open dialogs via the editor/alert
   helpers (`getEditorWrapper` / `openEditor`, confirm/prompt/alert); never roll
   a custom overlay.
6. **Delete confirmations via `createDeleteAction`** — Don't wire a custom
   confirm modal for deletes (see `PROTOCOL_UI_STATE.md`).
7. **Size via the `size` prop** — Use `size="sm"` for small variants; resize
   globally with the `ui-form-*` utilities (see `PROTOCOL_UI_STYLING.md`). Never
   restyle a component with ad-hoc classes to change its size.
8. **Loading/error via `StateHolderWrapper`** — Render async data through it,
   not hand-written spinner/error branches (see `PROTOCOL_UI_STATE.md`).

## Do / Don't

### Component selection

```tsx
// ❌ DON'T — hand-rolled equivalent of a panther component
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
// ❌ DON'T — custom size styling / arbitrary classes
<Input class="px-1 py-0.5 text-xs" value={v()} onChange={setV} />;

// ✅ DO — use the size prop (and global ui-form-* utilities to resize app-wide)
<Input size="sm" value={v()} onChange={setV} />;
```

**Why:** `size` and the `ui-form-*` utilities keep every input consistent;
ad-hoc classes drift and break global resizing.

### Tables

```tsx
// ❌ DON'T — bespoke table markup
<table>
  <For each={rows()}>
    {(r) => (
      <tr>
        <td>{r.id}</td>
      </tr>
    )}
  </For>
</table>;

// ✅ DO — Table with typed columns
const columns: TableColumn<Row>[] = [
  {
    key: "id",
    header: t3({ en: "ID", fr: "ID" }),
    sortable: true,
    render: (item) => <span class="font-mono">{item.id}</span>,
  },
];
<Table columns={columns} data={rows()} />;
```

**Why:** `Table` provides sorting/selection/rendering consistently; bespoke
tables re-solve those and diverge.

### Modals & editors

```tsx
// ❌ DON'T — custom overlay
<Show when={open()}>
  <div class="fixed inset-0 bg-black/30">
    <div class="...">{form}</div>
  </div>
</Show>;

// ✅ DO — editor/alert helpers
const { openEditor, EditorWrapper } = getEditorWrapper();
await openEditor({ element: EditForm, props: { data, onSave } });
// and for destructive actions, createDeleteAction (see PROTOCOL_UI_STATE.md)
```

**Why:** The helpers centralize focus, dismissal, and lifecycle; custom overlays
duplicate that and miss edge cases.

## Patterns

### Component catalog (prefer these)

- **Form:** `Button`, `Input`, `TextArea`, `Select`, `MultiSelect`, `Checkbox`
  (incl. `indeterminate`), `RadioGroup`, `Slider`, `ButtonGroup`, `FileInput`.
- **Layout:** `FrameTop`, `FrameLeft` / `FrameRight` / `FrameBottom` (+
  resizable variants), `HeadingBar`, `Tabs`, `Stepper`, collapsible sections.
- **Display:** `Badge`, `Card`, `EmptyState`.
- **Data:** `Table` (sortable/selectable), `FigureHolder`, `PageHolder`.
- **State/feedback:** `StateHolderWrapper`, `StateHolderFormError`, editor/alert
  helpers, loading/progress indicators.

### Standard data view

```tsx
const query = createQuery(
  () => serverActions.getRows(),
  t3({ en: "Loading…", fr: "Chargement…" }),
);

<FrameTop
  panelChildren={<HeadingBar heading={t3({ en: "Rows", fr: "Lignes" })} />}
>
  <StateHolderWrapper state={query.state()} noPad>
    {(rows) => <Table columns={columns} data={rows} />}
  </StateHolderWrapper>
</FrameTop>;
```

(`createQuery` / `StateHolderWrapper` semantics: `PROTOCOL_UI_STATE.md`. Layout
spacing/classes: `PROTOCOL_UI_STYLING.md`. User-facing strings: `t3` /
`PROTOCOL_ALL_TRANSLATION.md`.)

### `HeadingBar` — every header bar, no exceptions

One component covers all of it: `heading`, optional inline `subheading`,
`onBack`, `leftChildren`, `centerChildren`, right-hand `children`, and a
built-in search field via `searchText` / `setSearchText`. Empty slots collapse,
so the title gets the full width when nothing else is present, and the bar's
height floor is a control's height — a bar holding only a title is exactly as
tall as one holding buttons.

`tonal` is the only surface control, and it also decides the divider:

- **omitted** → flush: no background, draws `border-b`.
- **`tonal`** → the kit's one header surface, no divider. The tone change _is_
  the divider.

There is deliberately no way to pick _which_ tonal colour at a call site. The
surface is `--ui-heading-bar-tonal-bg` / `-fg`, retuned once per app, so "what
does a tonal header look like?" has a single answer.

```tsx
// ❌ DON'T — the hand-rolled bar this component exists to delete
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

**Why:** the hand-rolled version drifts — every copy re-decides the surface, the
title type scale, and whether there's a divider. Four implementations of this
bar existed before it was consolidated.

Outline `Button`s placed in a `tonal` bar still declare their surface:
`onBackground="base-200"` (rule 6 in `PROTOCOL_UI_STYLING.md`).

## Checklist

- [ ] No hand-rolled equivalents of panther `Button`/`Input`/`Select`/etc.
- [ ] Data tables use `Table` with typed `TableColumn<T>[]`
- [ ] Dialogs use the editor/alert helpers; deletes use `createDeleteAction`
- [ ] Component sizing uses the `size` prop / `ui-form-*`, not ad-hoc classes
- [ ] Async data rendered through `StateHolderWrapper`
- [ ] Custom components only where panther has no equivalent, built on panther
      parts
