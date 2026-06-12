# Protocol: State Management

**Scope:** UI

See `PROTOCOL_UI_SOLIDJS.md` for reactivity rules.

## Rules

1. **createQuery for one-shot fetches** — Runs queryFunc once on mount; no
   reactivity
2. **createEffect for reactive fetches** — Long-lived views that must react to
   changing inputs or server updates
3. **createFormAction for form submissions** — Validation inside, returns
   success/error
4. **createButtonAction for simple actions** — Delete, refresh, discrete
   commands
5. **createDeleteAction for deletions** — Confirmation dialog + action + refetch
6. **StateHolderWrapper for rendering** — Handles loading/error/ready states
7. **Use `StateHolder` for loading state** — Via `createQuery` (one-shot) or
   `createSignal<StateHolder<T>>` + `createEffect` (reactive). Never raw
   `loading`/`error`/`data` signals
8. **Validation inside actions** — Return `{ success: false, err }` for failures
9. **Don't flash loading on incremental refetches** — When refetching the same
   entity in `createEffect`, leave stale data visible until the new data arrives

## Read Modes

Every read of server-derived state is either **live** or **snapshot**. Picking
the wrong one is the source of most state bugs.

| Mode         | Behavior                                                             | Tools                                                     |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------- |
| **Live**     | Subscribes to changes. View stays in sync.                           | Reactive reads in JSX / `createEffect` / `createMemo`     |
| **Snapshot** | Captures state at a moment in time. View ignores subsequent changes. | `createQuery`, `unwrap()`, cache `.get()` from async code |

**When in doubt, prefer live.** A view that should have stayed in sync but used
a snapshot read goes silently stale — the worst failure mode. A live read where
snapshot would have sufficed has only minor cost.

Choose by **view lifetime**:

- **Short-lived** (picker modal, dropdown that closes after selection) →
  `createQuery` is fine
- **Long-lived** (editor, list, dashboard) → `createEffect` watching a version
  signal

## Patterns

### Data Fetching (one-shot)

`createQuery` is a **snapshot read**. `queryFunc` runs once on mount. There is
no key, no automatic re-running. Use for short-lived views where data captured
at mount is sufficient.

```tsx
const query = createQuery(
  () => serverActions.getData(params),
  t("Loading..."),
);

<StateHolderWrapper state={query.state()}>
  {(data) => <Content data={data} />}
</StateHolderWrapper>;
```

### Reactive Data (live)

For long-lived views, or when inputs change, use `createEffect` watching a
version signal. The effect re-runs when any tracked read changes; refetch
happens automatically.

```tsx
const [data, setData] = createSignal<StateHolder<MyData>>({
  status: "loading",
});

createEffect(async () => {
  const currentId = id(); // tracked
  setData({ status: "loading" });
  const res = await serverActions.getData(currentId);
  setData(
    res.success
      ? { status: "ready", data: res.data }
      : { status: "error", err: res.err },
  );
});

<StateHolderWrapper state={data()}>
  {(d) => <Content data={d} />}
</StateHolderWrapper>;
```

**Reactive refetch after mutation:** flip a version signal; the effect re-runs.

```tsx
const [version, setVersion] = createSignal(0);

createEffect(async () => {
  version();                                       // tracked
  const res = await serverActions.getData(id);
  setData(/* ... */);
});

async function save() {
  await serverActions.update(...);
  setVersion((v) => v + 1);                        // triggers refetch
}
```

### Stale-while-revalidate (incremental refetch)

When refetching the same entity (e.g. one field edited), don't reset to
`{ status: "loading" }` inside the effect. The user is actively viewing this
entity; flashing to "Loading..." on every small change is jarring. Let stale
data stay visible until fresh data arrives.

```tsx
const [data, setData] = createSignal<StateHolder<Entity>>({
  status: "loading",
});

createEffect(async () => {
  const _v = version(); // reactive read for tracking only
  // NOTE: No setData({ status: "loading" }) here.
  // Stale data stays visible while refetch is in flight.
  const res = await serverActions.getEntity(id);
  setData(
    res.success
      ? { status: "ready", data: res.data }
      : { status: "error", err: res.err },
  );
});
```

- Loading flash on first mount only (signal default)
- No flash on subsequent refetches — stale data stays visible
- Trade-off: a failed refetch replaces stale data with an error state.
  Acceptable in practice.

### Form Submission

```tsx
const save = createFormAction(
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
const refresh = createButtonAction(
  () => serverActions.refresh(),
  query.silentFetch,
);

<Button onClick={refresh.click} state={refresh.state()}>
  {t("Refresh")}
</Button>;
```

### Delete with Confirmation

```tsx
const deleteItem = createDeleteAction(
  {
    text: t("Delete this item?"),
    itemList: [item.name],
  },
  () => serverActions.deleteItem({ id: item.id }),
  query.silentFetch,
);

<Button onClick={deleteItem.click} intent="danger">
  {t("Delete")}
</Button>;
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
const query = createQuery(() => fetch(), "Loading...");
```

### Validation

```tsx
// ❌ DON'T — validate before calling action
const save = createFormAction(async () => {
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
const save = createFormAction(async () => {
  if (!valid()) {
    return { success: false, err: "Invalid" };
  }
  return serverActions.save(formData);
}, onSuccess);
```

### Reactivity in Queries

```tsx
// ❌ DON'T — createQuery is one-shot. Signal reads inside queryFunc are NOT tracked.
// This looks reactive but never re-runs when id() changes.
const query = createQuery(() => serverActions.getData(id()));

// ❌ DON'T — manually calling fetch() to "refresh" suggests you need a live read.
// If you keep wanting to do this, convert to createEffect.
async function save() {
  await serverActions.update(...);
  query.silentFetch();
}

// ✅ DO — use createEffect for reactive inputs
const [data, setData] = createSignal<StateHolder<T>>({ status: "loading" });
createEffect(async () => {
  const currentId = id();                  // tracked — refetches on change
  const res = await serverActions.getData(currentId);
  setData(/* ... */);
});
```

**Why:** `createQuery` runs `queryFunc` exactly once on mount. There is no key,
no automatic re-running. For any view that needs to react to changing inputs or
server updates, use `createEffect`.

### Stale-While-Revalidate

```tsx
// ❌ DON'T — flashes "Loading..." every time the entity changes
createEffect(async () => {
  const _v = version();
  setData({ status: "loading" }); // ⚠️ flash on every edit
  const res = await serverActions.getEntity(id);
  setData(/* ... */);
});

// ✅ DO — keep stale data visible until fresh arrives
createEffect(async () => {
  const _v = version();
  const res = await serverActions.getEntity(id);
  setData(/* ... */);
});
```

**Why:** When the same entity is refetched after a small change, the user is
actively viewing it. Stale data is more useful than a loading flash until the
new data arrives.

## Checklist

- [ ] One-shot fetches use `createQuery`
- [ ] Reactive fetches use `createEffect` + `createSignal<StateHolder<T>>`
- [ ] No signal reads inside `createQuery`'s `queryFunc` (they are not tracked)
- [ ] Form submissions use `createFormAction`
- [ ] Delete actions use `createDeleteAction`
- [ ] Loading/error states use `StateHolderWrapper`
- [ ] Validation happens inside action functions
- [ ] No raw `loading`/`error`/`data` signal trios
- [ ] Long-lived views don't use `createQuery`
- [ ] Incremental refetches don't reset to `{ status: "loading" }`
