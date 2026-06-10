# Protocol: UI Components

**Scope:** UI

How to use the panther component library in app code. For component
_declaration_ and reactivity rules see `PROTOCOL_UI_SOLIDJS.md`; for Tailwind
theme, `ui-*` utilities, sizing utilities, and sentence case see
`PROTOCOL_UI_STYLING.md`; for `timQuery` / `timAction*` / `StateHolderWrapper`
see `PROTOCOL_UI_STATE.md`.

## Rules

1. **Panther components first** — Never hand-roll a `Button`, `Input`, `Select`,
   `TextArea`, `Checkbox`, `RadioGroup`, table, or modal that panther provides.
2. **Compose, don't replace** — When panther lacks something, build on top of
   its components rather than reimplementing them.
3. **Custom only when justified** — Hand-write a component only when panther has
   no equivalent or the need is app-specific; even then, wrap panther parts.
4. **Tables use `DisplayTable`** — Define `columns: TableColumn<T>[]`; never
   build bespoke `<table>` markup for data.
5. **Modals/editors use the helpers** — Open dialogs via the editor/alert
   helpers (`getEditorWrapper` / `openEditor`, confirm/prompt/alert); never roll
   a custom overlay.
6. **Delete confirmations via `timActionDelete`** — Don't wire a custom confirm
   modal for deletes (see `PROTOCOL_UI_STATE.md`).
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

// ✅ DO — DisplayTable with typed columns
const columns: TableColumn<Row>[] = [
  {
    key: "id",
    header: t3({ en: "ID", fr: "ID" }),
    sortable: true,
    render: (item) => <span class="font-mono">{item.id}</span>,
  },
];
<DisplayTable columns={columns} data={rows()} />;
```

**Why:** `DisplayTable` provides sorting/selection/rendering consistently;
bespoke tables re-solve those and diverge.

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
// and for destructive actions, timActionDelete (see PROTOCOL_UI_STATE.md)
```

**Why:** The helpers centralize focus, dismissal, and lifecycle; custom overlays
duplicate that and miss edge cases.

## Patterns

### Component catalog (prefer these)

- **Form:** `Button`, `Input`, `TextArea`, `Select`, `MultiSelect`, `Checkbox`,
  `RadioGroup`, `Slider`, `ButtonGroup`.
- **Layout:** `FrameTop` / `FrameSide`, `HeadingBar`, `Tabs`, `Stepper`,
  collapsible sections.
- **Data:** `DisplayTable` (sortable/selectable), `ChartHolder`, `PageHolder`.
- **State/feedback:** `StateHolderWrapper`, `StateHolderFormError`, editor/alert
  helpers, loading/progress indicators.

### Standard data view

```tsx
const query = timQuery(
  () => serverActions.getRows(),
  t3({ en: "Loading…", fr: "Chargement…" }),
);

<FrameTop
  panelChildren={<HeadingBar heading={t3({ en: "Rows", fr: "Lignes" })} />}
>
  <StateHolderWrapper state={query.state()} noPad>
    {(rows) => <DisplayTable columns={columns} data={rows} />}
  </StateHolderWrapper>
</FrameTop>;
```

(`timQuery` / `StateHolderWrapper` semantics: `PROTOCOL_UI_STATE.md`. Layout
spacing/classes: `PROTOCOL_UI_STYLING.md`. User-facing strings: `t3` /
`PROTOCOL_ALL_TRANSLATION.md`.)

## Checklist

- [ ] No hand-rolled equivalents of panther `Button`/`Input`/`Select`/etc.
- [ ] Data tables use `DisplayTable` with typed `TableColumn<T>[]`
- [ ] Dialogs use the editor/alert helpers; deletes use `timActionDelete`
- [ ] Component sizing uses the `size` prop / `ui-form-*`, not ad-hoc classes
- [ ] Async data rendered through `StateHolderWrapper`
- [ ] Custom components only where panther has no equivalent, built on panther
      parts
