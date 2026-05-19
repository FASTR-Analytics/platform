# Protocol: SolidJS

**Scope:** UI

For detailed explanations, see `FRONTEND_STYLE_GUIDE.md`.

## Rules

1. **No conditional returns** — Never use early returns in component functions
2. **Access deps before conditionals** — Read all reactive deps before any `if`
3. **Never use createResource** — Triggers Suspense, causes full-page reloads
4. **Use control flow components** — `<Show>`, `<For>`, `<Switch>`/`<Match>`
5. **Props as `p`** — Never destructure, never name it `props`
6. **Function declarations** — Not arrow functions for components
7. **Use panther components** — Don't rebuild Button, Input, Select, etc.

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
- [ ] Components use function declarations
