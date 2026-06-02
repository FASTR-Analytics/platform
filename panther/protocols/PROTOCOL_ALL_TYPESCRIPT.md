# Protocol: TypeScript

**Scope:** All

For detailed explanations, see `DOC_CODING_CONVENTIONS.md`.

## Rules

1. **Function declarations for exports** — Use `function`, not arrow functions
2. **Arrow functions for callbacks** — Inline functions, map/filter/etc.
3. **Type aliases over interfaces** — Use `type`, not `interface`
4. **No JSDoc** — TypeScript types are sufficient
5. **No `any`** — Explicit types always
6. **Const by default** — Use `let` only for loop counters
7. **Undefined over null** — For optional/missing values
8. **Early throw** — Validate and throw early with descriptive messages
9. **Braces required** — Always use braces with `if` statements
10. **No magic values** — Use constants or config objects
11. **Static imports only** — Never use dynamic imports
12. **Exports first** — Main/exported functions at top, helpers below
13. **Async/await** — Never use Promise chains
14. **No vestigial versioning** — Don't suffix the only/current version (`fooV2` with no `foo`). When superseding, migrate callers and delete the old
15. **No dead code** — Delete unused and commented-out code; git is the history
16. **No silent failures** — Never swallow with `.catch(() => {})`. Await it, or log if genuinely fire-and-forget

## Do / Don't

### Function Style

```typescript
// ❌ DON'T
export const processData = (data: Data) => { ... };

// ✅ DO
export function processData(data: Data) { ... }
```

### Type Definitions

```typescript
// ❌ DON'T
interface ButtonProps { ... }

// ✅ DO
type ButtonProps = { ... };
```

### Comments

```typescript
// ❌ DON'T
/**
 * Rounds a number to the specified precision
 * @param val - The number to round
 */
export function round(val: number, precision: number) { ... }

// ✅ DO
export function round(val: number, precision: -3 | -2 | -1 | 0 | 1 | 2 | 3) { ... }
```

### Control Flow

```typescript
// ❌ DON'T
if (!valid) return;

// ✅ DO
if (!valid) {
  return;
}
```

### Error Handling

```typescript
// ❌ DON'T
if (!data) {
  console.log("No data");
  return null;
}

// ✅ DO
if (!data) {
  throw new Error("Data is required");
}
```

### Versioning

```typescript
// ❌ DON'T — version suffix when there is no other version
export function buildQueryV2(...) { ... }            // there is no buildQuery
const channel = new BroadcastChannel("updates_v2");

// ✅ DO — name for what it is; when you supersede something, replace and delete the old
export function buildQuery(...) { ... }
```

### Dead Code

```typescript
// ❌ DON'T — keep old code as a breadcrumb
// export function oldBuildQuery(...) { ... }   // "identical to v1"
export function buildQuery(...) { ... }

// ✅ DO — delete it; recover from git history if ever needed
export function buildQuery(...) { ... }
```

### Silent Failures

```typescript
// ❌ DON'T — swallow the error
logUsage(data).catch(() => {});

// ✅ DO — await it, or log the failure if genuinely fire-and-forget
await logUsage(data);
// or
logUsage(data).catch((e) => console.error(`logUsage failed: ${e.message}`));
```

## Naming

| Element | Convention | Example |
|---------|------------|---------|
| Files | snake_case | `measure_text.ts` |
| Types | PascalCase | `MeasuredText` |
| Functions | camelCase | `measureText` |
| Constants | UPPER_SNAKE_CASE | `MAX_WIDTH` |
| Private members | _prefix | `_value` |
| Internal folders | _prefix | `_internal/` |

### Type Suffixes

- `Props` — Component props (`ButtonProps`)
- `Options` — Configuration (`FigureStyleOptions`)
- `Measured` prefix — Computed values (`MeasuredText`)
- `Custom` prefix — User customization (`CustomStyle`)
- `Merged` prefix — Combined defaults + custom (`MergedStyle`)

## Checklist

- [ ] No `any` types
- [ ] No JSDoc comments
- [ ] No `interface` declarations
- [ ] Function declarations for exports
- [ ] Braces on all `if` statements
- [ ] No magic numbers/strings
- [ ] Static imports only
- [ ] Exports before helpers in file order
- [ ] No version-suffixed names without a surviving prior version
- [ ] No commented-out or dead code
- [ ] No empty `.catch(() => {})`
