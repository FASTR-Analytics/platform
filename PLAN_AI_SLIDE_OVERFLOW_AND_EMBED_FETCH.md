# PLAN: AI slide overflow feedback and report embed fetch

Two defects seen on the Somalia instance (2.3.0) during the investor-demo
rehearsal of 27 Oct 2026. The slide copilot writes a content slide whose layout
overflows the page and tells the model it succeeded, so the deck shows a "Layout
overflow" badge the model never hears about. The report editor's live preview
parses compiled HTML straight into a live element, so every figure embed makes
the browser fetch a `figure:<id>` URL and log an error before the embed is
swapped for its component.

**Next step: Do 1.** Branch `main`. Repos: this app (step 1) and the
`report-forge/` submodule (step 2). Read first: `CLAUDE.md`, `SYSTEMS.md`, then
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md) for step 1 and
[SYSTEM_12_documents_sharing.md](SYSTEM_12_documents_sharing.md) for step 2.
Start when: nothing; the plan stands alone.

## §0 How to work this plan

- The plan file is `PLAN_AI_SLIDE_OVERFLOW_AND_EMBED_FETCH.md`; the instruction
  is "Do the next step of PLAN_AI_SLIDE_OVERFLOW_AND_EMBED_FETCH.md".
- Branch `main`, as [PROTOCOL_APP_PLANS.md](PROTOCOL_APP_PLANS.md) binds it.
  Step 1 is worked in this repo. Step 2 is worked inside `report-forge/`, a git
  submodule: commit and push there, then commit the moved pointer here
  (SYSTEMS.md, "report-forge/").
- The floor is the one PROTOCOL_APP_PLANS.md names. Step 2 adds
  `deno task lint:report-forge` (already the last link of `deno task typecheck`)
  and `deno task test`, which runs `report-forge/tests/`.
- The log is §6. A step reads, in order: `CLAUDE.md`, `SYSTEMS.md`, the SYSTEM
  file the step names, §2 and §3, its own §4 section, §6.
- The last step is 2.
- Vocabulary. _Overflow_: the page-level `score.overflow` (0 or 1) of the best
  layout the page optimizer returns (`panther/_008_layouter/optimizer.ts:43`,
  set at `:117`). _Embed_: a `![caption](figure:<id>)` or
  `![caption](image:<id>)` token of FASTR Markdown, compiled to
  `<img src="figure:<id>">`.

## §1 The problem

**Slide overflow is silent.**
[convert_ai_input_to_slide.ts:126-139](client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts#L126-L139)
runs `optimizePageLayout` and keeps `result.best.layout`; `result.best.score` is
dropped, overflow with it. `create_slide`
([slides.tsx:136-156](client/src/components/products/copilot/ai_tools/tools/slides.tsx#L136-L156))
and `replace_slide`
([slides.tsx:192](client/src/components/products/copilot/ai_tools/tools/slides.tsx#L192))
write the slide and return "Created slide …" with no word on fit. The deck's
page holder shows the badge
([page_holder.tsx:631](panther/_303_components/charts/page_holder.tsx#L631))
from the same `overflow` flag, so the user sees what the model cannot. The deck
workflow in the system prompt
([build_system_prompt.ts:284-294](client/src/components/instance/copilot/build_system_prompt.ts#L284-L294))
never says that a `from_metric` block on a multi-indicator metric must filter
its indicators. Observed: a four-slide deck whose data-quality slide carried a
reporting-completeness figure over every indicator in the package, one panel
each, the text column squeezed to one word per line, the badge on, and the
model's final message reporting the slide as done.

**Embed images fetch an unknown scheme.** The live preview region widget assigns
compiled HTML to a live element,
[live_preview_extension.tsx:538-540](report-forge/ui/editor/live_preview_extension.tsx#L538-L540),
then walks its `<img>` elements at `:557-566` to mount the figure component or
resolve the image asset. The compiler emits `<img src="figure:<id>">` for an
embed
([report_fastr_markdown.ts:388-430](report-forge/engine/report_fastr_markdown.ts#L388-L430)),
the sanitizer admits the scheme
([embeds.ts:191-194](report-forge/engine/embeds.ts#L191-L194)), and an `<img>`
created by `innerHTML` in a live document fetches its `src` at once, so the
browser logs `Failed to load resource: net::ERR_UNKNOWN_URL_SCHEME figure:<id>`
once per embed per repaint. The block widget at
[live_preview_extension.tsx:2920-2922](report-forge/ui/editor/live_preview_extension.tsx#L2920-L2922)
has the same shape and compiles `:::logos` rows whose images carry `image:`
sources. `buildReportBodyNodes`
([report_html.ts:185-193](report-forge/ui/report_html.ts#L185-L193)) already
does this right: it parses into a `<template>`, whose content is inert, and
swaps the embeds before the caller adopts the fragment.

## §2 The model

- `convertAiInputToSlide` returns `{ slide, overflow }`. `create_slide` and
  `replace_slide` still write the slide, and when `overflow` is true their
  result ends with one sentence that names the figure block ids on the slide and
  the fix: filter the indicator dimension to the indicators the slide's text
  names, or pick a preset with fewer rows, via `update_figure`. The deck
  workflow in the system prompt states the filtering rule before the model
  builds a block.
- In Report Forge, compiled HTML never meets a live document with an embed `src`
  still in place: every widget that compiles markdown parses it into a
  `<template>`, swaps the embed images for their mounts or asset URLs there, and
  only then adopts the fragment into its element.

## §3 Rulings

1. _(proposed)_ Overflow is reported, not thrown. The slide is written as the
   model asked, the user can fix it by hand, and the model gets one line to act
   on in the same turn. Throwing would lose the slide and the model's work.
2. _(proposed)_ The feedback names figure blocks only. Text blocks autofit, so
   when a page overflows the figure is the cause; a slide with no figure block
   reports the overflow without a block list.
3. _(proposed)_ The report-forge fix lands in the submodule on its `main` and is
   pushed before the pointer moves here. No patched copy is vendored. If push
   access to `github.com/NicholasWillmott/report-forge` is missing, step 2 stops
   with "NOT DONE: needs you to" and the fix committed locally in the submodule.
4. Nothing ships. Tim deploys.

## §4 Steps

### Step 1: Overflow reaches the model (this repo)

**Surface.**
`client/src/components/products/copilot/slide_ai/convert_ai_input_to_slide.ts`,
`client/src/components/products/copilot/ai_tools/tools/slides.tsx`,
`client/src/components/products/copilot/ai_tools/tools/drafts.tsx`,
`client/src/components/products/copilot/ai_tools/tools/draft_slide_preview.tsx`,
`client/src/components/instance/copilot/build_system_prompt.ts`,
`SYSTEM_13_ai_assistant.md`.

**Deliverable.**

- `convertAiInputToSlide` returns `{ slide: Slide; overflow: boolean }` with
  `overflow` read from `result.best.score.overflow === 1`. Its four callers
  (`slides.tsx:136`, `slides.tsx:192`, `drafts.tsx:77`,
  `draft_slide_preview.tsx:169`) destructure it; the draft tools ignore
  `overflow`.
- `create_slide` and `replace_slide`, when `overflow` is true, append to their
  result:
  `The slide's layout overflows the page. Figure block(s) <ids>: filter
  the indicator dimension to the indicators this slide names, or choose a preset
  with fewer rows, then update_figure.`
  A slide with no figure block appends the first sentence only. The block ids
  are the ones `get_slide` would show.
- The deck workflow in `build_system_prompt.ts` gains a fifth item: a
  `from_metric` block on a content slide filters its indicator dimension to the
  indicators the slide's text names; an unfiltered multi-indicator metric draws
  one panel per indicator and overflows the page.
- `SYSTEM_13_ai_assistant.md` states, where it describes `create_slide` and
  `replace_slide`, that the result carries the overflow sentence and where the
  flag comes from.

**Not in this step.** `update_slide` (it edits blocks in place and does not
re-run the optimizer); the draft preview card's own text; any change to the
optimizer or to panther.

**Gates.** The floor.

**Ends with.** One commit.

### Step 2: Embeds never fetch (report-forge submodule)

**Surface.** `report-forge/ui/editor/live_preview_extension.tsx` (the two
`innerHTML` sites, `:538` and `:2920`, and the embed walk that follows the
first), `report-forge/ui/report_html.ts` (a shared helper, if the swap is
extracted from `buildReportBodyNodes`), `report-forge/tests/` (a test that
compiles a body with a figure embed through the same path and asserts no live
`<img>` carries a `figure:` or `image:` `src`), and in this repo the submodule
pointer.

**Deliverable.**

- Both widgets parse the compiled HTML into a `<template>` and replace every
  embed `<img>` inside the template's content, figure mounts and resolved image
  URLs alike, before the fragment is appended to `dom`. No live `<img>` ever has
  a `figure:` or `image:` `src`.
- The test above passes under `deno task test`.
- `report-forge/` is committed and pushed on its `main`; this repo's commit
  moves the pointer.

**Not in this step.** The sanitizer's URI regexp (export paths rely on the
scheme surviving sanitization: `measureFigureGrounds`,
`report_html.ts:231-265`); the Word and standalone HTML exports.

**Gates.** The floor; `deno task lint:report-forge`; `deno task test`.

**Ends with.** One commit in `report-forge/` (pushed), then one commit here that
moves the pointer and, this being the last step, deletes this file.

## §5 Out of scope

- The one `wss://…/collab` "Close received after close" console error seen in
  the same session: the client's ping-deadline close
  ([collab.ts:1252](client/src/state/instance/collab.ts#L1252)) racing the
  server's own close frame. The socket reconnected and the Live indicator stayed
  on.
- Model behaviour that the demo prompts steer in wording: asking to confirm an
  outline before drafting a report, and proposing a figure insertion when asked
  a question inside a report.
- The optimizer's scoring and the page holder badge in panther.

## §6 Log

(empty)
