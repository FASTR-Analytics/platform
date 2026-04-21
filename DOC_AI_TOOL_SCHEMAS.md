# AI Tool Schema Design

How we define Zod schemas for AI tool inputs. Covers schema derivation, validation layers, and runtime mechanics.

---

## Core Principle: Derive from Storage Schemas

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  DEFAULT: AI schemas DERIVE from storage schemas                            │
│  - Same field names, same types, same constraints                           │
│  - Use .shape.*, .partial(), .describe() for LLM hints                      │
│  - No transformation layer = no transformation bugs                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  EXCEPTION: Documented "much simpler" abstractions                          │
│  - Must be CLEARLY different (not just renamed fields)                      │
│  - Must have documented conversion logic                                    │
│  - Example: startDate/endDate → system infers periodOption from metric      │
└─────────────────────────────────────────────────────────────────────────────┘
```

AI input schemas should derive from storage schemas wherever possible. This eliminates schema drift and ensures AI inputs are directly compatible with storage.

**Source of truth:** `lib/types/_metric_installed.ts` exports `configDStrict`, the Zod schema for presentation object configuration.

```ts
// lib/types/ai_input.ts

import { configDStrict } from "./_metric_installed.ts";

// GOOD: Derive filter schema from storage
const aiFilterElementSchema = configDStrict.shape.filterBy.element;

export const AiMetricQuerySchema = z.object({
  metricId: z.string(),
  
  // Derived from storage - same field names, same types
  disaggregations: z.array(configDStrict.shape.disaggregateBy.element.shape.disOpt).optional(),
  filters: z.array(aiFilterElementSchema).optional(),
  valuesFilter: configDStrict.shape.valuesFilter,
});
```

### Why Derivation Matters

Without derivation, AI schemas and storage schemas drift apart:

```ts
// BAD: Parallel schema with different field names
const aiFilterSchema = z.object({
  col: z.string(),           // Storage uses "disOpt"
  vals: z.array(z.string()), // Storage uses "values" with (string | number)[]
});

// Requires conversion code everywhere, invites bugs
```

With derivation, field names and types match automatically. No conversion layer needed.

---

## The Forbidden Zone

Three categories of AI schema design:

| Category | Example | Verdict |
|----------|---------|---------|
| **Identical** | `filters` uses same shape as `configDStrict.filterBy` | Best - derive directly |
| **Much simpler** | `startDate/endDate` instead of full `periodFilter` | OK - document the exception |
| **Slightly different** | `col/vals` instead of `disOpt/values` | Forbidden - worst of both worlds |

The "slightly different" category is the forbidden zone. It looks similar enough to cause confusion but requires conversion code. Either match exactly (derive) or simplify significantly (documented exception).

---

## Documented Exceptions

When AI input is intentionally simpler than storage, document why:

```ts
export const AiMetricQuerySchema = z.object({
  // ...
  
  // EXCEPTION: startDate/endDate is a simpler abstraction than full periodFilter.
  // AI provides dates in flexible format (YYYY or YYYYMM), system converts using
  // metric's mostGranularTimePeriodColumnInResultsFile. See build_config_from_metric.ts.
  startDate: z.number().optional(),
  endDate: z.number().optional(),
});
```

The exception is justified when:
1. The simplified form is significantly easier for AI to use correctly
2. The conversion logic is localized (one place, not scattered)
3. The comment explains the tradeoff

---

## Two-Layer Validation

AI tool inputs go through two validation layers:

### Layer 1: Schema Validation (Zod)

Validates structure and types. Runs at tool invocation time.

```ts
// Enforced by schema derivation:
// - disOpt must be a valid DisaggregationOption enum value
// - values must be non-empty array (.min(1) on storage schema)
// - valuesFilter items must be valid value property names
```

### Layer 2: Data-Dependent Validation (Runtime)

Validates against actual data. Runs in tool handler or helper functions.

```ts
// client/src/components/project_ai/ai_tools/validators/content_validators.ts

// Can't be in schema - requires fetching metric metadata:
// - Is this disOpt available for THIS SPECIFIC METRIC?
// - Do these filter values actually exist in the data?
// - Is the date range within the metric's actual data bounds?
```

**Rule:** If validation requires fetching data or checking runtime state, it belongs in Layer 2. If it's purely about types and structure, derive it from the storage schema (Layer 1).

---

## Validation Flow

When Claude calls a tool, the input is validated before the handler runs:

```text
Claude calls tool with JSON input
    │
    ▼
Zod schema.parse(input) — validates and strips unknown properties
    │
    ├─► Valid: handler executes with cleaned input
    │
    └─► Invalid: ZodError thrown → framework returns is_error: true → Claude retries
```

### Error Handling

When validation fails or a handler throws, the framework catches the error and returns it to Claude with `is_error: true`. Claude sees the error message and can self-correct.

**Let errors propagate:**

```ts
handler: async (input) => {
  const result = await doSomething(input);
  if (!result.success) {
    throw new Error(result.error); // Framework catches, sets is_error: true
  }
  return result.data;
}
```

**Don't catch and return error strings:**

```ts
// BAD - Claude doesn't know this is an error
handler: async (input) => {
  try {
    return await doSomething(input);
  } catch (e) {
    return `Error: ${e.message}`;
  }
}
```

---

## Field Naming Convention

Storage field names are authoritative. AI schemas use the same names:

| Field | Type | Source |
|-------|------|--------|
| `disOpt` | `DisaggregationOption` | Disaggregation dimension identifier |
| `values` | `(string \| number)[]` | Filter values to include |
| `valuesFilter` | `string[]` | Value properties to include in results |
| `disaggregateBy` | `{ disOpt, ... }[]` | Dimensions to group by |
| `filterBy` | `{ disOpt, values }[]` | Filters to apply |

**Historical note:** Earlier versions used `col`/`vals` in some places. These were unified to `disOpt`/`values` to match storage.

---

## Inclusion List Semantics

Arrays that represent "items to include" (inclusion lists) require `.min(1)`:

```ts
// Storage schema in _metric_installed.ts
filterBy: z.array(z.object({
  disOpt: disaggregationOptionSchema,
  values: z.array(z.union([z.string(), z.number()])).min(1), // Must include something
})),
valuesFilter: z.array(z.string()).min(1).optional(), // If present, must include something
```

**Why:** An empty inclusion list means "include nothing" which is never useful. This is different from "operations to apply" arrays where empty means "no operations" (valid no-op).

| Array Type | Empty Meaning | .min(1)? |
|------------|---------------|----------|
| `filterBy` | No filters (show all) | No - on array itself |
| `filterBy[].values` | Include nothing (useless) | Yes |
| `valuesFilter` | Include no values (useless) | Yes |
| `disaggregateBy` | No grouping (valid) | No |

---

## Gotchas

### Don't Use z.strictObject()

`z.strictObject()` rejects unknown properties instead of stripping them. This breaks tools because Claude sometimes adds underscore-prefixed metadata properties (like `_thinking`) that cause validation errors.

### Don't Use strict: true on Tool Definitions

Anthropic's `strict: true` mode enables grammar-constrained sampling but **does not support** common JSON Schema features:

- `maxLength` / `minLength` (from `.max()` / `.min()` on strings)
- `maxItems` / `minItems` (from `.max()` / `.min()` on arrays)  
- `minimum` / `maximum` (from `.min()` / `.max()` on numbers)

Using `strict: true` with any of these causes an API error:

```text
400 - {"type":"error","error":{"type":"invalid_request_error",
"message":"tools.17.custom: For 'array' type, property 'maxItems' is not supported"}}
```

Since we rely on these validation constraints, `strict: true` is not compatible with our tools.

---

## Adding New AI Tool Schemas

Checklist for new AI tool input schemas:

1. **Check storage schema first** — Does `configDStrict` or another storage schema have fields you need?
2. **Derive where possible** — Use `.shape.fieldName` to extract sub-schemas
3. **Use storage field names** — Don't rename fields without strong justification
4. **Document exceptions** — If simplifying, explain why in a comment
5. **Consider .min(1)** — Is this an inclusion list? Empty = useless?
6. **Add data validation** — What requires runtime data checks? Put in content_validators.ts

---

## Key Files

| File | Purpose |
| ---- | ------- |
| `lib/types/_metric_installed.ts` | Storage schema (`configDStrict`) - source of truth |
| `lib/types/_presentation_object_config.ts` | PO config storage schema |
| `lib/types/ai_input.ts` | AI input schemas - derives from storage |
| `client/.../validators/content_validators.ts` | Runtime validation (data-dependent only) |
| `client/.../visualization_editor.tsx` | Viz editor tool schema - derives from storage |
