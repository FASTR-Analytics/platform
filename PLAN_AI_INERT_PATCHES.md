# PLAN: AI patches that are accepted but inert — a systematic fix

Status: **DESIGNED AND RULED, not started.** The forks below are closed; what
remains is the build in the order given. No sequencing constraint against
results-runs (AI-tool-layer only, near-zero merge overlap with the run/query
surface) — but the working tree carries results-runs work, so check
`git status` before staging.

Re-verified against code 2026-07-30 (a read-only review of the previous draft;
its findings are folded in, and the two forks it opened — ruling F's type-change
semantics and the Type 1 mechanism — are ruled below).

## The class

An AI write tool accepts a patch field that is **legal to Zod and legal to
store, but that the renderer ignores for this particular figure's shape**. The
tool saves it, returns `Updated figure X`, and the user sees no change.

This is the worst possible feedback loop. A hard error teaches the model; a
silent success teaches it that the field worked, so it repeats the same edit
with variations and reports success to the user each time. It also pollutes
stored configs with dead fields that a later shape change can silently
reanimate.

Distinguish from two neighbours that are NOT this class:

- A field the AI *can't reach* (see the non-goal below) — that's a write-surface
  question, already ruled on.
- A field that is applied and rendered but the user disagrees with — that's
  ordinary product feedback.

## The central distinction: two failure modes, two fixes

The single most important thing in this plan. These look identical to the user
and need different machinery.

**Type 1 — the edit never reached storage.** The AI sets `rollupPosition` on a
figure with no roll-up. `applyFigureConfigPatch` maps over the entries looking
for `rollup === true`, matches none, and returns a config identical to the one
it started from. Nothing was recorded anywhere.

**Type 2 — the edit reached storage but nothing reads it.** The AI sets
`valuesDisDisplayOpt` on a figure showing one data value. The setting really is
saved. But `getDisaggregatorDisplayProp`
([lib/get_disaggregator_display_prop.ts:40](lib/get_disaggregator_display_prop.ts#L40))
only consults it when `effectiveValueProps.length > 1`. Stored config changed;
render did not.

*Detected by:* a per-field "is this field live for this config + metric?"
check. Not derivable from a config comparison — the config genuinely differs.

Known Type 2 members, in full: `valuesDisDisplayOpt` on a single-value-prop
figure (already fixed, the worked example), and `selectedReplicantValue` on a
figure with no dimension displayed as `replicant`
([assert_replicant_valid.ts:21-22](client/src/generate_visualization/assert_replicant_valid.ts#L21-L22)
early-returns, so the value is stored and never read). Two members. That
population size is what decides ruling B below.

### How Type 1 is detected

**Leave-one-out over a pure apply, plus an explicit conditional/unconditional
split.** Both halves are load-bearing; the earlier draft had only the first and
was wrong because of it.

*The diff.* A whole-config comparison has a hole:
`{caption: "new", rollupPosition: "top"}` on a figure with no roll-up *does*
change the config, so the comparison passes and the inert field slips through —
the original bug, surviving the fix. So for each field in the patch, apply the
full patch, apply the full patch *minus that field*, and compare the two
results (deep equality — array fields replace wholesale); identical means that
field contributed nothing. This also gets field interactions right:
`rollupPosition` legitimately lands when the same patch introduces a flagged
dimension, and leave-one-out sees that, where probing each field alone against
the old config would falsely reject it. Cost is N+1 calls to a pure function.

*The split, and why the diff alone is not enough.* "No diff" has two
indistinguishable causes: the field's write target does not exist (the bug), or
the field's new value simply equals the old one (harmless). No amount of config
diffing separates them — both produce byte-identical configs. So classify by
how `applyFigureConfigPatch` writes the field:

```ts
// apply_figure_config_patch.ts is the authority. Every field except these two
// is written unconditionally (`if (patch.X !== undefined) d.X = patch.X`), so a
// no-diff on one of those can ONLY mean "the value already equalled the stored
// one". These two are written through a filter over disaggregateBy, so a
// no-diff means the write target did not exist.
const CONDITIONALLY_APPLIED_FIELDS = ["rollupDimension", "rollupPosition"];
```

- unconditional field, no diff ⇒ **pass**, and report it as not-changed.
- conditional field, no diff ⇒ **error**, naming the field.

**A field whose value already equals the stored one is NOT an error.** The harm
this plan exists to stop is a success message teaching the model that a field
works when it does not. `caption` set to the text already there teaches nothing
false — the field works, the value simply matched. Erroring on it would also
fire constantly, since the patch schema replaces arrays wholesale and an AI
restating `filterBy` unchanged while editing something else is normal. The split
above is what buys this: for every unconditional field, no-diff *is* value
equality, with no per-field path table to look it up in.

**The two conditional fields are checked structurally, not by diff.** Diffing
them produces a false positive: `{rollupDimension: "admin_area_2",
rollupPosition: "bottom"}` on a figure with no existing roll-up sets the
position to `"bottom"` twice — once via
[apply_figure_config_patch.ts:55](client/src/generate_visualization/apply_figure_config_patch.ts#L55)'s
`?? "bottom"` default, then again from the explicit field — so leave-one-out
sees no difference and would reject the most natural phrasing of "add a National
row at the bottom". Neither does the value-equality carve-out rescue it: nothing
was stored before. So for these two, ask the structural question directly —
does the new config have a flagged entry to receive a position; does the named
dimension exist and pass the roll-up gate — and use leave-one-out only for its
field-agnostic coverage of everything else.

**Maintenance note, stated because it is the split's whole cost:**
`CONDITIONALLY_APPLIED_FIELDS` must gain any future patch field that
`applyFigureConfigPatch` writes through a filter or a conditional rather than a
plain assignment. One assertion beside the list, pointing at the apply function
as the authority, is the guard.

## The worked example (fixed 2026-07-29, read this first)

Trigger: a user asked the assistant to add labels to 30 maps in a deck. Map
labels live in `config.s`, which the AI cannot patch (deliberate — see
non-goal). With no correct field available the model reached for
`valuesDisDisplayOpt`, an unrelated data-slot field, and got "success" 30 times.

Two independent holes let a guaranteed no-op through, both now closed in
[validate_display_slots.ts:103-126](client/src/generate_visualization/validate_display_slots.ts#L103-L126):

1. **The enum is shared across presentation types.**
   `disaggregationDisplayOptionSchema`
   ([lib/types/_metric_installed.ts:44](lib/types/_metric_installed.ts#L44))
   contains `mapArea` because *disaggregations* use it, so Zod cannot reject
   `valuesDisDisplayOpt: "mapArea"` on a map even though a map's legal
   value slots are `cell/row/col`. Only a per-type table can.
2. **The check was gated on the thing that made it inert.** Validation ran only
   `if (hasMultipleValueProps)`, so on a single-value-prop figure nothing was
   checked at all — and that predicate is exactly what makes the field inert.

Note the shape of hole 2: the guard's own precondition was the same predicate
that determines liveness. That pattern — "only validate it when it matters" —
is exactly what produces silent no-ops, and it is worth grepping for as a smell
in its own right.

## Rulings

**A. Universal effect-diff — REJECTED.** The idea was to compare what the
renderer consumes, before vs after, and throw when identical. Two reasons it
fails:

1. The mechanism named for it does not do what it sounds like.
   `getEffectivePOConfig`
   ([lib/normalize_po_config.ts:188-266](lib/normalize_po_config.ts#L188-L266))
   drops *ineffective disaggregators* and nothing else — its `effectiveConfig`
   is `{...config, d: {...config.d, disaggregateBy}}`, so
   `valuesDisDisplayOpt`, `selectedReplicantValue` and `rollupPosition` pass
   through verbatim. An effective-config diff therefore reports a difference for
   every Type 2 instance and catches none of them: it waves through the exact
   bug it was designed to stop.
2. The only diff that *would* catch Type 2 is over the built `FigureInputs`,
   which means building inputs twice, a meaningful equality across a structure
   whose style layer holds functions, and a post-resolve commit point.
   `update_viz_config` has no such point — it writes to a temp store and the
   preview resolves downstream — and `update_slide_editor` is not a figure at
   all. So the "one field-agnostic check for everything" claim holds for two of
   the four tools at best.

Type 1's config comparison keeps A's field-agnostic property at a fraction of
the cost, and works in every tool.

**B. Per-field applicability predicates — ACCEPTED, scoped down.** No
declarative table. The population is two fields, one of them already written.
A table of two entries carries all of the drift risk and none of the benefit.
Write the second check by hand inside the one shared validator, and record the
rule in [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) so the next tool
author knows to ask the question.

**C. Read-side truth — DEFERRED, and only in its positive form.** The
suppression version already exists:
[format_figure_config_for_ai.ts:78-85](client/src/components/project_ai/ai_tools/tools/_internal/format_figure_config_for_ai.ts#L78-L85)
already omits "Values display slot" when only one value prop is shown. The
worked example happened anyway, because a silent omission is not a signal. Only
a positive statement ("valuesDisDisplayOpt: not applicable — this figure shows
a single data value") would add anything. Worth doing later; not part of the
fix. Do not re-implement the suppression that is already there.

When it *is* built, fix the divergence in the same block: it derives the shown
value props as `config.d.valuesFilter?.length ? valuesFilter : metric.valueProps`
instead of calling `getFilteredValueProps`, so a `valuesFilter` naming
non-existent props inflates the count and the line prints where the renderer
would place nothing. Same read-vs-render divergence class this plan is about.

**D. Report the diff instead of asserting success — FOLDED INTO TYPE 1.** Not
an independent option: "state what changed" requires a change-set, and
computing one *is* the Type 1 comparison. The precedent cited from
[PLAN_AI_TOOL_IMPROVEMENTS.md](PLAN_AI_TOOL_IMPROVEMENTS.md) is `switch_tab`
returning `changed: bool` — a fair analogue, narrower than a figure diff.

**E. Unify `update_viz_config` onto the shared figure path — ACCEPTED, and it
is the structural core of this work.** See below.

**F. A `type` change runs the existing type-conversion transform; only slots the
patch itself supplies are then validated against the new type.** Scope note:
this ruling touches `update_viz_config` **only** — `AiFigureConfigPatchSchema`
carries no `type` by design, so the two figure tools cannot reach it.

Today `update_viz_config` changes type with a bare
`setTempConfig("d", "type", input.type)`
([visualization_editor.tsx:234](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L234))
and nothing else. Both validators check slots only when the patch itself touches
`disaggregateBy`, so switching a table to a chart while leaving
`disDisplayOpt: "rowGroup"` in place succeeds and the now-illegal slot is
silently dropped at render — a member of this very class, living in the
type-change path. Two further silent defects sit in the same statement: the
conversion's `styleResets` and `defaultContent` never run, so `content: "lines"`
or `specialBarChart: true` survives onto a table or a map; and dimensions the
metric marks required-for-the-new-type are never added.

The app already has the correct transform.
[convertVisualizationType](lib/convert_visualization_type.ts) drops dimensions
not allowed for the new type, remaps illegal slots through
`disDisplayOptFallbacks`, de-collides them, resets `valuesDisDisplayOpt` to the
type default, re-adds newly-required dimensions, and applies `styleResets` +
`defaultContent`. The human type dropdown in the same editor, writing the same
store, already calls it
([_1_summary.tsx:95](client/src/components/visualization/presentation_object_editor_panel_data/_1_summary.tsx#L95)).
The AI path bypassing it is the outlier, not the reference.

So: when `patch.type` differs from the current type, the shared apply function
runs `convertVisualizationType` FIRST, then applies the rest of the patch on
top. A type-only switch therefore succeeds and produces exactly what the human
dropdown produces. Validation then rejects only slots the **patch itself**
supplies that are illegal for the new type — the genuine "you asked for
something impossible" case, where the tool states intent and the system never
guesses. Ordering matters and is not negotiable: convert first (it rewrites
`valuesDisDisplayOpt` and every `disDisplayOpt`), patch second, so an explicit
slot in the patch wins over the fallback the conversion chose.

This also answers, rather than parks, the question the earlier draft sent to
[PLAN_PO_CONFIG_TYPE_UNION.md](PLAN_PO_CONFIG_TYPE_UNION.md) — "what should a
*human* switching type get?" It is already built and shipped; the AI now shares
it. Nothing about type switching is owed to that plan.

## Why the fix lands in one place, not three

`update_figure` and `update_report_figure` already share everything: the same
input schema, the same `applyFigureConfigPatch`, the same three validators. Two
tools, one code path, two save destinations. Nothing to unify there.

`update_viz_config` is a **parallel reimplementation** of that path:

- its own input schema (`vizConfigUpdateSchema`) instead of the shared one;
- it does not call `validateDisplaySlots` — it imports the two lookup tables
  and re-writes the checking loops inline
  ([visualization_editor.tsx:128-146](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L128-L146));
- its own copy of the roll-up carry-over rule (`mergeRollupFlags`,
  [visualization_editor.tsx:156-178](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L156-L178)),
  duplicating `applyFigureConfigPatch`'s logic, each with a long comment
  restating the same rule — the exact "one authoritative statement" trap;
- it skips `convertVisualizationType` on the one edit only it can make
  (ruling F).

**And the copy has already drifted.** The shared validator runs two checks the
inline version does not: it rejects `FILTER_ONLY_DISAGGREGATION_OPTIONS` used
as grouping dimensions, and it rejects dropping a dimension the metric marks
`isRequired` (which silently produces double-counted numbers). The viz editor
is missing both today, purely because it is a copy. Unifying gains them for
free, which is the concrete measure of what the duplication cost.

**And the copy already breaks the contract it advertises.** `update_viz_config`
writes `type`, `timeseriesGrouping`, `valuesDisDisplayOpt`, `valuesFilter`,
`disaggregateBy` and `filterBy` to the store from line 233 onward, then resolves
`periodFilter` at
[lines 268-321](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L268-L321)
where it can still throw ("metric has no time period column", "data period
range is unavailable"). So a throw there does NOT mean "nothing changed" — it
means a partial edit landed under an error message. The unification fixes this
structurally; until then, do not add a new throw below line 233.

`update_slide_editor` shares the *symptom* (a `header` sent to a cover slide is
dropped in silence — the three per-type branches at
[slide_editor.tsx:162](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L162),
[:185](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L185)
and [:200](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L200)
each read only their own fields) and none of the machinery — it edits slide
fields, not figure config. It gets its own fix, following the precedent already
in the codebase: `update_slide_header` errors outright on the wrong slide type
([slides.tsx:320-324](client/src/components/project_ai/ai_tools/tools/slides.tsx#L320-L324)).

Target shape:

```text
applyFigureConfigPatch(config, patch, periodOption, dataBounds)  → new config
validateFigureConfigEdit(oldConfig, newConfig, patch, source)    → throws

update_figure         read slide bundle  → apply → validate → write temp slide
update_report_figure  read report figure → apply → validate → save to server
update_viz_config     read temp config   → apply → validate → write temp store
```

## What Zod owns, and what it cannot

Zod owns **shape**. It cannot own liveness. Both halves matter.

**Rely on the schemas for shape — one schema, derived, not two.** The current
state is the documented worst case: `AiFigureConfigPatchSchema`
([lib/types/ai_input.ts:153-205](lib/types/ai_input.ts#L153-L205)) and
`vizConfigUpdateSchema` have the same field names, both derive from
`configDStrict`, and differ only in that the viz editor adds `type` +
`timeseriesGrouping` and widens `periodFilter` to optional `min`/`max`. That is
"slightly different" — the row
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md)'s forbidden-zone table
marks *Forbidden — worst of both worlds*. Resolution:

- One base patch schema in `lib/types/ai_input.ts`. The figure tools use it
  unchanged; the viz editor is `.extend({ type, timeseriesGrouping })`.
  `vizConfigUpdateSchema` is deleted.
- Unify `periodFilter` on the **open-ended** form (`min?`/`max?`). This widens
  the figure tools slightly — "from 2023 onward" becomes expressible — and
  requires threading the metric's real data bounds into
  `applyFigureConfigPatch` so an omitted side is filled from data, exactly as
  [visualization_editor.tsx:287-321](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L287-L321)
  already does. Keeping two shapes is the forbidden middle ground; narrowing
  the viz editor would remove working capability.

**Delete the two AI lookup tables; derive from the canonical one.**
`VALID_DIS_DISPLAY` and `VALID_VALUES_DISPLAY`
([validate_display_slots.ts:18-30](client/src/generate_visualization/validate_display_slots.ts#L18-L30))
are `Record<string, string[]>`, so both the keys and the members are unchecked,
and every consumer guards with `validValues && ...` — a **fail-open**: an
unrecognised presentation type skips all slot checking.

The fix is not to retype them. `VALID_DIS_DISPLAY` is a **verbatim duplicate**
of `VIZ_TYPE_CONFIG[type].disaggregationDisplayOptions`
([lib/types/presentation_objects.ts:147](lib/types/presentation_objects.ts#L147)),
which is already `Record<PresentationOption, DisaggregationDisplayOption[]>` —
element-for-element identical on all four types (verified). And
`VALID_VALUES_DISPLAY` is that same list minus `replicant` and `mapArea`, on all
four types (also verified: the value dimension can be neither a replicant nor
the map's geography). So:

- Delete both tables. Add one derivation beside `VIZ_TYPE_CONFIG`:
  `getValidValuesDisplayOptions(type)` = `disaggregationDisplayOptions` filtered
  to exclude `replicant` and `mapArea`, with the two exclusions named in a
  comment as the semantic rule they are — not an incidental filter.
- Slot checks read `VIZ_TYPE_CONFIG[type].disaggregationDisplayOptions` and
  `getValidValuesDisplayOptions(type)`. Both are exhaustively typed, so the
  `validValues &&` fail-open guards disappear and a new presentation type or
  display option becomes a compile error.

Note this replaces the earlier draft's "interim retyping" step and its framing.
The canonical typed table already exists; there is nothing interim about using
it. [PLAN_PO_CONFIG_TYPE_UNION.md](PLAN_PO_CONFIG_TYPE_UNION.md) would replace
`VIZ_TYPE_CONFIG` itself with a real discriminated union on `config.d` — that
is still deferred (it carries a storage migration) but it is no longer blocked
behind cleaning up AI-layer copies, because after this step there are none.

**Do not push liveness into Zod.** Three reasons, in order of finality:

- Type 1 compares two configs. A schema validates one value; it cannot see
  "before".
- Type 2 depends on the metric (how many value props) and on the figure's
  `type`. The schema cannot know what it is validating against.
- A `superRefine` closing over the metric would mean building the schema
  per-call, but tool input schemas must be static: they live in the cached
  prompt prefix and are sent every turn. You would end up with a second schema
  that only *looks* like the tool's — worse than a plain function.

This is the Layer 1 / Layer 2 line
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) already draws: types and
structure derive into the schema, anything needing data or runtime state is a
function called before any mutation.

## The work, in order

Phase 1 is three independently shippable commits that fix live bugs and need no
refactor. Phase 2 is the unification, which carries the only real risk in this
plan. Phase 1 first, so the bugs are fixed even if Phase 2 stalls.

### Phase 1 — standalone fixes

1. **`valuesFilter` membership, plus the read-back that makes it actionable.**
   `valuesFilter` is never checked against the metric's real value props in any
   AI edit path. `getFilteredValueProps`
   ([lib/get_fetch_config_from_po.ts:295](lib/get_fetch_config_from_po.ts#L295))
   is a membership filter, so a name that does not exist yields
   `effectiveValueProps: []` — a figure with **no data values**, not an inert
   field. Add a membership check alongside the filter-value one, in all three
   edit tools.

   Ship the read-back with it, not later: the figure read-back never lists the
   metric's value props, so the AI cannot discover the legal names and the new
   error becomes a guess-loop — the same pattern as SYSTEM_13's `[HIGH]`
   value-discoverability item. It is a few lines in the same formatter
   (`format_figure_config_for_ai`), and pairing them is what keeps the new
   rejection teachable rather than merely correct.
2. **`update_slide_editor`.** Error when a supplied field does not belong to the
   current slide type, per `update_slide_header`'s precedent. Structurally this
   is a per-slide-type allowed-field set (3 types × 9 schema fields) checked
   before the branches run — not a two-line change, but self-contained. Also
   closes SYSTEM_13's `[LOW]` "silently ignores fields that don't match the
   slide type" item — remove it there rather than leaving two records.
3. **Failure channel.** Model-correctable rejections must be `AIToolFailure`,
   not plain `Error`: today they render in the timeline as a red crash *with a
   stack*, styled as an app fault, so every correct rejection looks like the
   app breaking (`panther/_305_ai/_core/tool_failure.ts` is the contract;
   `tool_engine` sets `errorStack` only when message and full error differ).
   Convert across the AI-only paths — `validate_display_slots.ts` (all
   throws), `assert_replicant_valid.ts:31,43,49` (all three, including the
   `resOptions.err` throw the earlier draft missed),
   `apply_figure_config_patch.ts:67`,
   `resolve_bundle_from_metric_and_config.ts:27,32` (verified AI-only — its
   three callers are all AI paths). **Leave `build_figure_inputs.ts:73` as plain
   `Error`** — that file runs for human renders too, so an AI-specific class
   there is a layering error.

### Phase 2 — unification

1. **Schema unification.** One patch schema in `lib/types/ai_input.ts` + a viz
   extension; `periodFilter` on the open-ended form; delete
   `vizConfigUpdateSchema`.
2. **Lookup tables.** Delete `VALID_DIS_DISPLAY` / `VALID_VALUES_DISPLAY`, add
   `getValidValuesDisplayOptions`, repoint every consumer at `VIZ_TYPE_CONFIG`,
   drop the `validValues &&` fail-open guards. Do this before step 4 so the
   shared validator is written against the typed tables from the start.
3. **One apply function.** Extend `applyFigureConfigPatch` with `type`,
   `timeseriesGrouping`, and open-ended `periodFilter` (new `dataBounds`
   parameter). A differing `type` runs `convertVisualizationType` first, then
   the rest of the patch applies on top (ruling F). `update_viz_config` builds a
   whole new config and writes it once via `reconcile` instead of twelve
   `setTempConfig` calls; the periodFilter resolution (including the bounds
   fetch) moves above every write, which is also what makes its range check
   possible in step 5 and what repairs the partial-edit-under-error hole
   described above. `mergeRollupFlags` is deleted, its rule surviving only in
   `applyFigureConfigPatch`. Note `type` and `timeseriesGrouping` are reachable
   only from the viz caller — figure type stays immutable, and the branch
   existing in the shared function is not an invitation to expose it on
   figures.
4. **One validator.** `validateFigureConfigEdit(oldConfig, newConfig, patch,
   source)` in `client/src/generate_visualization/`, absorbing
   `validateDisplaySlots`, the viz editor's inline loops, and both roll-up
   gates — plus the new checks: the Type 1 leave-one-out comparison over
   unconditional fields (naming the fields that failed to land), the structural
   checks for the two conditional fields, and the Type 2
   `selectedReplicantValue` liveness check. `source` is plain `ResultsValue`:
   `MetricWithStatus = ResultsValue & {…}`
   ([lib/types/modules.ts:67](lib/types/modules.ts#L67)), the viz editor's
   context is already `resultsValue: ResultsValue`
   ([ai_views.ts:85](client/src/components/project_ai/ai_views.ts#L85)), and the
   validator touches only `valueProps` + `disaggregationOptions` — both on
   `ResultsValue`. No `RollupEligibilityInputs`-style structural narrowing is
   needed; the earlier draft's signature note was unnecessary work.
5. **`update_viz_config`'s missing period range check.** It calls
   `validateMetricInputs` with `valueChecks` only
   ([visualization_editor.tsx:230](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L230)),
   omitting the period argument the two figure tools pass, so a range with no
   data behind it succeeds. `validateMetricInputs`' period parameter is
   `{min, max}` with both required
   ([content_validators.ts:169-174](client/src/components/project_ai/ai_tools/validators/content_validators.ts#L169-L174)),
   so this lands only after step 3 hoists the conversion and bounds fetch above
   the writes — it is a Phase 2 consequence, not the standalone one-line fix the
   earlier draft claimed. (The original seed for this read "confirm the
   relative/`from_month` variants" — those are unreachable from the figure
   patch, which always produces `filterType: "custom"`; this is the real gap
   behind it.)
6. **Rule on `timeseriesGrouping`'s over-strict gate**, since step 3 rewrites
   the line. Today
   [visualization_editor.tsx:124](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L124)
   rejects any value other than `mostGranularTimePeriodColumnInResultsFile`, so
   the AI can only ever set the single most-granular grouping — while the human
   style panel freely offers year/quarter/period
   ([_timeseries.tsx:63,160](client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx#L63)).
   This is the *opposite* failure to the rest of the plan (over-strict
   rejection, not silent no-op) so it is not in the class, but it sits in the
   lines being unified and must not be carried forward unexamined: either widen
   it to "any grouping at or coarser than the metric's granularity", matching
   the human path, or state why the AI is held tighter.
7. **Docs.** One authoritative statement of the Type 1 / Type 2 rule in
   [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) (the tool-author
   recipe), a single-line pointer from
   [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md), and delete this
   plan.

Fix in passing: `client/src/generate_visualization/strip_figure_inputs.ts` is a
three-line comment-only file with zero importers repo-wide (verified). Delete it.

### Verification

`deno task typecheck` plus `./validate_queries` after Phase 2 — the apply-function
step touches shared config machinery that the query rig covers. Two things
typecheck cannot see, both requiring the viz editor run in a browser: that the
preview does not re-fetch on every edit after the whole-config write, and that
an AI `type` change now produces the same config as clicking the type dropdown
(compare the two paths on one figure with a `rowGroup` slot and
`specialBarChart` on).

## Non-goal (ruled, do not reopen)

**Do not widen the AI write surface to "solve" this.** `config.s` (style) is
excluded from the patch schema deliberately: the AI sets data and figure intent;
the system styles and renders. Opening it up is a slippery slope and needs its
own design pass. An agent that "fixes" the map-labels complaint by exposing
`showDataLabels` has done the wrong thing. The correct outcome for that user
request is a clear error plus a pointer to the manual path (slide editor →
figure block → Edit Visualization → Style).

Ruling F is not an exception to this. `convertVisualizationType` writes
`config.s.content` and `styleResets`, but as a *consequence* of a data-layer
change the AI already makes (`type`), using the same transform the human path
uses. No style field becomes addressable.

## Constraints and known traps

- **"A throw means nothing changed."** Validation runs before commit and the
  error messages say so. The restructuring must preserve that contract — which
  it does naturally, since apply produces a fresh config and validation runs on
  it before any store write or server call. Note this contract is currently
  **broken** in `update_viz_config` (see above); Phase 2 step 3 is what repairs
  it, and no new throw belongs below line 233 before then.
- **Delta-awareness is a contract, not an accident.** `validateDisplaySlots`
  deliberately validates only the concerns the patch touches, so a caption-only
  edit on a figure whose *stored* config has drifted is not blocked. Write
  `validateFigureConfigEdit` as "validate the whole new config" and every
  caption edit on a drifted figure starts throwing. Preserve the delta gating
  field by field. Ruling F does not weaken this: a `type` change no longer needs
  to re-validate inherited slots, because `convertVisualizationType` has already
  made them legal — only patch-supplied slots are checked.
- **One asymmetry cannot be refactored away.** Validation has two phases: pure
  config checks, and `assertNoSlotCollision`, which needs the *fetched* data's
  real date range (single-period/single-year degeneracy). The two figure tools
  fetch inside the handler and can run it; `update_viz_config` never fetches —
  the preview does, downstream — so it cannot. That check stays where it is,
  outside `validateFigureConfigEdit`. It is one check, and the viz editor lacks
  it today regardless.
- **The Solid store risk in the apply-function step.** `update_viz_config`'s
  field-by-field writes give fine-grained reactivity to the live preview;
  replacing the whole config object could trigger more re-render or re-fetch
  than today. `reconcile` is built for this and the slide tools already use it
  (`setTempSlide(reconcile(...))`), but verify by running the editor, not by
  reading. Note `applyFigureConfigPatch` returns `{...config, d, t}`, so
  `config.s` survives the reconcile — a whole-object write is safe on that axis.
- **Collab granularity, not just reactivity.** The temp config is diffed onto
  the Yjs map by `syncFigureConfigToMap`
  ([visualization_editor_inner.tsx:351](client/src/components/visualization/visualization_editor_inner.tsx#L351)),
  so a whole-object write does NOT coarsen the CRDT update — the sync layer
  still sends a field diff. The real exposure is the await window: the handler
  reads `getTempConfig()`, then awaits (`validateMetricInputs`, the bounds
  fetch), then writes. Today's field writes clobber only the fields touched; a
  whole-config write also reverts any remote field `adoptFromMap`
  ([:358](client/src/components/visualization/visualization_editor_inner.tsx#L358))
  landed during that await. Narrow (live co-editing of one figure, mid-tool-call)
  and consistent with the app-wide last-write-wins model, but it is a real
  widening — re-read the temp config immediately before the write rather than
  reusing the pre-await snapshot.
- **Decide, don't sweep, for stored dead fields.** An inert field is inert, so
  a migration is not obviously needed. The one with a real hazard is
  `selectedReplicantValue`: give the figure a `replicant` slot later and a
  stale value gets pinned, after which `assertReplicantValid` rejects the *next*
  AI edit on a figure the user never mis-edited. Prefer clearing it at write
  time when no replicant slot exists over a one-off sweep. `valuesDisDisplayOpt`
  and `rollupPosition` are harmless to leave. Note this holds only while the
  storage schema stays permissive —
  [PLAN_PO_CONFIG_TYPE_UNION.md](PLAN_PO_CONFIG_TYPE_UNION.md) would make those
  rows fail to parse and so forces the sweep.
- **Panther tool blocks execute sequentially**, one at a time, in block order
  (CONTRACT comment at `_create_ai_chat.ts:1393`). The `Promise.all` inside
  `processToolUses` always receives a single-element array from that caller. Do
  not diagnose anything here as tool-call concurrency; that was chased and
  ruled out.
- **No compat shims.** Clean end state.
- **Verify by executing.** These validators are pure and run directly:
  `deno run --allow-all -c deno.json /tmp/check.ts` with absolute-path imports.
  A ten-line harness settled the `valuesDisDisplayOpt` semantics decisively and
  is much faster than reading. Watch that `-c deno.json` can pollute the repo
  `deno.lock` — check `git status` after.

## Corrections to earlier drafts of this plan

Recorded so the same wrong leads are not re-followed:

- **There are no dashboard AI tools.** No tool declares
  `availableIn: ["viewing_dashboards"]`; the view exists but carries no tools.
  "the dashboard equivalents" was wrong.
- **`update_slide_content` is not in this class.** It takes only `slideId` +
  `updates` and has no per-slide-type field-drop path.
- **`valuesFilter` on a single-value-prop metric is not an inert field** — it
  can empty the figure. See Phase 1.
- **The `periodFilter` seed was aimed at the wrong variant.** See Phase 2 step 5.
- **Leave-one-out alone was not sufficient**, and the "no field→path table"
  claim did not compose with the value-equality carve-out. A no-diff cannot be
  attributed without knowing how the field is applied. Resolved by the
  conditional/unconditional split, which also removes the
  `rollupPosition: "bottom"` false positive.
- **Ruling F previously prescribed erroring on a type-only switch**, on the
  premise that no correct transform was available to the AI path.
  `convertVisualizationType` was already there and already used by the human
  dropdown in the same editor. The error version would have made the AI and the
  user behave differently on the same operation, and would have left the
  `styleResets`/`defaultContent` half of the bug unfixed.
- **The lookup tables were to be "retyped as exhaustive Records".** They are
  duplicates of `VIZ_TYPE_CONFIG`, which is already exhaustively typed. Delete,
  don't retype — and the "interim step before PLAN_PO_CONFIG_TYPE_UNION"
  framing went with it.
- **The shared validator needs no structural-narrowing type.** `ResultsValue`
  is already the common supertype of both callers' sources.
