# Protocol: SolidJS

**Scope:** UI

For component-library usage see `PROTOCOL_UI_COMPONENTS.md`; for data/actions
see `PROTOCOL_UI_STATE.md`.

## Rules

**Correctness — violations are bugs.** Reactivity breaks silently: no error, no
warning, the view just goes stale. Report these as bugs, not style findings.

1. **No conditional returns** — Never use early returns in component functions.
   Component bodies run exactly once; a top-level `if` is never re-evaluated
2. **Never destructure props** — Destructuring reads values once and loses
   reactivity. Forward a prop reactively with `() => p.x` or `splitProps`
3. **Access deps before conditionals** — Read all reactive deps at top of
   `createEffect`/`createMemo` before any `if`
4. **No tracking after `await`** — Reads after `await` in an async effect are
   silently untracked
5. **No createResource, no Suspense — hard ban, no exceptions** — Async state is
   always explicit `StateHolder` data (`createQuery` / effects, per
   `PROTOCOL_UI_STATE.md`), never a thrown-promise boundary. Banned:
   `createResource`, `<Suspense>`, `lazy()`, `useTransition`, and solid-router's
   Suspense-based data APIs (`createAsync`, `query`, route `preload`). This
   includes inert "just in case" `<Suspense>` wrappers at the router root

**Convention — violations are style findings.** The code works either way; these
keep the codebase uniform and reviewable.

6. **Use control flow components** — `<Show>`, `<For>`, `<Switch>`/`<Match>`
7. **Props as `p`** — Name the props parameter `p`, never `props`
8. **Function declarations** — Not arrow functions for components
9. **Batch writes in event handlers** — Wrap multiple signal writes in `batch()`
   in event handlers, in code after an `await`, and in other callbacks Solid
   does not auto-batch (ResizeObserver, requestAnimationFrame, stream/observer
   listeners). Wrap only contiguous, synchronous, write-only spans — never a
   span containing `return` (it would only exit the batch callback) or `await`.
   Solid already batches automatically inside `createEffect`, `onMount`, and
   store setters — `batch()` there is a no-op; don't add it or flag its absence
10. **Peer branches use `<Match>`, not `fallback`** — `<Show fallback>` is only
    for genuinely subordinate content (loading / empty / absent). Equal
    alternatives use `<Switch>` with an explicit `when` on each `<Match>` —
    never relegate a peer to `fallback` or a `when={true}` catch-all. A
    two-state value (glyph, class, label) is one element with a ternary prop —
    not a rendering branch; this rule applies only when the branches render
    different structure

Vendored third-party files (e.g. `solid_sortablejs_vendored.tsx`) are exempt
from this protocol — don't flag or modify them.

## Do / Don't

### Conditional Rendering

```tsx
// ❌ DON'T — breaks reactivity
export function MyComponent(p: Props) {
  if (!p.data) {
    return <div>No data</div>;
  }
  return <div>{p.data.value}</div>;
}

// ✅ DO
export function MyComponent(p: Props) {
  return (
    <Show when={p.data} fallback={<div>No data</div>}>
      {(data) => <div>{data().value}</div>}
    </Show>
  );
}
```

### Reactive Dependencies

```tsx
// ❌ DON'T — data() untracked while !ready()
createEffect(() => {
  if (!ready()) return;
  doSomething(data());
});

// ✅ DO — access all deps first
createEffect(() => {
  const r = ready();
  const d = data();
  if (r) {
    doSomething(d);
  }
});
```

**Why:** Dependencies are re-collected on every run, so the ❌ effect does
re-run when `ready()` changes — the bug is narrower: while `ready()` is false,
`data()` was never read that run, so changes to it don't trigger the effect.
Whether the effect responds to `data()` depends on the guard's state at the last
run. Reading every dep up front makes the dependency set static and the behavior
guard-independent.

### Async Effects

```tsx
// ❌ DON'T — someSignal() after await is not tracked
createEffect(async () => {
  const _v = version(); // tracked
  await fetchSomething();
  const x = someSignal(); // NOT tracked — effect won't re-run when x changes
  doSomething(x);
});

// ✅ DO — read everything synchronously first
createEffect(async () => {
  const _v = version();
  const x = someSignal(); // tracked
  await fetchSomething();
  doSomething(x);
});
```

**Why:** Solid's tracking context is synchronous. Once you `await`, you can no
longer set up new tracking dependencies in that effect run.

Async effects that fetch and write state must also drop out-of-order completions
— see "Overlapping Refetches" in `PROTOCOL_UI_STATE.md`.

### Data Fetching — No Suspense (hard ban)

```tsx
// ❌ DON'T — createResource is Suspense-based
const [data] = createResource(() => fetchData());

// ❌ DON'T — no Suspense boundaries anywhere, even inert ones at the router root
<Router root={(p) => <Suspense>{p.children}</Suspense>}>

// ❌ DON'T — lazy() suspends while the chunk loads
const Editor = lazy(() => import("./editor.tsx"));

// ✅ DO — loading is explicit data, rendered like any other state
const query = createQuery(() => fetchData(), "Loading...");

<StateHolderWrapper state={query.state()}>
  {(data) => <Content data={data} />}
</StateHolderWrapper>;
```

**Why:** Suspense inverts the house model: it moves loading state out of data
and into the component tree, where a thrown promise tears the UI down to the
nearest boundary — non-local, non-greppable, and the cause of full-page "reload"
flashes. Panther's `_302_query` (`createQuery`, `createFormAction`,
`StateHolderWrapper`) exists precisely so async state stays explicit (`loading`
/ `error` / `ready`) and rendering stays deterministic. The ban covers the
entire Suspense mechanism — `createResource`, `<Suspense>`, `lazy()`,
`useTransition`, and solid-router's data APIs (`createAsync`, `query`,
`preload`) — with no exceptions.

### Component Declaration

```tsx
// ❌ DON'T
export const Button = (props: ButtonProps) => { ... };

// ✅ DO
export function Button(p: ButtonProps) { ... }
```

### Props Access

```tsx
// ❌ DON'T — loses reactivity
export function Card({ title, children }: Props) {
  return <div>{title}</div>;
}

// ✅ DO
export function Card(p: Props) {
  return <div>{p.title}</div>;
}

// ✅ DO — reactive forwarding when you need a prop as a standalone value
const label = () => p.title; // wrapper function stays reactive
const [local, rest] = splitProps(p, ["title"]); // reactive split for spreads
```

### Control Flow

```tsx
// ❌ DON'T
{condition && <Component />}
{items.map(item => <Item item={item} />)}

// ✅ DO
<Show when={condition}>
  <Component />
</Show>

<For each={items}>
  {(item) => <Item item={item} />}
</For>
```

**Why:** `{condition && ...}` and `.map` are reactive in Solid (JSX expressions
re-evaluate) — they're not broken, they're unmemoized: the branch is torn down
and rebuilt on every dependent change, and `.map` recreates every row with no
keyed reconciliation. `<Show>`/`<For>` memoize. Style finding, not a bug.

### Multiple Conditions

```tsx
// ❌ DON'T
<Show when={a} fallback={<Show when={b} fallback={<C />}><B /></Show>}>
  <A />
</Show>

// ✅ DO
<Switch>
  <Match when={a}><A /></Match>
  <Match when={b}><B /></Match>
  <Match when={true}><C /></Match>
</Switch>
```

### Equal branches (peers, not a fallback)

```tsx
// ❌ DON'T — two equal branches, but one is forced into "fallback"
<Show when={mode() === "edit"} fallback={<ReadView item={item()} />}>
  <EditView item={item()} />
</Show>

// ✅ DO — peers stay peers; every branch states its own condition
<Switch>
  <Match when={mode() === "edit"}><EditView item={item()} /></Match>
  <Match when={mode() === "read"}><ReadView item={item()} /></Match>
</Switch>
```

**Why:** `fallback` encodes a primary/secondary hierarchy. For genuine
alternatives that's a lie that hides intent and misleads the next reader.
Reserve `<Show>`'s `fallback` (and a `when={true}` catch-all) for content that
truly _is_ subordinate — loading, empty, or absent — like the data / "No data"
case above.

### Batched Updates

```tsx
// ❌ DON'T — three separate updates in an event handler
function handleSelect(item: Item) {
  setSelected(item.id);
  setLabel(item.label);
  setDirty(true);
}

// ✅ DO — coalesced into one
function handleSelect(item: Item) {
  batch(() => {
    setSelected(item.id);
    setLabel(item.label);
    setDirty(true);
  });
}
```

**Why:** `batch()` collapses multiple signal writes into a single downstream
update. Solid already auto-batches inside `createEffect`, `onMount`, and store
setters — `batch()` there is redundant; don't add it or flag its absence. It
matters in event handlers, in code after an `await`, and in any other callback
Solid does not auto-batch (ResizeObserver, requestAnimationFrame, stream
listeners). Nesting is fine (a batched helper called inside a batched handler
coalesces into the outer batch), and parent callbacks like `p.onChange` may sit
inside a batch — their writes coalesce too.

## Checklist

Bug-severity:

- [ ] (bug) No conditional returns in components
- [ ] (bug) Props never destructured — reactive forwarding uses `() => p.x` or
      `splitProps`
- [ ] (bug) All reactive deps accessed before conditionals in effects
- [ ] (bug) All reactive deps accessed before `await` in async effects
- [ ] (bug) No Suspense mechanism anywhere: `createResource`, `<Suspense>`,
      `lazy()`, `useTransition`, `createAsync`, router `preload`

Style-severity:

- [ ] (style) Props parameter named `p`
- [ ] (style) Control flow uses `<Show>`, `<For>`, `<Switch>`
- [ ] (style) `<Show fallback>` only for subordinate content; equal branches use
      `<Switch>`/`<Match>` with an explicit `when` on each
- [ ] (style) Components use function declarations
- [ ] (style) Multi-signal writes in event handlers and other non-auto-batched
      callbacks wrapped in `batch()`
