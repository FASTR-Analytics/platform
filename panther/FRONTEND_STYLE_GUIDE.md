# Panther UI Frontend Code Style Guide

**Complementary to panther library documentation**

This guide provides coding patterns and conventions for building SolidJS
applications with Panther UI components. These instructions complement the
panther UI library documentation and provide recommended patterns for
consistency and maintainability.

**Core principle: Always prefer Panther components and utilities over custom
implementations.** Panther provides a comprehensive set of battle-tested
components, form utilities, state management helpers, and Tailwind CSS classes
that ensure consistency and reduce maintenance burden.

For detailed panther component usage and API references, refer to the
documentation within the panther library source code.

## Component Architecture & Organization

### File Naming & Structure

- Use **PascalCase** for component files (e.g., `DataTable.tsx`,
  `UserProfile.tsx`)
- Use **underscore prefixes** for internal/private components (e.g.,
  `_internal_component.tsx`, `_helper_form.tsx`)
- Group related components by feature domain (e.g., `dashboard/`, `settings/`,
  `users/`)
- Use `index.tsx` as the main component when a directory represents a single
  feature

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

## Using Panther Components

### Component Library

**Always use Panther components instead of building custom alternatives.**
Panther provides:

- **Form components**: Button, Input, TextArea, Select, Checkbox, RadioGroup,
  Slider, etc.
- **Layout components**: FrameTop, FrameSide, HeadingBar, Tabs, Stepper,
  Collapsible sections
- **State wrappers**: StateHolderWrapper, StateHolderFormError,
  GenericEditorWrapper
- **Data display**: DisplayTable with sorting/filtering/pagination, ChartHolder,
  PageHolder
- **Special components**: Alert dialogs, confirm/prompt modals, loading
  indicators, progress bars

### Component Benefits

Using Panther components ensures:

- **Consistent styling**: All components use the same Tailwind theme variables
- **Accessibility**: Built-in ARIA attributes and keyboard navigation
- **Type safety**: Full TypeScript support with proper generics
- **State management**: Integrated with Panther's state utilities
- **Maintenance**: Updates and bug fixes flow automatically from the library

### When to Use Custom Components

Only create custom components when:

- Panther doesn't provide the specific functionality needed
- The component is highly domain-specific to your application
- You need to compose Panther components in a unique way for your use case

Even then, build on top of Panther components rather than replacing them.

## Import Organization

### Preferred Import Order (not strictly enforced)

For consistency, prefer this order when convenient:

1. **Third-party libraries** (external lib imports)
2. **UI library imports** (panther imports)
3. **SolidJS imports** (solid-js imports)
4. **Internal app imports** (app-prefixed paths)
5. **Relative imports** (`./` prefixed)

### Example

```tsx
import { apiClient, type UserData } from "lib";
import { Button, StateHolderWrapper, timQuery } from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { EditForm } from "./EditForm";
```

**Note**: Import order is not critical - focus on functionality and readability
over strict ordering.

## State Management Patterns

### Signal Naming

- Use descriptive names: `selectedItems`, `tempFormData`, `needsSaving`
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
- Validation happens inside your action function by returning
  `{ success: false, err: "message" }`

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

- Similar to `timActionForm` but calls a success callback instead of silent
  fetch
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
- **Always use panther's `tim*` wrapper functions instead of manual
  `stateHolder*` patterns**
- **Always use:** `timActionForm`, `timActionForm`, `timActionButton` from
  panther
- Validation and error handling happens automatically inside the wrapper
  functions

## Layout & Styling Conventions

### Panther CSS System

**Use only Tailwind classes defined in Panther's theme configuration.** Panther
defines a complete Tailwind v4 theme with:

- **Semantic color system**: `base-*`, `primary`, `neutral`, `success`, `danger`
  (with `-content` variants)
- **Public spacing utilities**: `ui-pad`, `ui-pad-sm`, `ui-gap`, `ui-gap-sm`,
  `ui-spy`, `ui-spy-sm`
- **Interaction utilities**: `ui-hoverable` for consistent hover/active states
- **Standard Tailwind**: Full access to Tailwind's utility classes (flex, grid,
  text, etc.)

**Never use custom colors or spacing values.** Always use the semantic theme
variables to ensure:

- Consistent visual design across your application
- Easy theme customization through Tailwind configuration
- Proper light/dark mode support (if implemented)
- Maintainability as your application grows

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
</StateHolderWrapper>;
```

### Form Error Display

```tsx
<StateHolderFormError state={saving()} />;
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
</Button>;
```

### Delete Confirmations

**Use `timActionDelete` (from panther) for delete actions with confirmation and
silent fetch:**

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

**For delete actions without silent fetch, use `timActionDelete` (from
panther):**

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
</EditorWrapper>;

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

### Text Casing

- **Use Sentence case for all UI text** (headings, buttons, labels, etc.)
- **Do NOT use Title Case**
- Examples:
  - ✅ "Save changes" (Sentence case)
  - ✅ "Delete user account" (Sentence case)
  - ❌ "Save Changes" (Title Case)
  - ❌ "Delete User Account" (Title Case)

## Type Safety

### Generic Component Patterns

```tsx
function Component<T extends BaseType>(p: Props<T>) {
  // Type-safe component logic
}
```

### API Response Handling

- Always check `success` property on API responses
- Use appropriate typing from library exports

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

1. **Always prefer Panther components over custom implementations**
   - Use Panther's Button, Input, Select, etc. instead of building your own
   - Only create custom components when Panther doesn't provide the
     functionality
   - Build on top of Panther components rather than replacing them

2. **Use only Panther-defined Tailwind classes**
   - Semantic colors: `base-*`, `primary`, `neutral`, `success`, `danger`
   - Public spacing utilities: `ui-pad`, `ui-gap`, `ui-spy` (and `-sm` variants)
   - Standard Tailwind utilities for layout (flex, grid, etc.)
   - Never use arbitrary values like `bg-[#ff0000]` or `p-[23px]`

3. **Use Panther state management utilities**
   - `timQuery` for data fetching
   - `timActionForm`, `timActionButton` for form actions
   - `timActionDelete` for delete confirmations
   - StateHolderWrapper for loading/error states

4. **Never use arrow functions for component definitions**

5. **Always use `p` for props parameter**

6. **Use underscore prefixes for internal components**

7. **Maintain consistent signal naming conventions**

8. **Follow established folder structure patterns**

9. **Implement proper error boundaries with StateHolderWrapper**

10. **Always provide loading states for async operations**

---

These patterns ensure consistency and maintainability when building SolidJS
applications with Panther UI components.
