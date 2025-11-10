# _000_utils

Core utility functions for arrays, numbers, strings, and general operations.
Zero external dependencies.

## Purpose

Foundational utilities used throughout the library for common operations like:

- Array manipulation and creation
- Number formatting and calculations
- String operations
- Type assertions and guards
- Async utilities

## Key Exports

### Assertions (`assert.ts`)

```typescript
assert(test: boolean, msg?: string): void
assertArray<T>(a: unknown, msg?: string): asserts a is T[]
assertNumberBetween0And1(a: unknown, msg?: string): asserts a is number
assertNotUndefined<T>(a: T | undefined | null, msg?: string): asserts a is T
assertTwoArraysAreSameAndInSameOrder<T>(a: T[], b: T[], msg?: string): void
assertUnique(arr: number[] | string[], msg?: string): void
```

### Array Creation (`create_array.ts`)

```typescript
createArray<T>(n: number, fn: (i: number) => T): T[]
```

Creates arrays with computed values.

### Number Operations

- `numbers.ts` - Math operations (clamp, round, etc.)
- `number_formatters.ts` - Format numbers for display
- `sum_and_avg.ts` - Aggregation functions

### String Operations (`strings.ts`)

Common string manipulations and transformations.

### Sorting (`sort.ts`)

Generic sorting utilities for arrays of objects.

### Type Guards (`type_guards.ts`)

Runtime type checking utilities.

### Other Utilities

- `async_utils.ts` - Async operation helpers
- `boolean_reducers.ts` - Boolean logic operations
- `duplicates.ts` - Find and handle duplicate values
- `normalize.ts` - Data normalization
- `periods.ts` - Date/period handling utilities
- `reorder_array.ts` - Array reordering operations
- `try_catch.ts` - Error handling wrappers

## Usage Example

```typescript
import { assert, clamp, createArray } from "@timroberton/panther";

// Create array of 10 items
const items = createArray(10, (i) => i * 2);

// Assert conditions
assert(items.length === 10, "Array must have 10 items");

// Use number utilities
const clamped = clamp(value, 0, 100);
```

## Module Dependencies

None - this is a foundational module with zero external dependencies.
