# PLAN: AI patches that are accepted but inert — a systematic fix

Status: **DESIGNED AND RULED, not started.** The forks below are closed; what
remains is the build in the order given. No sequencing constraint against
results-runs (AI-tool-layer only, near-zero merge overlap with the run/query
surface) — but the working tree carries results-runs work, so check
`git status` before staging.

Re-verified against code 2026-07-30 (a read-only review of the previous draft;
its findings are folded in, and the two forks it opened — ruling F's type-change
semantics and the Type 1 mechanism — are ruled below). A second read-only pass
the same day corrected four things and opened one further fork — the
`periodFilter` shape — ruled as G. A third pass corrected ruling F's parity
claim and the drifted-copy count in place, added ruling F's grouping-default
sub-ruling, and rejected four other claims (recorded at the end). A fourth pass
read the required docs above and folded in four things: the `[HIGH]` open item
this plan does NOT close, the `selectedReplicantValue` predicate asymmetry, the
validator's placement, and step 7's real doc-drift list. **No fork is open.
Everything else stands — build it.**

## Required reading before touching code

- [PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) — the tool-schema recipe.
  Binds Phase 2 step 1 directly: derive from storage schemas, the "slightly
  different is forbidden" table, the Layer 1 (Zod) / Layer 2 (data-dependent)
  line this plan's checks live on, and the `z.strictObject` / `strict: true`
  bans. Phase 2 step 7 writes the Type 1 / Type 2 rule back into it.
- [SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) — the architecture.
  Read at minimum "Tools, view gating, and approval" (how a handler reaches
  `getTempConfig`/`setTempConfig` through the view registry's live context),
  "Tool input schemas", and the "Surface gaps — read-projection ≠ write-schema ≠
  stored-shape" inventory, of which this whole plan is one member. **Exactly one**
  of its open items is closed by Phase 1 — the `[LOW]` `update_slide_editor`
  field-drop (Phase 1 item 2); remove that one there rather than leaving two
  records. **Do NOT touch the `[HIGH]` value-discoverability item.** It is about
  filter/disaggregation VALUES for dimensions like `admin_area_2/3/4`,
  `facility_type`, `denominator` — with its own fix direction (a
  `get_dimension_values` tool, or bounded lists in the metric-list formatter).
  Phase 1 item 1's read-back lists the metric's **value props** for
  `valuesFilter`: the same pattern on a different surface, and it leaves that
  item entirely unfixed.
- [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md) — period
  semantics, the roll-up gate and the effective-config model. The authority
  behind ruling G, the two roll-up structural checks, and why
  `getEffectivePOConfig` cannot be used as an effect diff (ruling A). Its
  **"a one-value replicant is not a replicant"** trap binds the
  `selectedReplicantValue` work — see Type 2 member 2 below.
- `panther/_305_ai/_core/tool_failure.ts` — the failure-channel contract in the
  doc comment on `AIToolFailure`, which is what Phase 1 item 3 implements. The
  fuller consumer rulebook is
  [PROTOCOL_UI_AI_CHAT.md](panther/protocols/PROTOCOL_UI_AI_CHAT.md) (vendored).
  **`panther/` is a synced external library — never edit it from this repo.**
- [PROTOCOL_ALL_TYPESCRIPT.md](panther/protocols/PROTOCOL_ALL_TYPESCRIPT.md) —
  the code-quality rules that keep getting broken by default: no default
  arguments, `undefined` over `null`, no `any`, no dynamic imports, no silent
  catch, braces on every `if`.

Nothing outside these is required reading. Everything the rulings below settle is
settled — build it, don't re-litigate it.

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

Known Type 2 members, in full — three:

1. `valuesDisDisplayOpt` on a single-value-prop figure (the worked example —
   fixed in the shared validator, so fixed for the two figure tools; the viz
   editor's inline copy still lacks it, see "the copy has already drifted").
2. `selectedReplicantValue` on a figure with no ACTIVE replicant
   ([assert_replicant_valid.ts:23-24](client/src/generate_visualization/assert_replicant_valid.ts#L23-L24)
   early-returns, so the value is stored and never read). **The predicate is
   `getReplicateByProp`, not a scan for `disDisplayOpt === "replicant"`** — a
   replicant dimension filtered to a single value returns `undefined`
   ([get_disaggregator_display_prop.ts:59-71](lib/get_disaggregator_display_prop.ts#L59-L71)),
   which SYSTEM_09's traps name outright: *"a one-value replicant is not a
   replicant… code that reads `disDisplayOpt === 'replicant'` directly will
   disagree with the rest of the app."* A raw scan would wave through exactly the
   inert case this member exists to catch — this bug class re-entering through
   its own detector. Note the write-time CLEAR uses the OTHER predicate; the
   asymmetry is deliberate and is stated at Phase 2 step 3.
3. `timeseriesGrouping` on a non-timeseries config — reachable only from
   `update_viz_config` (the figure patch schema carries no such field). EVERY
   query/render reader gates on `type === "timeseries"`:
   [get_fetch_config_from_po.ts:45](lib/get_fetch_config_from_po.ts#L45),
   [get_data_config_from_po.ts:158-162](client/src/generate_visualization/get_data_config_from_po.ts#L158-L162)
   (throws `"Bad config type"` otherwise),
   [resolve_figure_calendar.ts:33](lib/resolve_figure_calendar.ts#L33), and the
   special-bar-chart CF labels via `isSpecialBarChartActive`, which itself
   requires timeseries
   ([special_chart_checks.ts:96](client/src/generate_visualization/special_chart_checks.ts#L96)).
   Verified by grepping every `.timeseriesGrouping` in lib/client/server/panther:
   the only ungated readers are two AI formatters and the migrations.

Member 3 is the worst of the three, because **the read-back confirms the dead
field**. [format_viz_editor_for_ai.ts:35-37](client/src/components/project_ai/ai_tools/tools/_internal/format_viz_editor_for_ai.ts#L35-L37)
prints `Timeseries grouping: <value>` whenever the field is present, with no type
gate. So on a table the model sets it, is told `Updated timeseriesGrouping`, then
calls `get_viz_editor` and sees its own edit reflected back — the worked example's
loop with an extra reinforcement step. Fix the check and the formatter gate
together (Phase 1 item 4).

Three is the population that decides ruling B below.

### How Type 1 is detected

**Two mechanisms with two different jobs, and only one of them errors.**

- **The two structural checks are the whole Type 1 error surface.** Exactly two
  patch fields can fail to reach storage, and each is checked by asking its own
  structural question directly (below).
- **Leave-one-out over a pure apply produces the change REPORT** (ruling D) — the
  "you asked for X, here is what landed" text that replaces a bare `Updated
  figure X`. It never errors.

Do not build a diff-driven error branch. The earlier draft specified one
("conditional field, no diff ⇒ error") and it is dead as written: its only
possible subjects are the two conditional fields, which the very next rule
carves out for structural checking — precisely because a diff gets them wrong.
The rest of this section is why.

*The diff, and why it is per-field.* A whole-config before/after comparison says
nothing useful: `{caption: "new", rollupPosition: "top"}` on a figure with no
roll-up *does* change the config, so a whole-config diff reports "changed" and the
inert field is invisible inside it. Hence leave-one-out — for each field in the
patch, apply the full patch, apply the full patch *minus that field*, and compare
the two results (deep equality — array fields replace wholesale); identical means
that field contributed nothing, and the report says so per field. Leave-one-out
also gets field interactions right: `rollupPosition` legitimately lands when the
same patch introduces a flagged dimension, and leave-one-out sees that, where
probing each field alone against the old config would call it inert. Cost is N+1
calls to a pure function.

*Why a no-diff is never itself an error.* "No diff" has two indistinguishable
causes: the field's write target does not exist (the bug), or the field's new
value simply equals the old one (harmless). No amount of config diffing separates
them — both produce byte-identical configs. What settles it is how
`applyFigureConfigPatch` writes the field:

```ts
// apply_figure_config_patch.ts is the authority. Every field except these two
// is written unconditionally (`if (patch.X !== undefined) d.X = patch.X`), so a
// no-diff on one of those can ONLY mean "the value already equalled the stored
// one". These two are written through a filter over disaggregateBy, so for THEM
// a no-diff is uninformative — hence the structural checks below.
const CONDITIONALLY_APPLIED_FIELDS = ["rollupDimension", "rollupPosition"];
```

So: for every unconditional field a no-diff *is* value equality, which the report
states as not-changed and nobody errors on. **A field whose value already equals
the stored one is NOT an error.** The harm this plan exists to stop is a success
message teaching the model that a field works when it does not. `caption` set to
the text already there teaches nothing false — the field works, the value simply
matched. Erroring on it would also fire constantly, since the patch schema
replaces arrays wholesale and an AI restating `filterBy` unchanged while editing
something else is normal. The list above is what buys that conclusion with no
per-field path table to look anything up in.

The list's remaining job is **forward-looking**, and it is the reason to keep it:
a future patch field that `applyFigureConfigPatch` writes through a filter or a
conditional rather than a plain assignment must be added to it AND given its own
structural check. Without the check its no-diff would be silently reported as
"value already equal" — this bug class, re-entering through the detector. One
assertion beside the list, pointing at the apply function as the authority, is
the guard.

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
dimension exist and pass the roll-up gate.

`rollupDimension: null` ("remove the roll-up") must NOT error when there is no
roll-up to remove. The existing gate already has that carve-out — it fires on
`typeof patch.rollupDimension === "string"`
([validate_display_slots.ts:145-147](client/src/generate_visualization/validate_display_slots.ts#L145-L147))
— and the new structural check inherits it.

**Accepted residual.** `rollupPosition` against a *latent* flag (a flagged entry
exists, but the gate is closed — dimension filtered to one value, or a map)
passes the structural check and still renders nothing. Naming it rather than
chasing it: the position genuinely lands in the config, the flag's own latency is
already reported by the roll-up gate on the edit that created it, and
`normalizePOConfigForStorage` strips both at save.

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
declarative table. The population is three fields, one of them already written,
and one of the remaining two (`timeseriesGrouping`) is reachable from a single
tool. A table of three entries carries all of the drift risk and none of the
benefit. Write the other two checks by hand — `selectedReplicantValue` in the one
shared validator, `timeseriesGrouping` alongside it (viz-caller-only, like the
field itself) — and record the rule in
[PROTOCOL_APP_AI_TOOLS.md](PROTOCOL_APP_AI_TOOLS.md) so the next tool author
knows to ask the question.

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

**The AI adopts the converted config WHOLE, which is deliberately not
byte-identical to the human handler.** Two differences, both verified, neither
a reason to imitate the handler:

- The dropdown keeps a per-session `Map` of prior per-type settings and, on a
  return switch, restores from it and **bypasses `convertVisualizationType`
  entirely** ([_1_summary.tsx:76-93](client/src/components/visualization/presentation_object_editor_panel_data/_1_summary.tsx#L76-L93)).
  The AI has no such session cache and should not grow one.
- On the convert branch the handler writes only five fields (`d.type`,
  `d.valuesDisDisplayOpt`, `d.disaggregateBy`, `s.content`, `styleResets`) and
  **drops `converted.d.timeseriesGrouping` on the floor** — which is why a human
  switching a grouping-less table to timeseries gets a
  "Timeseries config missing timeseriesGrouping" throw
  ([get_fetch_config_from_po.ts:45-49](lib/get_fetch_config_from_po.ts#L45-L49)).
  Taking the whole config fixes that for the AI path.

**Sub-ruling: the grouping default is the metric's granularity, not
`"period_id"`.** `convertVisualizationType` defaults it to
`config.d.timeseriesGrouping ?? "period_id"`
([convert_visualization_type.ts:82-84](lib/convert_visualization_type.ts#L82-L84))
without consulting the metric, and timeseries is offered to any metric carrying
a time dimension — including a year-only one
([presentation_objects.ts:325,345](lib/types/presentation_objects.ts#L325)). So
on a year-granularity metric that default pushes a column that isn't in the
results file into `groupBys`. Pass the metric's
`mostGranularTimePeriodColumnInResultsFile` and use it as the default (it is
already in scope — apply takes `source: ResultsValue`). Pre-existing sharp edge,
loud either way, three words to get right in a path this ruling newly makes
reachable.

So: when `patch.type` differs from the current type, the shared apply function
runs `convertVisualizationType` FIRST, then applies the rest of the patch on
top. A type-only switch therefore succeeds and produces the transform's own
output — the same transform the human dropdown runs, modulo the two differences
above. Validation then rejects only slots the **patch itself**
supplies that are illegal for the new type — the genuine "you asked for
something impossible" case, where the tool states intent and the system never
guesses. Ordering matters and is not negotiable: convert first (it rewrites
`valuesDisDisplayOpt` and every `disDisplayOpt`), patch second, so an explicit
slot in the patch wins over the fallback the conversion chose.

This also answers, rather than parks, the question the earlier draft sent to
[PLAN_PO_CONFIG_TYPE_UNION.md](PLAN_PO_CONFIG_TYPE_UNION.md) — "what should a
*human* switching type get?" It is already built and shipped; the AI now shares
it. Nothing about type switching is owed to that plan.

**G. An open-ended `periodFilter` resolves to `from_month`, and "to present" is
the truth the read-back must tell.** The question was: when the AI is told "from
2023 onward", does the figure keep extending as new data lands, or freeze at
today's latest period?

It extends. The human period dropdown already offers this as a first-class choice
labelled **"From specific month to present"**
([_2_filters.tsx:275-277](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L275-L277),
and the same option in `edit_common_properties_modal.tsx`), and the viz editor's
AI path already produces it
([visualization_editor.tsx:307-313](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L307-L313)).
Freezing to `custom` would mean the AI cannot express a filter the app names in
its own UI — the same "AI held tighter than the human for no reason" defect
step 6 exists to remove — and it would silently pin an end date the user never
asked for. So the shared apply writes `from_month` for an omitted max, and the
figure tools gain it.

The mechanism, verified: `from_month` **discards its stored `max`** —
[get_fetch_config_from_po.ts:159-163](lib/get_fetch_config_from_po.ts#L159-L163)
returns `{min: reAnchored, max: periodBounds.max}`, where `periodBounds` is the
live `rawDateRange` computed server-side per query
([get_presentation_object_items.ts:157](server/server_only_funcs_presentation_objects/get_presentation_object_items.ts#L157)).
Two things follow, and they are the price of the ruling:

- **The stored `max` is schema-mandated dead weight, and that is NOT this plan's
  problem to fix.** `from_month` extends `boundedFilterBase`
  ([_metric_installed.ts:134-136](lib/types/_metric_installed.ts#L134-L136)), so
  both bounds are required and the refine demands they share a format — the human
  UI stores `max: keyedPeriodBounds.max` for exactly this reason. It is not an
  inert field in this plan's sense (nobody set it expecting an effect); it is a
  required companion of a filter type whose meaning is "to present". Making it
  optional is a storage-schema change with a migration —
  [PLAN_PO_CONFIG_TYPE_UNION.md](PLAN_PO_CONFIG_TYPE_UNION.md) territory.
- **Two real defects, both live today and both Phase 1.** (1) The three AI
  formatters print `from <min> to <max>` for `from_month` because they branch on
  `periodFilterHasBounds`
  ([presentation_objects.ts:78](lib/types/presentation_objects.ts#L78)), so the
  model reads back a fixed upper bound that the renderer ignores — including on
  figures a *human* set that way. They must say "to present". (2) Both figure
  tools gate the period range check on `filterType === "custom"`
  ([slide_editor.tsx:421](client/src/components/project_ai/ai_tools/tools/slide_editor.tsx#L421),
  [report_editor.ts:365](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L365)),
  so a `from_month` config skips `validateMetricInputs`' period argument
  entirely — widen them to `periodFilterHasBounds`. (2) is inert-safe today only
  because figures cannot yet hold `from_month`; step 3 makes them able to, so it
  must land with step 3, not step 5.

Snapshot note, so it is not discovered later: a slide/report figure carries its
own fetched items, so a `from_month` figure does not shift spontaneously — its
range re-anchors on the next re-resolve (any later edit). That is the same
"to present" contract the human path has, applied at the moment the figure is
rebuilt.

## Why the fix lands in one place, not three

`update_figure` and `update_report_figure` share nearly everything: the same
input schema, the same `applyFigureConfigPatch`, the same three validators. Two
tools, one code path, two save destinations.

**One thing they do not share, and it is a member of this class.**
`update_report_figure` rejects an empty patch
([report_editor.ts:336-344](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L336-L344),
with the reasoning in its comment: `metricId`/`type` are not in the patch schema,
so an all-unsupported patch arrives `{}`). `update_figure` has no such guard —
verified, `grep "Object.keys(input.patch"` hits report_editor.ts only. So
`update_figure` with `{patch: {type: "table"}}` strips to `{}`, re-resolves the
bundle unchanged, and returns `Updated figure <blockId>`: a full round trip that
changed nothing, reported as success. Phase 1 item 6.

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

**And the copy has already drifted.** The shared validator runs three checks the
inline version does not: it rejects `FILTER_ONLY_DISAGGREGATION_OPTIONS` used
as grouping dimensions, it rejects dropping a dimension the metric marks
`isRequired` (which silently produces double-counted numbers), and — the one
that matters most here — it rejects `valuesDisDisplayOpt` on a
single-value-prop figure. The viz editor's inline check
([visualization_editor.tsx:128-133](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L128-L133))
tests per-type slot validity only, so **the worked example's own bug is still
live in `update_viz_config`** — and
[format_viz_editor_for_ai.ts:78-80](client/src/components/project_ai/ai_tools/tools/_internal/format_viz_editor_for_ai.ts#L78-L80)
prints `Values display: <slot>` with no value-prop gate, so the read-back
confirms it (the suppression ruling C describes exists only in
`format_figure_config_for_ai`). Phase 2 step 4 closes the write side for all
three tools; the read-back line is ruling C's deferred territory and is
harmless once the write errors. The viz editor is missing all three today
purely because it is a copy. Unifying gains them for free, which is the
concrete measure of what the duplication cost.

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
applyFigureConfigPatch(config, patch, source, dataBounds)        → new config
validateFigureConfigEdit(oldConfig, newConfig, patch, source)    → throws
  // `source: ResultsValue` carries periodOption (for the periodFilter
  // conversion) AND disaggregationOptions (for convertVisualizationType).

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
- Unify `periodFilter` on the **open-ended** form (`min?`/`max?`), threading the
  metric's real data bounds into `applyFigureConfigPatch` so an omitted side is
  filled from data. Keeping two shapes is the forbidden middle ground; narrowing
  the viz editor would remove working capability. An omitted max resolves to
  `from_month` — ruling G.

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

Phase 1 is six independently shippable commits that fix live bugs and need no
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
   edit tools **and in the create path**: `build_config_from_metric.ts:87-88`
   assigns `input.valuesFilter` with no check either, and it is reachable from
   `create_slide` / `replace_slide` / `blockUpdates` / `insert_figure` / the draft
   tools. Verified there is no `valueProps` membership check anywhere in the AI
   layer, create or edit. Same defect, same fix, one extra call site — excluding
   it would leave the identical empty figure reachable by the more common verb.

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
   three callers are all AI paths). Two of those five are dead branches:
   `getFetchConfigFromPresentationObjectConfig` never returns
   `{success: false}` — it throws instead — so
   `resolve_bundle_from_metric_and_config.ts:32` and
   `assert_replicant_valid.ts:31` are currently unreachable. Convert them anyway
   (harmless, and forward-safe if that function ever returns a failure), but
   know that its LIVE plain-`Error` surface is
   [get_fetch_config_from_po.ts:47](lib/get_fetch_config_from_po.ts#L47)
   ("Timeseries config missing timeseriesGrouping") — in `lib/`, shared with
   human renders, so it stays plain `Error`, and ruling F's grouping default is
   what keeps the AI path from reaching it. **Leave `build_figure_inputs.ts:73` as plain
   `Error`** — that file runs for human renders too, so an AI-specific class
   there is a layering error.
4. **`timeseriesGrouping` liveness, check and read-back together.** Reject
   `input.timeseriesGrouping` in `update_viz_config` when the config's effective
   type is not `timeseries` (Type 2 member 3), and gate
   [format_viz_editor_for_ai.ts:35-37](client/src/components/project_ai/ai_tools/tools/_internal/format_viz_editor_for_ai.ts#L35-L37)
   on the same predicate so the read-back stops confirming a field the renderer
   ignores. Shipping only the check would leave the formatter still printing the
   value on a table — a dead line the model reads as state. Both are two-liners
   next to code the unification will rewrite anyway; do them now because the
   confirmation loop is live. Note the effective type is `input.type ?? current`
   — setting `type: "timeseries"` and a grouping in one call is legal.
5. **`from_month` reads back as "to present"** (ruling G, defect 1). Three
   formatters print a fixed upper bound the renderer ignores, all by branching on
   `periodFilterHasBounds`:
   [format_figure_config_for_ai.ts:90-96](client/src/components/project_ai/ai_tools/tools/_internal/format_figure_config_for_ai.ts#L90-L96),
   [format_viz_editor_for_ai.ts:59-66](client/src/components/project_ai/ai_tools/tools/_internal/format_viz_editor_for_ai.ts#L59-L66),
   [format_metric_data_for_ai.ts:242-245](client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts#L242-L245).
   Split the `from_month` case out of the bounded branch in all three. Live today
   on any human-set `from_month` figure — the model reads a fixed range and may
   "correct" a filter that was already right — and a prerequisite for Phase 2
   step 3, which lets the AI create these itself.
6. **`update_figure`'s empty patch.** Port `update_report_figure`'s guard
   ([report_editor.ts:336-344](client/src/components/project_ai/ai_tools/tools/report_editor.ts#L336-L344))
   to `update_figure`, with its message adjusted (`replace_slide` / a
   from_metric-from_visualization block is the way to change metric or type on a
   slide, not `replace_figure`). Three lines, and it stops a no-op round trip
   reporting `Updated figure X`.

### Phase 2 — unification

1. **Schema unification.** One patch schema in `lib/types/ai_input.ts` + a viz
   extension; `periodFilter` on the open-ended form (an omitted max resolves to
   `from_month` — ruling G); delete `vizConfigUpdateSchema`.
2. **Lookup tables.** Delete `VALID_DIS_DISPLAY` / `VALID_VALUES_DISPLAY`, add
   `getValidValuesDisplayOptions`, repoint every consumer at `VIZ_TYPE_CONFIG`,
   drop the `validValues &&` fail-open guards. Do this before step 4 so the
   shared validator is written against the typed tables from the start.
3. **One apply function.** Extend `applyFigureConfigPatch` with `type`,
   `timeseriesGrouping`, and open-ended `periodFilter` (new `dataBounds`
   parameter). A differing `type` runs `convertVisualizationType` first, then
   the rest of the patch applies on top (ruling F). Two signature consequences:
   `convertVisualizationType` takes `disaggregationOptions`, so apply needs the
   same `source: ResultsValue` the validator takes — the target shape below is
   `(config, patch, source, dataBounds)`, not the four-arg form the earlier draft
   sketched (`source` also carries the
   `mostGranularTimePeriodColumnInResultsFile` the grouping default needs — see
   ruling F's sub-ruling); and the roll-up carry-over currently reads `config.d.disaggregateBy`
   from the pre-patch config
   ([apply_figure_config_patch.ts:39](client/src/generate_visualization/apply_figure_config_patch.ts#L39)),
   which must rebind to the CONVERTED config once convert runs first (convert
   remaps `disDisplayOpt` but never `disOpt`, so the carry-over still matches).
   Also clear `selectedReplicantValue` here when the resulting config has no
   `replicant` slot — that is the "prefer clearing at write time" ruling below,
   and putting it in apply is what makes it cover the convert path too (a type
   change can drop the slot; `convertVisualizationType` does not clear the
   value). **The clear tests structural slot absence — `disDisplayOpt ===
   "replicant"` on no entry — NOT `getReplicateByProp`,** which is the opposite
   of the liveness check in step 4 and deliberately so: `getReplicateByProp`
   also returns `undefined` for a replicant dimension transiently filtered to
   one value, and clearing on that would destroy the user's stored value on a
   filter edit. Same policy the roll-up flag follows — no eager clearing on
   transient gate closures, stripped at save instead
   (SYSTEM_09 "Position is display-only"). Structural absence is permanent;
   liveness is not. And because this step is what first lets a figure hold `from_month`,
   widen both figure tools' period-check gates from `filterType === "custom"` to
   `periodFilterHasBounds` in the same commit (ruling G, defect 2) — otherwise the
   new capability arrives with its range validation silently switched off.
   `update_viz_config` builds a
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
   gates — plus the new checks: the structural checks for the two conditional
   fields (the whole Type 1 error surface), the Type 2 `selectedReplicantValue`
   liveness check (on `getReplicateByProp` — see Type 2 member 2; the OPPOSITE
   predicate to step 3's clear), and the Type 2 `timeseriesGrouping` check from
   Phase 1 item 4 moving in with the rest.
   **Placement is deliberate and needs one line of docs (step 7).** It goes
   beside `validateDisplaySlots`, i.e. under S10's glob
   (`client/src/generate_visualization/**`), while being S13 machinery —
   SYSTEM_13's schema section places Layer-2 validation in
   `validators/content_validators.ts`. That file is for checks needing FETCHED
   data (`validateMetricInputs` and friends, which stay where they are); these
   are pure config checks that the S13 doc's own "Validate-before-commit"
   paragraph already describes living here. No `lint_systems.ts` change is
   needed (S10's manifest is glob-based, not per-file), but say it in the docs
   or the inventory drifts on the next review. The leave-one-out comparison lands here too but as the
   change REPORT feeding ruling D, not as an error path — see "How Type 1 is
   detected". It needs a small hand-rolled deep-equal (there is none in `lib/`,
   `client/src/` or `panther/_000_utils`; `JSON.stringify` is key-order sensitive
   and an AI-sent `{disDisplayOpt, disOpt}` would compare unequal to a stored
   `{disOpt, disDisplayOpt}`, over-reporting changes). `source` is plain
   `ResultsValue`:
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
   relative/`from_month` variants" — those are unreachable from the figure patch
   *today*, which always produces `filterType: "custom"`; this is the real gap
   behind it. Ruling G makes `from_month` reachable, which is why the figure
   tools' own gates widen in step 3 rather than here.)
6. **Rule on `timeseriesGrouping`'s over-strict VALUE gate**, since step 3
   rewrites the line. Distinct from the liveness check in Phase 1 item 4: that one
   asks "is this field live for this type at all", this one asks "which values may
   the AI set when it is". Today
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
   plan. Plus the drift the code changes create — enumerated, because two of
   these docs actively point authors at things that will no longer exist:
   - **`vizConfigUpdateSchema` is named in two docs as a surface to copy from.**
     [SYSTEM_13:344-347](SYSTEM_13_ai_assistant.md#L344) ("Three derived
     surfaces exist") and
     [PROTOCOL_APP_AI_TOOLS.md:30-33](PROTOCOL_APP_AI_TOOLS.md#L30) ("Existing
     derived surfaces to copy from"). Step 1 deletes it; both become three-→two
     and a pointer to the extended base schema.
   - **SYSTEM_10 records the `strip_figure_inputs.ts` tombstone twice** —
     [:238](SYSTEM_10_figure_render_export.md#L238) ("one comment-only tombstone
     survives… — Open item") and the open item itself at
     [:513](SYSTEM_10_figure_render_export.md#L513). Deleting the file deletes
     both records.
   - **The validator's placement** gets the one line step 4 asks for (pure
     config checks beside `validateDisplaySlots`; fetched-data checks stay in
     `content_validators.ts`).
   - **SYSTEM_13's "Validate-before-commit" paragraph
     ([:320-324](SYSTEM_13_ai_assistant.md#L320)) is currently FALSE for
     `update_viz_config`** — it claims all three tools validate before any store
     write. Step 3 is what makes it true; no edit needed after, but do not read
     it as evidence the hole doesn't exist.

Fix in passing: `client/src/generate_visualization/strip_figure_inputs.ts` is a
three-line comment-only file with zero importers repo-wide (verified). Delete it,
and with it the two SYSTEM_10 records above.

### Verification

`deno task typecheck` plus `./validate_queries` after Phase 2. Calibrate what the
rig buys: nothing here is imported outside `client/src/` (verified — no
non-client importer of `applyFigureConfigPatch` / `validateDisplaySlots`) and no
step changes SQL generation, so the rig is a cheap regression net over
config→fetch-config, not coverage of this work. The real checks are a direct
`deno run` harness over the pure apply/validate functions (see "Verify by
executing"), plus two things typecheck cannot see, both requiring the viz editor
run in a browser: that the preview does not re-fetch on every edit after the
whole-config write, and that an AI `type` change now runs the conversion at all
(compare against the type dropdown on one figure with a `rowGroup` slot and
`specialBarChart` on). Two traps in that comparison, both from ruling F: switch
the dropdown only ONCE from a freshly-opened editor, or its per-type cache
restores instead of converting; and expect `timeseriesGrouping` to differ, since
the handler drops the converted value and the AI keeps it. Slots, content and
style resets are what should match.

The rig IS relevant on one axis: ruling G puts `from_month` into stored figure
configs for the first time, so add a case covering a figure-shaped config with
that filter type.

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
  reading.

  **A lower-risk variant, if the whole-object write misbehaves:** compute
  `newConfig` through the shared apply, validate it, then write only the fields
  that DIFFER via the existing `setTempConfig` calls. That still deletes
  `mergeRollupFlags` and the inline loops, still gains the missing checks and
  `convertVisualizationType`, still hoists the bounds fetch above every write —
  while leaving reactivity and the CRDT/await window exactly as they are today.
  The change-set ruling D needs is the same diff, so it is nearly free. Prefer the
  whole-object write for cleanliness; fall back to this rather than fighting the
  preview.

  On the `config.s` axis: `applyFigureConfigPatch` returns `{...config, d, t}`, so
  a plain patch leaves `s` untouched — but a ruling-F type change rewrites
  `s.content` + `styleResets` by design
  ([convert_visualization_type.ts:86-90](lib/convert_visualization_type.ts#L86-L90)),
  so on that one path the style panel IS in the reconcile's blast radius. That is
  intended (it matches the human dropdown), not a regression — just include a type
  switch in the browser check rather than assuming `s` is inert.
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
  time when no replicant slot exists over a one-off sweep — on STRUCTURAL slot
  absence only, per Phase 2 step 3; clearing on `getReplicateByProp` would
  destroy a live value whenever the replicant dimension is transiently filtered
  to one. `valuesDisDisplayOpt`
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
- **…and then the split's error branch turned out to be dead.** The draft after
  that specified "conditional field, no diff ⇒ error", whose only possible
  subjects are the two fields the same draft carves out for structural checking.
  Leave-one-out is now scoped to the change report; the field list survives as a
  forward guard. Do not re-add a diff-driven error path.
- **Two Type 2 members was an undercount** — `timeseriesGrouping` on a
  non-timeseries config is a third, and its read-back confirms it. The count was
  load-bearing for ruling B (it survives at three).
- **"The two figure tools share everything, nothing to unify"** — they differ on
  the empty-patch guard, and the tool missing it is squarely in this class.
- **The `periodFilter` widening was costed as "slight"**, and the review that
  caught that then recommended the wrong resolution. `from_month` discards its
  stored `max` at query time, so the review proposed resolving everything to
  `custom` on purity grounds — freezing the range. That was wrong: the human
  period dropdown offers "From specific month to present" as a first-class
  choice, so freezing would have made the AI unable to express a filter the app
  names in its own UI, and would have pinned an end date nobody asked for. Ruling
  G keeps `from_month`; the two real defects it exposed (the read-back's false
  upper bound, the `custom`-only range gate) are Phase 1 item 5 and Phase 2
  step 3. Do not re-litigate the stored-`max`-is-ignored observation: it is
  schema-mandated and the human path does the same.
- **Three claims from that same review pass were checked and REJECTED**, recorded
  so they are not re-raised: `convertVisualizationType` handing a dimension the
  `replicant` slot, and its de-collision leaving a collision when no slot is free,
  are pre-existing properties of the transform the human type dropdown already
  calls — ruling F's whole point is parity, so they are not costs of this plan;
  and the plan's citation of the sequential-tool-block CONTRACT
  (`_create_ai_chat.ts:1393`) is correct — the file is under
  `panther/_305_ai/_components/`, not `_core/`.
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
  is already the common supertype of both callers' sources. (Its justification
  is slightly wider than first stated — the validator also reads `valueFunc` /
  `postAggregationExpression` / `hasFacilityLevelRows` via
  `getEffectiveRollupDimension`. All are on `ResultsValue`; the conclusion is
  unchanged.)
- **Ruling F's "exactly what the human dropdown produces" was over-claimed**,
  and the drifted-copy count was two rather than three. Both corrected in place
  (2026-07-30, a fourth read-only pass). The same pass raised four further
  claims that were checked and **REJECTED** — recorded so they are not
  re-raised:
  1. `disaggregateBy` belongs in `CONDITIONALLY_APPLIED_FIELDS` because the
     roll-up carry-over can override omitted flags. The case is real (patch
     entries with no `rollup` field, stored flag restored, result deep-equals
     stored) but harmless: the report says "not changed", which is TRUE of the
     config and is not a success message. The harm criterion is "a success
     teaching the model a field works when it does not" — not triggered.
  2. Ruling G should widen the create path's `startDate`/`endDate`.
     `validateDateRange` throws a clear both-or-neither error
     ([content_validators.ts:151-155](client/src/components/project_ai/ai_tools/validators/content_validators.ts#L151-L155)),
     so it is a loud correct rejection, not this class. Widening it is scope
     creep against the non-goal.
  3. The apply-clears vs validator-errors ordering for
     `selectedReplicantValue` is ambiguous. The delta-gating rule
     ("validate what the patch touches") already settles it: the check tests
     `patch.selectedReplicantValue`, not the post-apply field.
  4. Phase 1 should absorb the viz editor's `valuesDisDisplayOpt` liveness
     hole. Phase 2 step 4 fixes it by construction; hoisting it is only
     insurance against Phase 2 stalling, not a defect.
