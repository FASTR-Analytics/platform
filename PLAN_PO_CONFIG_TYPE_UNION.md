# PLAN: make `config.d` a discriminated union on presentation type

Status: **DEFERRED, not started.** Do not begin until
[PLAN_AI_INERT_PATCHES.md](PLAN_AI_INERT_PATCHES.md) has landed — that plan
fixes the live bug with runtime checks; this one is the end-state *shape* that
makes one class of it unrepresentable. Independent of results-runs. No trigger
date; this is a "do it properly one day" piece, and it carries a storage
migration, so it wants its own scoped review pass rather than being folded into
adjacent work.

## The idea

`config.d.type` is `"timeseries" | "table" | "chart" | "map"`
([presentationOptionSchema](lib/types/_metric_installed.ts#L39)), and several
`config.d` fields are only meaningful for some of those variants. Today that
per-variant truth is carried by two hand-maintained lookup tables in
[validate_display_slots.ts:18-30](client/src/generate_visualization/validate_display_slots.ts#L18-L30):

```text
VALID_VALUES_DISPLAY
  timeseries → series | cell | row | col
  table      → row | col | rowGroup | colGroup
  chart      → indicator | series | cell | row | col
  map        → cell | row | col
```

That is a discriminated union, hand-rolled. `configDStrict` instead types
`valuesDisDisplayOpt` and `disaggregateBy[].disDisplayOpt` against the shared
nine-member `disaggregationDisplayOptionSchema`
([lib/types/_metric_installed.ts:45](lib/types/_metric_installed.ts#L45)),
because `mapArea` and `rowGroup` are legal *somewhere*.

Make `config.d` a `z.discriminatedUnion("type", …)` with per-variant slot enums.

## What it buys

1. **`valuesDisDisplayOpt: "mapArea"` on a map becomes unrepresentable** — not
   validated, unconstructible. That is hole 1 of the
   [PLAN_AI_INERT_PATCHES.md](PLAN_AI_INERT_PATCHES.md) worked example ("the
   enum is shared across presentation types, so Zod cannot reject a
   per-type-illegal slot; only this table can") closed in the type system.
2. **The AI inherits it for free.** `AiFigureConfigPatchSchema` derives from
   `configDStrict`, so per-type slot legality arrives in the tool schema with no
   AI-layer work and no second schema. Same for the viz editor's schema once
   [PLAN_AI_INERT_PATCHES.md](PLAN_AI_INERT_PATCHES.md) unifies it.
3. **Both tables get deleted**, along with the `validValues && …` guards every
   consumer wraps them in — guards that currently **fail open**, so an
   unrecognised presentation type skips slot checking entirely.
4. **`timeseriesGrouping` stops being a universally-optional field** that is
   "only meaningful for timeseries" by comment, and becomes a member of the
   timeseries variant only.

## The precise limit — state it once, here

A discriminated union can enforce liveness that is determined by a **literal
scalar stored in the object**. Liveness that is **derived** cannot be a
discriminant. Three of the four known inert-field cases are derived, and stay
outside this plan permanently:

- **`valuesDisDisplayOpt` inert because the figure shows one data value.**
  Depends on the metric's `valueProps` intersected with `config.d.valuesFilter`.
  `valueProps` is not in the config at all — it is on the results object. A
  union over the config cannot discriminate on data held elsewhere. (This is
  hole 2 of the worked example, the harder of the two.)
- **`selectedReplicantValue` inert because nothing replicates.** It *is* in the
  config, but as a predicate over an array's contents
  (`disaggregateBy.some(d => d.disDisplayOpt === "replicant")`), and a
  discriminant must be a literal field. Hoisting replication into a scalar does
  not rescue it either: `getReplicateByProp` also consults `filterBy`, because a
  replicant filtered to a single value is degenerate and does not replicate. So
  true liveness is derived, and a stored discriminant would be a
  denormalisation to keep in sync.
- **`rollupPosition` inert because there is no total row.** Array contents *and*
  whether it is a map *and* whether the dimension is filtered to one value *and*
  whether the metric is re-aggregatable.

So this plan and the runtime checks in
[PLAN_AI_INERT_PATCHES.md](PLAN_AI_INERT_PATCHES.md) are **complements, not
alternatives**. Landing this does not retire the config comparison or the
per-field liveness checks.

## What makes this its own piece of work

1. **Type changes become variant transitions.** The viz editor lets a user
   switch a table to a chart. Today that is a field assignment, and a
   now-illegal slot (`rowGroup` on a chart) is silently dropped at render —
   which is itself a member of the inert-patch class. Under a union it is a
   transition between shapes, and every type→type pair needs an explicit "what
   does `rowGroup` become on a chart?" rule. This is arguably the *point* — it
   forces a question currently answered by silent data loss — but it is the bulk
   of the work, and it changes behaviour for human editor users, not just the AI.
2. **It forces a data sweep first, inverting the other plan's ruling.**
   [PLAN_AI_INERT_PATCHES.md](PLAN_AI_INERT_PATCHES.md) rules "decide, don't
   sweep" for stored dead fields, on the grounds that an inert field is inert.
   That holds only while the schema stays permissive. Tighten `config.d` and
   stored rows carrying legal-but-inert combinations **stop parsing**. Correct
   order: transform block + forced skip-gate to clean the data, *then* tighten
   the schema — the full apparatus in
   [PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md), plus the
   "renaming or deleting a stored JSON field is never just a rename" rule in
   CLAUDE.md.
3. **Blast radius reaches well past the AI layer.** `config.d` is parsed on the
   client save path (`normalizePOConfigForStorage`), in the server-side collab
   checkpoint, and feeds the viz query engine; the tables have non-AI consumers
   in the viz editor's runtime checks and in `format_figure_config_for_ai`.
   **Count every parse site before committing — not yet counted.**
4. **Open question: do authored modules carry `config.d` shapes?** Visualization
   presets are referenced by `vizPresetId` and `lib/derive_default_visualizations.ts`
   exists, so a preset config may be authored in `wb-fastr-modules` and baked
   into `definition.json`. If so, this needs a lockstep push in that repo per
   CLAUDE.md's three-repos rule. **Verify before starting** — it changes the
   sequencing.

## Related, same principle, much cheaper

`update_slide_editor`'s dropped-field bug is the same idea in reverse: `Slide`
**already is** a discriminated union (`cover | section | content`), and the AI
tool flattened it into one object with every field optional, which is why
`header` sent to a cover slide vanishes.
[PLAN_AI_INERT_PATCHES.md](PLAN_AI_INERT_PATCHES.md) fixes it with a runtime
per-type check (following `update_slide_header`'s precedent). The end state is
mirroring the existing storage union in the tool's input schema. Cheap — no
migration, the union already exists — but it is a tool-input change, so it can
ride whenever someone is in that file rather than waiting on this plan.

## Order of work, when it happens

1. Verify item 4 above (authored presets), then count the `config.d` parse sites.
2. Decide the type→type transition rules; they are the design content of this
   plan, and they need Tim's ruling because they are user-visible.
3. Migration: transform stored configs to legal-for-their-type combinations,
   with a forced skip-gate.
4. Convert `configDStrict` to the union; delete `VALID_DIS_DISPLAY`,
   `VALID_VALUES_DISPLAY` and their fail-open guards.
5. Fix the fallout at every parse and consumer site; re-run
   `./validate_queries`.

## Where the rulings land

Per-type `config.d` semantics belong in
[SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) (config →
disaggregation/period semantics); the migration mechanics in
[PROTOCOL_APP_MIGRATIONS.md](PROTOCOL_APP_MIGRATIONS.md). The "scalar
discriminant vs derived liveness" rule above is the durable statement — it
belongs with the inert-patch rule in
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) so a tool author reads both
together. Delete this plan when the work lands.
