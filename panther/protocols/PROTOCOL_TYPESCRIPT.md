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
