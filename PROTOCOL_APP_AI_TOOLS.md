# PROTOCOL_APP_AI_TOOLS — authoring AI tool input schemas

The recipe for writing Zod input schemas for AI tools (project copilot, HFA
assistant, and any future surface). The architecture — where validation is
enforced, which derived schemas exist — is
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md).

## Core principle: derive from storage schemas

AI input schemas derive from storage schemas wherever possible — same field
names, same types, same constraints. No transformation layer = no
transformation bugs, and AI inputs are storage-compatible by construction.

Source of truth: `configDStrict` in
[lib/types/_metric_installed.ts](lib/types/_metric_installed.ts) (and
`presentationObjectConfigTStrict` for `config.t`).

```ts
// lib/types/ai_input.ts
const aiFilterElementSchema = configDStrict.shape.filterBy.element;

export const AiMetricQuerySchema = z.object({
  metricId: z.string(),
  disaggregations: z.array(configDStrict.shape.disaggregateBy.element.shape.disOpt).optional(),
  filters: z.array(aiFilterElementSchema).optional(),
  valuesFilter: configDStrict.shape.valuesFilter,
});
```

Existing derived surfaces to copy from: `AiMetricQuerySchema` and
`AiFigureConfigPatchSchema`/`LayoutSpecSchema` (lib/types/ai_input.ts), and
`vizConfigUpdateSchema`
(client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx).

## The forbidden zone

| Category | Example | Verdict |
|----------|---------|---------|
| **Identical** | `filters` uses `configDStrict.filterBy`'s shape | Best — derive directly |
| **Much simpler** | `startDate`/`endDate` instead of full `periodFilter` | OK — document the exception |
| **Slightly different** | `col`/`vals` instead of `disOpt`/`values` | Forbidden — worst of both worlds |

"Slightly different" looks similar enough to confuse the model but requires
conversion code. Either match exactly (derive) or simplify significantly
(documented exception). Storage field names are authoritative: `disOpt`,
`values`, `valuesFilter`, `disaggregateBy`, `filterBy`. This rule binds tool
*output* text too — an example schema printed in a tool result (e.g. a
"how to build a figure" template) teaches the model the shape more strongly
than the schema description does; a `{col, vals}` example in output causes
ZodErrors just as surely as one in the schema.

A simplification exception is justified when the simpler form is
significantly easier for the model to use correctly, the conversion is
localized to one place, and a comment explains the tradeoff:

```ts
// EXCEPTION: startDate/endDate is a simpler abstraction than full periodFilter.
// AI provides YYYY or YYYYMM; system converts using the metric's
// mostGranularTimePeriodColumnInResultsFile. See build_config_from_metric.ts.
startDate: z.number().optional(),
endDate: z.number().optional(),
```

## Two-layer validation

- **Layer 1 — schema (Zod)**: structure and types. Enforced by panther's
  tool engine: `createAITool` parses input against the schema; a ZodError
  returns `is_error: true` and the model retries. Derivation gives you the
  storage constraints (enums, `.min(1)`) for free.
- **Layer 2 — data-dependent (runtime)**: anything requiring fetched data or
  runtime state — is this disOpt available for THIS metric? do these filter
  values exist? is the range within real data bounds? Lives in
  `client/src/components/project_ai/ai_tools/validators/content_validators.ts`
  (and `report_validators.ts` for report bodies), called from handlers.

Rule: if validation needs data, it's Layer 2; if it's types and structure,
derive it (Layer 1). Every write tool must run its Layer-2 checks **before**
mutating anything, so a throw provably means "nothing changed"
(`update_figure` / `update_report_figure` are the reference
implementations).

## Error handling: throw, don't catch

The engine catches handler throws and returns them to the model with
`is_error: true` — that flag is how the model knows to self-correct.

```ts
// GOOD — framework sets is_error: true
handler: async (input) => {
  const result = await doSomething(input);
  if (!result.success) throw new Error(result.error);
  return result.data;
}

// BAD — the model doesn't know this is an error
handler: async (input) => {
  try { return await doSomething(input); }
  catch (e) { return `Error: ${e.message}`; }
}
```

Don't mix disciplines in helpers either — a function that returns
`{success:false}` for some failures and throws for others advertises a
contract it doesn't keep.

## Inclusion-list semantics

Arrays meaning "items to include" require `.min(1)` — an empty inclusion
list means "include nothing", never useful. Arrays meaning "operations to
apply" allow empty (valid no-op).

| Array | Empty means | `.min(1)`? |
|-------|-------------|------------|
| `filterBy` | no filters (show all) | No |
| `filterBy[].values` | include nothing | Yes |
| `valuesFilter` | include no values | Yes |
| `disaggregateBy` | no grouping | No |

## Gotchas

- **Never `z.strictObject()`.** It rejects instead of strips unknown
  properties; Claude sometimes adds underscore-prefixed metadata keys, which
  then throw on every call. Empty-input tools use `z.object({})`.
- **Never `strict: true` on tool definitions.** Anthropic's
  grammar-constrained mode rejects `minItems`/`maxItems`/`minLength`/
  `maxLength`/`minimum`/`maximum` — which `.min()`/`.max()` emit — with a
  400. Our schemas rely on those constraints.

## Checklist for a new AI tool schema

1. Check storage schemas first — does `configDStrict` (or another) already
   have the fields?
2. Derive with `.shape.fieldName`; keep storage field names.
3. Simplifying? Document the exception in a comment, localize the
   conversion.
4. Inclusion list? Add `.min(1)`.
5. Data-dependent checks go in `content_validators.ts` (or
   `report_validators.ts`), called before any mutation.
6. Handlers throw on failure; never return error strings; never
   `z.strictObject` / `strict: true`.
7. If the tool's *output* prints a schema example, it must match the real
   schema exactly.
