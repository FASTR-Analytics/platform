# Plan: Sweep Client for SolidJS Reactivity Issues

## Background

SolidJS has fine-grained reactivity that differs fundamentally from React. Components don't re-render - only specific DOM nodes update when their tracked dependencies change. This means certain patterns that work in React will silently fail in SolidJS.

## Issues to Find

### 1. IIFEs in JSX (High Priority)

**Pattern:**
```tsx
{(() => {
  // logic here
  return <span>...</span>;
})()}
```

**Why it's broken:** The IIFE executes once at component mount. The returned JSX is inserted into the DOM and never re-evaluated, regardless of signal/store changes inside.

**Fix:** Use `createMemo` + `<Show>` or move logic to a memo:
```tsx
const shouldShow = createMemo(() => /* logic */);
// then
<Show when={shouldShow()}>
  <span>...</span>
</Show>
```

**Search pattern:**
```bash
grep -rn "{\s*(() =>" client/src --include="*.tsx"
grep -rn "{(function" client/src --include="*.tsx"
```

### 2. Reactive Reads After Early Returns (High Priority)

**Pattern:**
```tsx
const computed = createMemo(() => {
  const a = signalA();
  if (!a) return false;  // early return
  return signalB() > 0;  // signalB not tracked when a is falsy!
});
```

**Why it's broken:** SolidJS tracks dependencies by observing which signals are read during execution. If an early return prevents a signal from being read, that signal won't be tracked for that execution path.

**Fix:** Read all reactive values before any conditionals:
```tsx
const computed = createMemo(() => {
  const a = signalA();
  const b = signalB();  // read BEFORE early returns
  if (!a) return false;
  return b > 0;
});
```

**Search pattern:** Manual review of `createMemo`, `createEffect`, and any function that reads signals and has early returns. Look for:
- `if (!x) return` where `x` is a signal
- Any `return` statement that comes before other signal reads

```bash
grep -rn "createMemo\|createEffect" client/src --include="*.tsx" -A 10
```

### 3. Destructuring Props (Medium Priority)

**Pattern:**
```tsx
function Component({ value, onChange }) {  // destructured
  return <div>{value}</div>;  // not reactive!
}
```

**Why it's broken:** Props in SolidJS are getters. Destructuring evaluates them once at component mount.

**Fix:** Access props via the props object:
```tsx
function Component(p) {
  return <div>{p.value}</div>;  // reactive
}
```

**Note:** This codebase uses `p` for props consistently, so this may not be an issue. Verify no destructuring in function signatures.

**Search pattern:**
```bash
grep -rn "function.*({.*})" client/src --include="*.tsx"
grep -rn "const.*=.*props\." client/src --include="*.tsx"
```

### 4. Storing Signals in Variables Outside Reactive Context (Medium Priority)

**Pattern:**
```tsx
function Component(p) {
  const value = p.someSignal();  // evaluated once!
  return <div>{value}</div>;     // static
}
```

**Why it's broken:** Reading a signal in the component body (not in JSX or a memo/effect) evaluates it once at mount.

**Fix:** Read signals inside reactive contexts:
```tsx
function Component(p) {
  return <div>{p.someSignal()}</div>;  // reactive - JSX is a reactive context
}
// or
function Component(p) {
  const value = createMemo(() => p.someSignal());
  return <div>{value()}</div>;
}
```

### 5. Passing Derived Values as Props (Low Priority)

**Pattern:**
```tsx
<Child value={signal() + 1} />  // computed once if Child doesn't expect a getter
```

**Why it might be broken:** If the child component expects reactive props but receives a computed value, reactivity may be lost depending on how the child accesses it.

**Note:** Usually fine in this codebase because JSX props are wrapped in getters by the compiler. Only an issue if the child destructures or reads props outside reactive context.

## Sweep Procedure

### Phase 1: Automated Search

Run these searches and save results:

```bash
# IIFEs in JSX
grep -rn "{\s*(() =>" client/src --include="*.tsx" > iife_matches.txt

# createMemo/createEffect with potential early returns
grep -rn "createMemo\|createEffect" client/src --include="*.tsx" -l > memo_files.txt

# Destructured props
grep -rn "^function.*({" client/src --include="*.tsx" > destructured_props.txt
grep -rn "^export function.*({" client/src --include="*.tsx" >> destructured_props.txt
```

### Phase 2: Manual Review

For each match:

1. **IIFEs:** Convert to `createMemo` + `<Show>` or inline the logic properly
2. **Memos with conditionals:** Verify all signal reads happen before any `return` statements
3. **Destructured props:** Convert to `p.propName` access pattern

### Phase 3: Testing

For each fix:
1. Verify the component renders correctly
2. Trigger the reactive dependency to change
3. Confirm the UI updates without manual refresh

## Priority Order

1. Files with user-reported bugs (start with these)
2. Components displaying real-time/SSE data
3. Components with `<Show>` or `<Switch>` that depend on signals
4. Forms and interactive components
5. Static display components (lowest priority)

## Reference

- [SolidJS Reactivity Intro](https://docs.solidjs.com/concepts/intro-to-reactivity)
- [Fine-grained Reactivity](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity)
