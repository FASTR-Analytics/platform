# AI Tool Input Validation

How tool inputs are validated when Claude calls our custom AI tools.

**See also:** [DOC_MIGRATIONS.md](DOC_MIGRATIONS.md) for how stored data is validated and migrated.

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

This happens in panther at [tool_helpers.ts:90-92](panther/_305_ai/_core/tool_helpers.ts#L90-L92):

```ts
run: async (input: TInput) => {
  const validated = config.inputSchema.parse(input) as TInput;
  const result = await Promise.resolve(config.handler(validated));
```

---

## Schema Conventions

### Use Full Validation Constraints

Zod constraints (`.max()`, `.min()`, `.refine()`, etc.) work normally and are enforced at parse time:

```ts
createAITool({
  name: "create_slide",
  inputSchema: z.object({
    title: z.string().max(200).describe("Title (max 200 chars)"),
    count: z.number().int().min(1).max(100).describe("Count between 1-100"),
    items: z.array(z.string()).max(10).describe("Up to 10 items"),
  }),
  handler: async (input) => {
    // input is validated and typed
  },
});
```

Constraints serve two purposes:

1. **Runtime validation** — invalid input throws, error surfaces to Claude
2. **Documentation for Claude** — constraints in the schema help Claude generate correct values

### Unknown Properties Are Stripped

`z.object()` silently discards properties not in the schema. This is intentional — Claude sometimes adds underscore-prefixed metadata properties (like `_thinking`) to tool inputs. These are harmless and get stripped automatically.

---

## Error Handling

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

## Gotchas

### Don't Use z.strictObject()

`z.strictObject()` rejects unknown properties instead of stripping them. This breaks tools because Claude's underscore-prefixed metadata properties cause validation errors.

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
