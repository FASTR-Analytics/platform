# PLAN: AI patches that are accepted but inert — a systematic fix

Status: **INVESTIGATION + DESIGN, not started.** No sequencing constraint
against results-runs (this is AI-tool-layer only, near-zero merge overlap with
the run/query surface). One instance is already fixed and serves as the worked
example; the point of this plan is to decide whether the class gets a
mechanical fix or stays a per-field discipline.

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

## The worked example (fixed 2026-07-29, read this first)

Trigger: a user asked the assistant to add labels to 30 maps in a deck. Map
labels live in `config.s`, which the AI cannot patch (deliberate — see
non-goal). With no correct field available the model reached for
`valuesDisDisplayOpt`, an unrelated data-slot field, and got "success" 30 times.

Two independent holes let a guaranteed no-op through, both now closed in
`client/src/generate_visualization/validate_display_slots.ts`:

1. **The enum is shared across presentation types.**
   `disaggregationDisplayOptionSchema` (`lib/types/_metric_installed.ts`)
   contains `mapArea` because *disaggregations* use it, so Zod cannot reject
   `valuesDisDisplayOpt: "mapArea"` on a map even though
   `VALID_VALUES_DISPLAY.map` is `cell/row/col`. Only the per-type table can.
2. **The check was gated on the thing that made it inert.** Validation ran only
   `if (hasMultipleValueProps)`, so on a single-value-prop figure nothing was
   checked at all — and `getDisaggregatorDisplayProp`
   (`lib/get_disaggregator_display_prop.ts`) only places the value dimension
   when `effectiveValueProps.length > 1`, so the field is inert there *by
   construction*.

Note the shape of hole 2: the guard's own precondition was the same predicate
that determines liveness. That pattern — "only validate it when it matters" —
is exactly what produces silent no-ops, and it is worth grepping for as a smell
in its own right.

## Seed instances (verified, NOT exhaustive — go find the rest)

These were spotted in passing while fixing the above. They are a starting
point, not a checklist; the survey is the actual work.

- `selectedReplicantValue` set on a figure with no dimension displayed as
  `replicant`. `assertReplicantValid`
  (`client/src/generate_visualization/assert_replicant_valid.ts:24`) early-returns
  `if (!replicateBy) return`, so the value is stored and never read.
- `rollupPosition` patched with no roll-up flag anywhere in `disaggregateBy` —
  `applyFigureConfigPatch` maps over entries with `e.rollup === true`, matches
  none, stores nothing, reports success.
- `valuesFilter` on a single-value-prop metric.
- `update_slide_editor` with fields for the wrong slide type: send `title` +
  `header` to a cover slide and `title` applies, `header` is dropped without
  comment (`slide_editor.tsx`, the per-slide-type `if` blocks). This is G7 in
  `PLAN_AI_TOOL_GAPS`-lineage notes — same class, different tool, which is the
  evidence that a figure-only fix is the wrong altitude.
- `periodFilter` whose range sits outside the data. `validateMetricInputs`
  covers custom ranges; confirm the relative/`from_month` variants.

Tools in scope, at minimum: `update_figure`, `update_report_figure`,
`update_viz_config`, `update_slide_editor`, `update_slide_content`, and the
dashboard equivalents. Check whether the AI *authoring* paths
(`from_metric`, `from_visualization`) have the same holes — they build a config
from scratch rather than patching, so the failure may present differently.

## The design forks to rule on

These compose; the question is which combination is worth the cost. Do not
assume the strictest option wins — argue it.

**A. Universal effect-diff, enforced.** After the patch is applied and the
bundle re-resolved, compare what the renderer would actually consume — the
*effective* config (`getEffectivePOConfig`) and/or the built `FigureInputs` —
before vs after. Identical ⇒ the patch was a no-op ⇒ throw. Field-agnostic, so
it catches every present and future inert field with one check, and it needs no
list to keep in sync. There is already a natural home: `assertNoSlotCollision`
runs post-resolve, pre-commit, for exactly this reason. Open questions the
investigation must answer: is a meaningful equality cheap and stable here
(functions live in the style layer — see the FigureInputs schema history)? What
about a patch that legitimately changes stored config without changing *this*
render? Is "you set the caption to the text it already had" an error or a pass?

**B. Per-field applicability predicates.** A declarative table of field →
"is this field live for this config+metric?", checked centrally pre-apply. This
is the generalization of the hand-written fix. Precise, best error messages.
Cost: a list that drifts — and drift is a documented recurring wound in this
codebase (the "one authoritative doc comment per contract" rule exists because
a gate accumulated eight restatements, five wrong).

**C. Read-side truth.** Make the AI's *read* of a figure state which fields are
live and which are inert for that figure (`_internal/format_figure_config_for_ai.ts`,
`simplifySlideForAI`). Prevention rather than rejection, and it attacks the
systemic root cause already on record: read-projection ≠ write-schema ≠ stored
shape. Weakest alone, strong as a complement.

**D. Report the diff instead of asserting success.** Replace
`Updated figure ${blockId}` with a statement of what actually changed. Even an
undetected no-op then becomes visible to both the model and the user in the
transcript. Cheap, no false-positive risk, and it converges with an idea
already sitting in `PLAN_AI_TOOL_IMPROVEMENTS.md` ("structured response enables
the AI to detect no-ops"). Consider whether this alone is 80% of the value.

Rule on the fork explicitly and record the reasoning — a future reader needs to
know why the rejected options were rejected.

## A finding to fold in: these errors are mis-classified

`validateDisplaySlots` and its neighbours throw plain `Error`. Panther's
documented contract (`panther/_305_ai/_core/tool_failure.ts`) is that
model-correctable input failures are `AIToolFailure` — plain `Error` is reserved
for "should never happen" bug detectors, and renders in the timeline as a crash
*with a stack*, styled as an app fault. So today every one of these rejections
shows the user a red crash for what is ordinary model feedback. Whatever fork
is chosen, the failure channel should be corrected across these validators.

## Non-goal (ruled, do not reopen)

**Do not widen the AI write surface to "solve" this.** `config.s` (style) is
excluded from `AiFigureConfigPatchSchema` deliberately: the AI sets data and
figure intent; the system styles and renders. Opening it up is a slippery slope
and needs its own design pass. An agent that "fixes" the map-labels complaint by
exposing `showDataLabels` has done the wrong thing. The correct outcome for that
user request is a clear error plus a pointer to the manual path (slide editor →
figure block → Edit Visualization → Style).

## Constraints and known traps

- **"A throw means nothing changed."** Validation runs before commit and the
  error messages say so. Any restructuring must preserve that contract.
- **`validateDisplaySlots` is shared** by `update_figure` and
  `update_report_figure`, and `VALID_DIS_DISPLAY` / `VALID_VALUES_DISPLAY` are
  also consumed by the viz editor's runtime checks. One fix lands in several
  places — verify all of them, and don't fork the tables.
- **Panther tool blocks execute sequentially**, one at a time, in block order
  (explicit CONTRACT comment in `_create_ai_chat.ts`). The `Promise.all` inside
  `processToolUses` always receives a single-element array from that caller.
  Do not diagnose anything here as tool-call concurrency; that was chased and
  ruled out.
- **Tool definitions live in the cached prompt prefix** — every tool is always
  sent and gated at execution. Per-figure dynamic input schemas are therefore
  not available as a mechanism.
- **No compat shims.** Clean end state; a one-time sweep of stored configs
  carrying dead fields is acceptable if it's actually needed (check whether it
  is — an inert field is inert, so it may be harmless to leave).
- **Verify by executing.** These validators are pure and run directly:
  `deno run --allow-all -c deno.json /tmp/check.ts` with absolute-path imports.
  A ten-line harness settled the `valuesDisDisplayOpt` semantics decisively and
  is much faster than reading. Watch that `-c deno.json` can pollute the repo
  `deno.lock` — check `git status` after.
- **Parallel workstreams are normal here.** Check `git status` before staging or
  before debugging typecheck errors; results-runs work is live in the tree and
  its errors are not yours.

## Where the rulings land

`SYSTEM_13_ai_assistant.md` is the doc home for AI-assistant contracts;
`PROTOCOL_APP_AI_TOOLS.md` is the schema-authoring recipe and should carry
whatever rule comes out of this (a new tool author needs to know the rule
without reading this plan). One authoritative statement, single-line pointers
elsewhere. Delete this plan when the work lands.
