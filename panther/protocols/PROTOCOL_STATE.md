# Protocol: State Management

**Scope:** UI

For detailed explanations, see `FRONTEND_STYLE_GUIDE.md`.

## Rules

1. **timQuery for data fetching** — Handles loading states, provides refetch
2. **timActionForm for form submissions** — Validation inside, returns success/error
3. **timActionButton for simple actions** — Delete, refresh, discrete commands
4. **timActionDelete for deletions** — Confirmation dialog + action + refetch
5. **StateHolderWrapper for rendering** — Handles loading/error/ready states
6. **Never manually manage loading state** — Let tim* utilities handle it
7. **Validation inside actions** — Return `{ success: false, err }` for failures

## Patterns

### Data Fetching

```tsx
const query = timQuery(
  () => serverActions.getData(params),
  t("Loading..."),
);

<StateHolderWrapper state={query.state()}>
  {(data) => <Content data={data} />}
</StateHolderWrapper>
```

### Form Submission

```tsx
const save = timActionForm(
  async () => {
    const value = input().trim();
    if (!value) {
      return { success: false, err: t("Field is required") };
    }
    return serverActions.saveData({ value });
  },
  query.silentFetch,
);

<Button onClick={save.click} state={save.state()}>
  {t("Save")}
</Button>
<StateHolderFormError state={save.state()} />
```

### Simple Actions

```tsx
const refresh = timActionButton(
  () => serverActions.refresh(),
  query.silentFetch,
);

<Button onClick={refresh.click} state={refresh.state()}>
  {t("Refresh")}
</Button>
```

### Delete with Confirmation

```tsx
const deleteItem = timActionDelete(
  {
    text: t("Delete this item?"),
    itemList: [item.name],
  },
  () => serverActions.deleteItem({ id: item.id }),
  query.silentFetch,
);

<Button onClick={deleteItem.click} intent="danger">
  {t("Delete")}
</Button>
```

### Editable Pages (trackStore pattern)

For pages with inline editing (Setup, Marking):

```tsx
const [draft, setDraft] = createStore<Data>({} as Data);
const [loaded, setLoaded] = createSignal(false);

onMount(async () => {
  const data = await collection.get(id);
  setDraft(reconcile(data));
  setLoaded(true);
});

const debouncedPersist = debounce(
  () => collection.update(id, unwrap(draft)),
  300,
);

createEffect(
  on(
    () => trackStore(draft),
    () => debouncedPersist(),
    { defer: true },
  ),
);
```

**Key utilities:**
- `reconcile(data)` — Efficiently diffs when loading external data
- `unwrap(store)` — Strips SolidJS proxy before passing to storage
- `{ defer: true }` — Skips initial run, only fires on changes

## Do / Don't

### Loading States

```tsx
// ❌ DON'T
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string>();
const [data, setData] = createSignal<Data>();

async function load() {
  setLoading(true);
  try {
    setData(await fetch());
  } catch (e) {
    setError(e.message);
  }
  setLoading(false);
}

// ✅ DO
const query = timQuery(() => fetch(), "Loading...");
```

### Validation

```tsx
// ❌ DON'T — validate before calling action
const save = timActionForm(async () => {
  return serverActions.save(formData);
}, onSuccess);

function handleSave() {
  if (!valid()) {
    setError("Invalid");
    return;
  }
  save.click();
}

// ✅ DO — validate inside action
const save = timActionForm(async () => {
  if (!valid()) {
    return { success: false, err: "Invalid" };
  }
  return serverActions.save(formData);
}, onSuccess);
```

## Checklist

- [ ] Data fetching uses `timQuery`
- [ ] Form submissions use `timActionForm`
- [ ] Delete actions use `timActionDelete`
- [ ] Loading/error states use `StateHolderWrapper`
- [ ] Validation happens inside action functions
- [ ] No manual loading state signals
