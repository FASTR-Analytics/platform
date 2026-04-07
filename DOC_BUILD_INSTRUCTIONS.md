# Building UI Features in WB-FASTR

Step-by-step instructions for building new UI features that conform to the
wb-fastr design system. This document is prescriptive: follow these rules
exactly to produce consistent UI.

**Prerequisites**: Read these documents first:
- `panther/FRONTEND_STYLE_GUIDE.md` — component APIs, SolidJS patterns, coding conventions
- `DESIGN_SYSTEM.md` — color palette, spacing tokens, layout patterns, visual vocabulary

---

## Decision Checklist

Before writing any code, answer these questions:

1. **Does panther already have a component for this?** Check panther's exports
   before building anything custom. If panther has it, use it.
2. **Which layout pattern does this page use?** Match to Pattern A–E in
   `DESIGN_SYSTEM.md`. Don't invent new layout structures.
3. **What intent colors apply?** Map every colored element to a semantic intent
   (`primary`, `danger`, `success`, `neutral`) or base token. Never pick colors
   for aesthetic reasons.
4. **What spacing tokens apply?** Use `ui-*` utilities. If none fit, use
   Tailwind scale values. Never use arbitrary values.

---

## Building a New Page

### Step 1: Choose the Layout Pattern

Pick the pattern from `DESIGN_SYSTEM.md` that best fits your page:

| Page Type                         | Pattern   | Frame Structure                    |
|-----------------------------------|-----------|------------------------------------|
| Simple content/settings           | Pattern A | `FrameTop` + scrollable content    |
| Multi-tab with sidebar navigation | Pattern B | `FrameTop` + `FrameLeft` + tabs    |
| List with grouping/filtering      | Pattern C | `FrameTop` + `FrameLeftResizable`  |
| Complex editor                    | Pattern D | `FrameTop` + resizable panels      |
| Two-column comparison             | Pattern E | `div.flex` with two halves         |

### Step 2: Create the Component File

```tsx
// client/src/components/{feature}/index.tsx
import { Button, FrameTop, HeadingBar, StateHolderWrapper, timQuery } from "panther";
import { For, Show } from "solid-js";
import { t3 } from "~/translation";

type Props = {
  // Define props
};

export function FeaturePage(p: Props) {
  // 1. Data fetching
  const data = timQuery(
    () => serverActions.getFeatureData(p.id),
    t3({ en: "Loading...", fr: "Chargement..." }),
  );

  // 2. Local UI state
  const [searchText, setSearchText] = createSignal("");

  // 3. Render
  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          heading={t3({ en: "Feature name", fr: "Nom de la fonctionnalité" })}
          searchText={searchText()}
          setSearchText={setSearchText}
        >
          <div class="flex items-center ui-gap-sm">
            <Button iconName="plus">{t3({ en: "Create", fr: "Créer" })}</Button>
          </div>
        </HeadingBar>
      }
    >
      <StateHolderWrapper state={data.state()} noPad>
        {(d) => (
          <div class="ui-pad ui-spy">
            {/* Page content here */}
          </div>
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}
```

### Step 3: Wire Up Routing

Add the component as a tab or route match in the parent page's `Switch`/`Match` block.

---

## Building a List/Grid View

### Card Grid

```tsx
<div class="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] ui-gap ui-pad">
  <For each={filteredItems()} fallback={
    <div class="text-neutral text-sm">
      {searchText().length >= 3
        ? t3({ en: "No matching items", fr: "Aucun élément correspondant" })
        : t3({ en: "No items", fr: "Aucun élément" })}
    </div>
  }>
    {(item) => (
      <div
        class="ui-pad ui-hoverable border-base-300 rounded border cursor-pointer"
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

**Rules:**
- Grid uses `minmax(15rem, 1fr)` for responsive auto-fill.
- Cards use `ui-pad` + `border-base-300` + `rounded` + `ui-hoverable`.
- Card title is `font-700`, description is `text-neutral text-sm`.
- Empty state is `text-neutral text-sm` with search-aware messaging.

### Adding Selection to Cards

If cards need multi-select, add `group` class to the card and a selection circle:

```tsx
<div class="... group relative" classList={{ "border-primary": isSelected(item.id) }}>
  {/* Selection circle - top right */}
  <div
    class="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-base-300 opacity-0 group-hover:opacity-100"
    classList={{ "bg-primary text-primary-content border-primary opacity-100": isSelected(item.id) }}
    onClick={(e) => { e.stopPropagation(); toggleSelect(item.id, e); }}
  >
    <Show when={isSelected(item.id)}>
      {/* Checkmark SVG */}
    </Show>
  </div>
  {/* Card content */}
</div>
```

### List with Borders (non-grid)

```tsx
<div>
  <For each={items()}>
    {(item) => (
      <div class="border-base-300 flex items-center gap-2 border-b px-3 py-2 last:border-b-0">
        <div class="flex-1 truncate">{item.label}</div>
        <Button size="sm" iconName="pencil" intent="neutral" outline />
      </div>
    )}
  </For>
</div>
```

---

## Building a Sidebar Panel

### Grouping/Filter Sidebar

Used when a list view needs category filtering.

```tsx
<FrameLeftResizable
  startingWidth={180}
  minWidth={170}
  maxWidth={300}
  panelChildren={
    <div class="border-base-300 flex h-full w-full flex-col border-r">
      <div class="border-base-300 border-b p-3">
        <Select
          label={t3({ en: "Group by", fr: "Grouper par" })}
          value={groupMode()}
          onChange={setGroupMode}
          options={groupOptions}
        />
      </div>
      <div class="flex-1 overflow-auto p-2">
        <SelectList
          items={groups()}
          selectedKey={selectedGroup()}
          onSelect={setSelectedGroup}
          renderItem={renderGroupOption}
        />
      </div>
    </div>
  }
>
  {/* Main content grid */}
</FrameLeftResizable>
```

**Rules:**
- Sidebar container: `border-r border-base-300`, full height.
- Top section (controls): `border-b border-base-300 p-3`.
- Bottom section (list): `flex-1 overflow-auto p-2`.
- Use `FrameLeftResizable` with sensible width bounds.

---

## Building a Form/Editor

### Modal Form

```tsx
import { AlertFormHolder, Input, TextArea, timActionForm } from "panther";

type Props = {
  close: (result?: any) => void;
  silentFetch: () => void;
};

export function EditItemForm(p: Props) {
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");

  const save = timActionForm(
    async () => {
      const n = name().trim();
      if (!n) {
        return { success: false, err: t3({ en: "Name is required", fr: "Le nom est requis" }) };
      }
      return serverActions.createItem({ name: n, description: description() });
    },
    p.silentFetch,
  );

  return (
    <AlertFormHolder
      heading={t3({ en: "Create item", fr: "Créer un élément" })}
      saveLabel={t3({ en: "Create", fr: "Créer" })}
      onSave={save.click}
      onCancel={() => p.close()}
      state={save.state()}
    >
      <div class="ui-spy-sm">
        <Input
          label={t3({ en: "Name", fr: "Nom" })}
          value={name()}
          onChange={setName}
          autoFocus
        />
        <TextArea
          label={t3({ en: "Description", fr: "Description" })}
          value={description()}
          onChange={setDescription}
        />
      </div>
    </AlertFormHolder>
  );
}
```

**Rules:**
- Use `AlertFormHolder` for modal forms (provides header, save/cancel buttons, error display).
- Use `timActionForm` for save actions (handles loading state and validation).
- Validate inside the action function, return `{ success: false, err: "..." }`.
- Fields spaced with `ui-spy-sm`.
- Use `autoFocus` on the first input.

### Settings Panel

```tsx
import { SettingsSection, Input, Checkbox } from "panther";

<div class="ui-pad ui-spy">
  <SettingsSection heading={t3({ en: "General", fr: "Général" })}>
    <div class="ui-spy-sm">
      <Input label={t3({ en: "Name", fr: "Nom" })} value={name()} onChange={setName} />
      <Checkbox label={t3({ en: "Enable feature", fr: "Activer la fonctionnalité" })} ... />
    </div>
  </SettingsSection>

  <SettingsSection heading={t3({ en: "Advanced", fr: "Avancé" })}>
    <div class="ui-spy-sm">
      {/* More fields */}
    </div>
  </SettingsSection>
</div>
```

**Rules:**
- Wrap related fields in `SettingsSection` with a heading.
- Space sections with `ui-spy` (outer), fields with `ui-spy-sm` (inner).
- Outer container uses `ui-pad ui-spy`.

---

## Building Action Buttons

### Primary Action

```tsx
<Button iconName="plus" onClick={handleCreate}>
  {t3({ en: "Create", fr: "Créer" })}
</Button>
```

### Secondary/Cancel Action

```tsx
<Button intent="neutral" outline onClick={handleCancel}>
  {t3({ en: "Cancel", fr: "Annuler" })}
</Button>
```

### Destructive Action

```tsx
const deleteAction = timActionDelete(
  { text: t3({ en: "Delete this item?", fr: "Supprimer cet élément ?" }), itemList: [item.name] },
  () => serverActions.deleteItem({ id: item.id }),
  silentFetch,
);

<Button iconName="trash" intent="danger" outline onClick={deleteAction.click} state={deleteAction.state()}>
  {t3({ en: "Delete", fr: "Supprimer" })}
</Button>
```

### Async Action Button

```tsx
const action = timActionButton(
  () => serverActions.doSomething(params),
  silentFetch,
);

<Button onClick={action.click} state={action.state()} iconName="refresh">
  {t3({ en: "Refresh", fr: "Actualiser" })}
</Button>
```

### Button Groups (in toolbars)

```tsx
<div class="flex items-center ui-gap-sm">
  <Button iconName="upload" intent="neutral" outline>{t3({ en: "Upload", fr: "Télécharger" })}</Button>
  <Button iconName="plus">{t3({ en: "Create", fr: "Créer" })}</Button>
</div>
```

**Rules:**
- Primary action: default intent (teal), no `outline`.
- Secondary action: `intent="neutral"` + `outline`.
- Destructive action: `intent="danger"` + `outline`. Always use `timActionDelete` with confirmation.
- Async actions: pass `state={action.state()}` to show loading spinner.
- Button groups: wrap in `div.flex.items-center.ui-gap-sm`.

---

## Building Status Indicators

### Status Badge

```tsx
function StatusBadge(p: { status: string }) {
  const intent = () => {
    switch (p.status) {
      case "ready": return "success";
      case "error": return "danger";
      default: return "neutral";
    }
  };

  return (
    <div
      class="inline-flex items-center rounded border border-[currentColor] px-3 py-1.5 text-sm leading-none"
      data-intent={intent()}
      data-outline={true}
      classList={{ "ui-running": p.status === "running" }}
    >
      {statusLabel(p.status)}
    </div>
  );
}
```

### Tinted Container (conditional status)

```tsx
<div
  class="rounded border ui-pad"
  classList={{
    "border-success bg-success/10": isActive(),
    "border-base-300": !isActive(),
  }}
>
  {/* Content */}
</div>
```

---

## Building a Context Menu

```tsx
function handleContextMenu(e: MouseEvent, item: Item) {
  e.preventDefault();
  showMenu({
    x: e.clientX,
    y: e.clientY,
    items: [
      { label: t3({ en: "Edit", fr: "Modifier" }), icon: "pencil", onClick: () => editItem(item.id) },
      { label: t3({ en: "Duplicate", fr: "Dupliquer" }), icon: "copy", onClick: () => duplicateItem(item.id) },
      { label: t3({ en: "Delete", fr: "Supprimer" }), icon: "trash", intent: "danger", onClick: () => deleteItem(item.id) },
    ],
  });
}

// Attach to element:
<div onContextMenu={(e) => handleContextMenu(e, item)}>
```

**Rules:**
- Delete actions always use `intent: "danger"`.
- Delete should be the last menu item.
- Use standard icon names (see `DESIGN_SYSTEM.md`).

---

## Adding Search/Filtering

### In a HeadingBar

```tsx
const [searchText, setSearchText] = createSignal("");

const filteredItems = createMemo(() => {
  const s = searchText().toLowerCase();
  const items = allItems(); // access reactive dep first
  if (s.length < 3) return items;
  return items.filter((item) => item.label.toLowerCase().includes(s));
});

<HeadingBar
  heading={t3({ en: "Items", fr: "Éléments" })}
  searchText={searchText()}
  setSearchText={setSearchText}
/>
```

**Rules:**
- Search triggers at 3+ characters (show all items below that).
- Access all reactive dependencies before conditional logic in `createMemo`.
- HeadingBar has built-in search input rendering.

---

## Handling Responsive Layout

The primary breakpoint is `xl` (1280px). Use it to switch between compact and
full layouts:

```tsx
// Compact on small screens
<div class="flex xl:hidden">
  <ButtonGroup itemWidth="50px" /> {/* Icons only */}
</div>

// Full on large screens
<div class="hidden xl:flex">
  <ButtonGroup itemWidth="115px" /> {/* With labels */}
</div>
```

For sidebar navigation, use `collapsible` and `collapsed` props on `TabsNavigation`.

---

## Internationalization

Every user-facing string must be wrapped in `t3()`:

```tsx
t3({ en: "English text", fr: "French text" })
```

**Rules:**
- Sentence case: `"Save changes"`, not `"Save Changes"`.
- Validation messages: `t3({ en: "Name is required", fr: "Le nom est requis" })`.
- Loading messages: `t3({ en: "Loading...", fr: "Chargement..." })`.
- Empty states: `t3({ en: "No items", fr: "Aucun élément" })`.

---

## Checklist: Before Submitting

- [ ] All colors use semantic tokens (no hex values in components)
- [ ] All spacing uses `ui-*` utilities or Tailwind scale (no arbitrary values)
- [ ] All text wrapped in `t3()` with both `en` and `fr`
- [ ] All text in sentence case
- [ ] All async actions use `timActionForm`/`timActionButton`/`timActionDelete`
- [ ] All data loading uses `timQuery` + `StateHolderWrapper`
- [ ] No conditional returns in components (use `<Show>` instead)
- [ ] All reactive dependencies accessed before conditionals in effects/memos
- [ ] Components use `function` declarations with `p` for props
- [ ] Destructive actions have confirmation dialogs
- [ ] Empty states are handled with appropriate messaging
- [ ] Layout uses panther Frame components (not custom wrappers)
- [ ] No modifications to panther library files
