# Protocol: SolidJS

**Scope:** UI

For detailed explanations, see `FRONTEND_STYLE_GUIDE.md`.

## Rules

1. **No conditional returns** — Never use early returns in component functions
2. **Access deps before conditionals** — Read all reactive deps at top of
   `createEffect`/`createMemo` before any `if`
3. **No tracking after `await`** — Reads after `await` in an async effect are
   silently untracked
4. **Never use createResource** — Triggers Suspense, causes full-page reloads
5. **Use control flow components** — `<Show>`, `<For>`, `<Switch>`/`<Match>`
6. **Props as `p`** — Never destructure, never name it `props`
7. **Function declarations** — Not arrow functions for components
8. **Use panther components** — Don't rebuild Button, Input, Select, etc.

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
// ❌ DON'T — data() not tracked when !ready()
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

**Why:** Early returns silently break tracking. The effect runs ONCE in dev
(looks fine), then never re-runs when the un-read signals change.

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

### Data Fetching

```tsx
// ❌ DON'T — triggers Suspense
const [data] = createResource(() => fetchData());

// ✅ DO
const query = timQuery(() => fetchData(), "Loading...");
```

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

## Checklist

- [ ] No conditional returns in components
- [ ] No `createResource` usage
- [ ] Props accessed via `p.` not destructured
- [ ] Control flow uses `<Show>`, `<For>`, `<Switch>`
- [ ] All reactive deps accessed before conditionals in effects
- [ ] All reactive deps accessed before `await` in async effects
- [ ] Components use function declarations
