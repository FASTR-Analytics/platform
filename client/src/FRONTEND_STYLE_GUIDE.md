# WB FASTR Frontend Code Style Guide

**Complementary to panther library documentation**

This guide provides specific coding patterns and conventions used throughout the WB FASTR client application. These instructions complement the panther UI library guides and ensure consistency with the existing codebase.

For detailed panther component usage and patterns, refer to the documentation within the panther library source code.

## Component Architecture & Organization

### File Naming & Structure

- Use **PascalCase** for component files (e.g., `WindowingSelector.tsx`, `ProjectData.tsx`)
- Use **underscore prefixes** for internal/private components (e.g., `_edit_indicator_common.tsx`, `_import_information.tsx`)
- Group related components by feature domain (e.g., `indicators/`, `project/`, `instance/`)
- Use `index.tsx` as the main component when a directory represents a single feature

### Component Function Declarations

```tsx
// ALWAYS use function declarations, never arrow functions for components
export function ComponentName(p: Props) {
  // Component body
}

// NOT: export const ComponentName = (p: Props) => { ... }
```

### Props Pattern

- Always use single-letter `p` for props parameter
- Define props type inline or as separate `Props` type
- Use generic constraints where needed: `<T extends BaseType>`

## Import Organization

### Preferred Import Order (not strictly enforced)

For consistency, prefer this order when convenient:

1. **Third-party libraries** (lib imports)
2. **UI library imports** (panther imports)
3. **SolidJS imports** (solid-js imports)
4. **Internal app imports** (`~/` prefixed paths)
5. **Relative imports** (`./` prefixed)

### Example

```tsx
import { t, type InstanceDetail } from "lib";
import { Button, StateHolderWrapper, timQuery } from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { EditForm } from "./EditForm";
```

**Note**: Import order is not critical - focus on functionality and readability over strict ordering.

## State Management Patterns

### Signal Naming

- Use descriptive names: `selectedOrgUnits`, `tempWindowing`, `needsSaving`
- Use `temp` prefix for form draft states
- Always initialize with sensible defaults

### Data Fetching Pattern

**Use `timQuery` (from panther) for automatic data fetching:**

- `timQuery` automatically fetches data when the component mounts
- It handles loading states, errors, and provides refetch capabilities
- Eliminates the need for manual `onMount` + `stateHolderQuery` patterns

```tsx
const dataQuery = timQuery(
  () => serverActions.getData(params),
  t("Loading message..."),
);
```

### Form Action Patterns

**Preferred: Use `timActionForm` (from panther) for form submissions:**

- `timActionForm` wraps your action function and handles all state management
- It automatically calls a `silentFetch` function after successful submission
- Returns an object with `.click()` method and `.state()` accessor
- Validation happens inside your action function by returning `{ success: false, err: "message" }`

```tsx
const save = timActionForm(
  async () => {
    const value = input().trim();
    if (!value) {
      return { success: false, err: t("Field is required") };
    }
    
    return serverActions.saveData({ value });
  },
  silentFetch, // This function gets called after successful save
);

// In JSX:
<Button onClick={save.click} state={save.state()}>
```

**For non-silent actions, use `timActionForm` (from panther):**

- Similar to `timActionForm` but calls a success callback instead of silent fetch
- Use when you need custom success handling rather than data refetching

```tsx
const save = timActionForm(
  async () => {
    if (!isValid()) {
      return { success: false, err: t("Validation error") };
    }
    return serverActions.saveData(formData);
  },
  onSuccess, // Custom success callback function
);
```

**For simple button actions, use `timActionButton` (from panther):**

- Use for actions that don't need form validation (like delete, refresh, etc.)
- Simpler than form actions since no validation is needed

```tsx
const deleteItem = timActionButton(
  () => serverActions.deleteItem({ id }),
  silentFetch,
);
```

## Form Handling Standards

### Validation Pattern

- Validate inside action functions (not before calling them)
- Return `{ success: false, err: "message" }` objects for validation failures
- Use early returns for validation failures
- The panther functions automatically handle displaying these errors

### Form State Management

- Use `needsSaving` signal to track unsaved changes
- **Always use panther's `tim*` wrapper functions instead of manual `stateHolder*` patterns**
- **Always use:** `timActionForm`, `timActionForm`, `timActionButton` from panther
- Validation and error handling happens automatically inside the wrapper functions

## Layout & Styling Conventions

### Container Patterns

```tsx
// Standard page layout
<FrameTop panelChildren={<HeadingBar heading="Title" />}>
  <div class="ui-pad ui-spy">
    {/* Content */}
  </div>
</FrameTop>

// Grid layouts - use 12-column system
<div class="ui-gap grid grid-cols-12">
  <div class="col-span-4">{/* ... */}</div>
  <div class="col-span-8">{/* ... */}</div>
</div>

// Responsive breakpoints
<div class="flex flex-col xl:grid xl:grid-cols-12">
```

### Spacing Consistency

- Use `ui-pad` for standard container padding
- Use `ui-spy` for vertical spacing between sections
- Use `ui-gap` for flex/grid gaps
- Add `-sm` suffix for smaller spacing variants

### Border & Background Patterns

```tsx
// Success/active state
<div class="border-success bg-success/10 rounded border">

// Neutral/inactive state  
<div class="border-base-300 rounded border">

// Input containers
<div class="ui-pad border-base-300 rounded border">
```

## SolidJS Control Flow

### Always use SolidJS control flow components

```tsx
// Use Show for conditional rendering
<Show when={condition} fallback={<Alternative />}>
  <Content />
</Show>

// Use Switch/Match for multiple conditions
<Switch>
  <Match when={condition1} keyed>{(value) => <Component1 />}</Match>
  <Match when={condition2} keyed>{(value) => <Component2 />}</Match>
  <Match when={true}>{/* fallback */}</Match>
</Switch>

// Use For for lists
<For each={items()}>
  {(item, index) => <ItemComponent item={item} />}
</For>
```

## Error Handling & Loading States

### StateHolderWrapper Pattern

```tsx
<StateHolderWrapper state={query.state()} noPad>
  {(data) => (
    <div class="ui-spy">
      {/* Render with data */}
    </div>
  )}
</StateHolderWrapper>
```

### Form Error Display

```tsx
<StateHolderFormError state={saving()} />
```

## Action Patterns

### Button Actions

```tsx
// For async actions with loading states
const actionHandler = timActionButton(
  () => serverActions.doSomething(params),
  refreshCallback,
);

<Button
  onClick={actionHandler.click}
  state={actionHandler.state()}
  iconName="icon"
>
  {t("Action")}
</Button>
```

### Delete Confirmations

**Use `timActionDelete` (from panther) for delete actions with confirmation and silent fetch:**

```tsx
const deleteAction = timActionDelete(
  {
    text: t("Confirmation message"),
    itemList: [item.name],
  },
  () => serverActions.deleteItem({ id: item.id }),
  refreshCallback,
);

await deleteAction.click();
```

**For delete actions without silent fetch, use `timActionDelete` (from panther):**

```tsx
const deleteAction = timActionDelete(
  t("Are you sure you want to delete this item?"),
  () => serverActions.deleteItem({ id: item.id }),
  onSuccess,
);

await deleteAction.click();
```

## Table Configuration

### Table Columns

```tsx
const columns: TableColumn<DataType>[] = [
  {
    key: "id",
    header: t("ID"),
    sortable: true,
    render: (item) => <span class="font-mono">{item.id}</span>,
  },
  {
    key: "actions",
    header: "",
    align: "right",
    render: (item) => (
      <div class="ui-gap-sm flex justify-end">
        <Button iconName="pencil" intent="base-100" />
      </div>
    ),
  },
];
```

## Editor/Modal Patterns

### Editor Wrapper

```tsx
const { openEditor, EditorWrapper } = getEditorWrapper();

// Usage
<EditorWrapper>
  <Component />
</EditorWrapper>

// Opening editor
await openEditor({
  element: EditForm,
  props: { data, onSave: callback },
});
```

## Internationalization

### Translation Usage

- Always wrap user-facing strings in `t()` function
- Use descriptive keys when needed: `t("Loading data...")`
- For form validation: `t("Field is required")`

## Type Safety

### Generic Component Patterns

```tsx
function Component<T extends BaseType>(p: Props<T>) {
  // Type-safe component logic
}
```

### API Response Handling

- Always check `success` property on API responses
- Use appropriate typing from lib exports

## Performance Patterns

### Memo Usage

```tsx
const computedValue = createMemo(() => {
  // Expensive computation based on signals
  return processData(sourceData());
});
```

### Batch Updates

```tsx
batch(() => {
  setField1(value1);
  setField2(value2);
  setField3(value3);
});
```

## Code Organization Rules

1. **Never use arrow functions for component definitions**
2. **Always use `p` for props parameter**
3. **Use underscore prefixes for internal components**
4. **Maintain consistent signal naming conventions**
5. **Follow established folder structure patterns**
6. **Use panther components over custom implementations**
7. **Implement proper error boundaries with StateHolderWrapper**
8. **Always provide loading states for async operations**
9. **Use semantic color classes, never custom colors**

---

These patterns ensure consistency with the existing WB FASTR codebase while maintaining high-quality, type-safe, and maintainable code standards.
