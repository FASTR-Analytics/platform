# PROTOCOL_APP_AI_TOOLS: authoring AI tool input schemas

The recipe for writing Zod input schemas for AI tools (the chat's tools, the HFA tools among them, the `/mcp` surface, and any future one). The architecture (where validation is enforced, which derived schemas exist) is [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md).

## A tool's contract is written in lib

A tool the browser runs has two halves. Its **contract** (name, description, kind, input schema) is an entry in a `lib/ai_tools/contracts_*.ts` file, one file per family: package, deck, report, figure editor, products, HFA. Its `createAITool` call in the client takes the contract and adds what runs: the handler or the approval, the labels and the cards.

```ts
// lib/ai_tools/contracts_deck.ts
export const DECK_TOOL_CONTRACTS = {
  get_slides: {
    description: "Retrieve the content and structure of one or more slides…",
    kind: "read",
    inputSchema: z.strictObject({ slideIds: z.array(z.string()).min(1) }),
  },
} as const;

// client/src/components/products/copilot/ai_tools/tools/get_slides.ts
createAITool({
  viewRegistry: copilotViews,
  ...copilotToolContract("get_slides"),
  handler: async (input, view) => { … },
  inProgressLabel: t3({ … }),
});
```

- **Never write `name`, `description`, `kind`, `inputSchema` or `availableIn` in a client `createAITool` call.** `copilotToolContract` gives all five, the views from `COPILOT_TOOL_VIEWS`.
- **Why.** Panther's `createAITool` refuses an invalid tool when it is built: an open input object, a root that is not an object, an empty gate. Client code is first built when the shell mounts in a user's browser, after the deploy, so a refusal there stops the app for every user (2.17.0, 2026-11-24). `lib/` loads under Deno, so `lint:copilot-tools`, chained into `deno task typecheck`, builds every contract and the refusal stops the deploy.
- **A new tool, in this order:** its name in `COPILOT_TOOL_VIEWS` and `COPILOT_TOOL_REQUIREMENTS` ([copilot_catalogue.ts](lib/ai_tools/copilot_catalogue.ts)), its contract in the family's `contracts_*.ts`, then its call in the client. The catalogue's record satisfies `Record<CopilotClientToolName, …>`, so a gated tool with no contract does not compile, and the lint fails on a contract no client call takes.
- **A schema or a constant the handler also needs** (an input type, a cap the handler refuses over) is exported from the contract file and imported by the client from `lib`.
- **A tool both surfaces expose** (`lib/ai_tools/tools_*.ts`) is written whole in lib, handler included, and the lint builds it through its factory.

## Core principle: derive from storage schemas

AI input schemas derive from storage schemas wherever possible: same field names, same types, same constraints. No transformation layer = no transformation bugs, and AI inputs are storage-compatible by construction.

Source of truth: `configDStrict` in [lib/types/_metric_installed.ts](lib/types/_metric_installed.ts) (and `presentationObjectConfigTStrict` for `config.t`).

```ts
// lib/types/ai_input.ts
const aiFilterElementSchema = z.strictObject(
  configDStrict.shape.filterBy.element.shape,
);

export const AiMetricQuerySchema = z.strictObject({
  metricId: z.string(),
  disaggregations: z.array(
    configDStrict.shape.disaggregateBy.element.shape.disOpt,
  ).optional(),
  filters: z.array(aiFilterElementSchema).optional(),
  valuesFilter: configDStrict.shape.valuesFilter,
});
```

Existing derived surfaces to copy from: `AiMetricQuerySchema` and `AiFigureConfigPatchSchema`/`LayoutSpecSchema` (lib/types/ai_input.ts). The viz editor's `AiVizConfigUpdateSchema` is `.extend()` of the base patch schema (adds `type` + `timeseriesGrouping`), not a parallel copy. Follow that pattern when a surface needs extra fields.

## The forbidden zone

| Category               | Example                                              | Verdict                         |
| ---------------------- | ---------------------------------------------------- | ------------------------------- |
| **Identical**          | `filters` uses `configDStrict.filterBy`'s shape      | Best: derive directly           |
| **Much simpler**       | `startDate`/`endDate` instead of full `periodFilter` | OK: document the exception      |
| **Slightly different** | `col`/`vals` instead of `disOpt`/`values`            | Forbidden: worst of both worlds |

"Slightly different" looks similar enough to confuse the model but requires conversion code. Either match exactly (derive) or simplify significantly (documented exception). Storage field names are authoritative: `disOpt`, `values`, `valuesFilter`, `disaggregateBy`, `filterBy`. This rule binds tool _output_ text too: an example schema printed in a tool result (e.g. a "how to build a figure" template) teaches the model the shape more strongly than the schema description does; a `{col, vals}` example in output causes ZodErrors just as surely as one in the schema.

A simplification exception is justified when the simpler form is significantly easier for the model to use correctly, the conversion is localized to one place, and a comment explains the tradeoff:

```ts
// EXCEPTION: startDate/endDate is a simpler abstraction than full periodFilter.
// AI provides YYYY or YYYYMM; system converts using the metric's
// mostGranularTimePeriodColumnInResultsFile. See build_config_from_preset.ts.
startDate: z.number().optional(),
endDate: z.number().optional(),
```

## Two-layer validation

- **Layer 1, schema (Zod)**: structure and types. Enforced by panther's tool engine: `createAITool` parses input against the schema; a ZodError returns `is_error: true` and the model retries. Derivation gives you the storage constraints (enums, `.min(1)`) for free.
- **Layer 2, data-dependent (runtime)**: anything requiring fetched data or runtime state. Is this disOpt available for THIS metric? do these filter values exist? is the range within real data bounds? Lives in `client/src/components/products/copilot/_shared/content_validators.ts`, called from handlers. The rules a proposed report BODY must pass are Report Forge's (`report-forge/ai/validators.ts`, reached through the package's edit operations; the copilot's `report_validators.ts` wraps two of them as throws for the figure tools). The metric-query validators both surfaces run (the copilot and the `/mcp` endpoint) live in `lib/ai_tools/content_validators.ts`.

Rule: if validation needs data, it's Layer 2; if it's types and structure, derive it (Layer 1). Every write tool must run its Layer-2 checks **before** mutating anything, so a throw provably means "nothing changed" (`update_figure` / `update_report_figure` are the reference implementations). Placement within Layer 2: checks needing FETCHED data live in `content_validators.ts`; PURE config checks (slot legality, field liveness) live beside the shared edit validator in `client/src/generate_visualization/validate_figure_config_edit.ts`.

## Accepted-but-inert patches: the Type 1 / Type 2 rule

A field can be legal to Zod, legal to store, and still change nothing the user sees. A success message then teaches the model the field worked, and it repeats the dead edit. Every write tool must close both failure modes:

- **Type 1: the edit never reached storage.** Happens only for fields the apply function writes through a filter or conditional instead of a plain assignment (`CONDITIONALLY_APPLIED_FIELDS` in `apply_figure_config_patch.ts` is the authority). Each such field gets its own **structural check** in the validator ("is there an entry to receive this write?"). A config diff cannot attribute its no-op. A new conditionally-written field must be added to that list AND given a check.
- **Type 2: stored, but nothing reads it for this config's shape.** (e.g. `valuesDisDisplayOpt` on a single-value-prop figure, `selectedReplicantValue` with no active replicant, `timeseriesGrouping` on a non-timeseries.) Each needs a per-field **liveness check**: "is this field live for THIS config + metric?", asked with the same predicate the renderer uses (e.g. `getReplicateByProp`, not a raw `disDisplayOpt === "replicant"` scan). Never gate a field's validation on the predicate that makes it inert ("only validate it when it matters" is exactly what produces silent no-ops). The read-back formatter must gate on the same predicate, or it confirms the dead field back to the model.

For everything else, a field whose new value equals the stored one is NOT an error. The report (`describeFigureConfigPatchEffect`, leave-one-out over the pure apply) states "no change" per field and the tool's success message includes it. Never report a bare "Updated X".

These runtime checks are permanent, not a stopgap awaiting a stricter schema. A schema-level fix (a discriminated union on a stored literal like `config.d.type`) can only outlaw what a **literal scalar in the object** determines, and per-type slot legality qualifies. Liveness that is **derived** never can: `valuesDisDisplayOpt` depends on the metric's `valueProps` (not in the config at all), an active replicant is a predicate over `disaggregateBy` _and_ `filterBy` (`getReplicateByProp`), and rollup eligibility consults the metric's re-aggregatability. Storing a derived discriminant is a denormalisation to keep in sync. (A full union conversion of `configDStrict` was evaluated and declined 2026-08-06: the runtime checks above already close the AI path, and the union's cost spans ~60 parse sites, the `.shape`-derived AI input schemas, and a storage migration.)

## Error handling: throw, don't catch

The engine catches handler throws and returns them to the model with `is_error: true`, and that flag is how the model knows to self-correct.

```ts
// GOOD: framework sets is_error: true
handler: (async (input) => {
  const result = await doSomething(input);
  if (!result.success) throw new Error(result.error);
  return result.data;
});

// BAD: the model doesn't know this is an error
handler: (async (input) => {
  try {
    return await doSomething(input);
  } catch (e) {
    return `Error: ${e.message}`;
  }
});
```

Don't mix disciplines in helpers either. A function that returns `{success:false}` for some failures and throws for others advertises a contract it doesn't keep.

## Inclusion-list semantics

Arrays meaning "items to include" require `.min(1)`, since an empty inclusion list means "include nothing", never useful. Arrays meaning "operations to apply" allow empty (valid no-op).

| Array               | Empty means           | `.min(1)`? |
| ------------------- | --------------------- | ---------- |
| `filterBy`          | no filters (show all) | No         |
| `filterBy[].values` | include nothing       | Yes        |
| `valuesFilter`      | include no values     | Yes        |
| `disaggregateBy`    | no grouping           | No         |

## The round budget

A turn is everything from one user message to the reply that calls no tool. A round is one model reply that calls tools, with the results sent back: a reply may hold several calls, and they are one round. The chat engine caps the rounds of a turn (SYSTEM_13 "The panther engine"), so a tool is built to need few of them:

- **A read that can be asked for many takes an array.** One call returns every item the request needs, in the order asked, each with its id. The array is an inclusion list (`.min(1)`): an id that names nothing refuses the whole call before anything is read, naming every such id, and an id given twice is read once.
- **A write's result states what the write left.** Whatever the write decided that the model did not send comes back in its result: the ids it minted, the layout it chose, a flag it measured, the config a preset resolved to. What the model sent is never echoed (a block's text), nor what it has already read (a figure's data). Everything the result needs is computed before the write, so a throw still means nothing changed.
- **No result invites a read-back.** A read-back is a read whose only purpose is to learn what the model's own write just did. A write's result never names a read tool. A failure message may name the read that corrects the call.

The reference implementations are the deck's tools. `get_slides({ slideIds })` reads any number of slides in one round. The four slide writes (`create_slide`, `replace_slide`, `update_slide`, `update_figure`) return one result composed by `prepareSlideWriteResult` (`client/src/components/products/copilot/ai_tools/tools/slide_write_result.ts`): the sentence saying what was done, then, for a content slide, its blocks by id and type and its layout, then whether the slide overflows the page, then the config of each figure the write built or changed. The three figure patch tools (`update_figure`, `update_report_figure`, `update_figure_editor`) return their per-field report and then the config that resulted, as the matching read prints it.

## Bounded reads

A list or a read whose size follows the instance's data (its indicators, areas, facilities, products, a module's files) is bounded wherever the copilot is given it without asking, and is complete only where the copilot asks for it, in bounded pages. It binds a tool's result, description and errors, a view's state and a consumer block.

The bounds and the one paging helper live in [lib/ai_tools/read_bounds.ts](lib/ai_tools/read_bounds.ts). `pageForAI` takes the entries, the offset and the page size, refuses an offset past the entries, and returns the page with the sentence that says which entries are written, how many there are and the offset of the next page.

| Constant                   | Value  | Bounds                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_INLINE_LIST_MAX`       | 100    | the entries of a pushed list: the package block's indicator lists and scope limits, `get_overview`'s indicator lists, the metrics listing's HFA indicators and variant group members, Explore's chosen category values, the value lists of the validator's and the replicant check's errors, and each dimension's values in `get_dimension_values`'s listing of every dimension |
| `AI_VALUE_PAGE_MAX`        | 500    | the values one call of `get_dimension_values` writes for a named dimension                                                                                                                                                                                                                                                                                                      |
| `AI_DATA_ROWS_MAX`         | 1,000  | the CSV rows one read of a metric's data writes (`formatItemsAsMarkdown`): `get_metric_data`, a slide figure's data in `get_slides` and a new report figure's excerpt                                                                                                                                                                                                           |
| `AI_TEXT_WINDOW_MAX_CHARS` | 40,000 | the characters one window of a file writes, in whole lines (`formatTextWindowForAI`): `get_module_r_script` and `get_module_log`                                                                                                                                                                                                                                                |
| `AI_TEXT_LINE_MAX_CHARS`   | 2,000  | the characters of one line a window writes before it cuts the line and states its length                                                                                                                                                                                                                                                                                        |
| `AI_RECORD_PAGE_MAX`       | 100    | the one-line records one call of a record list writes: `get_hfa_indicators`, `get_hfa_variables` and `list_products`                                                                                                                                                                                                                                                            |

**Pushed lists.** A pushed list is one the copilot is given without asking for it: a consumer block, a view's state, an overview, a listing, an error. It is written whole up to `AI_INLINE_LIST_MAX`. Over it the text states the count and names the tool that lists the entries, with the metric and the dimension to pass where the text has them, so the model reads the list when it needs it and the text does not grow with the data. A list whose length does not follow the data (a package's modules, the ICEH stratifiers) is written whole. An error that refuses a value lists the valid values whole up to the cap, and over it the count and at most `AI_INLINE_LIST_MAX` values near the one sent (`formatValueListForAI`), then the sentence that names the lookup for the metric and the dimension (`dimensionLookupSentence`). A read-back of something already chosen writes the choice and the count of its alternatives, never their list: `get_slides` writes one read-back per figure.

**The lookup.** `get_dimension_values({ metricId, disOpt?, search?, offset? })` is where the copilot reads a dimension's values. Without `disOpt` it writes every dimension of the metric with its count and, up to `AI_INLINE_LIST_MAX`, its values; with `disOpt` that dimension in pages of `AI_VALUE_PAGE_MAX`. `search` narrows by the copilot's terms (`requiredSearchForAI`, which refuses terms with no word) before paging. A text that tells the model where a filter value comes from names the lookup, never `get_metric_data`.

**Data reads.** A read of a metric's data is refused whole over `AI_DATA_ROWS_MAX`, never cut: it writes its header, its row count and the Dimension Summary's counts, then one line that says how to narrow the read and names the lookup, and no rows. A part of the rows would be read as all of them.

**File reads.** A read of a file is a window, never the file: `formatTextWindowForAI` writes whole lines up to `AI_TEXT_WINDOW_MAX_CHARS`, each cut at `AI_TEXT_LINE_MAX_CHARS`, from a script's first line or to a log's last when the call gives neither `fromLine` nor `search`, from `fromLine`, or the lines that match `search`. Each result opens with the file's counts and the lines written, and names the `fromLine` of the next window.

**Record lists.** A list of one-line records pages: it takes `offset` and writes `AI_RECORD_PAGE_MAX` records a call through `pageForAI`, after its filters and its search. Its count line states how many records match, how many exist, which the page writes and the offset of the next page. A block every page would repeat, such as `get_hfa_indicators`' taxonomy, is written on the first page alone. `get_deck`'s outline and `get_image_assets` do not page: on 2026-11-18 the longest deck on nigeria, ethiopia, ghana and sierraleone held 156 slides and no instance held more than 13 image assets. `get_reference_docs` follows no instance's data.

## Gotchas

- **Closed schemas and strict tool use:** see [panther/protocols/PROTOCOL_UI_AI_CHAT.md](panther/protocols/PROTOCOL_UI_AI_CHAT.md), "Input schemas: two decisions".

## Checklist for a new AI tool schema

1. Check storage schemas first: does `configDStrict` (or another) already have the fields?
2. Derive with `.shape.fieldName`; keep storage field names. A borrowed field whose value is an object is rebuilt closed at the AI layer (`z.strictObject(Storage.shape.field.shape)`, each nested object included), and the storage schema is left open, because stored rows that still carry a retired key would throw.
3. Simplifying? Document the exception in a comment, localize the conversion.
4. Inclusion list? Add `.min(1)`.
5. Data-dependent checks go in `content_validators.ts` (or `report_validators.ts`), called before any mutation.
6. Handlers throw on failure; never return error strings.
7. If the tool's _output_ prints a schema example, it must match the real schema exactly.
8. A read that can be asked for many takes an array, and a write's result states what the write left: "The round budget".
9. A list whose length follows the instance's data is bounded where the copilot did not ask for it and paged where it did: "Bounded reads".
10. The schema goes in the tool's contract in `lib/ai_tools/contracts_*.ts`, never in the client: "A tool's contract is written in lib".
