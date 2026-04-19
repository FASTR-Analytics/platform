# AI Tool Input Validation

Claude's tool-use API can hallucinate arguments: a tool declares no inputs but Claude sends `{ filter: "foo" }` anyway, then believes the filter was applied. Tight Zod `inputSchema`s catch this at the boundary and let Claude self-correct.

## Convention

**Use `z.strictObject({...})`, not `z.object({...})`.**

- `z.object({})` accepts any input and silently drops unknown keys. Claude thinks its hallucinated `filter` worked. User gets unfiltered data.
- `z.strictObject({})` rejects any unknown key. Zod throws; the error surfaces to Claude; Claude retries without the hallucinated key.

This applies to every tool, including zero-arg fetchers:

```ts
createAITool({
  name: "get_available_modules",
  inputSchema: z.strictObject({}),   // not z.object({})
  handler: async () => { ... },
});
```

For tools with trivial params, still use `strictObject`:

```ts
inputSchema: z.strictObject({ id: z.string().describe("Module ID") }),
```

For tools with rich input (e.g. slide-editing, filter-generation), use `z.strictObject({ ... })` with `.refine()` on semantic invariants the schema can't express structurally (e.g. `filterBy.values.min(1)` — a filter must have at least one value).

## Retry-on-error idiom

The wiring is already in place in [panther/_305_ai/_core/tool_engine.ts:124-143](panther/_305_ai/_core/tool_engine.ts#L124-L143). When a tool handler throws, the framework catches the error and returns:

```ts
{
  type: "tool_result",
  tool_use_id: block.id,
  content: cleanMessage,
  is_error: true,
}
```

Claude reads `is_error: true`, self-corrects, retries. The author contract is:

> **Throw from the tool handler. The framework converts to `is_error`.**

Zod validation failures throw before the handler runs — same pattern, earlier detection, cleanest error message to Claude (Zod's `.parse` error has the exact field path).

Do not catch Zod errors inside handlers. Let them propagate.

## What NOT to do

- Don't wrap handlers in try/catch just to return error strings — that hides the error type from the framework. Throw.
- Don't use `z.object({}).passthrough()` — same failure mode as `z.object({})`.
- Don't write custom validation inside the handler when a Zod schema could express it. The framework runs the schema before the handler, so schema-level checks get free retry-on-error; handler-level checks work too but are more code.
